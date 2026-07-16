import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import {
  app,
  clipboard,
  desktopCapturer,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import log from 'electron-log/main';
import { z } from 'zod';

import {
  desktopSourceSelectionSchema,
  localSettingsSchema,
  type DesktopSourceInfo,
  type DesktopMessageNotification,
} from '@vatrushka/shared';

import type { DesktopStorage } from './storage.js';

export const IPC_CHANNELS = {
  appVersion: 'app:get-version',
  refreshGet: 'session:get-refresh',
  refreshStore: 'session:store-refresh',
  refreshClear: 'session:clear-refresh',
  sourcesList: 'desktop:list-sources',
  sourceSelect: 'desktop:select-source',
  sourceClear: 'desktop:clear-source',
  clipboardCopy: 'clipboard:copy',
  platform: 'app:get-platform',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  deepLink: 'app:deep-link',
  notificationShow: 'notification:show-message',
  notificationClick: 'notification:message-click',
} as const;

interface IpcOptions {
  isTrustedSender(event: IpcMainInvokeEvent): boolean;
  storage: DesktopStorage;
  setSelectedSource(selection: { sourceId: string; includeAudio: boolean } | null): void;
  showMessageNotification(notification: DesktopMessageNotification): void;
}

const desktopMessageNotificationSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1_000),
  serverId: z.uuid(),
  channelId: z.uuid(),
}).strict();

function sourceType(id: string): DesktopSourceInfo['type'] {
  return id.startsWith('screen:') ? 'screen' : 'window';
}

async function listSources(): Promise<DesktopSourceInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name.slice(0, 200),
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    ...(source.appIcon && !source.appIcon.isEmpty() ? { appIconDataUrl: source.appIcon.toDataURL() } : {}),
    type: sourceType(source.id),
  }));
}

export function registerIpc(options: IpcOptions): () => void {
  const channels = Object.values(IPC_CHANNELS).filter((channel) => channel !== IPC_CHANNELS.deepLink && channel !== IPC_CHANNELS.notificationClick);
  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
      if (!options.isTrustedSender(event)) {
        log.warn('Rejected IPC from an untrusted renderer', { channel });
        throw new Error('IPC sender rejected');
      }
      try {
        return await listener(event, ...args);
      } catch (error) {
        log.error('IPC operation failed', { channel, error });
        throw error;
      }
    });
  };

  handle(IPC_CHANNELS.appVersion, () => app.getVersion());
  handle(IPC_CHANNELS.refreshGet, () => options.storage.getRefreshToken());
  handle(IPC_CHANNELS.refreshStore, async (_event, token: unknown) => {
    await options.storage.storeRefreshToken(z.string().min(32).max(512).parse(token));
  });
  handle(IPC_CHANNELS.refreshClear, () => options.storage.clearRefreshToken());
  handle(IPC_CHANNELS.sourcesList, listSources);
  handle(IPC_CHANNELS.sourceSelect, async (_event, value: unknown) => {
    const selection = desktopSourceSelectionSchema.parse(value);
    const exists = (await listSources()).some((source) => source.id === selection.sourceId);
    if (!exists) throw new Error('Desktop source is no longer available');
    options.setSelectedSource(selection);
  });
  handle(IPC_CHANNELS.sourceClear, () => options.setSelectedSource(null));
  handle(IPC_CHANNELS.clipboardCopy, (_event, value: unknown) => clipboard.writeText(z.string().max(20_000).parse(value)));
  handle(IPC_CHANNELS.notificationShow, (_event, value: unknown) => options.showMessageNotification(desktopMessageNotificationSchema.parse(value)));
  handle(IPC_CHANNELS.platform, () => process.platform);
  handle(IPC_CHANNELS.settingsGet, () => options.storage.getSettings());
  handle(IPC_CHANNELS.settingsUpdate, async (_event, value: unknown) => options.storage.updateSettings(localSettingsSchema.parse(value)));

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

export async function configureLogging(): Promise<void> {
  const logPath = log.transports.file.getFile().path;
  await fs.mkdir(dirname(logPath), { recursive: true });
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.level = 'info';
  log.transports.console.level = process.env.NODE_ENV === 'production' ? false : 'debug';
  log.initialize();
}
