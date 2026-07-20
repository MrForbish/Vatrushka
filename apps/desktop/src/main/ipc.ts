import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import {
  app,
  clipboard,
  desktopCapturer,
  ipcMain,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import log from "electron-log/main";
import { z } from "zod";

import {
  desktopSourceSelectionSchema,
  completePasswordLoginSchema,
  localSettingsSchema,
  verifyRegistrationSchema,
  type DesktopAuthSession,
  type DesktopAuthCompletionResult,
  type DesktopUpdateState,
  type DesktopSourceInfo,
  type DesktopMessageNotification,
} from "@vatrushka/shared";

import type { DesktopStorage } from "./storage.js";

export const IPC_CHANNELS = {
  appVersion: "app:get-version",
  windowFullscreenGet: "window:get-fullscreen",
  windowFullscreenToggle: "window:toggle-fullscreen",
  windowFullscreenState: "window:fullscreen-state",
  updateStateGet: "update:get-state",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateState: "update:state",
  authComplete: "session:complete-auth",
  authRefresh: "session:refresh-auth",
  authLogout: "session:logout-auth",
  authClear: "session:clear-auth",
  sourcesList: "desktop:list-sources",
  sourceSelect: "desktop:select-source",
  sourceClear: "desktop:clear-source",
  mediaDiagnostic: "media:diagnostic",
  clipboardCopy: "clipboard:copy",
  externalOpen: "external:open-allowlisted",
  badgeCountSet: "app:set-badge-count",
  platform: "app:get-platform",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  deepLink: "app:deep-link",
  notificationShow: "notification:show-message",
  notificationClick: "notification:message-click",
} as const;

interface IpcOptions {
  isTrustedSender(event: IpcMainInvokeEvent): boolean;
  storage: DesktopStorage;
  setSelectedSource(
    selection: { sourceId: string; includeAudio: boolean } | null,
  ): void;
  showMessageNotification(notification: DesktopMessageNotification): void;
  setBadgeCount(count: number): void;
  getFullscreen(): boolean;
  toggleFullscreen(): boolean;
  updater: {
    getState(): DesktopUpdateState;
    check(): Promise<void>;
    install(): void;
  };
}

const desktopMessageNotificationSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(1_000),
    serverId: z.uuid().optional(),
    channelId: z.uuid().optional(),
    conversationId: z.uuid().optional(),
    messageId: z.string().regex(/^\d+$/u).optional(),
    silent: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.conversationId || (value.serverId && value.channelId)),
    "A notification target is required",
  );

const desktopMediaDiagnosticSchema = z
  .object({
    event: z.enum([
      "voice_reconnecting",
      "voice_reconnected",
      "voice_audio_restored",
      "voice_audio_restore_failed",
      "voice_track_subscription_failed",
      "screen_share_heartbeat_failed",
      "screen_share_heartbeat_recovered",
      "screen_share_lease_lost",
    ]),
    occurredAt: z.iso.datetime(),
    serverId: z.uuid(),
    channelId: z.uuid(),
    voiceSessionId: z.string().min(1).max(200).optional(),
    reason: z.string().min(1).max(100).optional(),
    attempt: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const apiBaseUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
  );
}, "API URL must use HTTPS");
const externalUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => {
      if (value === "mailto:vatrushka-notify@yandex.ru") return true;
      try {
        const url = new URL(value);
        return (
          (url.protocol === "https:" || url.protocol === "http:") &&
          url.username === "" &&
          url.password === ""
        );
      } catch {
        return false;
      }
    },
    "External URL must use HTTP or HTTPS without embedded credentials",
  );
const refreshTokenSchema = z.string().min(32).max(512);
const desktopAuthSessionSchema = z.object({
  accessToken: z.string().min(32),
  refreshToken: refreshTokenSchema,
  expiresIn: z.number().positive(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    platformRole: z.enum(["member", "admin", "owner"]),
    hasPassword: z.boolean(),
    twoFactorEnabled: z.boolean(),
  }),
  isNewUser: z.boolean().default(false),
});

const authCompletionPathSchema = z.enum([
  "/auth/register/verify-code",
  "/auth/password/complete",
]);

function validateAuthCompletionBody(
  path: z.infer<typeof authCompletionPathSchema>,
  body: unknown,
): unknown {
  if (path === "/auth/register/verify-code")
    return verifyRegistrationSchema.parse(body);
  return completePasswordLoginSchema.parse(body);
}

async function completeAuthSession(
  storage: DesktopStorage,
  pathValue: unknown,
  body: unknown,
  apiBaseUrlValue: unknown,
  rememberSessionValue: unknown,
): Promise<DesktopAuthCompletionResult> {
  const path = authCompletionPathSchema.parse(pathValue);
  const apiBaseUrl = apiBaseUrlSchema
    .parse(apiBaseUrlValue)
    .replace(/\/$/u, "");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(validateAuthCompletionBody(path, body)),
  });
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as unknown;
    const error =
      value &&
      typeof value === "object" &&
      "code" in value &&
      "message" in value &&
      typeof value.code === "string" &&
      typeof value.message === "string"
        ? {
            code: value.code,
            message: value.message,
            details: "details" in value ? value.details : null,
          }
        : null;
    return { ok: false, status: response.status, error };
  }
  const completed = desktopAuthSessionSchema.parse(await response.json());
  await storage.storeAuthSession({
    refreshToken: completed.refreshToken,
    apiBaseUrl,
  }, rememberSessionValue !== false);
  return {
    ok: true,
    session: {
      accessToken: completed.accessToken,
      expiresIn: completed.expiresIn,
      user: completed.user,
      isNewUser: completed.isNewUser,
    },
  };
}

