import {
  API_PREFIX,
  type ApiErrorBody,
  type AuthResponse,
  type PublicRoom,
  type PublicUser,
  type RoomConnection,
} from '@vatrushka/shared';

const apiBase = `${(import.meta.env.VITE_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/u, '')}${API_PREFIX}`;

export class ClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  guestToken?: string;
  retry?: boolean;
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<PublicUser> | null = null;
  private user: PublicUser | null = null;

  currentUser(): PublicUser | null {
    return this.user;
  }

  async restoreSession(): Promise<PublicUser | null> {
    this.refreshToken = await window.desktop.getStoredRefreshToken();
    if (!this.refreshToken) return null;
    try {
      return await this.refresh();
    } catch {
      await this.clearSession();
      return null;
    }
  }

  requestCode(email: string): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    return this.request('/auth/request-code', { method: 'POST', body: { email } });
  }

  async verifyCode(email: string, code: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/verify-code', {
      method: 'POST',
      body: { email, code, deviceName: `Ватрушка · ${await window.desktop.getPlatform()} Desktop` },
    });
    await this.acceptAuth(response);
    return response;
  }

  async updateProfile(displayName: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>('/me', { method: 'PATCH', body: { displayName }, auth: true });
    this.user = user;
    return user;
  }

  async logout(): Promise<void> {
    const token = this.refreshToken ?? (await window.desktop.getStoredRefreshToken());
    try {
      if (token) await this.request('/auth/logout', { method: 'POST', body: { refreshToken: token } });
    } finally {
      await this.clearSession();
    }
  }

  createRoom(): Promise<RoomConnection> {
    return this.request('/rooms', { method: 'POST', auth: true });
  }

  getRoom(code: string): Promise<PublicRoom> {
    return this.request(`/rooms/by-code/${encodeURIComponent(code)}`);
  }

  joinRoom(code: string): Promise<RoomConnection> {
    return this.request(`/rooms/by-code/${encodeURIComponent(code)}/join`, { method: 'POST', auth: true });
  }

  joinGuest(code: string, displayName: string): Promise<RoomConnection> {
    return this.request('/rooms/guest/join', { method: 'POST', body: { code, displayName } });
  }

  setRoomLock(roomId: string, isLocked: boolean): Promise<{ isLocked: boolean }> {
    return this.request(`/rooms/${roomId}/lock`, { method: 'PATCH', body: { isLocked }, auth: true });
  }

  async closeRoom(roomId: string): Promise<void> {
    await this.request(`/rooms/${roomId}/close`, { method: 'POST', auth: true });
  }

  async kickParticipant(roomId: string, participantIdentity: string): Promise<void> {
    await this.request(`/rooms/${roomId}/participants/${encodeURIComponent(participantIdentity)}`, { method: 'DELETE', auth: true });
  }

  claimScreenShare(connection: RoomConnection): Promise<{ expiresAt: string }> {
    return this.roomAction(connection, 'claim');
  }

  heartbeatScreenShare(connection: RoomConnection): Promise<{ expiresAt: string }> {
    return this.roomAction(connection, 'heartbeat');
  }

  async releaseScreenShare(connection: RoomConnection): Promise<void> {
    await this.roomAction(connection, 'release');
  }

  private roomAction(connection: RoomConnection, action: 'claim' | 'heartbeat' | 'release'): Promise<{ expiresAt: string }> {
    return this.request(`/rooms/${connection.roomId}/screen-share/${action}`, {
      method: 'POST',
      body: { participantIdentity: connection.participantIdentity },
      ...(connection.guestSessionToken ? { guestToken: connection.guestSessionToken } : { auth: true }),
    });
  }

  private async refresh(): Promise<PublicUser> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const token = this.refreshToken ?? (await window.desktop.getStoredRefreshToken());
      if (!token) throw new ClientError('UNAUTHORIZED', 'Сессия не найдена', 401);
      const response = await this.request<Omit<AuthResponse, 'isNewUser'>>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: token },
      });
      await this.acceptAuth(response);
      return response.user;
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async acceptAuth(response: Omit<AuthResponse, 'isNewUser'>): Promise<void> {
    this.accessToken = response.accessToken;
    this.refreshToken = response.refreshToken;
    this.user = response.user;
    await window.desktop.storeRefreshToken(response.refreshToken);
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    await window.desktop.clearRefreshToken();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, auth = false, guestToken, retry = true, headers, ...init } = options;
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', 'application/json');
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    if (guestToken) requestHeaders.set('Authorization', `Guest ${guestToken}`);
    else if (auth && this.accessToken) requestHeaders.set('Authorization', `Bearer ${this.accessToken}`);

    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ClientError('NETWORK_ERROR', 'Не удалось подключиться к серверу', 0);
    }

    if (response.status === 401 && auth && retry && this.refreshToken) {
      await this.refresh();
      return this.request<T>(path, { ...options, retry: false });
    }
    if (!response.ok) {
      const error = await response.json().catch(() => null) as ApiErrorBody | null;
      throw new ClientError(error?.code ?? 'UNKNOWN_ERROR', error?.message ?? 'Неизвестная ошибка сервера', response.status, error?.details);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export const apiClient = new ApiClient();
