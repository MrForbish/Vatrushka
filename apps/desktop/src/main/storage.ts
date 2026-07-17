import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { app, safeStorage } from 'electron';

import { localSettingsSchema, type LocalSettings } from '@vatrushka/shared';

const defaultSettings: LocalSettings = { volume: 1 };

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
  private get refreshPath(): string {
    return join(app.getPath('userData'), 'session.bin');
  }

  private get settingsPath(): string {
    return join(app.getPath('userData'), 'settings.json');
  }

  async getAuthSession(): Promise<StoredAuthSession | null> {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encrypted = await fs.readFile(this.refreshPath);
      const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
      if (!parsed || typeof parsed !== 'object' || !('refreshToken' in parsed) || !('apiBaseUrl' in parsed) || typeof parsed.refreshToken !== 'string' || typeof parsed.apiBaseUrl !== 'string') return null;
      return { refreshToken: parsed.refreshToken, apiBaseUrl: parsed.apiBaseUrl };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      await this.clearAuthSession();
      return null;
    }
  }

  async storeAuthSession(session: StoredAuthSession): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище операционной системы недоступно');
    await atomicWrite(this.refreshPath, safeStorage.encryptString(JSON.stringify(session)));
  }

  async clearAuthSession(): Promise<void> {
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
