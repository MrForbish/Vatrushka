import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { app, safeStorage } from 'electron';

import { localSettingsSchema, type LocalSettings } from '@vatrushka/shared';

const defaultSettings: LocalSettings = {
  microphoneVolume: 1,
  outputVolume: 1,
  volume: 1,
  appSoundVolume: 1,
  desktopNotificationsEnabled: true,
  messageSoundsEnabled: true,
};

export interface StoredAuthSession {
  refreshToken: string;
  apiBaseUrl: string;
}

async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await fs.writeFile(temporary, data, { mode: 0o600 });
  await fs.rename(temporary, path);
}

export class DesktopStorage {
  private volatileAuthSession: StoredAuthSession | null = null;
  private persistAuthSession = true;

  private get refreshPath(): string {
    return join(app.getPath('userData'), 'session.bin');
  }

  private get settingsPath(): string {
    return join(app.getPath('userData'), 'settings.json');
  }

  async getAuthSession(): Promise<StoredAuthSession | null> {
    if (this.volatileAuthSession) return this.volatileAuthSession;
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encrypted = await fs.readFile(this.refreshPath);
      const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
      if (!parsed || typeof parsed !== 'object' || !('refreshToken' in parsed) || !('apiBaseUrl' in parsed) || typeof parsed.refreshToken !== 'string' || typeof parsed.apiBaseUrl !== 'string') return null;
      this.volatileAuthSession = { refreshToken: parsed.refreshToken, apiBaseUrl: parsed.apiBaseUrl };
      this.persistAuthSession = true;
      return this.volatileAuthSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      await this.clearAuthSession();
      return null;
    }
  }

  async storeAuthSession(session: StoredAuthSession, persistent = true): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище операционной системы недоступно');
    this.volatileAuthSession = session;
    this.persistAuthSession = persistent;
    if (!persistent) {
      await fs.rm(this.refreshPath, { force: true });
      return;
    }
    await atomicWrite(this.refreshPath, safeStorage.encryptString(JSON.stringify(session)));
  }

  async rotateAuthSession(session: StoredAuthSession): Promise<void> {
    await this.storeAuthSession(session, this.persistAuthSession);
  }

  async clearAuthSession(): Promise<void> {
    this.volatileAuthSession = null;
    this.persistAuthSession = true;
    try {
      await fs.rm(this.refreshPath, { force: true });
    } catch {
      // A missing or locked session file is treated as already cleared.
    }
  }

  async getSettings(): Promise<LocalSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = localSettingsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : defaultSettings;
    } catch {
      return defaultSettings;
    }
  }

  async updateSettings(settings: LocalSettings): Promise<void> {
    const validated = localSettingsSchema.parse(settings);
    await atomicWrite(this.settingsPath, JSON.stringify(validated, null, 2));
  }
}
