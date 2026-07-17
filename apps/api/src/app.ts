import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WebhookReceiver } from 'livekit-server-sdk';
import { z, ZodError } from 'zod';

import {
  API_PREFIX,
  beginPasswordLoginSchema,
  completePasswordLoginSchema,
  createChannelSchema,
  createMessageSchema,
  createDirectConversationSchema,
  createDirectMessageSchema,
  createRoleSchema,
  createServerSchema,
  createApiError,
  errorMessages,
  joinServerSchema,
  messageQuerySchema,
  messageNotificationQuerySchema,
  messageReactionSchema,
  markChannelReadSchema,
  refreshSchema,
  requestRegistrationSchema,
  screenShareActionSchema,
  sessionTrustSchema,
  serverPermissions,
  setPasswordSchema,
  twoFactorCodeSchema,
  updateProfileSchema,
  updateMessageSchema,
  updateRoleSchema,
  assignMemberRolesSchema,
  channelPermissionOverwriteSchema,
  reorderRoleSchema,
  verifyRegistrationSchema,
} from '@vatrushka/shared';

import { AppError } from './app-error.js';
import type { AppConfig } from './config.js';
import { MAX_ATTACHMENT_BYTES, type VatrushkaService } from './service.js';

const serverIdParams = z.object({ serverId: z.uuid() });
const channelIdParams = z.object({ channelId: z.uuid() });
const serverRoleParams = z.object({ serverId: z.uuid(), roleId: z.uuid() });
const serverMemberParams = z.object({ serverId: z.uuid(), userId: z.uuid() });
const messageIdParams = z.object({ messageId: z.uuid() });
const attachmentIdParams = z.object({ attachmentId: z.uuid() });
const directConversationIdParams = z.object({ conversationId: z.uuid() });
const messageReactionParams = z.object({ messageId: z.uuid(), emoji: messageReactionSchema });
const channelParticipantParams = z.object({ channelId: z.uuid(), participantIdentity: z.string().min(3).max(200) });
const channelOverwriteParams = z.object({ channelId: z.uuid(), targetType: z.enum(['ROLE', 'MEMBER']), targetId: z.uuid() });
const authSessionParams = z.object({ sessionId: z.uuid() });

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
  platformRole: z.enum(['member', 'admin', 'owner']),
  hasPassword: z.boolean(),
  twoFactorEnabled: z.boolean(),
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
const recoveryCodesResponseSchema = z.object({ recoveryCodes: z.array(z.string()) });
const securityEventResponseSchema = z.object({
  id: z.string(),
  type: z.enum(['SESSION_CREATED', 'SESSION_REVOKED', 'PASSWORD_CHANGED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'RECOVERY_CODES_REGENERATED', 'REFRESH_TOKEN_REUSE_DETECTED']),
  deviceName: z.string().nullable(),
  createdAt: z.string(),
});
const connectionSchema = z.object({
  roomId: z.string(),
  ownerUserId: z.string(),
  code: z.string(),
  livekitUrl: z.string(),
  livekitToken: z.string(),
  participantIdentity: z.string(),
  participantDisplayName: z.string(),
  isOwner: z.boolean(),
  contextType: z.literal('channel'),
  serverId: z.string(),
  channelId: z.string(),
  canSpeak: z.boolean().optional(),
  canStream: z.boolean().optional(),
  canStreamApplicationAudio: z.boolean().optional(),
});
const permissionSchema = z.enum(serverPermissions);
const serverRoleResponseSchema = z.object({ id: z.string(), serverId: z.string(), name: z.string(), color: z.string(), position: z.number(), isDefault: z.boolean(), kind: z.enum(['EVERYONE', 'OWNER', 'CUSTOM']).optional(), permissions: z.array(permissionSchema) });
const permissionOverwriteResponseSchema = z.object({ channelId: z.string(), targetType: z.enum(['ROLE', 'MEMBER']), targetId: z.string(), allow: z.array(permissionSchema), deny: z.array(permissionSchema) });
const serverChannelResponseSchema = z.object({ id: z.string(), serverId: z.string(), name: z.string(), type: z.enum(['text', 'voice']), position: z.number(), unreadCount: z.number(), permissions: z.array(permissionSchema).optional(), permissionOverwrites: z.array(permissionOverwriteResponseSchema).optional() });
const serverMemberResponseSchema = z.object({ userId: z.string(), displayName: z.string(), platformRole: z.enum(['member', 'admin', 'owner']), joinedAt: z.string(), roles: z.array(serverRoleResponseSchema) });
const serverSummaryResponseSchema = z.object({ id: z.string(), name: z.string(), inviteCode: z.string(), ownerUserId: z.string(), memberCount: z.number(), createdAt: z.string() });
const serverDetailResponseSchema = serverSummaryResponseSchema.extend({ channels: z.array(serverChannelResponseSchema), roles: z.array(serverRoleResponseSchema), members: z.array(serverMemberResponseSchema), permissions: z.array(permissionSchema) });
const serverAuditLogResponseSchema = z.object({ id: z.string(), serverId: z.string(), actorUserId: z.string().nullable(), actorDisplayName: z.string(), action: z.string(), targetType: z.string(), targetId: z.string().nullable(), before: z.unknown(), after: z.unknown(), createdAt: z.string() });
const messageAttachmentResponseSchema = z.object({ id: z.string(), messageId: z.string(), fileName: z.string(), mimeType: z.string(), size: z.number(), createdAt: z.string() });
const messageNotificationResponseSchema = z.object({ id: z.string(), serverId: z.string(), serverName: z.string(), channelId: z.string(), channelName: z.string(), authorUserId: z.string(), authorDisplayName: z.string(), content: z.string(), createdAt: z.string() });
const messageNotificationPageResponseSchema = z.object({ items: z.array(messageNotificationResponseSchema), cursor: z.object({ createdAt: z.string(), id: z.string().nullable() }).nullable() });
const textMessageResponseSchema = z.object({ id: z.string(), channelId: z.string(), authorUserId: z.string(), authorDisplayName: z.string(), authorPlatformRole: z.enum(['member', 'admin', 'owner']), content: z.string(), replyTo: z.object({ messageId: z.string(), authorUserId: z.string(), authorDisplayName: z.string(), content: z.string() }).nullable(), reactions: z.array(z.object({ emoji: z.string(), count: z.number(), reactedByCurrentUser: z.boolean() })), attachments: z.array(messageAttachmentResponseSchema), createdAt: z.string(), editedAt: z.string().nullable() });
const directMessageParticipantResponseSchema = z.object({ userId: z.string(), displayName: z.string(), platformRole: z.enum(['member', 'admin', 'owner']) });
const directConversationResponseSchema = z.object({ id: z.string(), participant: directMessageParticipantResponseSchema, lastMessage: z.object({ authorUserId: z.string(), content: z.string(), createdAt: z.string() }).nullable(), unreadCount: z.number(), createdAt: z.string(), updatedAt: z.string() });
const directMessageCandidateResponseSchema = directMessageParticipantResponseSchema.extend({ sharedServerNames: z.array(z.string()) });
const directMessageResponseSchema = z.object({ id: z.string(), conversationId: z.string(), authorUserId: z.string(), authorDisplayName: z.string(), authorPlatformRole: z.enum(['member', 'admin', 'owner']), content: z.string(), replyTo: z.object({ messageId: z.string(), authorUserId: z.string(), authorDisplayName: z.string(), content: z.string() }).nullable(), reactions: z.array(z.object({ emoji: z.string(), count: z.number(), reactedByCurrentUser: z.boolean() })), attachments: z.array(messageAttachmentResponseSchema), createdAt: z.string(), editedAt: z.string().nullable() });

export interface BuildAppOptions {
  config: AppConfig;
  service: VatrushkaService;
  logger?: boolean;
}

function routeErrors(): Record<number, typeof errorResponseSchema> {
  return { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 410: errorResponseSchema, 413: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema, 503: errorResponseSchema };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, service } = options;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.body.code',
                'req.body.password',
                'req.body.refreshToken',
                'refreshToken',
                'accessToken',
                'livekitToken',
                'SMTP_PASSWORD',
                'LIVEKIT_API_SECRET',
              ],
              censor: '[REDACTED]',
            },
          },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 64 * 1024,
    trustProxy: config.NODE_ENV === 'production',
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  await app.register(cors, {
    origin(origin, callback) {
      const allowed = config.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
      callback(null, !origin || origin === 'null' || (config.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) || allowed.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 } });
  await app.register(rateLimit, { global: false, max: 60, timeWindow: '1 minute', ban: 2 });
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });

  if (config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: { title: `${config.APP_NAME} API`, version: '0.1.0' },
        servers: [{ url: config.PUBLIC_API_URL }],
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(
        createApiError(error.code, request.id, error.details, error.message || errorMessages[error.code]),
      );
      return;
    }
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
      void reply.status(400).send(createApiError('VALIDATION_ERROR', request.id, details));
      return;
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//u, '').replaceAll('/', '.'),
        message: issue.message ?? 'Некорректное значение',
      }));
      void reply.status(400).send(createApiError('VALIDATION_ERROR', request.id, details));
      return;
    }
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 429) {
      void reply.status(429).send(createApiError('RATE_LIMITED', request.id));
      return;
    }
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 413) {
      void reply.status(413).send(createApiError('ATTACHMENT_TOO_LARGE', request.id));
      return;
    }
    request.log.error({ err: error }, 'Unhandled API error');
    void reply.status(500).send(createApiError('INTERNAL_ERROR', request.id));
  });

  const api = app.withTypeProvider<ZodTypeProvider>();

  api.get('/health/live', {
    schema: { tags: ['health'], response: { 200: z.object({ status: z.literal('ok') }) } },
  }, () => ({ status: 'ok' as const }));

  api.get('/health/ready', {
    schema: { tags: ['health'], response: { 200: z.object({ status: z.literal('ready') }), 503: errorResponseSchema } },
  }, async (request, reply) => {
    try {
      await Promise.all([service.store.healthCheck(), service.media.healthCheck()]);
      return { status: 'ready' as const };
    } catch {
      return reply.status(503).send(createApiError('LIVEKIT_UNAVAILABLE', request.id));
    }
  });

  api.post(`${API_PREFIX}/auth/register/request-code`, {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: {
      tags: ['auth'],
      body: requestRegistrationSchema,
      response: { 200: z.object({ status: z.literal('CODE_SENT'), retryAfterSeconds: z.number() }), ...routeErrors() },
    },
  }, async (request) => service.requestRegistration(request.body.email, request.body.password));

  api.post(`${API_PREFIX}/auth/register/verify-code`, {
    config: { rateLimit: { max: 15, timeWindow: '10 minutes' } },
    schema: { tags: ['auth'], body: verifyRegistrationSchema, response: { 200: authResponseSchema, ...routeErrors() } },
  }, async (request) => service.verifyRegistration(request.body.email, request.body.code, request.body.deviceName));

  api.post(`${API_PREFIX}/auth/password/begin`, {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      tags: ['auth'],
      body: beginPasswordLoginSchema,
      response: { 200: z.object({ status: z.literal('SECOND_FACTOR_REQUIRED'), factor: z.enum(['email', 'totp', 'recovery']), retryAfterSeconds: z.number() }), ...routeErrors() },
    },
  }, async (request) => service.beginPasswordLogin(request.body.email, request.body.password, request.body.factor));

  api.post(`${API_PREFIX}/auth/password/complete`, {
    config: { rateLimit: { max: 15, timeWindow: '10 minutes' } },
    schema: { tags: ['auth'], body: completePasswordLoginSchema, response: { 200: authResponseSchema, ...routeErrors() } },
  }, async (request) => service.completePasswordLogin(request.body.email, request.body.password, request.body.code, request.body.factor, request.body.deviceName));

  api.post(`${API_PREFIX}/auth/refresh`, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['auth'],
      body: refreshSchema,
      response: { 200: z.object({ accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number(), user: publicUserSchema }), ...routeErrors() },
    },
  }, async (request) => service.refresh(request.body.refreshToken));

  api.post(`${API_PREFIX}/auth/logout`, {
    schema: { tags: ['auth'], body: refreshSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.logout(request.body.refreshToken);
    return reply.status(204).send(null);
  });

  api.get(`${API_PREFIX}/auth/sessions`, {
    schema: { tags: ['auth'], security: [{ bearerAuth: [] }], response: { 200: z.array(userSessionResponseSchema), ...routeErrors() } },
  }, async (request) => service.listSessions(request.headers.authorization));

  api.delete(`${API_PREFIX}/auth/sessions`, {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: { tags: ['auth'], security: [{ bearerAuth: [] }], response: { 200: z.object({ revokedCount: z.number() }), ...routeErrors() } },
  }, async (request) => service.revokeOtherSessions(request.headers.authorization));

  api.patch(`${API_PREFIX}/auth/sessions/:sessionId`, {
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    schema: { tags: ['auth'], security: [{ bearerAuth: [] }], params: authSessionParams, body: sessionTrustSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.setSessionTrusted(request.headers.authorization, request.params.sessionId, request.body.trusted);
    return reply.status(204).send(null);
  });

  api.delete(`${API_PREFIX}/auth/sessions/:sessionId`, {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: { tags: ['auth'], security: [{ bearerAuth: [] }], params: authSessionParams, response: { 200: z.object({ current: z.boolean() }), ...routeErrors() } },
  }, async (request) => service.revokeSession(request.headers.authorization, request.params.sessionId));

  api.get(`${API_PREFIX}/me`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.getMe(request.headers.authorization));

  api.patch(`${API_PREFIX}/me`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: updateProfileSchema, response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.updateMe(request.headers.authorization, request.body.displayName));

  api.post(`${API_PREFIX}/me/password/request-code`, {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], response: { 200: z.object({ status: z.literal('CODE_SENT'), retryAfterSeconds: z.number() }), ...routeErrors() } },
  }, async (request) => service.requestPasswordSetup(request.headers.authorization));

  api.put(`${API_PREFIX}/me/password`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: setPasswordSchema, response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.setPassword(request.headers.authorization, request.body.code, request.body.password));

  api.post(`${API_PREFIX}/me/2fa/setup`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], response: { 200: z.object({ secret: z.string(), otpauthUri: z.string() }), ...routeErrors() } },
  }, async (request) => service.beginTwoFactorSetup(request.headers.authorization));

  api.post(`${API_PREFIX}/me/2fa/enable`, {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: twoFactorCodeSchema, response: { 200: z.object({ user: publicUserSchema, recoveryCodes: z.array(z.string()) }), ...routeErrors() } },
  }, async (request) => service.enableTwoFactor(request.headers.authorization, request.body.code));

  api.delete(`${API_PREFIX}/me/2fa`, {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: twoFactorCodeSchema, response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.disableTwoFactor(request.headers.authorization, request.body.code));

  api.post(`${API_PREFIX}/me/2fa/recovery-codes`, {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: twoFactorCodeSchema, response: { 200: recoveryCodesResponseSchema, ...routeErrors() } },
  }, async (request) => service.regenerateRecoveryCodes(request.headers.authorization, request.body.code));

  api.get(`${API_PREFIX}/me/security-events`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], response: { 200: z.array(securityEventResponseSchema), ...routeErrors() } },
  }, async (request) => service.listSecurityEvents(request.headers.authorization));

  api.get(`${API_PREFIX}/servers`, {
    schema: { tags: ['servers'], security: [{ bearerAuth: [] }], response: { 200: z.array(serverSummaryResponseSchema), ...routeErrors() } },
  }, async (request) => service.listServers(request.headers.authorization));

  api.post(`${API_PREFIX}/servers`, {
    schema: { tags: ['servers'], security: [{ bearerAuth: [] }], body: createServerSchema, response: { 201: serverDetailResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createServer(request.headers.authorization, request.body.name)));

  api.post(`${API_PREFIX}/servers/join`, {
    schema: { tags: ['servers'], security: [{ bearerAuth: [] }], body: joinServerSchema, response: { 200: serverDetailResponseSchema, ...routeErrors() } },
  }, async (request) => service.joinServer(request.headers.authorization, request.body.inviteCode));

  api.get(`${API_PREFIX}/servers/:serverId`, {
    schema: { tags: ['servers'], security: [{ bearerAuth: [] }], params: serverIdParams, response: { 200: serverDetailResponseSchema, ...routeErrors() } },
  }, async (request) => service.getServer(request.headers.authorization, request.params.serverId));

  api.post(`${API_PREFIX}/servers/:serverId/channels`, {
    schema: { tags: ['channels'], security: [{ bearerAuth: [] }], params: serverIdParams, body: createChannelSchema, response: { 201: serverChannelResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createServerChannel(request.headers.authorization, request.params.serverId, request.body.name, request.body.type)));

  api.delete(`${API_PREFIX}/channels/:channelId`, {
    schema: { tags: ['channels'], security: [{ bearerAuth: [] }], params: channelIdParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.deleteServerChannel(request.headers.authorization, request.params.channelId);
    return reply.status(204).send(null);
  });

  api.post(`${API_PREFIX}/servers/:serverId/roles`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverIdParams, body: createRoleSchema, response: { 201: serverRoleResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createServerRole(request.headers.authorization, request.params.serverId, request.body.name, request.body.color, request.body.permissions)));

  api.patch(`${API_PREFIX}/servers/:serverId/roles/:roleId`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverRoleParams, body: updateRoleSchema, response: { 200: serverRoleResponseSchema, ...routeErrors() } },
  }, async (request) => service.updateServerRole(request.headers.authorization, request.params.serverId, request.params.roleId, request.body));

  api.patch(`${API_PREFIX}/servers/:serverId/roles/:roleId/position`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverRoleParams, body: reorderRoleSchema, response: { 200: serverRoleResponseSchema, ...routeErrors() } },
  }, async (request) => service.reorderServerRole(request.headers.authorization, request.params.serverId, request.params.roleId, request.body.position));

  api.delete(`${API_PREFIX}/servers/:serverId/roles/:roleId`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverRoleParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.deleteServerRole(request.headers.authorization, request.params.serverId, request.params.roleId);
    return reply.status(204).send(null);
  });

  api.put(`${API_PREFIX}/servers/:serverId/members/:userId/roles`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverMemberParams, body: assignMemberRolesSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.assignServerMemberRoles(request.headers.authorization, request.params.serverId, request.params.userId, request.body.roleIds);
    return reply.status(204).send(null);
  });

  api.put(`${API_PREFIX}/channels/:channelId/overwrites/:targetType/:targetId`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: channelOverwriteParams, body: channelPermissionOverwriteSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.setChannelPermissionOverwrite(request.headers.authorization, request.params.channelId, request.params.targetType, request.params.targetId, request.body.allow, request.body.deny);
    return reply.status(204).send(null);
  });

  api.get(`${API_PREFIX}/servers/:serverId/audit-log`, {
    schema: { tags: ['roles'], security: [{ bearerAuth: [] }], params: serverIdParams, response: { 200: z.array(serverAuditLogResponseSchema), ...routeErrors() } },
  }, async (request) => service.listServerAuditLog(request.headers.authorization, request.params.serverId));

  api.delete(`${API_PREFIX}/servers/:serverId/members/:userId`, {
    schema: { tags: ['servers'], security: [{ bearerAuth: [] }], params: serverMemberParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.kickServerMember(request.headers.authorization, request.params.serverId, request.params.userId);
    return reply.status(204).send(null);
  });

  api.get(`${API_PREFIX}/direct-conversations/candidates`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], response: { 200: z.array(directMessageCandidateResponseSchema), ...routeErrors() } },
  }, async (request) => service.listDirectMessageCandidates(request.headers.authorization));

  api.get(`${API_PREFIX}/direct-conversations`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], response: { 200: z.array(directConversationResponseSchema), ...routeErrors() } },
  }, async (request) => service.listDirectConversations(request.headers.authorization));

  api.post(`${API_PREFIX}/direct-conversations`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], body: createDirectConversationSchema, response: { 201: directConversationResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createDirectConversation(request.headers.authorization, request.body.userId)));

  api.get(`${API_PREFIX}/direct-conversations/:conversationId/messages`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: directConversationIdParams, querystring: messageQuerySchema, response: { 200: z.array(directMessageResponseSchema), ...routeErrors() } },
  }, async (request) => service.listDirectMessages(request.headers.authorization, request.params.conversationId, request.query.before, request.query.limit));

  api.post(`${API_PREFIX}/direct-conversations/:conversationId/messages`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: directConversationIdParams, body: createDirectMessageSchema, response: { 201: directMessageResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createDirectMessage(request.headers.authorization, request.params.conversationId, request.body.content, request.body.replyToMessageId ?? null)));

  api.patch(`${API_PREFIX}/direct-messages/:messageId`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: messageIdParams, body: updateMessageSchema, response: { 200: directMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.updateDirectMessage(request.headers.authorization, request.params.messageId, request.body.content));

  api.delete(`${API_PREFIX}/direct-messages/:messageId`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: messageIdParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.deleteDirectMessage(request.headers.authorization, request.params.messageId);
    return reply.status(204).send(null);
  });

  api.put(`${API_PREFIX}/direct-messages/:messageId/reactions/:emoji`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: messageReactionParams, response: { 200: directMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.setDirectMessageReaction(request.headers.authorization, request.params.messageId, request.params.emoji, true));

  api.delete(`${API_PREFIX}/direct-messages/:messageId/reactions/:emoji`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: messageReactionParams, response: { 200: directMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.setDirectMessageReaction(request.headers.authorization, request.params.messageId, request.params.emoji, false));

  api.put(`${API_PREFIX}/direct-conversations/:conversationId/read`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: directConversationIdParams, body: markChannelReadSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.markDirectConversationRead(request.headers.authorization, request.params.conversationId, request.body.messageId);
    return reply.status(204).send(null);
  });

  api.post(`${API_PREFIX}/direct-messages/:messageId/attachments`, {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: messageIdParams, response: { 201: directMessageResponseSchema, ...routeErrors() } },
  }, async (request, reply) => {
    if (!request.isMultipart()) throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'file' });
    const file = await request.file({ limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 } });
    if (!file || file.fieldname !== 'file') throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'file' });
    const message = await service.uploadDirectMessageAttachment(request.headers.authorization, request.params.messageId, { fileName: file.filename, mimeType: file.mimetype, content: await file.toBuffer() });
    return reply.status(201).send(message);
  });

  api.get(`${API_PREFIX}/direct-attachments/:attachmentId/content`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: attachmentIdParams },
  }, async (request, reply) => {
    const attachment = await service.getDirectMessageAttachment(request.headers.authorization, request.params.attachmentId);
    const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment';
    return reply.header('Cache-Control', 'private, max-age=3600').header('Content-Disposition', `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`).header('Content-Length', attachment.size).header('X-Content-Type-Options', 'nosniff').type(attachment.mimeType).send(attachment.content);
  });

  api.delete(`${API_PREFIX}/direct-attachments/:attachmentId`, {
    schema: { tags: ['direct-messages'], security: [{ bearerAuth: [] }], params: attachmentIdParams, response: { 200: directMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.deleteDirectMessageAttachment(request.headers.authorization, request.params.attachmentId));

  api.get(`${API_PREFIX}/channels/:channelId/messages`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: channelIdParams, querystring: messageQuerySchema, response: { 200: z.array(textMessageResponseSchema), ...routeErrors() } },
  }, async (request) => service.listMessages(request.headers.authorization, request.params.channelId, request.query.before, request.query.limit));

  api.get(`${API_PREFIX}/notifications/messages`, {
    schema: { tags: ['notifications'], security: [{ bearerAuth: [] }], querystring: messageNotificationQuerySchema, response: { 200: messageNotificationPageResponseSchema, ...routeErrors() } },
  }, async (request) => service.listMessageNotifications(request.headers.authorization, request.query.since, request.query.afterId, request.query.limit));

  api.post(`${API_PREFIX}/channels/:channelId/messages`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: channelIdParams, body: createMessageSchema, response: { 201: textMessageResponseSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createMessage(request.headers.authorization, request.params.channelId, request.body.content, request.body.replyToMessageId ?? null)));

  api.patch(`${API_PREFIX}/messages/:messageId`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: messageIdParams, body: updateMessageSchema, response: { 200: textMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.updateMessage(request.headers.authorization, request.params.messageId, request.body.content));

  api.delete(`${API_PREFIX}/messages/:messageId`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: messageIdParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.deleteMessage(request.headers.authorization, request.params.messageId);
    return reply.status(204).send(null);
  });

  api.post(`${API_PREFIX}/messages/:messageId/attachments`, {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { tags: ['attachments'], security: [{ bearerAuth: [] }], params: messageIdParams, response: { 201: textMessageResponseSchema, ...routeErrors() } },
  }, async (request, reply) => {
    if (!request.isMultipart()) throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'file' });
    const file = await request.file({ limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 } });
    if (!file || file.fieldname !== 'file') throw new AppError('VALIDATION_ERROR', 400, undefined, { field: 'file' });
    const content = await file.toBuffer();
    const message = await service.uploadMessageAttachment(request.headers.authorization, request.params.messageId, {
      fileName: file.filename,
      mimeType: file.mimetype,
      content,
    });
    return reply.status(201).send(message);
  });

  api.get(`${API_PREFIX}/attachments/:attachmentId/content`, {
    schema: { tags: ['attachments'], security: [{ bearerAuth: [] }], params: attachmentIdParams },
  }, async (request, reply) => {
    const attachment = await service.getMessageAttachment(request.headers.authorization, request.params.attachmentId);
    const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment';
    return reply
      .header('Cache-Control', 'private, max-age=3600')
      .header('Content-Disposition', `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`)
      .header('Content-Length', attachment.size)
      .header('X-Content-Type-Options', 'nosniff')
      .type(attachment.mimeType)
      .send(attachment.content);
  });

  api.delete(`${API_PREFIX}/attachments/:attachmentId`, {
    schema: { tags: ['attachments'], security: [{ bearerAuth: [] }], params: attachmentIdParams, response: { 200: textMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.deleteMessageAttachment(request.headers.authorization, request.params.attachmentId));

  api.put(`${API_PREFIX}/messages/:messageId/reactions/:emoji`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: messageReactionParams, response: { 200: textMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.setMessageReaction(request.headers.authorization, request.params.messageId, request.params.emoji, true));

  api.delete(`${API_PREFIX}/messages/:messageId/reactions/:emoji`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: messageReactionParams, response: { 200: textMessageResponseSchema, ...routeErrors() } },
  }, async (request) => service.setMessageReaction(request.headers.authorization, request.params.messageId, request.params.emoji, false));

  api.put(`${API_PREFIX}/channels/:channelId/read`, {
    schema: { tags: ['messages'], security: [{ bearerAuth: [] }], params: channelIdParams, body: markChannelReadSchema, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.markChannelRead(request.headers.authorization, request.params.channelId, request.body.messageId);
    return reply.status(204).send(null);
  });

  api.post(`${API_PREFIX}/channels/:channelId/connect`, {
    schema: { tags: ['channels'], security: [{ bearerAuth: [] }], params: channelIdParams, response: { 200: connectionSchema, ...routeErrors() } },
  }, async (request) => service.connectVoiceChannel(request.headers.authorization, request.params.channelId));

  api.delete(`${API_PREFIX}/channels/:channelId/participants/:participantIdentity`, {
    schema: { tags: ['channels'], security: [{ bearerAuth: [] }], params: channelParticipantParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.kickChannelParticipant(request.headers.authorization, request.params.channelId, request.params.participantIdentity);
    return reply.status(204).send(null);
  });

  for (const action of ['claim', 'heartbeat', 'release'] as const) {
    api.post(`${API_PREFIX}/channels/:channelId/screen-share/${action}`, {
      schema: { tags: ['screen-share'], security: [{ bearerAuth: [] }], params: channelIdParams, body: screenShareActionSchema, response: { 200: action === 'release' ? z.object({ released: z.literal(true) }) : z.object({ expiresAt: z.string() }), ...routeErrors() } },
    }, async (request) => {
      if (action === 'claim') return service.claimChannelScreenShare(request.headers.authorization, request.params.channelId, request.body.participantIdentity);
      if (action === 'heartbeat') return service.heartbeatChannelScreenShare(request.headers.authorization, request.params.channelId, request.body.participantIdentity);
      await service.releaseChannelScreenShare(request.headers.authorization, request.params.channelId, request.body.participantIdentity);
      return { released: true as const };
    });
  }

  const receiver = new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  app.post(`${API_PREFIX}/webhooks/livekit`, {
    config: { rawBody: true },
    schema: { tags: ['webhooks'] },
  }, async (request, reply) => {
    const webhookRequest = request as typeof request & { rawBody?: string; body?: unknown };
    const raw = typeof webhookRequest.body === 'string' ? webhookRequest.body : webhookRequest.rawBody;
    const authorization = request.headers.authorization;
    if (!raw || !authorization) throw new AppError('UNAUTHORIZED', 401);
    let event;
    try {
      event = await receiver.receive(raw, authorization);
    } catch {
      throw new AppError('UNAUTHORIZED', 401);
    }
    await service.handleWebhookEvent(event);
    return reply.status(204).send();
  });

  return app;
}
