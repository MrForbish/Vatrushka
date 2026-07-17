import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPostgresStore } from './db/postgres-store.js';
import { VatrushkaService } from './service.js';
import { LiveKitMediaService } from './services/livekit.js';
import { SmtpMailer } from './services/mailer.js';
import { createObjectStorage } from './services/object-storage.js';
import { createPresenceStore } from './services/presence-store.js';

const config = loadConfig();
const database = createPostgresStore(config.DATABASE_URL);
const objectStorage = createObjectStorage(config);
const presenceStore = await createPresenceStore(config);
if (config.PLATFORM_OWNER_EMAIL) {
  await database.store.setPlatformRoleByEmail(config.PLATFORM_OWNER_EMAIL, 'owner', new Date());
}
const service = new VatrushkaService({
  config,
  store: database.store,
  mailer: new SmtpMailer(config),
  media: new LiveKitMediaService(config),
  objectStorage,
  presenceStore,
});
const app = await buildApp({ config, service });

app.addHook('onClose', async () => {
  objectStorage?.close();
  await presenceStore.close();
  await database.close();
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'API failed to start');
  await app.close();
  process.exitCode = 1;
}
