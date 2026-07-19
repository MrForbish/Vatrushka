import type {
  RealtimeEvent,
  ServerVoiceStateDto,
  VoiceMemberStateDto,
} from "@vatrushka/shared";

export interface PendingVoiceMoveState {
  movementId: string;
  fromChannelId: string;
  toChannelId: string;
  expiresAt: string;
}

export interface ServerVoiceState {
  serverId: string;
  version: number;
  channelByUserId: Record<string, string>;
  membersByChannelId: Record<string, string[]>;
  memberStateByUserId: Record<string, VoiceMemberStateDto>;
  pendingMoveByUserId: Record<string, PendingVoiceMoveState>;
  processedEventIds: string[];
}

export interface ApplyVoiceEventResult {
  state: ServerVoiceState;
  snapshotRequired: boolean;
}

export function voiceStateFromSnapshot(
  snapshot: ServerVoiceStateDto,
): ServerVoiceState {
  const state: ServerVoiceState = {
    serverId: snapshot.serverId,
    version: snapshot.version,
    channelByUserId: {},
    membersByChannelId: {},
    memberStateByUserId: {},
    pendingMoveByUserId: {},
    processedEventIds: [],
  };
  for (const channel of snapshot.channels) {
    state.membersByChannelId[channel.channelId] = [];
    for (const member of channel.members) {
      state.channelByUserId[member.userId] = channel.channelId;
      state.membersByChannelId[channel.channelId]!.push(member.userId);
      state.memberStateByUserId[member.userId] = member;
    }
  }
  return state;
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  return typeof payload[key] === "string" ? payload[key] : null;
}

function numberPayload(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  return typeof payload[key] === "number" ? payload[key] : null;
}

function rememberEvent(state: ServerVoiceState, eventId: string): void {
  state.processedEventIds = [...state.processedEventIds, eventId].slice(-500);
}

function removeUser(state: ServerVoiceState, userId: string): void {
  const channelId = state.channelByUserId[userId];
  if (channelId)
    state.membersByChannelId[channelId] = (
      state.membersByChannelId[channelId] ?? []
    ).filter((candidate) => candidate !== userId);
  delete state.channelByUserId[userId];
  delete state.memberStateByUserId[userId];
}

function addUser(
  state: ServerVoiceState,
  channelId: string,
  userId: string,
  sessionId: string,
): void {
  removeUser(state, userId);
  state.channelByUserId[userId] = channelId;
  state.membersByChannelId[channelId] = [
    ...new Set([...(state.membersByChannelId[channelId] ?? []), userId]),
  ];
  state.memberStateByUserId[userId] = {
    userId,
    sessionId,
    muted: false,
    deafened: false,
    speaking: false,
    screenSharing: false,
    connectionQuality: "unknown",
  };
}

export function applyVoiceEvent(
  current: ServerVoiceState,
  event: RealtimeEvent,
): ApplyVoiceEventResult {
  if (current.processedEventIds.includes(event.id))
    return { state: current, snapshotRequired: false };
  if (stringPayload(event.payload, "serverId") !== current.serverId)
    return { state: current, snapshotRequired: false };
  const next: ServerVoiceState = {
    ...current,
    channelByUserId: { ...current.channelByUserId },
    membersByChannelId: Object.fromEntries(
      Object.entries(current.membersByChannelId).map(([key, value]) => [
        key,
        [...value],
      ]),
    ),
    memberStateByUserId: { ...current.memberStateByUserId },
    pendingMoveByUserId: { ...current.pendingMoveByUserId },
    processedEventIds: [...current.processedEventIds],
  };
  const version = numberPayload(event.payload, "version");
  if (version !== null && version <= current.version)
    return { state: current, snapshotRequired: false };
  if (version !== null && version > current.version + 1)
    return { state: current, snapshotRequired: true };

  const userId = stringPayload(event.payload, "userId");
  const subjectUserId = stringPayload(event.payload, "subjectUserId");
  if (event.type === "voice.member.move.pending" && subjectUserId) {
    const movementId = stringPayload(event.payload, "movementId");
    const fromChannelId = stringPayload(event.payload, "fromChannelId");
    const toChannelId = stringPayload(event.payload, "toChannelId");
    const expiresAt = stringPayload(event.payload, "expiresAt");
    if (movementId && fromChannelId && toChannelId && expiresAt)
      next.pendingMoveByUserId[subjectUserId] = {
        movementId,
        fromChannelId,
        toChannelId,
        expiresAt,
      };
  } else if (event.type === "voice.member.joined" && userId) {
    const channelId = stringPayload(event.payload, "channelId");
    const sessionId = stringPayload(event.payload, "sessionId");
    if (channelId && sessionId) addUser(next, channelId, userId, sessionId);
  } else if (event.type === "voice.member.left" && userId) {
    const sessionId = stringPayload(event.payload, "sessionId");
    if (
      sessionId &&
      next.memberStateByUserId[userId]?.sessionId === sessionId
    )
      removeUser(next, userId);
  } else if (event.type === "voice.member.moved" && userId) {
    const toChannelId = stringPayload(event.payload, "toChannelId");
    const sessionId = stringPayload(event.payload, "sessionId");
    if (toChannelId && sessionId) addUser(next, toChannelId, userId, sessionId);
    delete next.pendingMoveByUserId[userId];
  } else if (event.type === "voice.member.move.failed" && subjectUserId) {
    delete next.pendingMoveByUserId[subjectUserId];
  } else if (event.type === "voice.member.state.updated" && userId) {
    const previous = next.memberStateByUserId[userId];
    const patch = event.payload.patch;
    if (previous && patch && typeof patch === "object")
      next.memberStateByUserId[userId] = {
        ...previous,
        ...(patch as Partial<VoiceMemberStateDto>),
      };
  } else if (event.type === "voice.server.snapshot.required") {
    return { state: current, snapshotRequired: true };
  }
  if (version !== null) next.version = version;
  rememberEvent(next, event.id);
  return { state: next, snapshotRequired: false };
}
