import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS, registerIpc } from './ipc.js';
import type { DesktopStorage } from './storage.js';

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent) => Promise<unknown>>(),
}));
vi.mock('electron', () => ({
  app: {}, clipboard: {}, desktopCapturer: {}, screen: {}, shell: {},
  ipcMain: {
    handle: (channel: string, handler: (event: IpcMainInvokeEvent) => Promise<unknown>) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

const originalToken = 'original-refresh-token-for-ipc-test-123456789';
const rotatedToken = 'rotated-refresh-token-for-ipc-test-123456789';
const refreshed = {
  accessToken: 'access-token-for-ipc-test-1234567890',
  refreshToken: rotatedToken,
  expiresIn: 900,
  user: { id: 'user-test', email: 'test@example.com', displayName: 'Test', platformRole: 'member', hasPassword: true, twoFactorEnabled: true },
};

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('main-process refresh coordination', () => {
  let stored: { refreshToken: string; apiBaseUrl: string } | null;
  let dispose: () => void;
  const rotateAuthSession = vi.fn(async (session: NonNullable<typeof stored>) => { stored = session; });
  const clearAuthSession = vi.fn(async () => { stored = null; });
  const fetchMock = vi.fn<typeof fetch>();
  const trusted = vi.fn(() => true);
  const invoke = () => handlers.get(IPC_CHANNELS.authRefresh)!({} as IpcMainInvokeEvent);

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    trusted.mockReturnValue(true);
    stored = { refreshToken: originalToken, apiBaseUrl: 'https://api.test/api/v1' };
    vi.stubGlobal('fetch', fetchMock);
    dispose = registerIpc({
      storage: { getAuthSession: async () => stored, rotateAuthSession, clearAuthSession } as unknown as DesktopStorage,
      isTrustedSender: trusted,
      setSelectedSource: vi.fn(), showMessageNotification: vi.fn(), setBadgeCount: vi.fn(),
      updater: { getState: vi.fn(), check: vi.fn(), install: vi.fn() },
    });
  });

  afterEach(() => { dispose(); vi.unstubAllGlobals(); });

  it('shares an in-flight rotation and uses the rotated token on the next request', async () => {
    const response = deferredResponse();
    fetchMock.mockReturnValueOnce(response.promise);
    const first = invoke();
    const second = invoke();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    response.resolve(Response.json(refreshed));
    const sessions = await Promise.all([first, second]);
    expect(sessions[0]).toEqual(sessions[1]);
    expect(sessions[0]).not.toHaveProperty('refreshToken');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rotateAuthSession).toHaveBeenCalledTimes(1);
    expect(clearAuthSession).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ refreshToken: originalToken }));

    fetchMock.mockResolvedValueOnce(Response.json(refreshed));
    await invoke();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ refreshToken: rotatedToken }));
  });

  it('releases the shared request after a network failure without clearing the session', async () => {
    const response = deferredResponse();
    fetchMock.mockReturnValueOnce(response.promise);
    const results = Promise.allSettled([invoke(), invoke()]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    response.reject(new Error('Network unavailable'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(clearAuthSession).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json(refreshed));
    expect(await invoke()).toHaveProperty('accessToken', refreshed.accessToken);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears an expired session once for concurrent callers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await Promise.all([invoke(), invoke()])).toEqual([null, null]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearAuthSession).toHaveBeenCalledTimes(1);
    expect(await invoke()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an untrusted renderer before accessing the refresh endpoint', async () => {
    trusted.mockReturnValue(false);
    await expect(invoke()).rejects.toThrow('IPC sender rejected');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rotateAuthSession).not.toHaveBeenCalled();
  });
});
