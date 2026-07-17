import type {
  AuthCodeRecord,
  RefreshRotation,
  RecoveryCodeRecord,
  SecurityEventRecord,
  UserActivityRecord,
  SessionRecord,
  UserRecord,
  ServerGraph,
  ServerRecord,
  ServerWithMemberCount,
  ServerMemberRecord,
  ServerMemberProfile,
  ServerRoleRecord,
  ServerChannelRecord,
  ChannelPermissionOverwriteRecord,
  ServerAuditLogRecord,
  TextMessageRecord,
  TextMessageWithAuthor,
  MessageReactionRecord,
  MessageReactionSummary,
  ChannelReadStateRecord,
  ChannelUnreadCount,
  MessageAttachmentRecord,
  MessageAttachmentMetadata,
  MessageNotificationRecord,
  DirectConversationRecord,
  DirectConversationOverviewRecord,
  DirectMessageRecord,
  DirectMessageWithAuthor,
  DirectMessageAttachmentRecord,
  DirectMessageAttachmentMetadata,
  ChannelLeaseRecord,
} from './domain.js';
import type { DirectMessagePrivacy, PermissionOverwriteTargetType, PlatformRole, PresencePreference, PresenceVisibility } from '@vatrushka/shared';

export interface DataStore {
  healthCheck(): Promise<void>;
  replaceAuthCode(code: AuthCodeRecord): Promise<void>;
  findLatestAuthCode(email: string): Promise<AuthCodeRecord | null>;
  findLatestAuthCodeForPurpose(email: string, purpose: AuthCodeRecord['purpose']): Promise<AuthCodeRecord | null>;
  incrementAuthCodeAttempts(id: string): Promise<number>;
  consumeAuthCode(id: string, at: Date): Promise<boolean>;
  getOrCreateUser(email: string, now: Date): Promise<{ user: UserRecord; isNewUser: boolean }>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUserWithPassword(email: string, passwordHash: string, now: Date): Promise<UserRecord | null>;
  updateDisplayName(id: string, displayName: string, now: Date): Promise<UserRecord | null>;
  updatePresence(id: string, values: { preference: PresencePreference; customText: string | null; customTextExpiresAt: Date | null }, now: Date): Promise<UserRecord | null>;
  updatePrivacySettings(id: string, values: { directMessagePrivacy: DirectMessagePrivacy; presenceVisibility: PresenceVisibility; activityVisible: boolean }, now: Date): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string, now: Date): Promise<UserRecord | null>;
  updateTwoFactor(id: string, secretEncrypted: string | null, enabled: boolean, now: Date): Promise<UserRecord | null>;
  setPlatformRoleByEmail(email: string, role: PlatformRole, now: Date): Promise<UserRecord | null>;
  createSession(session: SessionRecord): Promise<void>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  listSessionsForUser(userId: string): Promise<SessionRecord[]>;
  rotateSession(tokenHash: string, replacement: SessionRecord, now: Date): Promise<RefreshRotation>;
  revokeSessionByHash(tokenHash: string, now: Date): Promise<void>;
  revokeSessionFamily(familyId: string, now: Date): Promise<void>;
  revokeSessionFamilyForUser(userId: string, familyId: string, now: Date): Promise<boolean>;
  setSessionFamilyTrusted(userId: string, familyId: string, trustedAt: Date | null): Promise<boolean>;
  replaceRecoveryCodes(userId: string, codes: RecoveryCodeRecord[]): Promise<void>;
  consumeRecoveryCode(userId: string, codeHash: string, now: Date): Promise<boolean>;
  deleteRecoveryCodes(userId: string): Promise<void>;
  createSecurityEvent(event: SecurityEventRecord): Promise<void>;
  listSecurityEvents(userId: string, limit: number): Promise<SecurityEventRecord[]>;
  createUserActivity(activity: UserActivityRecord): Promise<void>;
  listUserActivity(userId: string, limit: number): Promise<UserActivityRecord[]>;
  createServerGraph(graph: ServerGraph): Promise<boolean>;
  listServersForUser(userId: string): Promise<ServerWithMemberCount[]>;
  findServerById(id: string): Promise<ServerRecord | null>;
  findServerByInviteToken(inviteToken: string): Promise<ServerRecord | null>;
  findServerMember(serverId: string, userId: string): Promise<ServerMemberRecord | null>;
  addServerMember(member: ServerMemberRecord): Promise<boolean>;
  removeServerMember(serverId: string, userId: string): Promise<boolean>;
  listServerMembers(serverId: string): Promise<ServerMemberProfile[]>;
  listServerRoles(serverId: string): Promise<ServerRoleRecord[]>;
  listMemberRoleIds(serverId: string, userId: string): Promise<string[]>;
  listAllMemberRoles(serverId: string): Promise<Array<{ userId: string; roleId: string }>>;
  createServerRole(role: ServerRoleRecord): Promise<void>;
  updateServerRole(id: string, values: Partial<Pick<ServerRoleRecord, 'name' | 'color' | 'permissions' | 'position'>>, now: Date): Promise<ServerRoleRecord | null>;
  reorderServerRole(serverId: string, id: string, currentPosition: number, position: number, now: Date): Promise<ServerRoleRecord | null>;
  deleteServerRole(id: string): Promise<boolean>;
  assignMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<void>;
  listServerChannels(serverId: string): Promise<ServerChannelRecord[]>;
  findServerChannel(id: string): Promise<ServerChannelRecord | null>;
  createServerChannel(channel: ServerChannelRecord): Promise<void>;
  deleteServerChannel(id: string): Promise<boolean>;
  listChannelPermissionOverwrites(channelIds: string[]): Promise<ChannelPermissionOverwriteRecord[]>;
  upsertChannelPermissionOverwrite(overwrite: ChannelPermissionOverwriteRecord): Promise<void>;
  deleteChannelPermissionOverwrite(channelId: string, targetType: PermissionOverwriteTargetType, targetId: string): Promise<boolean>;
  createServerAuditLog(entry: ServerAuditLogRecord): Promise<void>;
  listServerAuditLog(serverId: string, limit: number): Promise<Array<ServerAuditLogRecord & { actorDisplayName: string | null }>>;
  listTextMessages(channelId: string, before: Date | null, limit: number): Promise<TextMessageWithAuthor[]>;
  findTextMessagesWithAuthors(ids: string[]): Promise<TextMessageWithAuthor[]>;
  listMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]>;
  findTextMessage(id: string): Promise<TextMessageRecord | null>;
  createTextMessage(message: TextMessageRecord): Promise<void>;
  updateTextMessage(id: string, content: string, now: Date): Promise<TextMessageRecord | null>;
  deleteTextMessage(id: string): Promise<boolean>;
  addMessageReaction(reaction: MessageReactionRecord): Promise<void>;
  removeMessageReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  markChannelRead(state: ChannelReadStateRecord): Promise<void>;
  listChannelUnreadCounts(channelIds: string[], userId: string, since: Date): Promise<ChannelUnreadCount[]>;
  listMessageAttachments(messageIds: string[]): Promise<MessageAttachmentMetadata[]>;
  listChannelAttachmentStorageKeys(channelId: string): Promise<string[]>;
  listLegacyMessageAttachments(limit: number): Promise<MessageAttachmentRecord[]>;
  findMessageAttachment(id: string): Promise<MessageAttachmentRecord | null>;
  createMessageAttachment(attachment: MessageAttachmentRecord): Promise<void>;
  moveMessageAttachmentToStorage(id: string, storageKey: string): Promise<boolean>;
  deleteMessageAttachment(id: string): Promise<boolean>;
  listMessageNotifications(userId: string, since: Date, afterId: string | null, limit: number): Promise<MessageNotificationRecord[]>;
  getOrCreateDirectConversation(userAId: string, userBId: string, now: Date): Promise<DirectConversationRecord>;
  findDirectConversation(id: string): Promise<DirectConversationRecord | null>;
  listDirectConversationOverviews(userId: string): Promise<DirectConversationOverviewRecord[]>;
  listDirectMessages(conversationId: string, before: Date | null, limit: number): Promise<DirectMessageWithAuthor[]>;
  findDirectMessagesWithAuthors(ids: string[]): Promise<DirectMessageWithAuthor[]>;
  findDirectMessage(id: string): Promise<DirectMessageRecord | null>;
  createDirectMessage(message: DirectMessageRecord): Promise<void>;
  updateDirectMessage(id: string, content: string, now: Date): Promise<DirectMessageRecord | null>;
  deleteDirectMessage(id: string): Promise<boolean>;
  listDirectMessageReactionSummaries(messageIds: string[], currentUserId: string): Promise<MessageReactionSummary[]>;
  addDirectMessageReaction(reaction: MessageReactionRecord): Promise<void>;
  removeDirectMessageReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  markDirectConversationRead(conversationId: string, userId: string, readAt: Date, messageId: string): Promise<boolean>;
  listDirectMessageAttachments(messageIds: string[]): Promise<DirectMessageAttachmentMetadata[]>;
  listLegacyDirectMessageAttachments(limit: number): Promise<DirectMessageAttachmentRecord[]>;
  findDirectMessageAttachment(id: string): Promise<DirectMessageAttachmentRecord | null>;
  createDirectMessageAttachment(attachment: DirectMessageAttachmentRecord): Promise<void>;
  moveDirectMessageAttachmentToStorage(id: string, storageKey: string): Promise<boolean>;
  deleteDirectMessageAttachment(id: string): Promise<boolean>;
  claimChannelLease(channelId: string, participantIdentity: string, participantDisplayName: string, now: Date, leaseSeconds: number): Promise<{ status: 'ok'; lease: ChannelLeaseRecord } | { status: 'busy'; lease: ChannelLeaseRecord }>;
  heartbeatChannelLease(channelId: string, participantIdentity: string, now: Date, leaseSeconds: number): Promise<ChannelLeaseRecord | null>;
  releaseChannelLease(channelId: string, participantIdentity: string): Promise<boolean>;
  releaseChannelLeaseByParticipant(participantIdentity: string): Promise<void>;
  releaseChannelLeaseByChannel(channelId: string): Promise<void>;
}

