import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { WebhookReceiver } from "livekit-server-sdk";
import { z, ZodError } from "zod";

import {
  API_PREFIX,
  beginPasswordLoginSchema,
  completePasswordLoginSchema,
  completePasswordResetSchema,
  createChannelSchema,
  createMessageSchema,
  createDirectConversationSchema,
  createDirectMessageSchema,
  createRoleSchema,
  createServerSchema,
  createApiError,
  errorMessages,
  inviteTokenSchema,
  messageQuerySchema,
  messageNotificationQuerySchema,
  messageReactionSchema,
  markChannelReadSchema,
  refreshSchema,
  requestRegistrationSchema,
  requestPasswordResetSchema,
  screenShareActionSchema,
  sessionTrustSchema,
  serverPermissions,
  setPasswordSchema,
  twoFactorCodeSchema,
  updateProfileSchema,
  updatePresenceSchema,
  presenceHeartbeatSchema,
  updateOwnVoiceStateSchema,
  updatePrivacySettingsSchema,
  updateMessageSchema,
  updateRoleSchema,
  assignMemberRolesSchema,
  channelPermissionOverwriteSchema,
  canonicalMessageIdSchema,
  conversationHistoryQuerySchema,
  createConversationMessageSchema,
  updateConversationMessageSchema,
  updateConversationReadStateSchema,
  notificationQuerySchema,
  createAttachmentIntentSchema,
  updateUserNotificationPreferencesSchema,
  updateServerNotificationPreferencesSchema,
  updateConversationNotificationPreferencesSchema,
  reorderRoleSchema,
  archiveServerSchema,
  banServerMemberSchema,
  createServerCategorySchema,
  createServerInviteSchema,
  deleteServerSchema,
  serverAppearanceUploadIntentSchema,
  serverAuditQuerySchema,
  serverDangerReauthenticationSchema,
  transferServerOwnershipSchema,
  updateServerAppearanceSchema,
  updateServerCategorySchema,
  updateServerChannelSettingsSchema,
  updateServerMemberSchema,
  updateOwnServerDisplayNameSchema,
  updateServerMemberAliasSchema,
  updateServerModerationSchema,
  updateServerOverviewSchema,
  accountReauthenticationSchema,
  confirmEmailChangeSchema,
  requestEmailChangeSchema,
  updateUserAvatarSchema,
  updateUserProfileCoverSchema,
  updateUserProfileSettingsSchema,
  userAvatarUploadIntentSchema,
  userProfileCoverUploadIntentSchema,
  verifyRegistrationSchema,
} from "@vatrushka/shared";

import { AppError } from "./app-error.js";
import type { AppConfig } from "./config.js";
import { MAX_ATTACHMENT_BYTES, type VatrushkaService } from "./service.js";
import type { RedisRealtimeBus } from "./services/realtime.js";
import { WebSocketGateway } from "./services/websocket-gateway.js";
import { technicalMetrics } from "./services/metrics.js";

const serverIdParams = z.object({ serverId: z.uuid() });
const channelIdParams = z.object({ channelId: z.uuid() });
const serverRoleParams = z.object({ serverId: z.uuid(), roleId: z.uuid() });
const serverMemberParams = z.object({ serverId: z.uuid(), userId: z.uuid() });
const messageIdParams = z.object({ messageId: z.uuid() });
const attachmentIdParams = z.object({ attachmentId: z.uuid() });
const directConversationIdParams = z.object({ conversationId: z.uuid() });
const messageReactionParams = z.object({
  messageId: z.uuid(),
  emoji: messageReactionSchema,
});
const channelParticipantParams = z.object({
  channelId: z.uuid(),
  participantIdentity: z.string().min(3).max(200),
});
const channelMemberParams = z.object({ channelId: z.uuid(), userId: z.uuid() });
const channelOverwriteParams = z.object({
  channelId: z.uuid(),
  targetType: z.enum(["ROLE", "MEMBER"]),
  targetId: z.uuid(),
});
const authSessionParams = z.object({ sessionId: z.uuid() });
const inviteTokenParams = z.object({ inviteToken: inviteTokenSchema });
const conversationIdParams = z.object({ conversationId: z.uuid() });
const canonicalMessageParams = z.object({
  conversationId: z.uuid(),
  messageId: canonicalMessageIdSchema,
});
const canonicalReactionParams = canonicalMessageParams.extend({
  emoji: messageReactionSchema,
});
const notificationIdParams = z.object({ notificationId: z.uuid() });
const serverCategoryParams = z.object({
  serverId: z.uuid(),
  categoryId: z.uuid(),
});
const serverInviteParams = z.object({ serverId: z.uuid(), inviteId: z.uuid() });
const serverSettingsChannelParams = z.object({
  serverId: z.uuid(),
  channelId: z.uuid(),
});
const userIdParams = z.object({ userId: z.uuid() });

const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().nullable(),
  requestId: z.string(),
});

const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  platformRole: z.enum(["member", "admin", "owner"]),
  hasPassword: z.boolean(),
  twoFactorEnabled: z.boolean(),
  avatarUrl: z.string().nullable().optional(),
});
const userPresenceResponseSchema = z.object({
  preference: z.enum(["online", "idle", "do_not_disturb", "invisible"]),
  effectiveStatus: z.enum(["online", "idle", "dnd", "offline"]),
  customText: z.string().nullable(),
  customTextExpiresAt: z.string().nullable(),
  updatedAt: z.string(),
});
const userPrivacyResponseSchema = z.object({
  directMessages: z.enum(["shared_servers", "nobody"]),
  presenceVisibility: z.enum(["shared_servers", "nobody"]),
  activityVisible: z.boolean(),
  updatedAt: z.string(),
});
const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: publicUserSchema,
  isNewUser: z.boolean(),
});
const userSessionResponseSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  current: z.boolean(),
  trusted: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
});
const recoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
const securityEventResponseSchema = z.object({
  id: z.string(),
  type: z.enum([
    "SESSION_CREATED",
    "SESSION_REVOKED",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET",
    "TWO_FACTOR_ENABLED",
    "TWO_FACTOR_DISABLED",
    "RECOVERY_CODES_REGENERATED",
    "REFRESH_TOKEN_REUSE_DETECTED",
    "PROFILE_UPDATED",
    "USERNAME_CHANGED",
    "EMAIL_CHANGED",
    "ACCOUNT_DEACTIVATION_SCHEDULED",
    "ACCOUNT_DEACTIVATION_CANCELLED",
  ]),
  deviceName: z.string().nullable(),
  createdAt: z.string(),
});
const connectionSchema = z.object({
  roomId: z.string(),
  ownerUserId: z.string(),
  livekitUrl: z.string(),
  livekitToken: z.string(),
  participantIdentity: z.string(),
  voiceSessionId: z.string().optional(),
  participantDisplayName: z.string(),
  isOwner: z.boolean(),
  contextType: z.literal("channel"),
  serverId: z.string(),
  channelId: z.string(),
  serverName: z.string().optional(),
  channelName: z.string().optional(),
  canSpeak: z.boolean().optional(),
  canStream: z.boolean().optional(),
  canStreamApplicationAudio: z.boolean().optional(),
  canMoveMembers: z.boolean().optional(),
  seamlesslyMoved: z.boolean().optional(),
});
const voiceMemberStateResponseSchema = z.object({
  userId: z.uuid(),
  sessionId: z.string(),
  muted: z.boolean(),
  deafened: z.boolean(),
  speaking: z.boolean(),
  screenSharing: z.boolean(),
  connectionQuality: z
    .enum(["excellent", "good", "poor", "unknown"])
    .optional(),
});
const serverVoiceStateResponseSchema = z.object({
  serverId: z.uuid(),
  version: z.number().int().nonnegative(),
  generatedAt: z.string(),
  channels: z.array(
    z.object({
      channelId: z.uuid(),
      members: z.array(voiceMemberStateResponseSchema),
    }),
  ),
});
const moveVoiceMemberRequestSchema = z
  .object({
    clientRequestId: z.uuid(),
    subjectUserId: z.uuid(),
    targetChannelId: z.uuid(),
    expectedSourceChannelId: z.uuid().optional(),
    expectedVoiceSessionId: z.string().min(1).max(200).optional(),
  })
  .strict();
