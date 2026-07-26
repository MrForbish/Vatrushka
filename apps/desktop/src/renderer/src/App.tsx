import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { ConnectionState } from "livekit-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import {
  channelNameSchema,
  codePointLength,
  displayNameSchema,
  inviteTokenSchema,
  messageContentSchema,
  passwordSchema,
  serverNameSchema,
  type ConversationMemberReadState,
  type ConversationMentionDraft,
  type ConversationMessage,
  type ConversationSummary,
  type DesktopSourceInfo,
  type DesktopUpdateState,
  type DirectConversationSummary,
  type DirectMessage,
  type DirectMessageCandidate,
  type EffectivePresenceStatus,
  type HomeDestination,
  type InternalNotification,
  type LocalSettings,
  type MessageDeliveryState,
  type PresencePreference,
  type PublicUser,
  type RoomConnection,
  type ServerDetail,
  type ServerSummary,
  type TextMessage,
  type UserNotificationPreferences,
  type UserPresence,
  type UserProfileSettings,
  type UserUnreadSummary,
  type RealtimeEvent,
} from "@vatrushka/shared";

import { apiClient, ClientError } from "./api.js";
import {
  parseSettingsRoute,
  serverSettingsPath,
  userSettingsPath,
  type ServerSettingsSection,
} from "./app/routes";
import { splitAudioDevices, type AudioDevices } from "./audio-devices.js";
import { AuthPanel, ProfilePanel } from "./components.js";
import { DirectMessagesView } from "./features/direct-messages/index.js";
import {
  HomePage,
  homeDashboardQueryKey,
  useHomeDashboard,
} from "./features/home/index.js";
import { NotificationCenter } from "./features/notifications/NotificationCenter.js";
import {
  SourcePicker,
  type ScreenShareQuality,
} from "./features/screen-share/index.js";
import { ServerView } from "./features/servers/index.js";
import {
  diffRemoteParticipants,
  RoomView,
  VoiceCuePlayer,
  type VoiceCue,
} from "./features/voice/index.js";
import { VoiceProfileConnection } from "./ui";
import {
  applyVoiceEvent,
  voiceStateFromSnapshot,
  type ServerVoiceState,
} from "./features/voice/store/voice-state.js";
import { MediaSession } from "./media.js";
import { RealtimeClient } from "./realtime.js";
import { ConfirmDialog, SystemToolbar } from "./ui";

type Screen = "boot" | "auth" | "profile" | "home" | "server" | "direct";
const media = new MediaSession(apiClient);
const realtime = new RealtimeClient((forceRefresh) =>
  apiClient.realtimeCredentials(forceRefresh),
);
const SettingsRoutePage = lazy(async () => {
  const module = await import("./app/routes/SettingsRoutePage");
  return { default: module.SettingsRoutePage };
});

function toTextMessage(
  message: ConversationMessage,
  server: ServerDetail,
  user: PublicUser,
): TextMessage {
  const author = server.members.find(
    (member) => member.userId === message.author.id,
  );
  return {
    id: message.id,
    channelId: message.conversationId,
    authorUserId: message.author.id,
    authorDisplayName: author?.displayName ?? message.author.displayName,
    authorAvatarUrl: message.author.avatarUrl,
    authorPlatformRole:
      author?.platformRole ??
      (message.author.id === user.id ? user.platformRole : "member"),
    content: message.content,
    mentions: message.mentions.flatMap((mention) =>
      mention.type === "user" &&
      mention.userId &&
      mention.start !== null &&
      mention.length !== null
        ? [
            {
              userId: mention.userId,
              start: mention.start,
              length: mention.length,
              displayName:
                server.members.find(
                  (member) => member.userId === mention.userId,
                )?.displayName ?? "Участник",
            },
          ]
        : [],
    ),
    conversationMentions: message.mentions.flatMap(
      (mention): ConversationMentionDraft[] => {
        if (mention.start === null || mention.length === null) return [];
        if (mention.type === "user" && mention.userId)
          return [
            {
              type: "user",
              userId: mention.userId,
              start: mention.start,
              length: mention.length,
              displayName:
                server.members.find(
                  (member) => member.userId === mention.userId,
                )?.displayName ?? "Участник",
            },
          ];
        if (mention.type === "role" && mention.roleId)
          return [
            {
              type: "role",
              roleId: mention.roleId,
              start: mention.start,
              length: mention.length,
              displayName:
                server.roles
                  .find((role) => role.id === mention.roleId)
                  ?.name.replace(/^@/u, "") ?? "роль",
            },
          ];
        if (mention.type === "everyone")
          return [
            {
              type: "everyone",
              start: mention.start,
              length: mention.length,
              displayName: "everyone",
            },
          ];
        return [];
      },
    ),
    replyTo:
      message.replyTo === null
        ? null
        : {
            messageId: message.replyTo.id,
            authorUserId: message.replyTo.authorId,
            authorDisplayName:
              server.members.find(
                (member) => member.userId === message.replyTo?.authorId,
              )?.displayName ?? message.replyTo.authorDisplayName,
            content: message.replyTo.content,
          },
    reactions: message.reactions,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      messageId: message.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: Number(attachment.sizeBytes),
      createdAt: message.createdAt,
    })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    ...(message.author.id === user.id
      ? { deliveryState: "sent" as const }
      : {}),
  };
}

function projectServerVoiceState(
  server: ServerDetail,
  voiceState: ServerVoiceState | null,
): ServerDetail {
  if (
    !voiceState ||
    voiceState.serverId !== server.id ||
    voiceState.version === 0
  )
    return server;
  const memberById = new Map(server.members.map((member) => [member.userId, member]));
  return {
    ...server,
    channels: server.channels.map((channel) =>
      channel.type !== "voice"
        ? channel
        : {
            ...channel,
            voiceParticipants: (voiceState.membersByChannelId[channel.id] ?? [])
              .map((userId) => {
                const member = memberById.get(userId);
                const session = voiceState.memberStateByUserId[userId];
                if (!member || !session) return null;
                return {
                  identity: `voice:${session.sessionId}`,
                  userId,
                  displayName: member.displayName,
                  platformRole: member.platformRole,
                  avatarUrl: member.avatarUrl ?? null,
                  muted: session.muted,
                  deafened: session.deafened,
                  speaking: session.speaking,
                  screenSharing: session.screenSharing,
                  ...(session.connectionQuality
                    ? { connectionQuality: session.connectionQuality }
                    : {}),
                };
              })
              .filter((participant): participant is NonNullable<typeof participant> => participant !== null),
          },
    ),
  };
}

function messageReached(
  cursor: string | null | undefined,
  messageId: string,
): boolean {
  if (!cursor) return false;
  try {
    return BigInt(cursor) >= BigInt(messageId);
  } catch {
    return cursor.localeCompare(messageId, undefined, { numeric: true }) >= 0;
  }
}

function directDeliveryState(
  message: ConversationMessage,
  user: PublicUser,
  peerReadState: ConversationMemberReadState | null,
): MessageDeliveryState | undefined {
  if (message.author.id !== user.id) return undefined;
  if (messageReached(peerReadState?.lastReadMessageId, message.id))
    return "read";
  if (messageReached(peerReadState?.lastDeliveredMessageId, message.id))
    return "delivered";
  return "sent";
}

function toDirectMessage(
  message: ConversationMessage,
  user: PublicUser,
  conversations: DirectConversationSummary[],
  peerReadState: ConversationMemberReadState | null = null,
): DirectMessage {
  const peer = conversations.find(
    (conversation) => conversation.id === message.conversationId,
  )?.participant;
  const deliveryState = directDeliveryState(message, user, peerReadState);
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.author.id,
    authorDisplayName: message.author.displayName,
    authorAvatarUrl: message.author.avatarUrl,
    authorPlatformRole:
      message.author.id === user.id
        ? user.platformRole
        : (peer?.platformRole ?? "member"),
    content: message.content,
    replyTo:
      message.replyTo === null
        ? null
        : {
            messageId: message.replyTo.id,
            authorUserId: message.replyTo.authorId,
            authorDisplayName: message.replyTo.authorDisplayName,
            content: message.replyTo.content,
          },
    reactions: message.reactions,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      messageId: message.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: Number(attachment.sizeBytes),
      createdAt: message.createdAt,
    })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    ...(deliveryState === undefined ? {} : { deliveryState }),
  };
}