export interface ObjectStoragePutInput {
  key: string;
  content: Buffer;
  mimeType: string;
}

export interface ObjectStorage {
  healthCheck(): Promise<void>;
  putObject(input: ObjectStoragePutInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  close(): void;
}

export type EphemeralPresenceStatus = 'online' | 'idle' | 'offline';

export interface PresenceStore {
  healthCheck(): Promise<void>;
  heartbeat(userId: string, sessionId: string, idle: boolean, now: Date, ttlSeconds: number): Promise<void>;
  removeSession(userId: string, sessionId: string): Promise<void>;
  status(userId: string, now: Date): Promise<EphemeralPresenceStatus>;
  close(): Promise<void>;
}

export interface Mailer {
  sendOtp(email: string, code: string, expiresInMinutes: number): Promise<void>;
  sendSecurityNotice(email: string, title: string, message: string): Promise<void>;
}

export interface MediaRoomOptions {
  id: string;
  ownerUserId: string;
  name: string;
  maxParticipants: number;
}

export interface MediaTokenOptions {
  roomName: string;
  identity: string;
  displayName: string;
  metadata: Record<string, string>;
  canPublishMicrophone?: boolean;
  canPublishScreen?: boolean;
  canPublishScreenAudio?: boolean;
}

export interface MediaService {
  createRoom(options: MediaRoomOptions): Promise<void>;
  deleteRoom(roomName: string): Promise<void>;
  participantCount(roomName: string): Promise<number>;
  participantExists(roomName: string, identity: string): Promise<boolean>;
  removeParticipant(roomName: string, identity: string): Promise<void>;
  moveParticipant(sourceRoomName: string, identity: string, destinationRoomName: string, permissions: Pick<MediaTokenOptions, 'canPublishMicrophone' | 'canPublishScreen' | 'canPublishScreenAudio'>): Promise<void>;
  participantIdentities(roomName: string): Promise<string[]>;
  issueToken(options: MediaTokenOptions): Promise<string>;
  healthCheck(): Promise<void>;
}