const moveVoiceMemberAcceptedSchema = z.object({
  movementId: z.uuid(),
  status: z.literal("pending"),
  expiresAt: z.string(),
});
const permissionSchema = z.enum(serverPermissions);
const serverRoleResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number(),
  isDefault: z.boolean(),
  kind: z.enum(["EVERYONE", "OWNER", "CUSTOM"]).optional(),
  permissions: z.array(permissionSchema),
});
const permissionOverwriteResponseSchema = z.object({
  channelId: z.string(),
  targetType: z.enum(["ROLE", "MEMBER"]),
  targetId: z.string(),
  allow: z.array(permissionSchema),
  deny: z.array(permissionSchema),
});
const voiceChannelParticipantResponseSchema = z.object({
  identity: z.string(),
  userId: z.string(),
  displayName: z.string(),
  platformRole: z.enum(["member", "admin", "owner"]),
  avatarUrl: z.string().nullable().optional(),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
  speaking: z.boolean().optional(),
  screenSharing: z.boolean().optional(),
  connectionQuality: z
    .enum(["excellent", "good", "poor", "unknown"])
    .optional(),
});
const serverChannelResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  type: z.enum(["text", "voice"]),
  position: z.number(),
  unreadCount: z.number(),
  mentionCount: z.number().optional(),
  voiceParticipants: z.array(voiceChannelParticipantResponseSchema).optional(),
  permissions: z.array(permissionSchema).optional(),
  permissionOverwrites: z.array(permissionOverwriteResponseSchema).optional(),
});
const serverMemberResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  serverDisplayName: z.string().nullable(),
  privateAlias: z.string().nullable(),
  platformRole: z.enum(["member", "admin", "owner"]),
  avatarUrl: z.string().nullable().optional(),
  joinedAt: z.string(),
  roles: z.array(serverRoleResponseSchema),
  presence: z.enum(["online", "idle", "dnd", "offline"]).optional(),
  customStatusText: z.string().nullable().optional(),
});
const serverSummaryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  inviteUrl: z.url(),
  ownerUserId: z.string(),
  memberCount: z.number(),
  createdAt: z.string(),
  description: z.string().nullable().optional(),
  iconUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  visibility: z.enum(["private", "public"]).optional(),
});
const publicServerSummaryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  iconUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  memberCount: z.number(),
  featured: z.boolean(),
  joined: z.boolean(),
});
const serverDetailResponseSchema = serverSummaryResponseSchema.extend({
  description: z.string().nullable(),
  channels: z.array(serverChannelResponseSchema),
  roles: z.array(serverRoleResponseSchema),
  members: z.array(serverMemberResponseSchema),
  permissions: z.array(permissionSchema),
});
const homeDestinationResponseSchema = z.object({
  type: z.enum(["server", "text_channel", "voice_channel"]),
  serverId: z.string(),
  channelId: z.string().optional(),
});
const homeServerResponseSchema = serverSummaryResponseSchema.extend({
  unreadCount: z.number(),
  activeVoiceCount: z.number(),
});
const homeContinueResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["active_call", "server", "text_channel", "voice_channel"]),
  title: z.string(),
  subtitle: z.string(),
  participantCount: z.number(),
  active: z.boolean(),
  lastActivityAt: z.string(),
  destination: homeDestinationResponseSchema,
});
const homeActiveSpaceResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["voice_channel", "text_channel"]),
  title: z.string(),
  subtitle: z.string(),
  participants: z.array(z.object({ id: z.string(), displayName: z.string() })),
  participantCount: z.number(),
  hasVoiceActivity: z.boolean(),
  unreadCount: z.number(),
  lastActivityAt: z.string(),
  destination: homeDestinationResponseSchema,
});
const homeActivityTypeSchema = z.enum([
  "opened_channel",
  "joined_voice",
  "left_voice",
  "sent_message",
  "joined_server",
  "mention_received",
]);
const homeRecentActivityResponseSchema = z.object({
  id: z.string(),
  type: homeActivityTypeSchema,
  title: z.string(),
  context: z.string(),
  occurredAt: z.string(),
  destination: homeDestinationResponseSchema.nullable(),
});
const homeOnboardingStepResponseSchema = z.object({
  id: z.enum(["create_server", "configure_channels", "invite_members"]),
  title: z.string(),
  description: z.string(),
  complete: z.boolean(),
  destination: homeDestinationResponseSchema.nullable(),
});
const gamingHomeVoiceSpaceResponseSchema = z.object({
  channelId: z.string(),
  serverId: z.string(),
  serverName: z.string(),
  serverIconUrl: z.string().nullable(),
  serverAccentColor: z.string().nullable(),
  channelName: z.string(),
  gameName: z.string().nullable(),
  coverUrl: z.string().nullable(),
  participantCount: z.number(),
  participantLimit: z.number().nullable(),
  friendCount: z.number(),
  participantAvatars: z.array(z.string()),
  hasScreenShare: z.boolean(),
  hasFreeSlots: z.boolean(),
  canJoin: z.boolean(),
  lastActivityAt: z.string(),
});
const homeDashboardResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    presence: z.enum(["online", "idle", "dnd", "offline"]),
    platformBadge: z.literal("FOUNDER_DEVELOPER").nullable(),
  }),
  readiness: z.object({
    connection: z.enum(["healthy", "degraded", "offline"]),
    audioSetupRequired: z.boolean(),
  }),
  servers: z.array(homeServerResponseSchema),
  continueItems: z.array(homeContinueResponseSchema),
  activeSpaces: z.array(homeActiveSpaceResponseSchema),
  recentActivity: z.array(homeRecentActivityResponseSchema),
  onboarding: z.object({
    visible: z.boolean(),
    steps: z.array(homeOnboardingStepResponseSchema),
  }),
  gaming: z.object({
    voiceStatus: z.object({
      microphone: z.object({
        available: z.boolean(),
        enabled: z.boolean(),
        label: z.string().nullable(),
      }),
      output: z.object({
        available: z.boolean(),
        label: z.string().nullable(),
      }),
      pingMs: z.number().nullable(),
      connectionQuality: z.enum(["excellent", "good", "poor", "offline"]),
    }),
    quickReturn: z.array(
      gamingHomeVoiceSpaceResponseSchema.extend({
        returnReason: z.enum([
          "current_voice",
          "recently_left",
          "friends_inside",
          "screen_share",
          "pinned",
        ]),
      }),
    ),
    activeSpaces: z.array(gamingHomeVoiceSpaceResponseSchema),
    friendsInGame: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
        presence: z.enum(["online", "away", "dnd"]),
        gameName: z.string().nullable(),
        gameDetails: z.string().nullable(),
        voiceChannel: z
          .object({
            channelId: z.string(),
            serverId: z.string(),
            channelName: z.string(),
            canJoin: z.boolean(),
          })
          .nullable(),
      }),
    ),
  }),
});
const serverAuditLogResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  actorUserId: z.string().nullable(),
  actorDisplayName: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  createdAt: z.string(),
});
const serverOverviewSettingsResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  timezone: z.string(),
  systemChannelId: z.string().nullable(),
  welcomeChannelId: z.string().nullable(),
  defaultNotificationLevel: z.enum(["all", "mentions", "none"]),
  defaultVoiceInactivitySeconds: z.number(),
  visibility: z.enum(["private", "public"]),
  ownerUserId: z.string(),
  ownerDisplayName: z.string(),
  version: z.number(),
  updatedAt: z.string(),
});
const serverAppearanceSettingsResponseSchema = z.object({
  iconUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  version: z.number(),
});
const serverSettingsMemberResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  username: z.string().nullable(),
  serverDisplayName: z.string().nullable(),
  privateAlias: z.string().nullable(),
  platformRole: z.enum(["member", "admin", "owner"]),
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
  mutedUntil: z.string().nullable(),
  deafened: z.boolean(),
  roleIds: z.array(z.string()),
});
const serverCategoryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
});
const serverChannelSettingsResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "voice"]),
  position: z.number(),
  categoryId: z.string().nullable(),
  slowModeSeconds: z.number(),
  maxParticipants: z.number().nullable(),
  bitrate: z.number().nullable(),
  version: z.number(),
  archivedAt: z.string().nullable(),
});
const serverInviteSettingsResponseSchema = z.object({
  id: z.string(),
  createdByUserId: z.string().nullable(),
  createdByDisplayName: z.string(),
  destinationChannelId: z.string().nullable(),
  tokenPreview: z.string(),
  expiresAt: z.string().nullable(),
  maxUses: z.number().nullable(),
  useCount: z.number(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
const serverModerationSettingsResponseSchema = z.object({
  verificationLevel: z.enum(["none", "email_verified", "account_age"]),
  newMemberRestrictionMinutes: z.number(),
  messageRateLimitPerMinute: z.number(),
  mentionLimitPerMessage: z.number(),
  rules: z.string().nullable(),
  version: z.number(),
});
const serverBanSettingsResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  actorUserId: z.string().nullable(),
  actorDisplayName: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});
const userProfileSettingsResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  username: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  coverUrl: z.string().nullable().optional(),
  usernameChangedAt: z.string().nullable(),
  updatedAt: z.string(),
});
const blockedUserSettingsResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  username: z.string().nullable(),
  blockedAt: z.string(),
});
const userAccountSettingsResponseSchema = z.object({
  email: z.string(),
  emailVerified: z.boolean(),
  pendingEmail: z.string().nullable(),
  deactivationScheduledAt: z.string().nullable(),
  deletionAt: z.string().nullable(),
  ownsServers: z.boolean(),
});
const messageAttachmentResponseSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  createdAt: z.string(),
});
const messageNotificationResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  serverName: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  authorUserId: z.string(),
  authorDisplayName: z.string(),
  content: z.string(),
  mention: z.boolean().optional(),
  createdAt: z.string(),
});
const messageNotificationPageResponseSchema = z.object({
  items: z.array(messageNotificationResponseSchema),
  cursor: z
    .object({ createdAt: z.string(), id: z.string().nullable() })
    .nullable(),
});
const messageMentionResponseSchema = z.object({
  userId: z.string(),
  start: z.number(),
  length: z.number(),
  displayName: z.string(),
});
const textMessageResponseSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  authorUserId: z.string(),
  authorDisplayName: z.string(),
  authorAvatarUrl: z.string().nullable().optional(),
  authorPlatformRole: z.enum(["member", "admin", "owner"]),
  content: z.string(),
  mentions: z.array(messageMentionResponseSchema).optional(),
  replyTo: z
    .object({
      messageId: z.string(),
      authorUserId: z.string(),
      authorDisplayName: z.string(),
      content: z.string(),
    })
    .nullable(),
  reactions: z.array(
    z.object({
      emoji: z.string(),
      count: z.number(),
      reactedByCurrentUser: z.boolean(),
    }),
  ),
  attachments: z.array(messageAttachmentResponseSchema),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});
const directMessageParticipantResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  platformRole: z.enum(["member", "admin", "owner"]),
  avatarUrl: z.string().nullable().optional(),
});
const directConversationResponseSchema = z.object({
  id: z.string(),
  participant: directMessageParticipantResponseSchema,
  lastMessage: z
    .object({
      authorUserId: z.string(),
      content: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const directMessageCandidateResponseSchema =
  directMessageParticipantResponseSchema.extend({
    sharedServerNames: z.array(z.string()),
  });
const directMessageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  authorUserId: z.string(),
  authorDisplayName: z.string(),
  authorAvatarUrl: z.string().nullable().optional(),
  authorPlatformRole: z.enum(["member", "admin", "owner"]),
  content: z.string(),
  replyTo: z
    .object({
      messageId: z.string(),
      authorUserId: z.string(),
      authorDisplayName: z.string(),
      content: z.string(),
    })
    .nullable(),
  reactions: z.array(
    z.object({
      emoji: z.string(),
      count: z.number(),
      reactedByCurrentUser: z.boolean(),
    }),
  ),
  attachments: z.array(messageAttachmentResponseSchema),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});
const canonicalConversationResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["server_channel", "direct", "group_direct"]),
  serverId: z.string().nullable(),
  channelId: z.string().nullable(),
  title: z.string(),
  updatedAt: z.string(),
  lastMessage: z
    .object({
      id: z.string(),
      authorId: z.string(),
      content: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number(),
  mentionCount: z.number(),
});
const canonicalMessageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  clientMessageId: z.string(),
  author: z.object({
    id: z.string(),
    displayName: z.string(),
    username: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  content: z.string(),
  replyTo: z
    .object({
      id: z.string(),
      authorId: z.string(),
      authorDisplayName: z.string(),
      content: z.string(),
    })
    .nullable(),
  attachments: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      durationMs: z.number().nullable(),
    }),
  ),
  reactions: z.array(
    z.object({
      emoji: z.string(),
      count: z.number(),
      reactedByCurrentUser: z.boolean(),
    }),
  ),
  mentions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["user", "role", "everyone"]),
      userId: z.string().nullable(),
      roleId: z.string().nullable(),
      start: z.number().nullable(),
      length: z.number().nullable(),
    }),
  ),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
