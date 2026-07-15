import cors from '@fastify/cors';
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
  createApiError,
  errorMessages,
  guestJoinSchema,
  refreshSchema,
  requestCodeSchema,
  roomCodeSchema,
  roomLockSchema,
  screenShareActionSchema,
  updateProfileSchema,
  verifyCodeSchema,
} from '@vatrushka/shared';

import { AppError } from './app-error.js';
import type { AppConfig } from './config.js';
import type { VatrushkaService } from './service.js';

const roomIdParams = z.object({ roomId: z.uuid() });
const roomCodeParams = z.object({ code: roomCodeSchema });
const participantParams = z.object({ roomId: z.uuid(), participantIdentity: z.string().min(3).max(200) });
const tokenBody = z.object({ participantIdentity: z.string().min(3).max(200) }).strict();

const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().nullable(),
  requestId: z.string(),
});

const publicUserSchema = z.object({ id: z.string(), email: z.string(), displayName: z.string().nullable() });
const connectionSchema = z.object({
  roomId: z.string(),
  ownerUserId: z.string(),
  code: z.string(),
  livekitUrl: z.string(),
  livekitToken: z.string(),
  participantIdentity: z.string(),
  participantDisplayName: z.string(),
  isOwner: z.boolean(),
  guestSessionToken: z.string().optional(),
});

export interface BuildAppOptions {
  config: AppConfig;
  service: VatrushkaService;
  logger?: boolean;
}

function routeErrors(): Record<number, typeof errorResponseSchema> {
  return { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 410: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema, 503: errorResponseSchema };
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

  await app.register(cors, {
    origin(origin, callback) {
      const allowed = config.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
      callback(null, !origin || origin === 'null' || (config.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) || allowed.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
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

  api.post(`${API_PREFIX}/auth/request-code`, {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: {
      tags: ['auth'],
      body: requestCodeSchema,
      response: { 200: z.object({ status: z.literal('CODE_SENT'), retryAfterSeconds: z.number() }), ...routeErrors() },
    },
  }, async (request) => service.requestCode(request.body.email));

  api.post(`${API_PREFIX}/auth/verify-code`, {
    config: { rateLimit: { max: 15, timeWindow: '10 minutes' } },
    schema: {
      tags: ['auth'],
      body: verifyCodeSchema,
      response: {
        200: z.object({ accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number(), user: publicUserSchema, isNewUser: z.boolean() }),
        ...routeErrors(),
      },
    },
  }, async (request) => service.verifyCode(request.body.email, request.body.code, request.body.deviceName));

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

  api.get(`${API_PREFIX}/me`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.getMe(request.headers.authorization));

  api.patch(`${API_PREFIX}/me`, {
    schema: { tags: ['user'], security: [{ bearerAuth: [] }], body: updateProfileSchema, response: { 200: publicUserSchema, ...routeErrors() } },
  }, async (request) => service.updateMe(request.headers.authorization, request.body.displayName));

  api.post(`${API_PREFIX}/rooms`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], response: { 201: connectionSchema, ...routeErrors() } },
  }, async (request, reply) => reply.status(201).send(await service.createRoom(request.headers.authorization)));

  api.get(`${API_PREFIX}/rooms/by-code/:code`, {
    schema: {
      tags: ['rooms'],
      params: roomCodeParams,
      response: {
        200: z.object({ code: z.string(), status: z.enum(['active', 'closed', 'expired']), isLocked: z.boolean(), currentParticipantCount: z.number(), maxParticipants: z.number(), ownerDisplayName: z.string() }),
        ...routeErrors(),
      },
    },
  }, async (request) => service.publicRoom(request.params.code));

  api.post(`${API_PREFIX}/rooms/:roomId/join`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], params: roomIdParams, response: { 200: connectionSchema, ...routeErrors() } },
  }, async (request) => service.joinRoom(request.headers.authorization, request.params.roomId));

  api.post(`${API_PREFIX}/rooms/by-code/:code/join`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], params: roomCodeParams, response: { 200: connectionSchema, ...routeErrors() } },
  }, async (request) => service.joinRoomByCode(request.headers.authorization, request.params.code));

  api.post(`${API_PREFIX}/rooms/guest/join`, {
    schema: { tags: ['rooms'], body: guestJoinSchema, response: { 200: connectionSchema, ...routeErrors() } },
  }, async (request) => service.joinGuest(request.body.code, request.body.displayName));

  api.post(`${API_PREFIX}/rooms/:roomId/token`, {
    schema: { tags: ['rooms'], params: roomIdParams, body: tokenBody, response: { 200: z.object({ livekitUrl: z.string(), livekitToken: z.string() }), ...routeErrors() } },
  }, async (request) => service.reissueRoomToken(request.headers.authorization, request.params.roomId, request.body.participantIdentity));

  api.patch(`${API_PREFIX}/rooms/:roomId/lock`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], params: roomIdParams, body: roomLockSchema, response: { 200: z.object({ isLocked: z.boolean() }), ...routeErrors() } },
  }, async (request) => service.setRoomLock(request.headers.authorization, request.params.roomId, request.body.isLocked));

  api.post(`${API_PREFIX}/rooms/:roomId/close`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], params: roomIdParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.closeRoom(request.headers.authorization, request.params.roomId);
    return reply.status(204).send(null);
  });

  api.delete(`${API_PREFIX}/rooms/:roomId/participants/:participantIdentity`, {
    schema: { tags: ['rooms'], security: [{ bearerAuth: [] }], params: participantParams, response: { 204: z.null(), ...routeErrors() } },
  }, async (request, reply) => {
    await service.kickParticipant(request.headers.authorization, request.params.roomId, request.params.participantIdentity);
    return reply.status(204).send(null);
  });

  for (const action of ['claim', 'heartbeat', 'release'] as const) {
    api.post(`${API_PREFIX}/rooms/:roomId/screen-share/${action}`, {
      schema: { tags: ['screen-share'], params: roomIdParams, body: screenShareActionSchema, response: { 200: action === 'release' ? z.object({ released: z.literal(true) }) : z.object({ expiresAt: z.string() }), ...routeErrors() } },
    }, async (request) => {
      if (action === 'claim') return service.claimScreenShare(request.headers.authorization, request.params.roomId, request.body.participantIdentity);
      if (action === 'heartbeat') return service.heartbeatScreenShare(request.headers.authorization, request.params.roomId, request.body.participantIdentity);
      await service.releaseScreenShare(request.headers.authorization, request.params.roomId, request.body.participantIdentity);
      return { released: true as const };
    });
  }

  const receiver = new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  app.post(`${API_PREFIX}/webhooks/livekit`, {
    config: { rawBody: true },
    schema: { tags: ['webhooks'] },
  }, async (request, reply) => {
    const raw = (request as typeof request & { rawBody?: string }).rawBody;
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