function mergeDirectSummaries(
  legacy: DirectConversationSummary[],
  canonical: ConversationSummary[],
): DirectConversationSummary[] {
  const canonicalById = new Map(
    canonical
      .filter((conversation) => conversation.type === "direct")
      .map((conversation) => [conversation.id, conversation]),
  );
  return legacy
    .map((conversation) => {
      const current = canonicalById.get(conversation.id);
      if (!current) return conversation;
      return {
        ...conversation,
        lastMessage:
          current.lastMessage === null
            ? null
            : {
                authorUserId: current.lastMessage.authorId,
                content: current.lastMessage.content,
                createdAt: current.lastMessage.createdAt,
              },
        unreadCount: current.unreadCount,
        updatedAt: current.updatedAt,
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergeMessages<T extends { id: string; createdAt: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function quietHoursActive(
  preferences: UserNotificationPreferences | null,
  now = new Date(),
): boolean {
  if (
    !preferences?.quietHoursStart ||
    !preferences.quietHoursEnd ||
    !preferences.quietHoursTimezone
  )
    return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: preferences.quietHoursTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const current =
    Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const minutes = (value: string): number =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const start = minutes(preferences.quietHoursStart);
  const end = minutes(preferences.quietHoursEnd);
  return start <= end
    ? current >= start && current < end
    : current >= start || current < end;
}

export default function App(): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("boot");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [profileCoverUrl, setProfileCoverUrl] = useState<string | null>(null);
  const [presence, setPresence] = useState<UserPresence | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<"password" | "register" | "reset">(
    "password",
  );
  const [authStage, setAuthStage] = useState<"credentials" | "otp">(
    "credentials",
  );
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPasswordValue] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [secondFactor, setSecondFactor] = useState<
    "email" | "totp" | "recovery"
  >("email");
  const [totpAvailable, setTotpAvailable] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [connectedVoiceChannelName, setConnectedVoiceChannelName] =
    useState("");
  const [settings, setSettings] = useState<LocalSettings>({
    microphoneVolume: 1,
    outputVolume: 1,
    volume: 1,
    appSoundVolume: 1,
    desktopNotificationsEnabled: true,
    messageSoundsEnabled: true,
  });
  const [devices, setDevices] = useState<AudioDevices>({
    inputs: [],
    outputs: [],
  });
  const [version, setVersion] = useState("0.4.0");
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({
    status: "idle",
    currentVersion: "0.4.0",
  });
  const [platform, setPlatform] = useState("win32");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [voiceLeaveNotice, setVoiceLeaveNotice] = useState<string | null>(null);
  const [sources, setSources] = useState<DesktopSourceInfo[] | null>(null);
  const [settingsServerLoading, setSettingsServerLoading] = useState(false);
  const [settingsServerError, setSettingsServerError] = useState<string | null>(
    null,
  );
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [serverDetail, setServerDetail] = useState<ServerDetail | null>(null);
  const [serverVoiceState, setServerVoiceState] =
    useState<ServerVoiceState | null>(null);
  const [voiceSnapshotRevision, setVoiceSnapshotRevision] = useState(0);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [directConversations, setDirectConversations] = useState<
    DirectConversationSummary[]
  >([]);
  const [directCandidates, setDirectCandidates] = useState<
    DirectMessageCandidate[]
  >([]);
  const [blockedDirectUserIds, setBlockedDirectUserIds] = useState<string[]>(
    [],
  );
  const [activeDirectConversationId, setActiveDirectConversationId] = useState<
    string | null
  >(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [directMessageDraft, setDirectMessageDraft] = useState("");
  const [directPeerReadState, setDirectPeerReadState] =
    useState<ConversationMemberReadState | null>(null);
  const [serverMessageHistory, setServerMessageHistory] = useState<{
    conversationId: string | null;
    before: string | null;
    hasMore: boolean;
    loading: boolean;
  }>({ conversationId: null, before: null, hasMore: false, loading: false });
  const [directMessageHistory, setDirectMessageHistory] = useState<{
    conversationId: string | null;
    before: string | null;
    hasMore: boolean;
    loading: boolean;
  }>({ conversationId: null, before: null, hasMore: false, loading: false });
  const [notifications, setNotifications] = useState<InternalNotification[]>(
    [],
  );
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<{
    before: string | null;
    hasMore: boolean;
    loading: boolean;
  }>({ before: null, hasMore: false, loading: false });
  const [canonicalConversations, setCanonicalConversations] = useState<
    ConversationSummary[]
  >([]);
  const [unreadSummary, setUnreadSummary] = useState<UserUnreadSummary | null>(
    null,
  );
  const [notificationPreferences, setNotificationPreferences] =
    useState<UserNotificationPreferences | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [homeRealtimeRevision, setHomeRealtimeRevision] = useState(0);
  const [serverSettingsRevision, setServerSettingsRevision] = useState(0);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [serverName, setServerName] = useState("");
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(
    null,
  );
  const notificationUserRef = useRef<string | null>(null);
  const notificationInitializedRef = useRef(false);
  const shownNotificationIdsRef = useRef(new Set<string>());
  const voiceCuePlayerRef = useRef<VoiceCuePlayer | null>(null);
  const participantConnectionRef = useRef<RoomConnection | null>(null);
  const previousRemoteParticipantsRef = useRef<Set<string> | null>(null);
  const previousScreenShareActiveRef = useRef<boolean | null>(null);
  const announcedUpdateRef = useRef<string | null>(null);
  const voiceTransitionRef = useRef(false);
  const serverMessageRetryRef = useRef(new Map<string, () => void>());
  const directMessageRetryRef = useRef(new Map<string, () => void>());
  const typingExpiryTimersRef = useRef(new Map<string, number>());
  const typingStopTimerRef = useRef<number | null>(null);
  const lastUserActivityRef = useRef(Date.now());
  const activeVoiceRef = useRef(false);
  const settingsReturnScreenRef = useRef<Screen>("home");
  const mediaSnapshot = useSyncExternalStore(
    media.subscribe,
    media.getSnapshot,
    media.getSnapshot,
  );

  useEffect(() => {
    activeVoiceRef.current = connection !== null;
    if (connection !== null) lastUserActivityRef.current = Date.now();
  }, [connection]);

  useEffect(() => {
    if (!presence || !user) return;
    setServerDetail((current) =>
      current === null
        ? null
        : {
            ...current,
            members: current.members.map((member) =>
              member.userId === user.id
                ? { ...member, presence: presence.effectiveStatus }
                : member,
            ),
            channels: current.channels.map((channel) =>
              channel.voiceParticipants === undefined
                ? channel
                : {
                    ...channel,
                    voiceParticipants: channel.voiceParticipants.map(
                      (participant) =>
                        participant.userId === user.id
                          ? {
                              ...participant,
                              presence: presence.effectiveStatus,
                            }
                          : participant,
                    ),
                  },
            ),
          },
    );
  }, [presence, user]);
  const queryClient = useQueryClient();
  const homeDashboardQuery = useHomeDashboard(user?.id, screen === "home");
  const homePresenceRevision = mediaSnapshot.participants
    .map((participant) => participant.identity)
    .sort()
    .join("|");
  const homeServersRevision = servers
    .map(
      (server) =>
        `${server.id}:${server.memberCount}:${server.iconUrl ?? ""}:${server.bannerUrl ?? ""}:${server.accentColor ?? ""}`,
    )
    .join("|");
  const settingsRouteResult = parseSettingsRoute(location.pathname);
  const settingsRoute =
    settingsRouteResult?.kind === "invalid" ? null : settingsRouteResult;
  const invalidSettingsCanonicalPath =
    settingsRouteResult?.kind === "invalid"
      ? settingsRouteResult.canonicalPath
      : null;
  const settingsServerRouteId =
    settingsRoute?.kind === "server" ? settingsRoute.serverId : null;
  const activeChannelIsText =
    activeChannelId !== null &&
    Boolean(
      serverDetail?.channels.some(
        (channel) => channel.id === activeChannelId && channel.type === "text",
      ),
    );

  useEffect(
    () =>
      media.subscribeTerminated(() => {
        setConnection(null);
        setConnectedVoiceChannelName("");
        previousRemoteParticipantsRef.current = null;
        participantConnectionRef.current = null;
      }),
    [],
  );

  useEffect(() => {
    if (screen === "home") setError(null);
  }, [screen]);

  useEffect(() => {
    if (user === null) {
      realtime.stop();
      return undefined;
    }
    const refresh = (): void => setRealtimeRevision((current) => current + 1);
    const unsubscribeEvent = realtime.onEvent((event) => {
      refresh();
      if (
        event.type === "presence.updated" &&
        typeof event.payload.userId === "string" &&
        isEffectivePresenceStatus(event.payload.effectiveStatus)
      ) {
        const userId = event.payload.userId;
        const presenceStatus = event.payload.effectiveStatus;
        setServerDetail((current) =>
          current === null
            ? null
            : {
                ...current,
                members: current.members.map((member) =>
                  member.userId === userId
                    ? { ...member, presence: presenceStatus }
                    : member,
                ),
                channels: current.channels.map((channel) =>
                  channel.voiceParticipants === undefined
                    ? channel
                    : {
                        ...channel,
                        voiceParticipants: channel.voiceParticipants.map(
                          (participant) =>
                            participant.userId === userId
                              ? { ...participant, presence: presenceStatus }
                              : participant,
                        ),
                      },
                ),
              },
        );
      }
      if (event.type !== "typing.started" && event.type !== "typing.stopped")
        setHomeRealtimeRevision((current) => current + 1);
      if (event.type.startsWith("voice.")) {
        if (
          event.type === "voice.member.move.failed" &&
          typeof event.payload.message === "string"
        )
          setError(event.payload.message);
        if (
          event.type === "voice.member.moved" &&
          event.payload.userId === user.id &&
          typeof event.payload.toChannelId === "string"
        ) {
          const targetChannelId = event.payload.toChannelId;
          setConnection((current) =>
            current
              ? {
                  ...current,
                  roomId: targetChannelId,
                  channelId: targetChannelId,
                  ...(typeof event.payload.channelName === "string"
                    ? { channelName: event.payload.channelName }
                    : {}),
                }
              : current,
          );
          setActiveChannelId(targetChannelId);
          if (typeof event.payload.channelName === "string")
            setConnectedVoiceChannelName(event.payload.channelName);
        }
        setServerVoiceState((current) => {
          if (!current) return current;
          const result = applyVoiceEvent(current, event);
          if (result.snapshotRequired)
            window.queueMicrotask(() =>
              setVoiceSnapshotRevision((revision) => revision + 1),
            );
          return result.state;
        });
      }
      if (
        event.type === "server.updated" ||
        event.type === "server.channel.updated"
      )
        setServerSettingsRevision((current) => current + 1);
      if (
        (event.type !== "typing.started" && event.type !== "typing.stopped") ||
        !event.conversationId ||
        typeof event.payload.userId !== "string" ||
        event.payload.userId === user.id
      )
        return;
      const conversationId = event.conversationId;
      const typingUserId = event.payload.userId;
      const key = `${conversationId}:${typingUserId}`;
      const existingTimer = typingExpiryTimersRef.current.get(key);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);
      const remove = (): void => {
        typingExpiryTimersRef.current.delete(key);
        setTypingUsers((current) => ({
          ...current,
          [conversationId]: (current[conversationId] ?? []).filter(
            (id) => id !== typingUserId,
          ),
        }));
      };
      if (event.type === "typing.stopped") return remove();
      setTypingUsers((current) => ({
        ...current,
        [conversationId]: [
          ...new Set([...(current[conversationId] ?? []), typingUserId]),
        ],
      }));
      typingExpiryTimersRef.current.set(key, window.setTimeout(remove, 9_000));
    });
    const unsubscribeStatus = realtime.onStatus((status) => {
      if (status === "connected") {
        refresh();
        setVoiceSnapshotRevision((revision) => revision + 1);
      }
    });
    realtime.start();
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
      realtime.stop();
      for (const timer of typingExpiryTimersRef.current.values())
        window.clearTimeout(timer);
      typingExpiryTimersRef.current.clear();
      setTypingUsers({});
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || screen !== "server" || !serverDetail) return;
    let active = true;
    const serverId = serverDetail.id;
    void apiClient
      .getServerVoiceState(serverId)
      .then((snapshot) => {
        if (!active) return;
        setServerVoiceState(voiceStateFromSnapshot(snapshot));
        realtime.subscribeVoiceServer(serverId, snapshot.version);
      })
      .catch((caught) => {
        if (active) setError(userMessage(caught));
      });
    return () => {
      active = false;
      realtime.unsubscribeVoiceServer(serverId);
    };
  }, [screen, serverDetail?.id, user?.id, voiceSnapshotRevision]);

  useEffect(() => {
    if (!user || screen !== "home") return;
    for (const server of servers) realtime.subscribeVoiceServer(server.id);
    return () => {
      for (const server of servers) realtime.unsubscribeVoiceServer(server.id);
    };
  }, [homeServersRevision, screen, user?.id]);

  useEffect(() => {
    let conversationId: string | null = null;
    if (screen === "server" && activeChannelId !== null && activeChannelIsText)
      conversationId = activeChannelId;
    if (screen === "direct") conversationId = activeDirectConversationId;
    if (conversationId === null) {
      realtime.setActiveConversation(null);
      return undefined;
    }
    realtime.subscribe(conversationId);
    realtime.setActiveConversation(conversationId);
    return () => {
      realtime.unsubscribe(conversationId);
      realtime.setActiveConversation(null);
    };
  }, [
    activeChannelId,
    activeChannelIsText,
    activeDirectConversationId,
    screen,
  ]);

  useEffect(() => {
    const conversationId =
      screen === "server" && activeChannelIsText
        ? activeChannelId
        : screen === "direct"
          ? activeDirectConversationId
          : null;
    const draft =
      screen === "server"
        ? messageDraft
        : screen === "direct"
          ? directMessageDraft
          : "";
    if (typingStopTimerRef.current !== null)
      window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    if (!conversationId || draft.trim().length === 0) {
      if (conversationId)
        realtime.sendCommand({ type: "typing.stop", conversationId });
      return;
    }
    realtime.sendCommand({ type: "typing.start", conversationId });
    typingStopTimerRef.current = window.setTimeout(() => {
      realtime.sendCommand({ type: "typing.stop", conversationId });
      typingStopTimerRef.current = null;
    }, 4_000);
  }, [
    activeChannelId,
    activeChannelIsText,
    activeDirectConversationId,
    directMessageDraft,
    messageDraft,
    screen,
  ]);

  useEffect(() => {
    if (invalidSettingsCanonicalPath === null) return;
    void navigate(invalidSettingsCanonicalPath, { replace: true });
  }, [invalidSettingsCanonicalPath, navigate]);

  useEffect(() => {
    if (
      settingsServerRouteId === null ||
      user === null ||
      serverDetail?.id === settingsServerRouteId
    )
      return;
    let active = true;
    setSettingsServerLoading(true);
    setSettingsServerError(null);
    void apiClient
      .getServer(settingsServerRouteId)
      .then((detail) => {
        if (!active) return;
        setServerDetail(detail);
        setActiveChannelId((current) =>
          current !== null &&
          detail.channels.some((channel) => channel.id === current)
            ? current
            : (detail.channels[0]?.id ?? null),
        );
      })
      .catch((caught) => {
        if (active) setSettingsServerError(userMessage(caught));
      })
      .finally(() => {
        if (active) setSettingsServerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serverDetail?.id, settingsServerRouteId, user]);

  useEffect(() => {
    if (user === null) return;
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: homeDashboardQueryKey(user.id),
        refetchType: screen === "home" ? "active" : "none",
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    connection?.channelId,
    homePresenceRevision,
    homeServersRevision,
    queryClient,
    homeRealtimeRevision,
    screen,
    user?.id,
  ]);

  const playVoiceCue = useCallback(
    (cue: VoiceCue): void => {
      if (presence?.preference === "do_not_disturb") return;
      voiceCuePlayerRef.current ??= new VoiceCuePlayer();
      voiceCuePlayerRef.current.play(
        cue,
        settings.outputDeviceId,
        settings.appSoundVolume,
      );
    },
    [presence?.preference, settings.appSoundVolume, settings.outputDeviceId],
  );

  const updateUser = (next: PublicUser | null): void => {
    userRef.current = next;
    setUser(next);
  };
  const updateProfileMedia = useCallback(
    (profile: UserProfileSettings): void => {
      setProfileCoverUrl(profile.coverUrl ?? null);
      setUser((current) => {
        if (current === null || current.id !== profile.id) return current;
        const next = { ...current, avatarUrl: profile.avatarUrl };
        userRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (user === null) {
      setProfileCoverUrl(null);
      return;
    }
    let active = true;
    void apiClient
      .getUserProfileSettings()
      .then((profile) => {
        if (!active) return;
        setProfileCoverUrl(profile.coverUrl ?? null);
        setUser((current) => {
          if (current === null || current.id !== user.id) return current;
          // Profile settings may omit media while the authenticated user payload
          // already contains a usable URL. Do not turn a loaded avatar into a
          // fallback merely because this auxiliary request has no avatar value.
          const next = {
            ...current,
            avatarUrl: profile.avatarUrl ?? current.avatarUrl ?? null,
          };
          userRef.current = next;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);
  const loadPresence = useCallback(() => apiClient.getPresence(), []);
  const updatePresenceSettings = useCallback(
    (input: Parameters<typeof apiClient.updatePresence>[0]) =>
      apiClient.updatePresence(input),
    [],
  );
  const updateProfilePresence = useCallback(
    async (preference: PresencePreference): Promise<void> => {
      const current = presence ?? (await apiClient.getPresence());
      const next = await apiClient.updatePresence({
        preference,
        customText: current.customText,
        customTextExpiresAt: current.customTextExpiresAt,
      });
      setPresence(next);
      setHomeRealtimeRevision((revision) => revision + 1);
    },
    [presence],
  );
  const loadPrivacySettings = useCallback(
    () => apiClient.getPrivacySettings(),
    [],
  );
  const updatePrivacySettings = useCallback(
    (input: Parameters<typeof apiClient.updatePrivacySettings>[0]) =>
      apiClient.updatePrivacySettings(input),
    [],
  );
  const loadNotificationPreferences = useCallback(
    () => apiClient.getNotificationPreferences(),
    [],
  );
  const updateServerNotificationPreferences = useCallback(
    async (
      input: Omit<UserNotificationPreferences, "updatedAt">,
    ): Promise<UserNotificationPreferences> => {
      const updated = await apiClient.updateNotificationPreferences(input);
      setNotificationPreferences(updated);
      const next = {
        ...settings,
        desktopNotificationsEnabled: updated.desktopEnabled,
        messageSoundsEnabled: updated.soundEnabled,
      };
      setSettings(next);
      await window.desktop.updateLocalSettings(next);
      return updated;
    },
    [settings],
  );

  useEffect(() => {
    if (user === null) {
      setPresence(null);
      setNotificationPreferences(null);
      return undefined;
    }
    let active = true;
    let inFlight = false;
    const recordActivity = (): void => {
      lastUserActivityRef.current = Date.now();
    };
    const heartbeat = (): void => {
      if (inFlight) return;
      inFlight = true;
      const idle =
        !activeVoiceRef.current &&
        Date.now() - lastUserActivityRef.current >= 5 * 60 * 1_000;
      void apiClient
        .heartbeatPresence(idle)
        .then((next) => {
          if (active) setPresence(next);
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("focus", recordActivity);
    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("focus", recordActivity);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiClient
      .getNotificationPreferences()
      .then((value) => {
        if (active) setNotificationPreferences(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);

  const refreshDevices = useCallback(
    async (requestPermission = false): Promise<void> => {
      let permissionStream: MediaStream | null = null;
      try {
        if (requestPermission)
          permissionStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(splitAudioDevices(all));
      } catch (caught) {
        if (requestPermission)
          throw new Error(
            "Не удалось получить доступ к аудиоустройствам. Проверьте разрешение на микрофон в Windows.",
            { cause: caught },
          );
        setDevices({ inputs: [], outputs: [] });
      } finally {
        permissionStream?.getTracks().forEach((track) => track.stop());
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.onDeepLink((inviteToken) => {
      const parsed = inviteTokenSchema.safeParse(inviteToken);
      if (!parsed.success) return;
      setPendingInviteToken(parsed.data);
      setError(null);
      if (userRef.current) setScreen("home");
    });
    void Promise.all([
      window.desktop.getAppVersion(),
      window.desktop.getPlatform(),
      window.desktop.getLocalSettings(),
      apiClient.restoreSession(),
    ]).then(([appVersion, currentPlatform, localSettings, restoredUser]) => {
      if (!active) return;
      setVersion(appVersion);
      setPlatform(currentPlatform);
      setSettings(localSettings);
      updateUser(restoredUser);
      setScreen(
        restoredUser ? (restoredUser.displayName ? "home" : "profile") : "auth",
      );
    });
    void refreshDevices();
    const onDeviceChange = (): void => {
      void refreshDevices();
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    const unload = (): void => {
      void media.disconnect();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      active = false;
      unsubscribe();
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
      window.removeEventListener("beforeunload", unload);
      void media.disconnect();
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (!user) return;
    void refreshDevices(true).catch((caught) => setError(userMessage(caught)));
  }, [refreshDevices, user?.id]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.onUpdateState((state) => {
      if (active) setUpdateState(state);
    });
    void window.desktop
      .getUpdateState()
      .then((state) => {
        if (active) setUpdateState(state);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(
      () => setRetrySeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [retrySeconds]);

  useEffect(() => {
    const microphoneMissing =
      settings.microphoneDeviceId !== undefined &&
      devices.inputs.length > 0 &&
      !devices.inputs.some(
        (device) => device.deviceId === settings.microphoneDeviceId,
      );
    const outputMissing =
      settings.outputDeviceId !== undefined &&
      devices.outputs.length > 0 &&
      !devices.outputs.some(
        (device) => device.deviceId === settings.outputDeviceId,
      );
    if (!microphoneMissing && !outputMissing) return;
    const next = { ...settings };
    if (microphoneMissing) delete next.microphoneDeviceId;
    if (outputMissing) delete next.outputDeviceId;
    setSettings(next);
    void window.desktop
      .updateLocalSettings(next)
      .catch((caught) => setError(userMessage(caught)));
    if (connection !== null) {
      const fallbacks: Array<Promise<void>> = [];
      if (microphoneMissing) fallbacks.push(media.switchMicrophone("default"));
      if (outputMissing) fallbacks.push(media.switchOutput("default"));
      void Promise.all(fallbacks).catch((caught) =>
        setError(userMessage(caught)),
      );
    }
  }, [connection, devices.inputs, devices.outputs, settings]);

  useEffect(() => {
    if (connection === null) {
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
      return;
    }
    if (participantConnectionRef.current !== connection) {
      participantConnectionRef.current = connection;
      previousRemoteParticipantsRef.current = null;
    }
    const changes = diffRemoteParticipants(
      previousRemoteParticipantsRef.current,
      mediaSnapshot.participants,
    );
    previousRemoteParticipantsRef.current = changes.current;
    if (changes.joined.length > 0) playVoiceCue("join");
    if (changes.left.length > 0) playVoiceCue("leave");
  }, [connection, mediaSnapshot.participants, playVoiceCue]);

  useEffect(() => {
    const active = mediaSnapshot.screenTrack !== null;
    const previous = previousScreenShareActiveRef.current;
    previousScreenShareActiveRef.current = active;
    if (previous === null || previous === active) return;
    playVoiceCue(active ? "stream-start" : "stream-stop");
  }, [mediaSnapshot.screenTrack, playVoiceCue]);

  useEffect(() => {
    const key = updateState.status === "ready" ? updateState.version ?? "ready" : null;
    if (key === null || announcedUpdateRef.current === key) return;
    announcedUpdateRef.current = key;
    playVoiceCue("update");
  }, [playVoiceCue, updateState.status, updateState.version]);

  useEffect(() => {
    if (
      !user ||
      (screen !== "home" && screen !== "server" && screen !== "direct")
    )
      return;
    let active = true;
    let inFlight = false;
    const refresh = (): void => {
      if (inFlight) return;
      inFlight = true;
      void apiClient
        .listServers()
        .then((items) => {
          if (active) setServers(items);
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        })
        .finally(() => {
          inFlight = false;
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [realtimeRevision, screen, user]);

  useEffect(() => {
    if (!user || screen !== "server" || serverDetail === null) return;
    let active = true;
    let inFlight = false;
    const serverId = serverDetail.id;
    const refresh = (): void => {
      if (inFlight) return;
      inFlight = true;
      void apiClient
        .getServer(serverId)
        .then((detail) => {
          if (!active) return;
          setServerDetail(detail);
          setActiveChannelId((current) =>
            current !== null &&
            detail.channels.some((channel) => channel.id === current)
              ? current
              : (detail.channels[0]?.id ?? null),
          );
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        })
        .finally(() => {
          inFlight = false;
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [realtimeRevision, screen, serverDetail?.id, user]);

  useEffect(() => {
    if (
      !user ||
      (screen !== "home" && screen !== "server" && screen !== "direct")
    )
      return;
    if (notificationUserRef.current !== user.id) {
      notificationUserRef.current = user.id;
      shownNotificationIdsRef.current.clear();
      notificationInitializedRef.current = false;
      setNotifications([]);
      setNotificationHistory({ before: null, hasMore: false, loading: false });
    }
    let active = true;
    const poll = (): void => {
      void Promise.all([
        apiClient.listNotifications(undefined, false),
        apiClient.listConversations(),
      ])
        .then(([items, conversations]) => {
          if (!active) return;
          setNotifications((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            for (const item of items) merged.set(item.id, item);
            return [...merged.values()].sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
          });
          setNotificationHistory((current) =>
            current.before === null
              ? {
                  before: items.at(-1)?.createdAt ?? null,
                  hasMore: items.length === 100,
                  loading: false,
                }
              : current,
          );
          setCanonicalConversations(conversations);
          const firstLoad = !notificationInitializedRef.current;
          notificationInitializedRef.current = true;
          const fresh = firstLoad
            ? []
            : items.filter(
                (notification) =>
                  !shownNotificationIdsRef.current.has(notification.id),
              );
          for (const notification of items)
            shownNotificationIdsRef.current.add(notification.id);
          for (const notification of fresh) {
            if (
              Date.now() - new Date(notification.createdAt).getTime() >
              5 * 60_000
            )
              continue;
            if (presence?.preference === "do_not_disturb") continue;
            if (quietHoursActive(notificationPreferences)) continue;
            if (
              notification.type === "direct_message" &&
              notificationPreferences?.directMessagesEnabled === false
            )
              continue;
            if (
              (notification.type === "mention" ||
                notification.type === "reply") &&
              notificationPreferences?.mentionsEnabled === false
            )
              continue;
            const conversation = notification.conversationId
              ? conversations.find(
                  (item) => item.id === notification.conversationId,
                )
              : null;
            const visibleConversationId =
              screen === "server"
                ? activeChannelId
                : screen === "direct"
                  ? activeDirectConversationId
                  : null;
            if (
              document.hasFocus() &&
              document.visibilityState === "visible" &&
              notification.conversationId === visibleConversationId
            )
              continue;
            const preview =
              typeof notification.payload.preview === "string"
                ? notification.payload.preview
                : "Новое событие";
            if (
              notificationPreferences?.soundEnabled ??
              settings.messageSoundsEnabled
            )
              playVoiceCue("message");
            if (
              (notificationPreferences?.desktopEnabled ??
                settings.desktopNotificationsEnabled) &&
              (!document.hasFocus() ||
                document.visibilityState !== "visible") &&
              conversation
            ) {
              const previewMode =
                notificationPreferences?.previewMode ?? "full";
              void window.desktop
                .showMessageNotification({
                  id: notification.id,
                  title:
                    previewMode === "hidden"
                      ? "Новое сообщение"
                      : (notification.actorDisplayName ??
                        (notification.type === "mention"
                          ? `Вас упомянули · #${conversation.title}`
                          : notification.type === "reply"
                            ? `Ответ · #${conversation.title}`
                            : `Новое сообщение · #${conversation.title}`)),
                  body:
                    previewMode === "full"
                      ? preview.slice(0, 700)
                      : previewMode === "sender_only"
                        ? `#${conversation.title}`
                        : "Откройте Ватрушку, чтобы прочитать.",
                  ...(conversation.serverId && conversation.channelId
                    ? {
                        serverId: conversation.serverId,
                        channelId: conversation.channelId,
                      }
                    : { conversationId: conversation.id }),
                  ...(notification.messageId
                    ? { messageId: notification.messageId }
                    : {}),
                  silent: true,
                })
                .catch(() => undefined);
            }
          }
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        });
    };
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    activeChannelId,
    activeDirectConversationId,
    notificationPreferences,
    playVoiceCue,
    presence?.preference,
    realtimeRevision,
    screen,
    settings.desktopNotificationsEnabled,
    settings.messageSoundsEnabled,
    user,
  ]);

  useEffect(() => {
    if (
      !user ||
      (screen !== "home" && screen !== "server" && screen !== "direct")
    )
      return;
    let active = true;
    void apiClient
      .getUnreadSummary()
      .then((summary) => {
        if (!active) return;
        setUnreadSummary(summary);
        const counts = new Map(
          summary.conversations.map((item) => [item.conversationId, item]),
        );
        setServerDetail((current) =>
          current === null
            ? current
            : {
                ...current,
                channels: current.channels.map((channel) => {
                  const unread = counts.get(channel.id);
                  return unread
                    ? {
                        ...channel,
                        unreadCount: unread.unreadCount,
                        mentionCount: unread.mentionCount,
                      }
                    : channel;
                }),
              },
        );
        setDirectConversations((current) =>
          current.map((conversation) => {
            const unread = counts.get(conversation.id);
            return unread
              ? { ...conversation, unreadCount: unread.unreadCount }
              : conversation;
          }),
        );
      })
      .catch((caught) => {
        if (active) setError(userMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [realtimeRevision, screen, user]);

  useEffect(() => {
    const count =
      user && unreadSummary
        ? unreadSummary.totalDirectUnread +
          unreadSummary.totalMentionUnread +
          unreadSummary.totalReplyUnread
        : 0;
    void window.desktop.setBadgeCount(count).catch(() => undefined);
  }, [unreadSummary, user]);

  useEffect(() => {
    if (
      targetMessageId === null ||
      (screen !== "server" && screen !== "direct")
    )
      return;
    const startedAt = Date.now();
    let timer = 0;
    let highlightTimer = 0;
    const findTarget = (): void => {
      const element = document.querySelector<HTMLElement>(
        `[data-message-id="${targetMessageId}"]`,
      );
      if (!element) {
        if (Date.now() - startedAt < 3_000) {
          timer = window.setTimeout(findTarget, 100);
          return;
        }
        setTargetMessageId(null);
        setError("Сообщение удалено или больше недоступно");
        return;
      }
      element.dataset.targeted = "true";
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
      highlightTimer = window.setTimeout(() => {
        element.removeAttribute("data-targeted");
        setTargetMessageId(null);
      }, 1_700);
    };
    timer = window.setTimeout(findTarget, 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(highlightTimer);
      document
        .querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`)
        ?.removeAttribute("data-targeted");
    };
  }, [screen, targetMessageId]);

  useEffect(
    () =>
      window.desktop.onMessageNotificationClick((target) => {
        if (!userRef.current) return;
        if (target.conversationId) {
          setTargetMessageId(target.messageId ?? null);
          setActiveDirectConversationId(target.conversationId);
          setDirectMessages([]);
          setDirectMessageDraft("");
          setScreen("direct");
          return;
        }
        if (!target.serverId || !target.channelId) return;
        const serverId = target.serverId;
        const channelId = target.channelId;
        setTargetMessageId(target.messageId ?? null);
        void apiClient
          .getServer(serverId)
          .then((detail) => {
            if (
              !detail.channels.some(
                (channel) =>
                  channel.id === channelId && channel.type === "text",
              )
            )
              return;
            setServerDetail(detail);
            setActiveChannelId(channelId);
            setMessages([]);
            setError(null);
            setScreen("server");
          })
          .catch((caught) => setError(userMessage(caught)));
      }),
    [],
  );

  useEffect(() => {
    if (
      !user ||
      (screen !== "home" && screen !== "server" && screen !== "direct")
    )
      return;
    let active = true;
    const refresh = (): void => {
      void Promise.all([
        apiClient.listDirectConversations(),
        apiClient.listConversations(),
      ])
        .then(([legacy, canonical]) => {
          if (!active) return;
          const items = mergeDirectSummaries(legacy, canonical);
          setDirectConversations(items);
          if (screen === "direct")
            setActiveDirectConversationId((current) =>
              current !== null &&
              items.some((conversation) => conversation.id === current)
                ? current
                : (items[0]?.id ?? null),
            );
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [realtimeRevision, screen, user]);

  useEffect(() => {
    if (!user || screen !== "direct") return;
    let active = true;
    void apiClient
      .listDirectMessageCandidates()
      .then((items) => {
        if (active) setDirectCandidates(items);
      })
      .catch((caught) => {
        if (active) setError(userMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [screen, user]);

  useEffect(() => {
    if (!user || screen !== "direct" || activeDirectConversationId === null)
      return;
    let active = true;
    let readTimer: number | null = null;
    const conversationId = activeDirectConversationId;
    const refresh = (): void => {
      void Promise.all([
        apiClient.listConversationMessages(conversationId),
        apiClient.listConversationReadStates(conversationId),
      ])
        .then(([page, readStates]) => {
          if (!active) return;
          const peerReadState =
            readStates.find((state) => state.userId !== user.id) ?? null;
          setDirectPeerReadState(peerReadState);
          const items = page.items.map((message) =>
            toDirectMessage(message, user, directConversations, peerReadState),
          );
          setDirectMessages((current) => mergeMessages(current, items));
          setDirectMessageHistory((current) =>
            current.conversationId === conversationId && current.before !== null
              ? current
              : {
                  conversationId,
                  before: page.pageInfo.before,
                  hasMore: page.pageInfo.hasMore,
                  loading: false,
                },
          );
          const latest = items.at(-1);
          if (latest) {
            void apiClient
              .updateConversationReadState(conversationId, {
                lastDeliveredMessageId: latest.id,
              })
              .catch(() => undefined);
            if (readTimer !== null) window.clearTimeout(readTimer);
            if (document.visibilityState === "visible" && document.hasFocus())
              readTimer = window.setTimeout(() => {
                if (
                  !active ||
                  document.visibilityState !== "visible" ||
                  !document.hasFocus()
                )
                  return;
                void apiClient
                  .updateConversationReadState(conversationId, {
                    lastDeliveredMessageId: latest.id,
                    lastReadMessageId: latest.id,
                  })
                  .then(() => {
                    if (!active) return;
                    setDirectConversations((current) =>
                      current.map((conversation) =>
                        conversation.id === conversationId
                          ? { ...conversation, unreadCount: 0 }
                          : conversation,
                      ),
                    );
                    setUnreadSummary((current) => {
                      if (current === null) return current;
                      const conversation = current.conversations.find(
                        (item) => item.conversationId === conversationId,
                      );
                      return {
                        ...current,
                        conversations: current.conversations.filter(
                          (item) => item.conversationId !== conversationId,
                        ),
                        totalDirectUnread: Math.max(
                          0,
                          current.totalDirectUnread -
                            (conversation?.unreadCount ?? 0),
                        ),
                      };
                    });
                  })
                  .catch((caught) => {
                    if (active) setError(userMessage(caught));
                  });
              }, 500);
          }
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (readTimer !== null) window.clearTimeout(readTimer);
    };
  }, [realtimeRevision, screen, activeDirectConversationId, user?.id]);

  useEffect(() => {
    if (!user || screen !== "server" || !serverDetail || !activeChannelId)
      return;
    const channel = serverDetail.channels.find(
      (candidate) => candidate.id === activeChannelId,
    );
    if (channel?.type !== "text") return;
    let active = true;
    let readTimer: number | null = null;
    const refresh = (): void => {
      void apiClient
        .listConversationMessages(channel.id)
        .then((page) => {
          if (!active) return;
          const items = page.items.map((message) =>
            toTextMessage(message, serverDetail, user),
          );
          setMessages((current) => mergeMessages(current, items));
          setServerMessageHistory((current) =>
            current.conversationId === channel.id && current.before !== null
              ? current
              : {
                  conversationId: channel.id,
                  before: page.pageInfo.before,
                  hasMore: page.pageInfo.hasMore,
                  loading: false,
                },
          );
          const latest = items.at(-1);
          if (
            latest &&
            document.visibilityState === "visible" &&
            document.hasFocus()
          ) {
            if (readTimer !== null) window.clearTimeout(readTimer);
            readTimer = window.setTimeout(() => {
              if (
                !active ||
                document.visibilityState !== "visible" ||
                !document.hasFocus()
              )
                return;
              void apiClient
                .updateConversationReadState(channel.id, {
                  lastReadMessageId: latest.id,
                })
                .then(() => {
                  if (!active) return;
                  setServerDetail((current) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          channels: current.channels.map((item) =>
                            item.id === channel.id
                              ? { ...item, unreadCount: 0, mentionCount: 0 }
                              : item,
                          ),
                        },
                  );
                  setUnreadSummary((current) => {
                    if (current === null) return current;
                    const conversation = current.conversations.find(
                      (item) => item.conversationId === channel.id,
                    );
                    return {
                      ...current,
                      conversations: current.conversations.filter(
                        (item) => item.conversationId !== channel.id,
                      ),
                      totalMentionUnread: Math.max(
                        0,
                        current.totalMentionUnread -
                          (conversation?.mentionCount ?? 0),
                      ),
                    };
                  });
                })
                .catch((caught) => {
                  if (active) setError(userMessage(caught));
                });
            }, 500);
          }
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        });
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
      if (readTimer !== null) window.clearTimeout(readTimer);
    };
  }, [realtimeRevision, screen, serverDetail?.id, activeChannelId, user?.id]);

  const run = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (caught) {
        setError(userMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (pendingInviteToken === null || !user?.displayName) return;
    const inviteToken = pendingInviteToken;
    setPendingInviteToken(null);
    void run(async () => {
      const detail = await apiClient.acceptServerInvite(inviteToken);
      setServerDetail(detail);
      setActiveChannelId(
        detail.channels.find((channel) => channel.type === "text")?.id ??
          detail.channels[0]?.id ??
          null,
      );
      setMessages([]);
      setServers(await apiClient.listServers());
      setScreen("server");
    });
  }, [pendingInviteToken, run, user?.displayName]);

  const requestCode = (): void => {
    void run(async () => {
      let response: { retryAfterSeconds: number };
      if (authMode === "reset") {
        response = await apiClient.requestPasswordReset(email);
        setSecondFactor("email");
      } else if (authMode === "register") {
        const validPassword = passwordSchema.parse(password);
        if (validPassword !== passwordConfirmation)
          throw new Error("Пароли не совпадают");
        response = await apiClient.requestRegistration(email, validPassword);
        setSecondFactor("email");
      } else {
        const validPassword = passwordSchema.parse(password);
        const challenge = await apiClient.beginPasswordLogin(
          email,
          validPassword,
          authStage === "otp" ? secondFactor : "auto",
        );
        response = challenge;
        setSecondFactor(challenge.factor);
        setTotpAvailable(challenge.factor === "totp");
      }
      setRetrySeconds(response.retryAfterSeconds);
      setAuthStage("otp");
    });
  };

  const verifyCode = (): void => {
    void run(async () => {
      if (authMode === "reset") {
        const validPassword = passwordSchema.parse(password);
        if (validPassword !== passwordConfirmation)
          throw new Error("Пароли не совпадают");
        await apiClient.completePasswordReset(email, otp, validPassword);
        setAuthMode("password");
        setAuthStage("credentials");
        setOtp("");
        setPasswordValue("");
        setPasswordConfirmation("");
        setAuthNotice("Пароль изменён. Войдите с новым паролем.");
        return;
      }
      const response =
        authMode === "register"
          ? await apiClient.verifyRegistration(email, otp)
          : await apiClient.completePasswordLogin(
              email,
              password,
              otp,
              secondFactor,
              rememberSession,
            );
      updateUser(response.user);
      if (!response.user.displayName) setScreen("profile");
      else setScreen("home");
    });
  };

  const switchPasswordFactor = (
    factor: "email" | "totp" | "recovery",
  ): void => {
    void run(async () => {
      const challenge = await apiClient.beginPasswordLogin(
        email,
        password,
        factor,
      );
      setSecondFactor(challenge.factor);
      setRetrySeconds(challenge.retryAfterSeconds);
      setOtp("");
    });
  };

  const saveProfile = (): void => {
    void run(async () => {
      const name = displayNameSchema.parse(displayName);
      const updated = await apiClient.updateProfile(name);
      updateUser(updated);
      setScreen("home");
    });
  };

  const openDestination = (destination: HomeDestination): void => {
    void run(async () => {
      const detail = await apiClient.getServer(destination.serverId);
      setServerDetail(detail);
      const requestedChannel =
        destination.channelId &&
        detail.channels.some((channel) => channel.id === destination.channelId)
          ? destination.channelId
          : null;
      setActiveChannelId(
        requestedChannel ??
          detail.channels.find((channel) => channel.type === "text")?.id ??
          detail.channels[0]?.id ??
          null,
      );
      setMessages([]);
      setScreen("server");
      if (requestedChannel)
        void apiClient
          .recordOpenedChannel(requestedChannel)
          .catch(() => undefined);
    });
  };

  const joinVoiceFromHome = (serverId: string, channelId: string): void => {
    if (voiceTransitionRef.current) return;
    voiceTransitionRef.current = true;
    void run(async () => {
      try {
        const detail = await apiClient.getServer(serverId);
        setServerDetail(detail);
        setActiveChannelId(channelId);
        setMessages([]);
        await enterVoiceChannel(await apiClient.connectVoiceChannel(channelId));
      } finally {
        voiceTransitionRef.current = false;
      }
    });
  };

  const openServer = (serverId: string): void =>
    openDestination({ type: "server", serverId });

  const openDirectMessages = (): void => {
    void run(async () => {
      const [
        legacyConversations,
        canonicalConversations,
        candidates,
        blockedUsers,
      ] = await Promise.all([
        apiClient.listDirectConversations(),
        apiClient.listConversations(),
        apiClient.listDirectMessageCandidates(),
        apiClient.listBlockedUsers(),
      ]);
      const conversations = mergeDirectSummaries(
        legacyConversations,
        canonicalConversations,
      );
      setDirectConversations(conversations);
      setDirectCandidates(candidates);
      setBlockedDirectUserIds(blockedUsers.map((blocked) => blocked.userId));
      setActiveDirectConversationId((current) =>
        current !== null &&
        conversations.some((conversation) => conversation.id === current)
          ? current
          : (conversations[0]?.id ?? null),
      );
      setDirectMessages([]);
      setDirectMessageDraft("");
      setScreen("direct");
    });
  };

  const selectDirectConversation = (conversationId: string): void => {
    if (conversationId === activeDirectConversationId) return;
    setActiveDirectConversationId(conversationId);
    setDirectMessages([]);
    setDirectMessageDraft("");
    setDirectMessageHistory({
      conversationId: null,
      before: null,
      hasMore: false,
      loading: false,
    });
    setError(null);
  };

  const createDirectConversation = (participantUserId: string): void => {
    void run(async () => {
      const conversation =
        await apiClient.createDirectConversation(participantUserId);
      setDirectConversations((current) => [
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ]);
      setActiveDirectConversationId(conversation.id);
      setDirectMessages([]);
      setDirectMessageDraft("");
    });
  };

  const messageFriendFromHome = (participantUserId: string): void => {
    void run(async () => {
      const conversation =
        await apiClient.createDirectConversation(participantUserId);
      setDirectConversations((current) => [
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ]);
      setActiveDirectConversationId(conversation.id);
      setDirectMessages([]);
      setDirectMessageDraft("");
      setScreen("direct");
    });
  };

  const refreshServer = async (): Promise<ServerDetail> => {
    if (!serverDetail) throw new Error("Сервер не выбран");
    const detail = await apiClient.getServer(serverDetail.id);
    setServerDetail(detail);
    setServers(await apiClient.listServers());
    return detail;
  };

  const createServer = (): void => {
    void run(async () => {
      const detail = await apiClient.createServer(
        serverNameSchema.parse(serverName),
      );
      setServerDetail(detail);
      setActiveChannelId(
        detail.channels.find((channel) => channel.type === "text")?.id ??
          detail.channels[0]?.id ??
          null,
      );
      setServerName("");
      setServers(await apiClient.listServers());
      setScreen("server");
    });
  };

  const sendMessage = (
    replyToMessageId?: string,
    files: File[] = [],
    draftMentions: ConversationMentionDraft[] = [],
  ): void => {
    void run(async () => {
      if (!activeChannelId || !user || !serverDetail) return;
      const content =
        messageDraft.trim().length > 0
          ? messageContentSchema.parse(messageDraft)
          : files.length > 0
            ? ""
            : messageContentSchema.parse(messageDraft);
      const leadingCodePoints =
        codePointLength(messageDraft) -
        codePointLength(messageDraft.trimStart());
      const mentions = draftMentions
        .map((mention) => ({
          ...mention,
          start: mention.start - leadingCodePoints,
        }))
        .filter(
          (mention) =>
            mention.start >= 0 &&
            mention.start + mention.length <= codePointLength(content),
        );
      const clientMessageId = crypto.randomUUID();
      const optimisticId = `optimistic_${clientMessageId}`;
      const replyTarget =
        replyToMessageId === undefined
          ? null
          : (messages.find((message) => message.id === replyToMessageId) ??
            null);
      const optimistic: TextMessage = {
        id: optimisticId,
        channelId: activeChannelId,
        authorUserId: user.id,
        authorDisplayName:
          user.displayName ?? user.email.split("@")[0] ?? "Пользователь",
        authorPlatformRole: user.platformRole,
        content,
        mentions: mentions.flatMap((mention) =>
          mention.type === "user" && mention.userId
            ? [
                {
                  userId: mention.userId,
                  start: mention.start,
                  length: mention.length,
                  displayName: mention.displayName,
                },
              ]
            : [],
        ),
        conversationMentions: mentions,
        replyTo:
          replyTarget === null
            ? null
            : {
                messageId: replyTarget.id,
                authorUserId: replyTarget.authorUserId,
                authorDisplayName: replyTarget.authorDisplayName,
                content: replyTarget.content,
              },
        reactions: [],
        attachments: files.map((file) => ({
          id: `optimistic_${crypto.randomUUID()}`,
          messageId: optimisticId,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
        editedAt: null,
        deliveryState: "sending",
      };
      setMessageDraft("");
      setMessages((current) => [...current, optimistic]);
      const attempt = async (): Promise<void> => {
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticId
              ? { ...message, deliveryState: "sending" }
              : message,
          ),
        );
        try {
          const attachmentIds = await Promise.all(
            files.map((file) => apiClient.uploadConversationAttachment(file)),
          );
          const canonical = await apiClient.createConversationMessage(
            activeChannelId,
            {
              clientMessageId,
              content,
              ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
              attachmentIds,
              mentions: mentions.map((mention) => ({
                type: mention.type,
                ...(mention.userId ? { userId: mention.userId } : {}),
                ...(mention.roleId ? { roleId: mention.roleId } : {}),
                start: mention.start,
                length: mention.length,
              })),
            },
          );
          const created = toTextMessage(canonical, serverDetail, user);
          setMessages((current) => [
            ...current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== created.id,
            ),
            created,
          ]);
          serverMessageRetryRef.current.delete(optimisticId);
        } catch (caught) {
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticId
                ? { ...message, deliveryState: "failed" }
                : message,
            ),
          );
          throw caught;
        }
      };
      serverMessageRetryRef.current.set(optimisticId, () => {
        void run(attempt);
      });
      await attempt();
    });
  };

  const deleteMessage = (messageId: string): void => {
    void run(async () => {
      if (!activeChannelId) return;
      await apiClient.deleteConversationMessage(activeChannelId, messageId);
      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
    });
  };

  const deleteAttachment = (attachmentId: string): void => {
    void run(async () => {
      if (!serverDetail || !user) return;
      const updated = toTextMessage(
        await apiClient.deleteConversationAttachment(attachmentId),
        serverDetail,
        user,
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === updated.id ? updated : message,
        ),
      );
    });
  };

  const downloadAttachment = (attachmentId: string, fileName: string): void => {
    void run(async () => {
      const blob = await apiClient.downloadConversationAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const loadAttachment = useCallback(
    (attachmentId: string): Promise<Blob> =>
      apiClient.downloadConversationAttachment(attachmentId),
    [],
  );

  const updateMessage = (
    messageId: string,
    value: string,
    draftMentions: ConversationMentionDraft[] = [],
  ): void => {
    void run(async () => {
      const content = messageContentSchema.parse(value);
      const leadingCodePoints =
        codePointLength(value) - codePointLength(value.trimStart());
      const mentions = draftMentions
        .map((mention) => ({
          ...mention,
          start: mention.start - leadingCodePoints,
        }))
        .filter(
          (mention) =>
            mention.start >= 0 &&
            mention.start + mention.length <= codePointLength(content),
        );
      if (!activeChannelId || !serverDetail || !user) return;
      const canonical = await apiClient.updateConversationMessage(
        activeChannelId,
        messageId,
        content,
        mentions.map((mention) => ({
          type: mention.type,
          ...(mention.userId ? { userId: mention.userId } : {}),
          ...(mention.roleId ? { roleId: mention.roleId } : {}),
          start: mention.start,
          length: mention.length,
        })),
      );
      const updated = toTextMessage(canonical, serverDetail, user);
      setMessageDraft("");
      setMessages((current) =>
        current.map((message) =>
          message.id === updated.id ? updated : message,
        ),
      );
    });
  };

  const toggleMessageReaction = (messageId: string, emoji: string): void => {
    void run(async () => {
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const active =
        message.reactions.find((reaction) => reaction.emoji === emoji)
          ?.reactedByCurrentUser !== true;
      if (!activeChannelId || !serverDetail || !user) return;
      const canonical = await apiClient.setConversationReaction(
        activeChannelId,
        messageId,
        emoji,
        active,
      );
      const updated = toTextMessage(canonical, serverDetail, user);
      setMessages((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
    });
  };

  const sendDirectMessage = (
    replyToMessageId?: string,
    files: File[] = [],
  ): void => {
    void run(async () => {
      if (activeDirectConversationId === null || !user) return;
      const content =
        directMessageDraft.trim().length > 0
          ? messageContentSchema.parse(directMessageDraft)
          : files.length > 0
            ? ""
            : messageContentSchema.parse(directMessageDraft);
      const conversationId = activeDirectConversationId;
      const clientMessageId = crypto.randomUUID();
      const optimisticId = `optimistic_${clientMessageId}`;
      const replyTarget =
        replyToMessageId === undefined
          ? null
          : (directMessages.find(
              (message) => message.id === replyToMessageId,
            ) ?? null);
      const optimistic: DirectMessage = {
        id: optimisticId,
        conversationId,
        authorUserId: user.id,
        authorDisplayName:
          user.displayName ?? user.email.split("@")[0] ?? "Пользователь",
        authorPlatformRole: user.platformRole,
        content,
        replyTo:
          replyTarget === null
            ? null
            : {
                messageId: replyTarget.id,
                authorUserId: replyTarget.authorUserId,
                authorDisplayName: replyTarget.authorDisplayName,
                content: replyTarget.content,
              },
        reactions: [],
        attachments: files.map((file) => ({
          id: `optimistic_${crypto.randomUUID()}`,
          messageId: optimisticId,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
        editedAt: null,
        deliveryState: "sending",
      };
      setDirectMessageDraft("");
      setDirectMessages((current) => [...current, optimistic]);
      const attempt = async (): Promise<void> => {
        setDirectMessages((current) =>
          current.map((message) =>
            message.id === optimisticId
              ? { ...message, deliveryState: "sending" }
              : message,
          ),
        );
        try {
          const attachmentIds = await Promise.all(
            files.map((file) => apiClient.uploadConversationAttachment(file)),
          );
          const canonical = await apiClient.createConversationMessage(
            conversationId,
            {
              clientMessageId,
              content,
              ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
              attachmentIds,
            },
          );
          const created = toDirectMessage(canonical, user, directConversations);
          setDirectMessages((current) => [
            ...current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== created.id,
            ),
            created,
          ]);
          const [legacy, conversations] = await Promise.all([
            apiClient.listDirectConversations(),
            apiClient.listConversations(),
          ]);
          setDirectConversations(mergeDirectSummaries(legacy, conversations));
          directMessageRetryRef.current.delete(optimisticId);
        } catch (caught) {
          setDirectMessages((current) =>
            current.map((message) =>
              message.id === optimisticId
                ? { ...message, deliveryState: "failed" }
                : message,
            ),
          );
          throw caught;
        }
      };
      directMessageRetryRef.current.set(optimisticId, () => {
        void run(attempt);
      });
      await attempt();
    });
  };

  const updateDirectMessage = (messageId: string, value: string): void => {
    void run(async () => {
      if (!activeDirectConversationId || !user) return;
      const canonical = await apiClient.updateConversationMessage(
        activeDirectConversationId,
        messageId,
        messageContentSchema.parse(value),
      );
      const updated = toDirectMessage(canonical, user, directConversations);
      setDirectMessages((current) =>
        current.map((message) =>
          message.id === updated.id ? updated : message,
        ),
      );
      const [legacy, conversations] = await Promise.all([
        apiClient.listDirectConversations(),
        apiClient.listConversations(),
      ]);
      setDirectConversations(mergeDirectSummaries(legacy, conversations));
    });
  };

  const deleteDirectMessage = (messageId: string): void => {
    void run(async () => {
      if (!activeDirectConversationId) return;
      await apiClient.deleteConversationMessage(
        activeDirectConversationId,
        messageId,
      );
      setDirectMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
      const [legacy, conversations] = await Promise.all([
        apiClient.listDirectConversations(),
        apiClient.listConversations(),
      ]);
      setDirectConversations(mergeDirectSummaries(legacy, conversations));
    });
  };

  const toggleDirectMessageReaction = (
    messageId: string,
    emoji: string,
  ): void => {
    void run(async () => {
      const message = directMessages.find(
        (candidate) => candidate.id === messageId,
      );
      if (!message) return;
      const active =
        message.reactions.find((reaction) => reaction.emoji === emoji)
          ?.reactedByCurrentUser !== true;
      if (!activeDirectConversationId || !user) return;
      const canonical = await apiClient.setConversationReaction(
        activeDirectConversationId,
        messageId,
        emoji,
        active,
      );
      const updated = toDirectMessage(canonical, user, directConversations);
      setDirectMessages((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
    });
  };

  const deleteDirectAttachment = (attachmentId: string): void => {
    void run(async () => {
      if (!user) return;
      const updated = toDirectMessage(
        await apiClient.deleteConversationAttachment(attachmentId),
        user,
        directConversations,
      );
      setDirectMessages((current) =>
        current.map((message) =>
          message.id === updated.id ? updated : message,
        ),
      );
    });
  };

  const downloadDirectAttachment = (
    attachmentId: string,
    fileName: string,
  ): void => {
    void run(async () => {
      const blob = await apiClient.downloadConversationAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const loadDirectAttachment = useCallback(
    (attachmentId: string): Promise<Blob> =>
      apiClient.downloadConversationAttachment(attachmentId),
    [],
  );

  const createCommunityChannel = (
    name: string,
    type: "text" | "voice",
  ): void => {
    void run(async () => {
      if (!serverDetail) return;
      const channel = await apiClient.createServerChannel(
        serverDetail.id,
        channelNameSchema.parse(name),
        type,
      );
      const detail = await refreshServer();
      setActiveChannelId(
        detail.channels.some((candidate) => candidate.id === channel.id)
          ? channel.id
          : activeChannelId,
      );
    });
  };

  const deleteCommunityChannel = (channelId: string): void => {
    void run(async () => {
      const replacementChannel =
        serverDetail?.channels.find(
          (candidate) =>
            candidate.id !== channelId && candidate.type === "text",
        ) ??
        serverDetail?.channels.find((candidate) => candidate.id !== channelId) ??
        null;
      if (activeChannelId === channelId) {
        setActiveChannelId(replacementChannel?.id ?? null);
        setMessages([]);
        setServerMessageHistory({
          conversationId: null,
          before: null,
          hasMore: false,
          loading: false,
        });
      }
      await apiClient.deleteServerChannel(channelId);
      const detail = await refreshServer();
      setActiveChannelId((current) =>
        current === channelId
          ? (detail.channels.find((candidate) => candidate.type === "text")
              ?.id ??
            detail.channels[0]?.id ??
            null)
          : current,
      );
    });
  };

  const renameCommunityChannel = (channelId: string, name: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      const normalizedName = channelNameSchema.parse(name);
      const settings = await apiClient.getServerChannelSettings(
        serverDetail.id,
      );
      const channel = settings.channels.find(
        (candidate) => candidate.id === channelId,
      );
      if (!channel) throw new Error("Канал не найден");
      await apiClient.updateServerChannelSettings(serverDetail.id, channelId, {
        name: normalizedName,
        version: channel.version,
      });
      await refreshServer();
    });
  };

  const kickCommunityMember = (userId: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.kickServerMember(serverDetail.id, userId);
      await refreshServer();
    });
  };

  const enterVoiceChannel = async (
    voiceConnection: RoomConnection,
  ): Promise<void> => {
    if (connection !== null) playVoiceCue("leave");
    participantConnectionRef.current = null;
    previousRemoteParticipantsRef.current = null;
    await media.connect(voiceConnection, settings);
    setConnection(voiceConnection);
    setConnectedVoiceChannelName(
      voiceConnection.channelName ??
        serverDetail?.channels.find(
          (channel) => channel.id === voiceConnection.channelId,
        )?.name ??
        "Голосовой канал",
    );
    setActiveChannelId(voiceConnection.channelId);
    setScreen("server");
    playVoiceCue("join");
    await refreshDevices(true);
  };

  const connectVoiceChannel = (channelId: string): void => {
    if (voiceTransitionRef.current) return;
    voiceTransitionRef.current = true;
    void run(async () => {
      try {
        await enterVoiceChannel(await apiClient.connectVoiceChannel(channelId));
      } finally {
        voiceTransitionRef.current = false;
      }
    });
  };

  const leaveRoom = (): void => {
    void run(async () => {
      const wasScreenSharing = mediaSnapshot.isScreenSharing;
      if (connection !== null) {
        playVoiceCue("leave");
        void apiClient
          .recordLeftVoiceChannel(connection.channelId)
          .catch(() => undefined);
      }
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
      await media.disconnect();
      setConnection(null);
      setConnectedVoiceChannelName("");
      if (wasScreenSharing) {
        setVoiceLeaveNotice("Демонстрация остановлена");
        window.setTimeout(() => setVoiceLeaveNotice(null), 2_500);
      }
      setScreen(serverDetail ? "server" : userRef.current ? "home" : "auth");
    });
  };

  useEffect(() => {
    if (
      !user ||
      (screen !== "home" && screen !== "server" && screen !== "direct")
    )
      return;
    let active = true;
    const poll = (): void => {
      if (voiceTransitionRef.current) return;
      void apiClient
        .pollVoiceMoveRequest()
        .then(async (voiceConnection) => {
          if (
            !active ||
            voiceConnection === null ||
            voiceConnection.channelId === connection?.channelId
          )
            return;
          voiceTransitionRef.current = true;
          try {
            if (serverDetail?.id !== voiceConnection.serverId) {
              const detail = await apiClient.getServer(
                voiceConnection.serverId,
              );
              if (!active) return;
              setServerDetail(detail);
              setMessages([]);
            }
            if (
              voiceConnection.seamlesslyMoved === true &&
              mediaSnapshot.connectionState === ConnectionState.Connected
            ) {
              playVoiceCue("leave");
              participantConnectionRef.current = null;
              previousRemoteParticipantsRef.current = null;
              setConnection(voiceConnection);
              setConnectedVoiceChannelName(
                voiceConnection.channelName ?? "Голосовой канал",
              );
              setActiveChannelId(voiceConnection.channelId);
              setScreen("server");
              playVoiceCue("join");
            } else {
              await enterVoiceChannel(voiceConnection);
            }
          } finally {
            voiceTransitionRef.current = false;
          }
        })
        .catch((caught) => {
          if (active) setError(userMessage(caught));
        });
    };
    poll();
    const timer = window.setInterval(poll, 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    connection?.channelId,
    mediaSnapshot.connectionState,
    playVoiceCue,
    screen,
    serverDetail?.id,
    user,
  ]);

  const moveVoiceMember = (channelId: string, userId: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      const sourceChannelId = serverVoiceState?.channelByUserId[userId];
      const voiceSessionId = serverVoiceState?.memberStateByUserId[userId]?.sessionId;
      const accepted = await apiClient.moveVoiceMember(serverDetail.id, {
        clientRequestId: window.crypto.randomUUID(),
        subjectUserId: userId,
        targetChannelId: channelId,
        ...(sourceChannelId ? { expectedSourceChannelId: sourceChannelId } : {}),
        ...(voiceSessionId ? { expectedVoiceSessionId: voiceSessionId } : {}),
      });
      setServerVoiceState((current) => {
        if (!current || !sourceChannelId) return current;
        const synthetic: RealtimeEvent = {
          id: `local:${accepted.movementId}`,
          type: "voice.member.move.pending",
          occurredAt: new Date().toISOString(),
          conversationId: null,
          targetUserIds: [userId],
          payload: {
            serverId: serverDetail.id,
            movementId: accepted.movementId,
            subjectUserId: userId,
            fromChannelId: sourceChannelId,
            toChannelId: channelId,
            expiresAt: accepted.expiresAt,
          },
        };
        return applyVoiceEvent(current, synthetic).state;
      });
    });
  };

  const performLogout = (): void => {
    void run(async () => {
      if (connection !== null) playVoiceCue("leave");
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
      await media.disconnect();
      await apiClient.logout();
      updateUser(null);
      setConnection(null);
      setConnectedVoiceChannelName("");
      setServerDetail(null);
      setServers([]);
      setDirectConversations([]);
      setDirectCandidates([]);
      setActiveDirectConversationId(null);
      setDirectMessages([]);
      setAuthStage("credentials");
      setOtp("");
      await navigate("/", { replace: true });
      setScreen("auth");
    });
  };
  const requestLogout = (): void => setLogoutConfirmOpen(true);

  const persistDevice = (
    key: "microphoneDeviceId" | "outputDeviceId",
    value: string,
  ): void => {
    const deviceId = value === "default" ? undefined : value;
    const next = { ...settings };
    if (deviceId) next[key] = deviceId;
    else delete next[key];
    const apply = async (): Promise<void> => {
      if (connection !== null)
        await (key === "microphoneDeviceId"
          ? media.switchMicrophone(value)
          : media.switchOutput(value));
      setSettings(next);
      await window.desktop.updateLocalSettings(next);
    };
    if (connection !== null) void run(apply);
    else void apply().catch((caught) => setError(userMessage(caught)));
  };


  const setScreenShareVolume = (value: number): void => {
    const next = { ...settings, volume: value };
    setSettings(next);
    media.setScreenShareAudioVolume(value);
    void window.desktop.updateLocalSettings(next);
  };

  const setAppSoundVolume = (value: number): void => {
    const next = { ...settings, appSoundVolume: Math.max(0, Math.min(1, value)) };
    setSettings(next);
    void window.desktop.updateLocalSettings(next);
  };

  const setMicrophoneVolume = (value: number): void => {
    const next = { ...settings, microphoneVolume: Math.max(0, Math.min(1, value)) };
    setSettings(next);
    media.setMicrophoneVolume(next.microphoneVolume);
    void window.desktop.updateLocalSettings(next);
  };

  const setOutputVolume = (value: number): void => {
    const next = { ...settings, outputVolume: Math.max(0, Math.min(1, value)) };
    setSettings(next);
    media.setOutputVolume(next.outputVolume);
    void window.desktop.updateLocalSettings(next);
  };

  const showSourcePicker = (): void => {
    if (!connection) return;
    if (mediaSnapshot.isScreenSharing) {
      void run(() => media.stopScreenShare());
      return;
    }
    void run(async () => {
      await media.waitForPublishingReady();
      await apiClient.claimScreenShare(connection);
      try {
        const available = await window.desktop.listDesktopSources();
        if (available.length === 0)
          throw new Error("Нет доступных окон или мониторов");
        setSources(available);
      } catch (caught) {
        await apiClient.releaseScreenShare(connection);
        throw caught;
      }
    });
  };

  const cancelSourcePicker = useCallback((): void => {
    setSources(null);
    void window.desktop.clearSelectedDesktopSource();
    if (connection) void apiClient.releaseScreenShare(connection);
  }, [connection]);

  const selectSource = (
    source: DesktopSourceInfo,
    quality: ScreenShareQuality,
    includeAudio: boolean,
  ): void => {
    void run(async () => {
      if (!connection) return;
      try {
        if (
          includeAudio &&
          (!source.audioAvailable ||
            connection.canStreamApplicationAudio === false)
        )
          throw new Error(
            "Для этого источника безопасная передача звука недоступна",
          );
        await media.waitForPublishingReady();
        await apiClient.heartbeatScreenShare(connection);
        await window.desktop.selectDesktopSource(source.id, includeAudio);
        await media.startScreenShare(source, quality, includeAudio);
        await window.desktop.clearSelectedDesktopSource();
        setSources(null);
      } catch (caught) {
        setSources(null);
        await window.desktop.clearSelectedDesktopSource();
        await apiClient.releaseScreenShare(connection);
        throw caught;
      }
    });
  };

  const updateNotificationSettings = (
    values: Pick<
      LocalSettings,
      "desktopNotificationsEnabled" | "messageSoundsEnabled"
    >,
  ): void => {
    const next = { ...settings, ...values };
    setSettings(next);
    void window.desktop
      .updateLocalSettings(next)
      .catch((caught) => setError(userMessage(caught)));
  };
  const handleCurrentSessionRevoked = (): void => {
    updateUser(null);
    void navigate("/", { replace: true });
    setScreen("auth");
  };
  const openNotification = (notification: InternalNotification): void => {
    if (!notification.conversationId) return;
    setTargetMessageId(notification.messageId);
    const conversation = canonicalConversations.find(
      (item) => item.id === notification.conversationId,
    );
    if (
      conversation?.type === "server_channel" &&
      conversation.serverId &&
      conversation.channelId
    ) {
      openDestination({
        type: "text_channel",
        serverId: conversation.serverId,
        channelId: conversation.channelId,
      });
      return;
    }
    if (conversation?.type === "direct") {
      setActiveDirectConversationId(conversation.id);
      setDirectMessages([]);
      setDirectMessageDraft("");
      setScreen("direct");
    }
  };

  const loadOlderDirectMessages = (): void => {
    const conversationId = activeDirectConversationId;
    if (
      conversationId === null ||
      directMessageHistory.conversationId !== conversationId ||
      directMessageHistory.before === null ||
      !directMessageHistory.hasMore ||
      directMessageHistory.loading ||
      !user
    )
      return;
    setDirectMessageHistory((current) => ({ ...current, loading: true }));
    void apiClient
      .listConversationMessages(conversationId, {
        before: directMessageHistory.before,
        limit: 100,
      })
      .then((page) => {
        const older = page.items.map((message) =>
          toDirectMessage(
            message,
            user,
            directConversations,
            directPeerReadState,
          ),
        );
        setDirectMessages((current) => mergeMessages(current, older));
        setDirectMessageHistory({
          conversationId,
          before: page.pageInfo.before,
          hasMore: page.pageInfo.hasMore,
          loading: false,
        });
      })
      .catch((caught) => {
        setDirectMessageHistory((current) => ({ ...current, loading: false }));
        setError(userMessage(caught));
      });
  };

  const loadOlderServerMessages = (): void => {
    const conversationId = activeChannelId;
    if (
      conversationId === null ||
      serverMessageHistory.conversationId !== conversationId ||
      serverMessageHistory.before === null ||
      !serverMessageHistory.hasMore ||
      serverMessageHistory.loading ||
      !user ||
      !serverDetail
    )
      return;
    setServerMessageHistory((current) => ({ ...current, loading: true }));
    void apiClient
      .listConversationMessages(conversationId, {
        before: serverMessageHistory.before,
        limit: 100,
      })
      .then((page) => {
        const older = page.items.map((message) =>
          toTextMessage(message, serverDetail, user),
        );
        setMessages((current) => mergeMessages(current, older));
        setServerMessageHistory({
          conversationId,
          before: page.pageInfo.before,
          hasMore: page.pageInfo.hasMore,
          loading: false,
        });
      })
      .catch((caught) => {
        setServerMessageHistory((current) => ({ ...current, loading: false }));
        setError(userMessage(caught));
      });
  };

  const blockDirectParticipant = (participantUserId: string): void => {
    void run(async () => {
      await apiClient.blockUser(participantUserId);
      setBlockedDirectUserIds((current) =>
        current.includes(participantUserId)
          ? current
          : [...current, participantUserId],
      );
      setDirectMessageDraft("");
      setDirectCandidates(await apiClient.listDirectMessageCandidates());
    });
  };

  const unblockDirectParticipant = (participantUserId: string): void => {
    void run(async () => {
      await apiClient.unblockUser(participantUserId);
      setBlockedDirectUserIds((current) =>
        current.filter((userId) => userId !== participantUserId),
      );
      setDirectCandidates(await apiClient.listDirectMessageCandidates());
    });
  };
  const markNotificationRead = (id: string): void => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
          : item,
      ),
    );
    void apiClient
      .markNotificationRead(id)
      .catch((caught) => setError(userMessage(caught)));
  };
  const dismissNotification = (id: string): void => {
    setNotifications((current) => current.filter((item) => item.id !== id));
    void apiClient
      .dismissNotification(id)
      .catch((caught) => setError(userMessage(caught)));
  };
  const markAllNotificationsRead = (): void => {
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? now })),
    );
    void apiClient
      .markAllNotificationsRead()
      .catch((caught) => setError(userMessage(caught)));
  };
  const loadOlderNotifications = (): void => {
    if (
      !notificationHistory.before ||
      !notificationHistory.hasMore ||
      notificationHistory.loading
    )
      return;
    setNotificationHistory((current) => ({ ...current, loading: true }));
    void apiClient
      .listNotifications(notificationHistory.before, false)
      .then((items) => {
        setNotifications((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          for (const item of items) merged.set(item.id, item);
          return [...merged.values()].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
          );
        });
        setNotificationHistory({
          before: items.at(-1)?.createdAt ?? notificationHistory.before,
          hasMore: items.length === 100,
          loading: false,
        });
      })
      .catch((caught) => {
        setNotificationHistory((current) => ({ ...current, loading: false }));
        setError(userMessage(caught));
      });
  };
  const withNotifications = (content: ReactNode): ReactNode => (
    <>
      {content}
      {voiceLeaveNotice ? (
        <div aria-live="polite" className="vui-voice-leave-notice" role="status">
          {voiceLeaveNotice}
        </div>
      ) : null}
      {user ? (
        <SystemToolbar>
          <NotificationCenter
          appVersion={version}
          hasMore={notificationHistory.hasMore}
          items={notifications}
          loadingMore={notificationHistory.loading}
          onDismiss={dismissNotification}
          onLoadMore={loadOlderNotifications}
          onMarkAllRead={markAllNotificationsRead}
          onOpen={openNotification}
          onRead={markNotificationRead}
          updateInstallBlocked={connection !== null}
          updateState={updateState}
          onInstallUpdate={() =>
            void window.desktop
              .installUpdate()
              .catch((caught) => setError(userMessage(caught)))
          }
          onRetryUpdate={() =>
            void window.desktop
              .checkForUpdates()
              .catch((caught) => setError(userMessage(caught)))
          }
          onCheckUpdate={() =>
            void window.desktop
              .checkForUpdates()
              .catch((caught) => setError(userMessage(caught)))
          }
          />
        </SystemToolbar>
      ) : null}
      <ConfirmDialog
        confirmLabel="Выйти"
        danger
        description="Текущая сессия будет завершена. Для следующего входа снова понадобятся пароль и второй фактор."
        loading={busy}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          performLogout();
        }}
        open={logoutConfirmOpen}
        title="Выйти из аккаунта?"
      />
    </>
  );
  const directUnreadCount =
    unreadSummary?.totalDirectUnread ??
    directConversations.reduce(
      (count, conversation) => count + conversation.unreadCount,
      0,
    );
  // The currently open conversation is marked read immediately. A divider in
  // that view is misleading during the short acknowledgement window and after
  // the current user sends a message.
  const serverFirstUnreadMessageId = null;
  const directFirstUnreadMessageId = null;
  const serverTypingText = activeChannelId
    ? (typingUsers[activeChannelId] ?? [])
        .map(
          (id) =>
            serverDetail?.members.find((member) => member.userId === id)
              ?.displayName,
        )
        .filter((name): name is string => Boolean(name))
        .slice(0, 3)
        .join(", ")
    : "";
  const directTypingText = activeDirectConversationId
    ? (typingUsers[activeDirectConversationId] ?? [])
        .map((id) =>
          directConversations.find(
            (conversation) => conversation.id === activeDirectConversationId,
          )?.participant.userId === id
            ? directConversations.find(
                (conversation) =>
                  conversation.id === activeDirectConversationId,
              )?.participant.displayName
            : null,
        )
        .filter((name): name is string => Boolean(name))
        .join(", ")
    : "";
  const localParticipant = mediaSnapshot.participants.find(
    (participant) => participant.isLocal,
  );
  const localInputLevel =
    connection === null ? undefined : localParticipant?.audioLevel;
  const openConnectedVoice = (): void => {
    if (!connection) return;
    if (serverDetail?.id === connection.serverId) {
      setActiveChannelId(connection.channelId);
      setScreen("server");
      return;
    }
    void run(async () => {
      const detail = await apiClient.getServer(connection.serverId);
      setServerDetail(detail);
      setActiveChannelId(connection.channelId);
      setMessages([]);
      setScreen("server");
    });
  };
  const voiceStage = connection ? (
    <RoomView
      connection={connection}
      snapshot={mediaSnapshot}
      participantNames={
        serverDetail?.id === connection.serverId
          ? Object.fromEntries(
              serverDetail.members.map((member) => [
                member.userId,
                member.displayName,
              ]),
            )
          : undefined
      }
      participantAvatars={
        serverDetail?.id === connection.serverId
          ? Object.fromEntries(
              serverDetail.members.map((member) => [
                member.userId,
                member.avatarUrl ?? null,
              ]),
            )
          : undefined
      }
      voiceParticipants={
        serverDetail?.id === connection.serverId
          ? serverDetail.channels.find(
              (channel) => channel.id === connection.channelId,
            )?.voiceParticipants
          : undefined
      }
      devices={devices}
      microphoneId={settings.microphoneDeviceId}
      microphoneVolume={settings.microphoneVolume ?? 1}
      outputId={settings.outputDeviceId}
      outputVolume={settings.outputVolume ?? 1}
      busy={busy}
      error={error}
      onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))}
      onDeafen={() =>
        void run(() => media.setDeafened(!mediaSnapshot.isDeafened))
      }
      onShare={showSourcePicker}
      onLeave={leaveRoom}
      onKick={(identity) =>
        void run(() => apiClient.kickMediaParticipant(connection, identity))
      }
      onMicrophone={(value) => persistDevice("microphoneDeviceId", value)}
      onMicrophoneVolume={setMicrophoneVolume}
      onOutput={(value) => persistDevice("outputDeviceId", value)}
      onOutputVolume={setOutputVolume}
      onStartAudio={() => void media.startAudio()}
      onScreenAudioMute={() =>
        media.setScreenShareAudioMuted(!mediaSnapshot.screenShareAudioMuted)
      }
      onScreenAudioVolume={setScreenShareVolume}
      onScreenAnnotationStroke={(stroke) => void media.addScreenAnnotationStroke(stroke)}
      onScreenAnnotationUndo={() => void media.undoScreenAnnotation()}
      onScreenAnnotationClear={() => void media.clearScreenAnnotations()}
      onParticipantMute={(identity, muted) =>
        media.setParticipantMuted(identity, muted)
      }
      onParticipantVolume={(identity, volume) =>
        media.setParticipantVolume(identity, volume)
      }
    />
  ) : undefined;
  const voiceProfileConnection = connection ? (
    <VoiceProfileConnection
      channelName={connectedVoiceChannelName}
      deafened={mediaSnapshot.isDeafened}
      microphoneMuted={mediaSnapshot.isMuted}
      onDeafenToggle={() =>
        void run(() => media.setDeafened(!mediaSnapshot.isDeafened))
      }
      onLeave={leaveRoom}
      onMicrophoneToggle={() =>
        void run(() => media.setMuted(!mediaSnapshot.isMuted))
      }
      onOpen={openConnectedVoice}
      participantCount={mediaSnapshot.participants.length}
      state={
        mediaSnapshot.connectionState === ConnectionState.Connected
          ? "connected"
          : mediaSnapshot.connectionState === ConnectionState.Reconnecting ||
              mediaSnapshot.connectionState === ConnectionState.SignalReconnecting
            ? "reconnecting"
            : "connecting"
      }
    />
  ) : undefined;
  const openUserSettings = (): void => {
    settingsReturnScreenRef.current = screen;
    void navigate(userSettingsPath());
  };
  const openAudioSettings = (): void => {
    settingsReturnScreenRef.current = screen;
    void navigate(userSettingsPath("audio"));
  };
  const openServerSettings = (
    section: ServerSettingsSection = "overview",
  ): void => {
    if (serverDetail === null) return;
    settingsReturnScreenRef.current = "server";
    // Administrators land on Overview; regular members land on the one settings
    // section they can use for their server name and private aliases.
    const destination =
      section === "roles"
        ? serverDetail.permissions.includes("MANAGE_SERVER")
          ? "overview"
          : "members"
        : section;
    void navigate(serverSettingsPath(serverDetail.id, destination));
  };
  const refreshSettingsServer = async (): Promise<void> => {
    if (settingsServerRouteId === null) return;
    const [detail, summaries] = await Promise.all([
      apiClient.getServer(settingsServerRouteId),
      apiClient.listServers(),
    ]);
    setServerDetail(detail);
    setServers(summaries);
    if (user !== null) {
      await queryClient.invalidateQueries({
        queryKey: homeDashboardQueryKey(user.id),
        refetchType: "all",
      });
    }
  };
  const handleSettingsServerDeleted = (): void => {
    setServerDetail(null);
    setActiveChannelId(null);
    void apiClient
      .listServers()
      .then(setServers)
      .catch((caught) => setError(userMessage(caught)));
    void navigate("/", { replace: true });
    setScreen("home");
  };
  const closeSettings = (): void => {
    const returnScreen =
      settingsRoute?.kind === "server" &&
      serverDetail?.id === settingsRoute.serverId
        ? "server"
        : settingsReturnScreenRef.current;
    void navigate("/", { replace: true });
    setScreen(
      returnScreen === "boot" ||
        returnScreen === "auth" ||
        returnScreen === "profile"
        ? "home"
        : returnScreen,
    );
  };
  const leaveSettingsForHome = (): void => {
    void navigate("/", { replace: true });
    setError(null);
    setScreen("home");
  };
  const leaveSettingsForDirectMessages = (): void => {
    void navigate("/", { replace: true });
    openDirectMessages();
  };
  const leaveSettingsForServer = (serverId: string): void => {
    void navigate("/", { replace: true });
    openServer(serverId);
  };

  if (screen === "boot")
    return withNotifications(
      <main className="bootScreen">
        <div className="pulseLogo">
          <span />
        </div>
        <span>Подключаем «Ватрушку»…</span>
      </main>,
    );
  if (screen === "auth")
    return withNotifications(
      <AuthPanel
        mode={authMode}
        stage={authStage}
        factor={secondFactor}
        totpAvailable={totpAvailable}
        email={email}
        code={otp}
        password={password}
        passwordConfirmation={passwordConfirmation}
        rememberSession={rememberSession}
        retrySeconds={retrySeconds}
        busy={busy}
        error={error}
        notice={authNotice}
        onMode={(mode) => {
          setAuthMode(mode);
          setAuthStage("credentials");
          setOtp("");
          setPasswordValue("");
          setPasswordConfirmation("");
          setError(null);
          setAuthNotice(null);
        }}
        onReset={() => {
          setAuthMode("reset");
          setAuthStage("credentials");
          setOtp("");
          setPasswordValue("");
          setPasswordConfirmation("");
          setError(null);
          setAuthNotice(null);
        }}
        onEmailChange={setEmail}
        onCodeChange={setOtp}
        onPasswordChange={setPasswordValue}
        onPasswordConfirmationChange={setPasswordConfirmation}
        onRememberSessionChange={setRememberSession}
        onRequest={requestCode}
        onVerify={verifyCode}
        onFactor={switchPasswordFactor}
        onBack={() => {
          setAuthStage("credentials");
          setOtp("");
          setError(null);
        }}
      />,
    );
  if (screen === "profile")
    return withNotifications(
      <ProfilePanel
        value={displayName}
        busy={busy}
        error={error}
        onChange={setDisplayName}
        onSave={saveProfile}
      />,
    );
  if (settingsRoute !== null && user !== null)
    return withNotifications(
      <Suspense
        fallback={
          <main className="bootScreen">
            <div className="pulseLogo">
              <span />
            </div>
            <span>Открываем настройки…</span>
          </main>
        }
      >
        <SettingsRoutePage
          busy={busy}
          devices={devices}
          directUnreadCount={directUnreadCount}
          error={settingsRoute.kind === "server" ? settingsServerError : null}
          inputLevel={localInputLevel ?? 0}
          loading={
            settingsRoute.kind === "server" &&
            (settingsServerLoading ||
              (serverDetail?.id !== settingsRoute.serverId &&
                settingsServerError === null))
          }
          microphoneId={settings.microphoneDeviceId}
          onBack={closeSettings}
          onCreateServer={leaveSettingsForHome}
          onCurrentSessionRevoked={handleCurrentSessionRevoked}
          onDirectMessages={leaveSettingsForDirectMessages}
          onHome={leaveSettingsForHome}
          onMicrophone={(deviceId) =>
            persistDevice("microphoneDeviceId", deviceId)
          }
          onAppSoundVolume={setAppSoundVolume}
          onMicrophoneVolume={setMicrophoneVolume}
          onNavigate={(path) => {
            void navigate(path);
          }}
          onNotificationSettingsChange={updateNotificationSettings}
          onOpenServer={leaveSettingsForServer}
          onServerChanged={refreshSettingsServer}
          onServerDeleted={handleSettingsServerDeleted}
          onOutput={(deviceId) => persistDevice("outputDeviceId", deviceId)}
          onOutputVolume={setOutputVolume}
          onRefreshDevices={() => {
            void run(() => refreshDevices(true));
          }}
          onTestOutput={() => playVoiceCue("message")}
          onLoadPresence={loadPresence}
          onLoadPrivacy={loadPrivacySettings}
          onLoadNotificationPreferences={loadNotificationPreferences}
          onPresenceChange={setPresence}
          onUpdatePresence={updatePresenceSettings}
          onUpdatePrivacy={updatePrivacySettings}
          onUpdateNotificationPreferences={updateServerNotificationPreferences}
          onLogout={requestLogout}
          onProfileMediaChange={updateProfileMedia}
          onUserChange={updateUser}
          outputId={settings.outputDeviceId}
          presence={presence}
          presenceEnabled
          route={settingsRoute}
          serverSettingsRevision={serverSettingsRevision}
          server={
            serverDetail?.id ===
            (settingsRoute.kind === "server" ? settingsRoute.serverId : "")
              ? serverDetail
              : null
          }
          servers={servers}
          settings={settings}
          profileCoverUrl={profileCoverUrl}
          user={user}
          voiceConnected={connection !== null}
          voiceProfileConnection={voiceProfileConnection}
        />
      </Suspense>,
    );
  if (screen === "home" && user)
    return withNotifications(
      <HomePage
        user={user}
        version={version}
        devices={devices}
        microphoneId={settings.microphoneDeviceId}
        outputId={settings.outputDeviceId}
        microphoneMuted={mediaSnapshot.isMuted}
        voicePingMs={mediaSnapshot.pingMs}
        voiceConnectionQuality={
          mediaSnapshot.connectionState === ConnectionState.Connected
            ? localParticipant?.connectionQuality === "Отличное"
              ? "excellent"
              : localParticipant?.connectionQuality === "Хорошее"
                ? "good"
                : "poor"
            : undefined
        }
        busy={busy}
        error={error}
        servers={servers}
        serverName={serverName}
        directUnreadCount={directUnreadCount}
        connection={connection}
        dashboard={homeDashboardQuery.data}
        dashboardLoading={
          homeDashboardQuery.isFetching && homeDashboardQuery.data === undefined
        }
        dashboardError={
          homeDashboardQuery.error
            ? userMessage(homeDashboardQuery.error)
            : null
        }
        onRetryDashboard={() => void homeDashboardQuery.refetch()}
        onLogout={requestLogout}
        onSecurity={openUserSettings}
        onStatus={updateProfilePresence}
        status={presence?.effectiveStatus}
        onAudioSettings={openAudioSettings}
        onServerName={setServerName}
        onCreateServer={createServer}
        onOpenServer={openServer}
        onOpenDestination={openDestination}
        onJoinVoice={joinVoiceFromHome}
        onMessageFriend={messageFriendFromHome}
        onDirectMessages={openDirectMessages}
        profileCoverUrl={profileCoverUrl}
        voiceProfileConnection={voiceProfileConnection}
      />,
    );
  if (screen === "server" && user && serverDetail)
    return withNotifications(
      <>
        <ServerView
          user={user}
          server={projectServerVoiceState(serverDetail, serverVoiceState)}
          servers={servers}
          activeChannelId={activeChannelId}
          messages={messages}
          messageDraft={messageDraft}
          serverName={serverName}
          busy={busy}
          error={error}
          directUnreadCount={directUnreadCount}
          typingText={serverTypingText}
          firstUnreadMessageId={serverFirstUnreadMessageId}
          targetMessageId={targetMessageId}
          hasOlderMessages={
            serverMessageHistory.conversationId === activeChannelId &&
            serverMessageHistory.hasMore
          }
          loadingOlderMessages={serverMessageHistory.loading}
          connectedVoiceChannelId={
            connection?.serverId === serverDetail.id
              ? connection.channelId
              : undefined
          }
          connectedVoiceServerId={connection?.serverId}
          voiceStage={voiceStage}
          voiceProfileConnection={voiceProfileConnection}
          voiceConnectionStatus={
            connection === null
              ? undefined
              : (
                  <span
                    className="vui-server-topbar__connection-status"
                    data-state={
                      mediaSnapshot.connectionState === ConnectionState.Connected
                        ? "connected"
                        : mediaSnapshot.connectionState === ConnectionState.Reconnecting ||
                            mediaSnapshot.connectionState === ConnectionState.SignalReconnecting
                          ? "reconnecting"
                          : "disconnected"
                    }
                    role="status"
                  >
                    <i aria-hidden="true" />
                    <strong>
                      {mediaSnapshot.connectionState === ConnectionState.Connected
                        ? "Вы подключены"
                        : mediaSnapshot.connectionState === ConnectionState.Reconnecting ||
                            mediaSnapshot.connectionState === ConnectionState.SignalReconnecting
                          ? "Переподключение…"
                          : "Подключение…"}
                    </strong>
                    {mediaSnapshot.pingMs === null || mediaSnapshot.pingMs === undefined ? null : (
                      <small>{mediaSnapshot.pingMs} мс</small>
                    )}
                  </span>
                )
          }
          onBack={() => setScreen("home")}
          onDirectMessages={openDirectMessages}
          onSwitchServer={openServer}
          onChannel={(channelId) => {
            if (channelId === activeChannelId) return;
            setActiveChannelId(channelId);
            setMessages([]);
            setServerMessageHistory({
              conversationId: null,
              before: null,
              hasMore: false,
              loading: false,
            });
            setError(null);
            void apiClient
              .recordOpenedChannel(channelId)
              .catch(() => undefined);
          }}
          onMessageDraft={setMessageDraft}
          onSendMessage={sendMessage}
          onUpdateMessage={updateMessage}
          onMessageReaction={toggleMessageReaction}
          onDeleteMessage={deleteMessage}
          onDeleteAttachment={deleteAttachment}
          onDownloadAttachment={downloadAttachment}
          onLoadAttachment={loadAttachment}
          onLoadOlderMessages={loadOlderServerMessages}
          onRetryMessage={(messageId) =>
            serverMessageRetryRef.current.get(messageId)?.()
          }
          onConnectVoice={connectVoiceChannel}
          onMoveVoiceMember={moveVoiceMember}
          pendingVoiceMemberIds={Object.keys(
            serverVoiceState?.pendingMoveByUserId ?? {},
          )}
          onCopyInvite={() =>
            window.desktop.copyToClipboard(serverDetail.inviteUrl)
          }
          onCreateChannel={createCommunityChannel}
          onRenameChannel={renameCommunityChannel}
          onDeleteChannel={deleteCommunityChannel}
          onKickMember={kickCommunityMember}
          onServerName={setServerName}
          onCreateServer={createServer}
          onSecurity={openUserSettings}
          onPresenceChange={setPresence}
          onServerSettings={() => openServerSettings("overview")}
          onLogout={requestLogout}
          profileCoverUrl={profileCoverUrl}
        />
        {sources && (
          <SourcePicker
            audioAllowed={connection?.canStreamApplicationAudio !== false}
            audioProtectionAvailable={supportsOwnAudioExclusion()}
            busy={busy}
            sources={sources}
            platform={platform}
            onSelect={selectSource}
            onCancel={cancelSourcePicker}
          />
        )}
      </>,
    );
  if (screen === "direct" && user)
    return withNotifications(
      <DirectMessagesView
        user={user}
        servers={servers}
        conversations={directConversations}
        candidates={directCandidates}
        activeConversationId={activeDirectConversationId}
        messages={directMessages}
        messageDraft={directMessageDraft}
        serverName={serverName}
        busy={busy}
        error={error}
        typingText={directTypingText}
        blockedParticipantIds={blockedDirectUserIds}
        firstUnreadMessageId={directFirstUnreadMessageId}
        targetMessageId={targetMessageId}
        hasOlderMessages={
          directMessageHistory.conversationId === activeDirectConversationId &&
          directMessageHistory.hasMore
        }
        loadingOlderMessages={directMessageHistory.loading}
        onHome={() => setScreen("home")}
        onSwitchServer={openServer}
        onConversation={selectDirectConversation}
        onCreateConversation={createDirectConversation}
        onBlockParticipant={blockDirectParticipant}
        onUnblockParticipant={unblockDirectParticipant}
        onMessageDraft={setDirectMessageDraft}
        onSendMessage={sendDirectMessage}
        onUpdateMessage={updateDirectMessage}
        onMessageReaction={toggleDirectMessageReaction}
        onDeleteMessage={deleteDirectMessage}
        onDeleteAttachment={deleteDirectAttachment}
        onDownloadAttachment={downloadDirectAttachment}
        onLoadAttachment={loadDirectAttachment}
        onLoadOlderMessages={loadOlderDirectMessages}
        onRetryMessage={(messageId) =>
          directMessageRetryRef.current.get(messageId)?.()
        }
        onServerName={setServerName}
        onCreateServer={createServer}
        onSecurity={openUserSettings}
        onLogout={requestLogout}
        profileCoverUrl={profileCoverUrl}
        presenceStatus={presence?.effectiveStatus}
        onStatus={updateProfilePresence}
        voiceProfileConnection={voiceProfileConnection}
      />,
    );
  return withNotifications(
    <main className="bootScreen">
      <span>Не удалось открыть экран</span>
      <button
        className="secondaryButton"
        onClick={() => setScreen(user ? "home" : "auth")}
      >
        Вернуться
      </button>
    </main>,
  );
}

function supportsOwnAudioExclusion(): boolean {
  const constraints = navigator.mediaDevices.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { restrictOwnAudio?: boolean })
    | undefined;
  return constraints?.restrictOwnAudio === true;
}

function isEffectivePresenceStatus(
  value: unknown,
): value is EffectivePresenceStatus {
  return value === "online" || value === "idle" || value === "dnd" || value === "offline";
}

function userMessage(error: unknown): string {
  if (
    error instanceof ClientError &&
    typeof error.details === "object" &&
    error.details !== null &&
    "message" in error.details &&
    typeof error.details.message === "string"
  )
    return error.details.message;
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