const canonicalMessagePageResponseSchema = z.object({
  items: z.array(canonicalMessageResponseSchema),
  pageInfo: z.object({
    before: z.string().nullable(),
    after: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
const canonicalReadStateResponseSchema = z.object({
  conversationId: z.string(),
  lastDeliveredMessageId: z.string().nullable(),
  lastReadMessageId: z.string().nullable(),
  lastDeliveredAt: z.string().nullable(),
  lastReadAt: z.string().nullable(),
  mentionCount: z.number(),
});
const canonicalMemberReadStateResponseSchema =
  canonicalReadStateResponseSchema.extend({ userId: z.string() });
const unreadSummaryResponseSchema = z.object({
  totalDirectUnread: z.number(),
  totalMentionUnread: z.number(),
  totalReplyUnread: z.number(),
  conversations: z.array(
    z.object({
      conversationId: z.string(),
      unreadCount: z.number(),
      mentionCount: z.number(),
      firstUnreadMessageId: z.string().nullable(),
    }),
  ),
});
const userNotificationPreferencesResponseSchema =
  updateUserNotificationPreferencesSchema.extend({ updatedAt: z.string() });
const serverNotificationPreferencesResponseSchema =
  updateServerNotificationPreferencesSchema.extend({
    serverId: z.uuid(),
    updatedAt: z.string(),
  });
const conversationNotificationPreferencesResponseSchema =
  updateConversationNotificationPreferencesSchema.extend({
    conversationId: z.uuid(),
    updatedAt: z.string(),
  });
const internalNotificationResponseSchema = z.object({
  id: z.string(),
  type: z.enum([
    "message",
    "direct_message",
    "mention",
    "reply",
    "server_invite",
    "moderation",
    "system",
  ]),
  actorUserId: z.string().nullable(),
  conversationId: z.string().nullable(),
  messageId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  actorDisplayName: z.string().nullable().optional(),
  actorAvatarUrl: z.string().nullable().optional(),
  conversationTitle: z.string().nullable().optional(),
  serverId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
});
const attachmentIntentResponseSchema = z.object({
  attachmentId: z.string(),
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});

export interface BuildAppOptions {
  config: AppConfig;
  service: VatrushkaService;
  logger?: boolean;
  realtimeBus?: RedisRealtimeBus | undefined;
}

export const logRedactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "req.body.code",
  "req.body.otp",
  "req.body.recoveryCode",
  "req.body.password",
  "req.body.refreshToken",
  "refreshToken",
  "accessToken",
  "token",
  "livekitToken",
  "SMTP_PASSWORD",
  "LIVEKIT_API_SECRET",
  "S3_SECRET_ACCESS_KEY",
  "ACCESS_TOKEN_SECRET",
  "CREDENTIAL_ENCRYPTION_KEY",
  "OTP_PEPPER",
] as const;

function routeErrors(): Record<number, typeof errorResponseSchema> {
  return {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    410: errorResponseSchema,
    413: errorResponseSchema,
    429: errorResponseSchema,
    500: errorResponseSchema,
    503: errorResponseSchema,
  };
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const { config, service } = options;
  const requestStartedAt = new WeakMap<object, number>();
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [...logRedactPaths],
              censor: "[REDACTED]",
            },
          },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 64 * 1024,
    trustProxy: config.NODE_ENV === "production",
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onRequest", (request, _reply, done) => {
    requestStartedAt.set(request, performance.now());
    done();
  });
  app.addHook("onResponse", (request, reply, done) => {
    const startedAt = requestStartedAt.get(request) ?? performance.now();
    const route = request.routeOptions.url || "unmatched";
    const labels = {
      method: request.method,
      route,
      status_class: `${Math.floor(reply.statusCode / 100)}xx`,
    };
    technicalMetrics.increment("api_http_requests_total", 1, labels);
    technicalMetrics.observeHistogram(
      "api_http_request_duration_seconds",
      Math.max(0, performance.now() - startedAt) / 1_000,
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      labels,
    );
    done();
  });
  app.addContentTypeParser(
    "application/webhook+json",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  await app.register(cors, {
    origin(origin, callback) {
      const allowed = config.CORS_ALLOWED_ORIGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      callback(
        null,
        !origin ||
          origin === "null" ||
          (config.NODE_ENV !== "production" &&
            origin.startsWith("http://localhost:")) ||
          allowed.includes(origin),
      );
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 },
  });
  await app.register(rateLimit, {
    global: false,
    max: 60,
    timeWindow: "1 minute",
    ban: 2,
  });
  if (options.realtimeBus) {
    await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
    const gateway = new WebSocketGateway(service, options.realtimeBus);
    app.get("/ws", { websocket: true }, (socket) => gateway.handle(socket));
    app.addHook("onClose", () => gateway.close());
  }
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  if (config.NODE_ENV !== "production") {
    await app.register(swagger, {
      openapi: {
        info: { title: `${config.APP_NAME} API`, version: "0.1.0" },
        servers: [{ url: config.PUBLIC_API_URL }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        technicalMetrics.increment("api_errors_total", 1, {
          code: error.code,
          route: request.routeOptions.url || "unmatched",
          status_class: `${Math.floor(error.statusCode / 100)}xx`,
        });
        request.log.error(
          { err: error.cause ?? error, code: error.code },
          "API dependency error",
        );
      }
      void reply
        .status(error.statusCode)
        .send(
          createApiError(
            error.code,
            request.id,
            error.details,
            error.message || errorMessages[error.code],
          ),
        );
      return;
    }
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      void reply
        .status(400)
        .send(createApiError("VALIDATION_ERROR", request.id, details));
      return;
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//u, "").replaceAll("/", "."),
        message: issue.message ?? "Некорректное значение",
      }));
      void reply
        .status(400)
        .send(createApiError("VALIDATION_ERROR", request.id, details));
      return;
    }
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      void reply
        .status(400)
        .send(
          createApiError("VALIDATION_ERROR", request.id, [
            { field: "body", message: "Некорректный JSON" },
          ]),
        );
      return;
    }
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      void reply.status(429).send(createApiError("RATE_LIMITED", request.id));
      return;
    }
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 413
    ) {
      void reply
        .status(413)
        .send(createApiError("ATTACHMENT_TOO_LARGE", request.id));
      return;
    }
    request.log.error({ err: error }, "Unhandled API error");
    technicalMetrics.increment("api_errors_total", 1, {
      code: "INTERNAL_ERROR",
      route: request.routeOptions.url || "unmatched",
      status_class: "5xx",
    });
    void reply.status(500).send(createApiError("INTERNAL_ERROR", request.id));
  });

  const api = app.withTypeProvider<ZodTypeProvider>();

  api.get(
    "/health/live",
    {
      schema: {
        tags: ["health"],
        response: { 200: z.object({ status: z.literal("ok") }) },
      },
    },
    () => ({ status: "ok" as const }),
  );

  api.get(
    "/health/ready",
    {
      schema: {
        tags: ["health"],
        response: {
          200: z.object({ status: z.literal("ready") }),
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await service.store.healthCheck();
        technicalMetrics.set("api_readiness", 1);
      } catch {
        technicalMetrics.set("api_readiness", 0);
        return reply
          .status(503)
          .send(createApiError("INTERNAL_ERROR", request.id));
      }
      try {
        await service.media.healthCheck();
      } catch {
        return reply
          .status(503)
          .send(createApiError("LIVEKIT_UNAVAILABLE", request.id));
      }
      try {
        await service.objectStorage?.healthCheck();
      } catch {
        return reply
          .status(503)
          .send(createApiError("MEDIA_STORAGE_UNAVAILABLE", request.id));
      }
      try {
        await service.presenceStore.healthCheck();
      } catch {
        return reply
          .status(503)
          .send(
            createApiError("INTERNAL_ERROR", request.id, {
              dependency: "presence",
            }),
          );
      }
      try {
        await service.voicePresenceStore.healthCheck();
      } catch {
        return reply
          .status(503)
          .send(
            createApiError("INTERNAL_ERROR", request.id, {
              dependency: "voice_presence",
            }),
          );
      }
      return { status: "ready" as const };
    },
  );

  api.get(
    "/i/:inviteToken",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { params: inviteTokenParams },
    },
    (request, reply) =>
      reply
        .status(302)
        .header("Cache-Control", "no-store")
        .header(
          "Location",
          `${config.APP_PROTOCOL}://invite/${request.params.inviteToken}`,
        )
        .send(),
  );

  api.post(
    `${API_PREFIX}/auth/register/request-code`,
    {
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: requestRegistrationSchema,
        response: {
          200: z.object({
            status: z.literal("CODE_SENT"),
            retryAfterSeconds: z.number(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.requestRegistration(request.body.email, request.body.password),
  );

  api.post(
    `${API_PREFIX}/auth/register/verify-code`,
    {
      config: { rateLimit: { max: 15, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: verifyRegistrationSchema,
        response: { 200: authResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.verifyRegistration(
        request.body.email,
        request.body.code,
        request.body.deviceName,
      ),
  );

  api.post(
    `${API_PREFIX}/auth/password/reset/request-code`,
    {
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: requestPasswordResetSchema,
        response: {
          200: z.object({
            status: z.literal("CODE_SENT"),
            retryAfterSeconds: z.number(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) => service.requestPasswordReset(request.body.email),
  );

  api.post(
    `${API_PREFIX}/auth/password/reset/complete`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: completePasswordResetSchema,
        response: {
          200: z.object({ status: z.literal("PASSWORD_RESET") }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.completePasswordReset(
        request.body.email,
        request.body.code,
        request.body.password,
      ),
  );

  api.post(
    `${API_PREFIX}/auth/password/begin`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: beginPasswordLoginSchema,
        response: {
          200: z.object({
            status: z.literal("SECOND_FACTOR_REQUIRED"),
            factor: z.enum(["email", "totp", "recovery"]),
            retryAfterSeconds: z.number(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.beginPasswordLogin(
        request.body.email,
        request.body.password,
        request.body.factor,
      ),
  );

  api.post(
    `${API_PREFIX}/auth/password/complete`,
    {
      config: { rateLimit: { max: 15, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        body: completePasswordLoginSchema,
        response: { 200: authResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.completePasswordLogin(
        request.body.email,
        request.body.password,
        request.body.code,
        request.body.factor,
        request.body.deviceName,
      ),
  );

  api.post(
    `${API_PREFIX}/auth/refresh`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: refreshSchema,
        response: {
          200: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number(),
            user: publicUserSchema,
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) => service.refresh(request.body.refreshToken),
  );

  api.post(
    `${API_PREFIX}/auth/logout`,
    {
      schema: {
        tags: ["auth"],
        body: refreshSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.logout(request.body.refreshToken);
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/auth/sessions`,
    {
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(userSessionResponseSchema), ...routeErrors() },
      },
    },
    async (request) => service.listSessions(request.headers.authorization),
  );

  api.delete(
    `${API_PREFIX}/auth/sessions`,
    {
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ revokedCount: z.number() }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.revokeOtherSessions(request.headers.authorization),
  );

  api.patch(
    `${API_PREFIX}/auth/sessions/:sessionId`,
    {
      config: { rateLimit: { max: 20, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        params: authSessionParams,
        body: sessionTrustSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.setSessionTrusted(
        request.headers.authorization,
        request.params.sessionId,
        request.body.trusted,
      );
      return reply.status(204).send(null);
    },
  );

  api.delete(
    `${API_PREFIX}/auth/sessions/:sessionId`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        params: authSessionParams,
        response: { 200: z.object({ current: z.boolean() }), ...routeErrors() },
      },
    },
    async (request) =>
      service.revokeSession(
        request.headers.authorization,
        request.params.sessionId,
      ),
  );

  api.get(
    `${API_PREFIX}/me`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: { 200: publicUserSchema, ...routeErrors() },
      },
    },
    async (request) => service.getMe(request.headers.authorization),
  );

  api.patch(
    `${API_PREFIX}/me`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: updateProfileSchema,
        response: { 200: publicUserSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateMe(request.headers.authorization, request.body.displayName),
  );

  api.get(
    `${API_PREFIX}/users/me/profile`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        response: { 200: userProfileSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getUserProfileSettings(request.headers.authorization),
  );

  api.patch(
    `${API_PREFIX}/users/me/profile`,
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: updateUserProfileSettingsSchema,
        response: { 200: userProfileSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateUserProfileSettings(
        request.headers.authorization,
        request.body,
      ),
  );

  api.post(
    `${API_PREFIX}/users/me/avatar/upload-intent`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: userAvatarUploadIntentSchema,
        response: {
          200: z.object({
            objectKey: z.string(),
            uploadUrl: z.url(),
            headers: z.record(z.string(), z.string()),
            expiresAt: z.string(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.createUserAvatarUploadIntent(
        request.headers.authorization,
        request.body,
      ),
  );

  api.put(
    `${API_PREFIX}/users/me/avatar`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: updateUserAvatarSchema,
        response: { 200: userProfileSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateUserAvatar(
        request.headers.authorization,
        request.body.objectKey,
      ),
  );

  api.post(
    `${API_PREFIX}/users/me/profile-cover/upload-intent`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: userProfileCoverUploadIntentSchema,
        response: {
          200: z.object({
            objectKey: z.string(),
            uploadUrl: z.url(),
            headers: z.record(z.string(), z.string()),
            expiresAt: z.string(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.createUserProfileCoverUploadIntent(
        request.headers.authorization,
        request.body,
      ),
  );

  api.put(
    `${API_PREFIX}/users/me/profile-cover`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: updateUserProfileCoverSchema,
        response: { 200: userProfileSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateUserProfileCover(
        request.headers.authorization,
        request.body.objectKey,
      ),
  );

  api.post(
    `${API_PREFIX}/users/me/email-change/request`,
    {
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: requestEmailChangeSchema,
        response: {
          200: z.object({
            status: z.literal("CODE_SENT"),
            retryAfterSeconds: z.number(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.requestEmailChange(request.headers.authorization, request.body),
  );

  api.post(
    `${API_PREFIX}/users/me/email-change/confirm`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: confirmEmailChangeSchema,
        response: { 200: publicUserSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.confirmEmailChange(
        request.headers.authorization,
        request.body.code,
      ),
  );

  api.get(
    `${API_PREFIX}/users/me/blocked-users`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(blockedUserSettingsResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) => service.listBlockedUsers(request.headers.authorization),
  );

  api.put(
    `${API_PREFIX}/users/me/blocked-users/:userId`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        params: userIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.blockUser(
        request.headers.authorization,
        request.params.userId,
      );
      return reply.status(204).send(null);
    },
  );

  api.delete(
    `${API_PREFIX}/users/me/blocked-users/:userId`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        params: userIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.unblockUser(
        request.headers.authorization,
        request.params.userId,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/users/me/account`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        response: { 200: userAccountSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getUserAccountSettings(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/users/me/deactivation`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        body: accountReauthenticationSchema,
        response: { 200: userAccountSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.scheduleAccountDeactivation(
        request.headers.authorization,
        request.body,
      ),
  );

  api.delete(
    `${API_PREFIX}/users/me/deactivation`,
    {
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        response: { 200: userAccountSettingsResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.cancelAccountDeactivation(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/users/me/export`,
    {
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
      schema: {
        tags: ["user-settings"],
        security: [{ bearerAuth: [] }],
        response: { 200: z.record(z.string(), z.unknown()), ...routeErrors() },
      },
    },
    async (request) =>
      service.exportPersonalData(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/me/presence`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: { 200: userPresenceResponseSchema, ...routeErrors() },
      },
    },
    async (request) => service.getPresence(request.headers.authorization),
  );

  api.patch(
    `${API_PREFIX}/me/presence`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: updatePresenceSchema,
        response: { 200: userPresenceResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updatePresence(request.headers.authorization, request.body),
  );

  api.post(
    `${API_PREFIX}/me/presence/heartbeat`,
    {
      config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: presenceHeartbeatSchema,
        response: { 200: userPresenceResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.heartbeatPresence(
        request.headers.authorization,
        request.body.idle,
      ),
  );

  api.get(
    `${API_PREFIX}/me/privacy`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: { 200: userPrivacyResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getPrivacySettings(request.headers.authorization),
  );

  api.patch(
    `${API_PREFIX}/me/privacy`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: updatePrivacySettingsSchema,
        response: { 200: userPrivacyResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updatePrivacySettings(
        request.headers.authorization,
        request.body,
      ),
  );

  api.post(
    `${API_PREFIX}/me/password/request-code`,
    {
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            status: z.literal("CODE_SENT"),
            retryAfterSeconds: z.number(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.requestPasswordSetup(request.headers.authorization),
  );

  api.put(
    `${API_PREFIX}/me/password`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: setPasswordSchema,
        response: { 200: publicUserSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setPassword(
        request.headers.authorization,
        request.body.code,
        request.body.password,
      ),
  );

  api.post(
    `${API_PREFIX}/me/2fa/setup`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({ secret: z.string(), otpauthUri: z.string() }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.beginTwoFactorSetup(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/me/2fa/enable`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: twoFactorCodeSchema,
        response: {
          200: z.object({
            user: publicUserSchema,
            recoveryCodes: z.array(z.string()),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.enableTwoFactor(request.headers.authorization, request.body.code),
  );

  api.delete(
    `${API_PREFIX}/me/2fa`,
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: twoFactorCodeSchema,
        response: { 200: publicUserSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.disableTwoFactor(
        request.headers.authorization,
        request.body.code,
      ),
  );

  api.post(
    `${API_PREFIX}/me/2fa/recovery-codes`,
    {
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        body: twoFactorCodeSchema,
        response: { 200: recoveryCodesResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.regenerateRecoveryCodes(
        request.headers.authorization,
        request.body.code,
      ),
  );

  api.get(
    `${API_PREFIX}/me/security-events`,
    {
      schema: {
        tags: ["user"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(securityEventResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listSecurityEvents(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/servers`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(serverSummaryResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) => service.listServers(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/public-servers`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        querystring: z
          .object({
            search: z.string().trim().max(80).optional(),
            limit: z.coerce.number().int().min(1).max(50).default(20),
            offset: z.coerce.number().int().min(0).max(10_000).default(0),
          })
          .strict(),
        response: {
          200: z.array(publicServerSummaryResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listPublicServers(request.headers.authorization, request.query),
  );

  api.post(
    `${API_PREFIX}/public-servers/:serverId/join`,
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: { 200: serverDetailResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.joinPublicServer(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.get(
    `${API_PREFIX}/home`,
    {
      schema: {
        tags: ["home"],
        security: [{ bearerAuth: [] }],
        response: { 200: homeDashboardResponseSchema, ...routeErrors() },
      },
    },
    async (request) => service.getHomeDashboard(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/servers`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        body: createServerSchema,
        response: { 201: serverDetailResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createServer(
            request.headers.authorization,
            request.body.name,
          ),
        ),
  );

  api.post(
    `${API_PREFIX}/invites/:inviteToken/accept`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: inviteTokenParams,
        response: { 200: serverDetailResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.acceptServerInvite(
        request.headers.authorization,
        request.params.inviteToken,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: { 200: serverDetailResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getServer(request.headers.authorization, request.params.serverId),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/overview`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: serverOverviewSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getServerOverviewSettings(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.put(
    `${API_PREFIX}/servers/:serverId/settings/overview`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: updateServerOverviewSchema,
        response: {
          200: serverOverviewSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateServerOverviewSettings(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/appearance`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: serverAppearanceSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getServerAppearanceSettings(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/appearance/upload-intent`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: serverAppearanceUploadIntentSchema,
        response: {
          200: z.object({
            objectKey: z.string(),
            uploadUrl: z.url(),
            headers: z.record(z.string(), z.string()),
            expiresAt: z.string(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.createServerAppearanceUploadIntent(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.put(
    `${API_PREFIX}/servers/:serverId/settings/appearance`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: updateServerAppearanceSchema,
        response: {
          200: serverAppearanceSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateServerAppearanceSettings(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/members`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        querystring: z
          .object({ search: z.string().trim().max(100).optional() })
          .strict(),
        response: {
          200: z.array(serverSettingsMemberResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerSettingsMembers(
        request.headers.authorization,
        request.params.serverId,
        request.query.search,
      ),
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/settings/members/:userId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        body: updateServerMemberSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updateServerSettingsMember(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/members/me/display-name`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: updateOwnServerDisplayNameSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updateOwnServerDisplayName(
        request.headers.authorization,
        request.params.serverId,
        request.body.displayName,
      );
      return reply.status(204).send(null);
    },
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/members/:userId/private-alias`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        body: updateServerMemberAliasSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updatePrivateServerMemberAlias(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
        request.body.alias,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/channels`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: z.object({
            categories: z.array(serverCategoryResponseSchema),
            channels: z.array(serverChannelSettingsResponseSchema),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerChannelSettings(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/categories`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: createServerCategorySchema,
        response: { 201: serverCategoryResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createServerCategory(
            request.headers.authorization,
            request.params.serverId,
            request.body.name,
            request.body.position,
          ),
        ),
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/settings/categories/:categoryId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverCategoryParams,
        body: updateServerCategorySchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updateServerCategory(
        request.headers.authorization,
        request.params.serverId,
        request.params.categoryId,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/settings/categories/:categoryId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverCategoryParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteServerCategory(
        request.headers.authorization,
        request.params.serverId,
        request.params.categoryId,
      );
      return reply.status(204).send(null);
    },
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/settings/channels/:channelId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverSettingsChannelParams,
        body: updateServerChannelSettingsSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updateServerChannelSettings(
        request.headers.authorization,
        request.params.serverId,
        request.params.channelId,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/invites`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: z.array(serverInviteSettingsResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerInvites(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/invites`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: createServerInviteSchema,
        response: {
          201: serverInviteSettingsResponseSchema.extend({
            inviteUrl: z.url(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createServerInvite(
            request.headers.authorization,
            request.params.serverId,
            request.body,
          ),
        ),
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/settings/invites/:inviteId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverInviteParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.revokeServerInvite(
        request.headers.authorization,
        request.params.serverId,
        request.params.inviteId,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/moderation`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: serverModerationSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getServerModerationSettings(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.put(
    `${API_PREFIX}/servers/:serverId/settings/moderation`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: updateServerModerationSchema,
        response: {
          200: serverModerationSettingsResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateServerModerationSettings(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/bans`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: z.array(serverBanSettingsResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerBans(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/bans/:userId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        body: banServerMemberSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.banServerMember(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
        request.body.reason,
      );
      return reply.status(204).send(null);
    },
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/settings/bans/:userId`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.unbanServerMember(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/settings/audit-log`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        querystring: serverAuditQuerySchema,
        response: {
          200: z.object({
            entries: z.array(serverAuditLogResponseSchema),
            nextCursor: z.string().nullable(),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerSettingsAudit(
        request.headers.authorization,
        request.params.serverId,
        request.query,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/revoke-invites`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: serverDangerReauthenticationSchema,
        response: { 200: z.object({ revoked: z.number() }), ...routeErrors() },
      },
    },
    async (request) =>
      service.revokeAllServerInvites(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/archive`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: archiveServerSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.archiveServer(
        request.headers.authorization,
        request.params.serverId,
        request.body.archived,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/settings/transfer-ownership`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: transferServerOwnershipSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.transferServerOwnership(
        request.headers.authorization,
        request.params.serverId,
        request.body.userId,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/settings`,
    {
      schema: {
        tags: ["server-settings"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: deleteServerSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteServerPermanently(
        request.headers.authorization,
        request.params.serverId,
        request.body.confirmation,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/channels`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: createChannelSchema,
        response: { 201: serverChannelResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createServerChannel(
            request.headers.authorization,
            request.params.serverId,
            request.body.name,
            request.body.type,
          ),
        ),
  );

  api.delete(
    `${API_PREFIX}/channels/:channelId`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteServerChannel(
        request.headers.authorization,
        request.params.channelId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/channels/:channelId/activity/open`,
    {
      schema: {
        tags: ["home"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.recordOpenedChannel(
        request.headers.authorization,
        request.params.channelId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/channels/:channelId/activity/leave`,
    {
      schema: {
        tags: ["home"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.recordLeftVoiceChannel(
        request.headers.authorization,
        request.params.channelId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/roles`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: createRoleSchema,
        response: { 201: serverRoleResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createServerRole(
            request.headers.authorization,
            request.params.serverId,
            request.body.name,
            request.body.color,
            request.body.permissions,
          ),
        ),
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/roles/:roleId`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverRoleParams,
        body: updateRoleSchema,
        response: { 200: serverRoleResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateServerRole(
        request.headers.authorization,
        request.params.serverId,
        request.params.roleId,
        request.body,
      ),
  );

  api.patch(
    `${API_PREFIX}/servers/:serverId/roles/:roleId/position`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverRoleParams,
        body: reorderRoleSchema,
        response: { 200: serverRoleResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.reorderServerRole(
        request.headers.authorization,
        request.params.serverId,
        request.params.roleId,
        request.body.position,
      ),
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/roles/:roleId`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverRoleParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteServerRole(
        request.headers.authorization,
        request.params.serverId,
        request.params.roleId,
      );
      return reply.status(204).send(null);
    },
  );

  api.put(
    `${API_PREFIX}/servers/:serverId/members/:userId/roles`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        body: assignMemberRolesSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.assignServerMemberRoles(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
        request.body.roleIds,
      );
      return reply.status(204).send(null);
    },
  );

  api.put(
    `${API_PREFIX}/channels/:channelId/overwrites/:targetType/:targetId`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: channelOverwriteParams,
        body: channelPermissionOverwriteSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.setChannelPermissionOverwrite(
        request.headers.authorization,
        request.params.channelId,
        request.params.targetType,
        request.params.targetId,
        request.body.allow,
        request.body.deny,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/audit-log`,
    {
      schema: {
        tags: ["roles"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: z.array(serverAuditLogResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listServerAuditLog(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.delete(
    `${API_PREFIX}/servers/:serverId/members/:userId`,
    {
      schema: {
        tags: ["servers"],
        security: [{ bearerAuth: [] }],
        params: serverMemberParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.kickServerMember(
        request.headers.authorization,
        request.params.serverId,
        request.params.userId,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/conversations`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(canonicalConversationResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listCanonicalConversations(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/direct-conversations/:userId`,
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: z.object({ userId: z.uuid() }),
        response: {
          200: canonicalConversationResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.createCanonicalDirectConversation(
        request.headers.authorization,
        request.params.userId,
      ),
  );

  api.get(
    `${API_PREFIX}/conversations/:conversationId`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        response: {
          200: canonicalConversationResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getCanonicalConversation(
        request.headers.authorization,
        request.params.conversationId,
      ),
  );

  api.get(
    `${API_PREFIX}/conversations/:conversationId/messages`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        querystring: conversationHistoryQuerySchema,
        response: { 200: canonicalMessagePageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.listCanonicalMessages(
        request.headers.authorization,
        request.params.conversationId,
        request.query.before,
        request.query.after,
        request.query.limit,
      ),
  );

  api.post(
    `${API_PREFIX}/conversations/:conversationId/messages`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        body: createConversationMessageSchema,
        response: {
          200: canonicalMessageResponseSchema,
          201: canonicalMessageResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request, reply) => {
      const result = await service.createCanonicalMessage(
        request.headers.authorization,
        request.params.conversationId,
        request.body,
      );
      return reply.status(result.created ? 201 : 200).send(result.message);
    },
  );

  api.get(
    "/metrics",
    {
      schema: { tags: ["health"], response: { 200: z.string() } },
    },
    async (_request, reply) => {
      if (service.canonicalMessagingStore) {
        const outbox = await service.canonicalMessagingStore.outboxMetrics(
          new Date(),
        );
        technicalMetrics.set("chat_outbox_pending_total", outbox.pending);
        technicalMetrics.set("chat_outbox_failed_total", outbox.failed);
        technicalMetrics.set(
          "chat_outbox_oldest_age_seconds",
          outbox.oldestAgeSeconds,
        );
      }
      return reply
        .type("text/plain; version=0.0.4; charset=utf-8")
        .send(technicalMetrics.render());
    },
  );

  api.patch(
    `${API_PREFIX}/conversations/:conversationId/messages/:messageId`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: canonicalMessageParams,
        body: updateConversationMessageSchema,
        response: { 200: canonicalMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateCanonicalMessage(
        request.headers.authorization,
        request.params.messageId,
        request.body.content,
        request.body.mentions,
      ),
  );

  api.delete(
    `${API_PREFIX}/conversations/:conversationId/messages/:messageId`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: canonicalMessageParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteCanonicalMessage(
        request.headers.authorization,
        request.params.messageId,
      );
      return reply.status(204).send(null);
    },
  );

  api.put(
    `${API_PREFIX}/conversations/:conversationId/messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: canonicalReactionParams,
        response: { 200: canonicalMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setCanonicalReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        true,
      ),
  );

  api.delete(
    `${API_PREFIX}/conversations/:conversationId/messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: canonicalReactionParams,
        response: { 200: canonicalMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setCanonicalReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        false,
      ),
  );

  api.put(
    `${API_PREFIX}/conversations/:conversationId/read-state`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        body: updateConversationReadStateSchema,
        response: { 200: canonicalReadStateResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateCanonicalReadState(
        request.headers.authorization,
        request.params.conversationId,
        request.body.lastDeliveredMessageId,
        request.body.lastReadMessageId,
      ),
  );

  api.get(
    `${API_PREFIX}/conversations/:conversationId/read-states`,
    {
      schema: {
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        response: {
          200: z.array(canonicalMemberReadStateResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listCanonicalReadStates(
        request.headers.authorization,
        request.params.conversationId,
      ),
  );

  api.get(
    `${API_PREFIX}/me/unread`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: { 200: unreadSummaryResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getCanonicalUnreadSummary(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/me/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: {
          200: userNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getNotificationPreferences(request.headers.authorization),
  );

  api.put(
    `${API_PREFIX}/me/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        body: updateUserNotificationPreferencesSchema,
        response: {
          200: userNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateNotificationPreferences(
        request.headers.authorization,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: {
          200: serverNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getServerNotificationPreferences(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.put(
    `${API_PREFIX}/servers/:serverId/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: updateServerNotificationPreferencesSchema,
        response: {
          200: serverNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateServerNotificationPreferences(
        request.headers.authorization,
        request.params.serverId,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/conversations/:conversationId/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        response: {
          200: conversationNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getConversationNotificationPreferences(
        request.headers.authorization,
        request.params.conversationId,
      ),
  );

  api.put(
    `${API_PREFIX}/conversations/:conversationId/notification-preferences`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: conversationIdParams,
        body: updateConversationNotificationPreferencesSchema,
        response: {
          200: conversationNotificationPreferencesResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.updateConversationNotificationPreferences(
        request.headers.authorization,
        request.params.conversationId,
        request.body,
      ),
  );

  api.get(
    `${API_PREFIX}/notifications`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        querystring: notificationQuerySchema,
        response: {
          200: z.array(internalNotificationResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listCanonicalNotifications(
        request.headers.authorization,
        request.query.before,
        request.query.limit,
        request.query.unreadOnly,
      ),
  );

  api.patch(
    `${API_PREFIX}/notifications/:notificationId/read`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: notificationIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.markCanonicalNotificationRead(
        request.headers.authorization,
        request.params.notificationId,
      );
      return reply.status(204).send(null);
    },
  );

  api.patch(
    `${API_PREFIX}/notifications/:notificationId/dismiss`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: notificationIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.dismissCanonicalNotification(
        request.headers.authorization,
        request.params.notificationId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/notifications/read-all`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ updated: z.number() }), ...routeErrors() },
      },
    },
    async (request) =>
      service.markAllCanonicalNotificationsRead(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/attachments/intents`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        body: createAttachmentIntentSchema,
        response: { 201: attachmentIntentResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createCanonicalAttachmentIntent(
            request.headers.authorization,
            request.body,
          ),
        ),
  );

  api.post(
    `${API_PREFIX}/attachments/:attachmentId/finalize`,
    {
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
        response: {
          200: z.object({
            attachmentId: z.string(),
            finalized: z.literal(true),
          }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.finalizeCanonicalAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      ),
  );

  api.get(
    `${API_PREFIX}/attachments/:attachmentId/url`,
    {
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
        response: {
          200: z.object({ url: z.url(), expiresAt: z.string() }),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.getCanonicalAttachmentUrl(
        request.headers.authorization,
        request.params.attachmentId,
      ),
  );

  api.delete(
    `${API_PREFIX}/conversation-attachments/:attachmentId`,
    {
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
        response: { 200: canonicalMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.deleteCanonicalAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      ),
  );

  api.get(
    `${API_PREFIX}/direct-conversations/candidates`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(directMessageCandidateResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listDirectMessageCandidates(request.headers.authorization),
  );

  api.get(
    `${API_PREFIX}/direct-conversations`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(directConversationResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listDirectConversations(request.headers.authorization),
  );

  api.post(
    `${API_PREFIX}/direct-conversations`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        body: createDirectConversationSchema,
        response: { 201: directConversationResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createDirectConversation(
            request.headers.authorization,
            request.body.userId,
          ),
        ),
  );

  api.get(
    `${API_PREFIX}/direct-conversations/:conversationId/messages`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: directConversationIdParams,
        querystring: messageQuerySchema,
        response: {
          200: z.array(directMessageResponseSchema),
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listDirectMessages(
        request.headers.authorization,
        request.params.conversationId,
        request.query.before,
        request.query.limit,
      ),
  );

  api.post(
    `${API_PREFIX}/direct-conversations/:conversationId/messages`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: directConversationIdParams,
        body: createDirectMessageSchema,
        response: { 201: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createDirectMessage(
            request.headers.authorization,
            request.params.conversationId,
            request.body.content,
            request.body.replyToMessageId ?? null,
          ),
        ),
  );

  api.patch(
    `${API_PREFIX}/direct-messages/:messageId`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        body: updateMessageSchema,
        response: { 200: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateDirectMessage(
        request.headers.authorization,
        request.params.messageId,
        request.body.content,
      ),
  );

  api.delete(
    `${API_PREFIX}/direct-messages/:messageId`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteDirectMessage(
        request.headers.authorization,
        request.params.messageId,
      );
      return reply.status(204).send(null);
    },
  );

  api.put(
    `${API_PREFIX}/direct-messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: messageReactionParams,
        response: { 200: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setDirectMessageReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        true,
      ),
  );

  api.delete(
    `${API_PREFIX}/direct-messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: messageReactionParams,
        response: { 200: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setDirectMessageReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        false,
      ),
  );

  api.put(
    `${API_PREFIX}/direct-conversations/:conversationId/read`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: directConversationIdParams,
        body: markChannelReadSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.markDirectConversationRead(
        request.headers.authorization,
        request.params.conversationId,
        request.body.messageId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/direct-messages/:messageId/attachments`,
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        response: { 201: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) => {
      if (!request.isMultipart())
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "file",
        });
      const file = await request.file({
        limits: {
          fileSize: MAX_ATTACHMENT_BYTES,
          files: 1,
          fields: 0,
          parts: 1,
        },
      });
      if (!file || file.fieldname !== "file")
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "file",
        });
      const message = await service.uploadDirectMessageAttachment(
        request.headers.authorization,
        request.params.messageId,
        {
          fileName: file.filename,
          mimeType: file.mimetype,
          content: await file.toBuffer(),
        },
      );
      return reply.status(201).send(message);
    },
  );

  api.get(
    `${API_PREFIX}/direct-attachments/:attachmentId/content`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
      },
    },
    async (request, reply) => {
      const attachment = await service.getDirectMessageAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      );
      const disposition = attachment.mimeType.startsWith("image/")
        ? "inline"
        : "attachment";
      return reply
        .header("Cache-Control", "private, max-age=3600")
        .header(
          "Content-Disposition",
          `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        )
        .header("Content-Length", attachment.size)
        .header("X-Content-Type-Options", "nosniff")
        .type(attachment.mimeType)
        .send(attachment.content);
    },
  );

  api.delete(
    `${API_PREFIX}/direct-attachments/:attachmentId`,
    {
      schema: {
        tags: ["direct-messages"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
        response: { 200: directMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.deleteDirectMessageAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      ),
  );

  api.get(
    `${API_PREFIX}/channels/:channelId/messages`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        querystring: messageQuerySchema,
        response: { 200: z.array(textMessageResponseSchema), ...routeErrors() },
      },
    },
    async (request) =>
      service.listMessages(
        request.headers.authorization,
        request.params.channelId,
        request.query.before,
        request.query.limit,
      ),
  );

  api.get(
    `${API_PREFIX}/notifications/messages`,
    {
      schema: {
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        querystring: messageNotificationQuerySchema,
        response: {
          200: messageNotificationPageResponseSchema,
          ...routeErrors(),
        },
      },
    },
    async (request) =>
      service.listMessageNotifications(
        request.headers.authorization,
        request.query.since,
        request.query.afterId,
        request.query.limit,
      ),
  );

  api.post(
    `${API_PREFIX}/channels/:channelId/messages`,
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        body: createMessageSchema,
        response: { 201: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createMessage(
            request.headers.authorization,
            request.params.channelId,
            request.body.content,
            request.body.mentions,
            request.body.replyToMessageId ?? null,
          ),
        ),
  );

  api.patch(
    `${API_PREFIX}/messages/:messageId`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        body: updateMessageSchema,
        response: { 200: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.updateMessage(
        request.headers.authorization,
        request.params.messageId,
        request.body.content,
        request.body.mentions,
      ),
  );

  api.delete(
    `${API_PREFIX}/messages/:messageId`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.deleteMessage(
        request.headers.authorization,
        request.params.messageId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/messages/:messageId/attachments`,
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: messageIdParams,
        response: { 201: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request, reply) => {
      if (!request.isMultipart())
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "file",
        });
      const file = await request.file({
        limits: {
          fileSize: MAX_ATTACHMENT_BYTES,
          files: 1,
          fields: 0,
          parts: 1,
        },
      });
      if (!file || file.fieldname !== "file")
        throw new AppError("VALIDATION_ERROR", 400, undefined, {
          field: "file",
        });
      const content = await file.toBuffer();
      const message = await service.uploadMessageAttachment(
        request.headers.authorization,
        request.params.messageId,
        {
          fileName: file.filename,
          mimeType: file.mimetype,
          content,
        },
      );
      return reply.status(201).send(message);
    },
  );

  api.get(
    `${API_PREFIX}/attachments/:attachmentId/content`,
    {
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
      },
    },
    async (request, reply) => {
      const attachment = await service.getMessageAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      );
      const disposition = attachment.mimeType.startsWith("image/")
        ? "inline"
        : "attachment";
      return reply
        .header("Cache-Control", "private, max-age=3600")
        .header(
          "Content-Disposition",
          `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        )
        .header("Content-Length", attachment.size)
        .header("X-Content-Type-Options", "nosniff")
        .type(attachment.mimeType)
        .send(attachment.content);
    },
  );

  api.delete(
    `${API_PREFIX}/attachments/:attachmentId`,
    {
      schema: {
        tags: ["attachments"],
        security: [{ bearerAuth: [] }],
        params: attachmentIdParams,
        response: { 200: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.deleteMessageAttachment(
        request.headers.authorization,
        request.params.attachmentId,
      ),
  );

  api.put(
    `${API_PREFIX}/messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: messageReactionParams,
        response: { 200: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setMessageReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        true,
      ),
  );

  api.delete(
    `${API_PREFIX}/messages/:messageId/reactions/:emoji`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: messageReactionParams,
        response: { 200: textMessageResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.setMessageReaction(
        request.headers.authorization,
        request.params.messageId,
        request.params.emoji,
        false,
      ),
  );

  api.put(
    `${API_PREFIX}/channels/:channelId/read`,
    {
      schema: {
        tags: ["messages"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        body: markChannelReadSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.markChannelRead(
        request.headers.authorization,
        request.params.channelId,
        request.body.messageId,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/channels/:channelId/connect`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        response: { 200: connectionSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.connectVoiceChannel(
        request.headers.authorization,
        request.params.channelId,
      ),
  );

  api.get(
    `${API_PREFIX}/servers/:serverId/voice-state`,
    {
      schema: {
        tags: ["voice"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        response: { 200: serverVoiceStateResponseSchema, ...routeErrors() },
      },
    },
    async (request) =>
      service.getServerVoiceState(
        request.headers.authorization,
        request.params.serverId,
      ),
  );

  api.patch(
    `${API_PREFIX}/channels/:channelId/voice-state`,
    {
      schema: {
        tags: ["voice"],
        security: [{ bearerAuth: [] }],
        params: channelIdParams,
        body: updateOwnVoiceStateSchema,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.updateOwnVoiceState(
        request.headers.authorization,
        request.params.channelId,
        request.body,
      );
      return reply.status(204).send(null);
    },
  );

  api.post(
    `${API_PREFIX}/servers/:serverId/voice/moves`,
    {
      config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
      schema: {
        tags: ["voice"],
        security: [{ bearerAuth: [] }],
        params: serverIdParams,
        body: moveVoiceMemberRequestSchema,
        response: { 202: moveVoiceMemberAcceptedSchema, ...routeErrors() },
      },
    },
    async (request, reply) =>
      reply
        .status(202)
        .send(
          await service.requestServerVoiceMove(
            request.headers.authorization,
            request.params.serverId,
            {
              clientRequestId: request.body.clientRequestId,
              subjectUserId: request.body.subjectUserId,
              targetChannelId: request.body.targetChannelId,
              ...(request.body.expectedSourceChannelId
                ? {
                    expectedSourceChannelId:
                      request.body.expectedSourceChannelId,
                  }
                : {}),
              ...(request.body.expectedVoiceSessionId
                ? {
                    expectedVoiceSessionId:
                      request.body.expectedVoiceSessionId,
                  }
                : {}),
            },
          ),
        ),
  );

  api.post(
    `${API_PREFIX}/channels/:channelId/members/:userId/move`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        params: channelMemberParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.requestVoiceMemberMove(
        request.headers.authorization,
        request.params.channelId,
        request.params.userId,
      );
      return reply.status(204).send(null);
    },
  );

  api.get(
    `${API_PREFIX}/voice/move-request`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        response: { 200: connectionSchema.nullable(), ...routeErrors() },
      },
    },
    async (request) =>
      service.pollVoiceMemberMove(request.headers.authorization),
  );

  api.delete(
    `${API_PREFIX}/channels/:channelId/participants/:participantIdentity`,
    {
      schema: {
        tags: ["channels"],
        security: [{ bearerAuth: [] }],
        params: channelParticipantParams,
        response: { 204: z.null(), ...routeErrors() },
      },
    },
    async (request, reply) => {
      await service.kickChannelParticipant(
        request.headers.authorization,
        request.params.channelId,
        request.params.participantIdentity,
      );
      return reply.status(204).send(null);
    },
  );

  for (const action of ["claim", "heartbeat", "release"] as const) {
    api.post(
      `${API_PREFIX}/channels/:channelId/screen-share/${action}`,
      {
        schema: {
          tags: ["screen-share"],
          security: [{ bearerAuth: [] }],
          params: channelIdParams,
          body: screenShareActionSchema,
          response: {
            200:
              action === "release"
                ? z.object({ released: z.literal(true) })
                : z.object({ expiresAt: z.string() }),
            ...routeErrors(),
          },
        },
      },
      async (request) => {
        if (action === "claim")
          return service.claimChannelScreenShare(
            request.headers.authorization,
            request.params.channelId,
            request.body.participantIdentity,
          );
        if (action === "heartbeat")
          return service.heartbeatChannelScreenShare(
            request.headers.authorization,
            request.params.channelId,
            request.body.participantIdentity,
          );
        await service.releaseChannelScreenShare(
          request.headers.authorization,
          request.params.channelId,
          request.body.participantIdentity,
        );
        return { released: true as const };
      },
    );
  }

  const receiver = new WebhookReceiver(
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
  );
  app.post(
    `${API_PREFIX}/webhooks/livekit`,
    {
      config: { rawBody: true },
      schema: { tags: ["webhooks"] },
    },
    async (request, reply) => {
      const webhookRequest = request as typeof request & {
        rawBody?: string;
        body?: unknown;
      };
      const raw =
        typeof webhookRequest.body === "string"
          ? webhookRequest.body
          : webhookRequest.rawBody;
      const authorization = request.headers.authorization;
      if (!raw || !authorization) throw new AppError("UNAUTHORIZED", 401);
      let event;
      try {
        event = await receiver.receive(raw, authorization);
      } catch {
        throw new AppError("UNAUTHORIZED", 401);
      }
      await service.handleWebhookEvent(event);
      return reply.status(204).send();
    },
  );

  app.post(
    `${API_PREFIX}/integrations/livekit/webhook`,
    {
      config: { rawBody: true },
      schema: { tags: ["webhooks"] },
    },
    async (request, reply) => {
      const webhookRequest = request as typeof request & {
        rawBody?: string;
        body?: unknown;
      };
      const raw =
        typeof webhookRequest.body === "string"
          ? webhookRequest.body
          : webhookRequest.rawBody;
      const authorization = request.headers.authorization;
      if (!raw || !authorization) throw new AppError("UNAUTHORIZED", 401);
      let event;
      try {
        event = await receiver.receive(raw, authorization);
      } catch {
        throw new AppError("UNAUTHORIZED", 401);
      }
      await service.handleWebhookEvent(event);
      return reply.status(204).send();
    },
  );

  return app;
}