async function refreshAuthSession(
  storage: DesktopStorage,
): Promise<DesktopAuthSession | null> {
  const session = await storage.getAuthSession();
  if (!session) return null;
  const response = await fetch(`${session.apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok) {
    if (response.status === 401) await storage.clearAuthSession();
    throw new Error(`Session refresh failed with status ${response.status}`);
  }
  const refreshed = desktopAuthSessionSchema.parse(await response.json());
  await storage.rotateAuthSession({
    refreshToken: refreshed.refreshToken,
    apiBaseUrl: session.apiBaseUrl,
  });
  return {
    accessToken: refreshed.accessToken,
    expiresIn: refreshed.expiresIn,
    user: refreshed.user,
  };
}

function sourceType(id: string): DesktopSourceInfo["type"] {
  return id.startsWith("screen:") ? "screen" : "window";
}

async function listSources(): Promise<DesktopSourceInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  const displays = screen.getAllDisplays();
  return sources.map((source) => {
    const type = sourceType(source.id);
    const display =
      type === "screen"
        ? displays.find(
            (candidate) => String(candidate.id) === source.display_id,
          )
        : undefined;
    return {
      id: source.id,
      name: source.name.slice(0, 200),
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      ...(source.appIcon && !source.appIcon.isEmpty()
        ? { appIconDataUrl: source.appIcon.toDataURL() }
        : {}),
      type,
      ...(display === undefined
        ? {}
        : {
            displayName: display.label.slice(0, 200),
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor),
          }),
      audioAvailable: process.platform === "win32",
    };
  });
}

export function registerIpc(options: IpcOptions): () => void {
  const outgoingChannels = new Set<string>([
    IPC_CHANNELS.deepLink,
    IPC_CHANNELS.notificationClick,
    IPC_CHANNELS.updateState,
    IPC_CHANNELS.windowFullscreenState,
  ]);
  const channels = Object.values(IPC_CHANNELS).filter(
    (channel) => !outgoingChannels.has(channel),
  );
  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    listener: (
      event: IpcMainInvokeEvent,
      ...args: TArgs
    ) => Promise<TResult> | TResult,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
      if (!options.isTrustedSender(event)) {
        log.warn("Rejected IPC from an untrusted renderer", { channel });
        throw new Error("IPC sender rejected");
      }
      try {
        return await listener(event, ...args);
      } catch (error) {
        log.error("IPC operation failed", { channel, error });
        throw error;
      }
    });
  };

  handle(IPC_CHANNELS.appVersion, () => app.getVersion());
  handle(IPC_CHANNELS.windowFullscreenGet, () => options.getFullscreen());
  handle(IPC_CHANNELS.windowFullscreenToggle, () => options.toggleFullscreen());
  handle(IPC_CHANNELS.updateStateGet, () => options.updater.getState());
  handle(IPC_CHANNELS.updateCheck, () => options.updater.check());
  handle(IPC_CHANNELS.updateInstall, () => options.updater.install());
  handle(
    IPC_CHANNELS.authComplete,
    (_event, path: unknown, body: unknown, apiBaseUrl: unknown, rememberSession: unknown) =>
      completeAuthSession(options.storage, path, body, apiBaseUrl, rememberSession),
  );
  handle(IPC_CHANNELS.authRefresh, () => refreshAuthSession(options.storage));
  handle(IPC_CHANNELS.authLogout, async () => {
    const session = await options.storage.getAuthSession();
    try {
      if (session)
        await fetch(`${session.apiBaseUrl}/auth/logout`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
    } finally {
      await options.storage.clearAuthSession();
    }
  });
  handle(IPC_CHANNELS.authClear, () => options.storage.clearAuthSession());
  handle(IPC_CHANNELS.sourcesList, listSources);
  handle(IPC_CHANNELS.sourceSelect, (_event, value: unknown) => {
    const selection = desktopSourceSelectionSchema.parse(value);
    // The source list is intentionally not re-enumerated here. Chromium asks for
    // the source immediately after this IPC call; a second enumeration races
    // with disappearing/recreated windows and rejects an otherwise valid first
    // selection. The display-media handler remains authoritative and safely
    // denies a source that is genuinely gone.
    options.setSelectedSource(selection);
  });
  handle(IPC_CHANNELS.sourceClear, () => options.setSelectedSource(null));
  handle(IPC_CHANNELS.mediaDiagnostic, (_event, value: unknown) => {
    const diagnostic = desktopMediaDiagnosticSchema.parse(value);
    log.info("Media diagnostic", { media: diagnostic });
  });
  handle(IPC_CHANNELS.clipboardCopy, (_event, value: unknown) =>
    clipboard.writeText(z.string().max(20_000).parse(value)),
  );
  handle(IPC_CHANNELS.externalOpen, async (_event, value: unknown) =>
    shell.openExternal(externalUrlSchema.parse(value)),
  );
  handle(IPC_CHANNELS.badgeCountSet, (_event, value: unknown) =>
    options.setBadgeCount(z.number().int().min(0).max(99_999).parse(value)),
  );
  handle(IPC_CHANNELS.notificationShow, (_event, value: unknown) =>
    options.showMessageNotification(
      desktopMessageNotificationSchema.parse(value),
    ),
  );
  handle(IPC_CHANNELS.platform, () => process.platform);
  handle(IPC_CHANNELS.settingsGet, () => options.storage.getSettings());
  handle(IPC_CHANNELS.settingsUpdate, async (_event, value: unknown) =>
    options.storage.updateSettings(localSettingsSchema.parse(value)),
  );

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

export async function configureLogging(): Promise<void> {
  const logPath = log.transports.file.getFile().path;
  await fs.mkdir(dirname(logPath), { recursive: true });
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.level = "info";
  log.transports.console.level =
    process.env.NODE_ENV === "production" ? false : "debug";
  log.initialize();
}
