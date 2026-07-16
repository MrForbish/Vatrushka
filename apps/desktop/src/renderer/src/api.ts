import {
  API_PREFIX,
  type ApiErrorBody,
  type AuthResponse,
  type DirectConversationSummary,
  type DirectMessage,
  type DirectMessageCandidate,
  type PasswordLoginChallenge,
  type PublicRoom,
  type PublicUser,
  type RoomConnection,
  type ServerChannel,
  type ServerDetail,
  type ServerPermission,
  type ServerRole,
  type ServerSummary,
  type TextMessage,
  type MessageNotificationPage,
  type TwoFactorSetup,
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
  formData?: FormData;
  auth?: boolean;
  guestToken?: string;
  retry?: boolean;
  responseType?: 'blob' | 'json';
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

  requestRegistration(email: string, password: string): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    return this.request('/auth/register/request-code', { method: 'POST', body: { email, password } });
  }

  async verifyRegistration(email: string, code: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register/verify-code', {
      method: 'POST',
      body: { email, code, deviceName: await this.deviceName() },
    });
    await this.acceptAuth(response);
    return response;
  }

  beginPasswordLogin(email: string, password: string, factor: 'auto' | 'email' | 'totp' = 'auto'): Promise<PasswordLoginChallenge> {
    return this.request('/auth/password/begin', { method: 'POST', body: { email, password, factor } });
  }

  async completePasswordLogin(email: string, password: string, code: string, factor: 'email' | 'totp'): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/password/complete', {
      method: 'POST',
      body: { email, password, code, factor, deviceName: await this.deviceName() },
    });
    await this.acceptAuth(response);
    return response;
  }

  requestPasswordSetup(): Promise<{ status: 'CODE_SENT'; retryAfterSeconds: number }> {
    return this.request('/me/password/request-code', { method: 'POST', auth: true });
  }

  async setPassword(code: string, password: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>('/me/password', { method: 'PUT', body: { code, password }, auth: true });
    this.user = user;
    return user;
  }

  beginTwoFactorSetup(): Promise<TwoFactorSetup> {
    return this.request('/me/2fa/setup', { method: 'POST', auth: true });
  }

  async enableTwoFactor(code: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>('/me/2fa/enable', { method: 'POST', body: { code }, auth: true });
    this.user = user;
    return user;
  }

  async disableTwoFactor(code: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>('/me/2fa', { method: 'DELETE', body: { code }, auth: true });
    this.user = user;
    return user;
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

  listServers(): Promise<ServerSummary[]> {
    return this.request('/servers', { auth: true });
  }

  createServer(name: string): Promise<ServerDetail> {
    return this.request('/servers', { method: 'POST', body: { name }, auth: true });
  }

  joinServer(inviteCode: string): Promise<ServerDetail> {
    return this.request('/servers/join', { method: 'POST', body: { inviteCode }, auth: true });
  }

  getServer(serverId: string): Promise<ServerDetail> {
    return this.request(`/servers/${serverId}`, { auth: true });
  }

  createServerChannel(serverId: string, name: string, type: 'text' | 'voice'): Promise<ServerChannel> {
    return this.request(`/servers/${serverId}/channels`, { method: 'POST', body: { name, type }, auth: true });
  }

  async deleteServerChannel(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}`, { method: 'DELETE', auth: true });
  }

  createServerRole(serverId: string, name: string, color: string, permissions: ServerPermission[]): Promise<ServerRole> {
    return this.request(`/servers/${serverId}/roles`, { method: 'POST', body: { name, color, permissions }, auth: true });
  }

  updateServerRole(serverId: string, roleId: string, values: Partial<Pick<ServerRole, 'name' | 'color' | 'permissions'>>): Promise<ServerRole> {
    return this.request(`/servers/${serverId}/roles/${roleId}`, { method: 'PATCH', body: values, auth: true });
  }

  async assignServerMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<void> {
    await this.request(`/servers/${serverId}/members/${userId}/roles`, { method: 'PUT', body: { roleIds }, auth: true });
  }

  async kickServerMember(serverId: string, userId: string): Promise<void> {
    await this.request(`/servers/${serverId}/members/${userId}`, { method: 'DELETE', auth: true });
  }

  listMessages(channelId: string): Promise<TextMessage[]> {
    return this.request(`/channels/${channelId}/messages?limit=100`, { auth: true });
  }

  listMessageNotifications(since: string | null, afterId: string | null): Promise<MessageNotificationPage> {
    const cursor = since === null ? '' : `&since=${encodeURIComponent(since)}${afterId === null ? '' : `&afterId=${encodeURIComponent(afterId)}`}`;
    return this.request(`/notifications/messages?limit=20${cursor}`, { auth: true });
  }

  createMessage(channelId: string, content: string, replyToMessageId?: string): Promise<TextMessage> {
    return this.request(`/channels/${channelId}/messages`, { method: 'POST', body: { content, ...(replyToMessageId === undefined ? {} : { replyToMessageId }) }, auth: true });
  }

  updateMessage(messageId: string, content: string): Promise<TextMessage> {
    return this.request(`/messages/${messageId}`, { method: 'PATCH', body: { content }, auth: true });
  }

  setMessageReaction(messageId: string, emoji: string, active: boolean): Promise<TextMessage> {
    return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: active ? 'PUT' : 'DELETE', auth: true });
  }

  async markChannelRead(channelId: string, messageId: string): Promise<void> {
    await this.request(`/channels/${channelId}/read`, { method: 'PUT', body: { messageId }, auth: true });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.request(`/messages/${messageId}`, { method: 'DELETE', auth: true });
  }

  uploadMessageAttachment(messageId: string, file: File): Promise<TextMessage> {
    const formData = new FormData();
    formData.set('file', file, file.name);
    return this.request(`/messages/${messageId}/attachments`, { method: 'POST', formData, auth: true });
  }

  deleteMessageAttachment(attachmentId: string): Promise<TextMessage> {
    return this.request(`/attachments/${attachmentId}`, { method: 'DELETE', auth: true });
  }

  downloadMessageAttachment(attachmentId: string): Promise<Blob> {
    return this.request(`/attachments/${attachmentId}/content`, { auth: true, responseType: 'blob' });
  }

  listDirectConversations(): Promise<DirectConversationSummary[]> {
    return this.request('/direct-conversations', { auth: true });
  }

  listDirectMessageCandidates(): Promise<DirectMessageCandidate[]> {
    return this.request('/direct-conversations/candidates', { auth: true });
  }

  createDirectConversation(participantUserId: string): Promise<DirectConversationSummary> {
    return this.request('/direct-conversations', { method: 'POST', body: { userId: participantUserId }, auth: true });
  }

  listDirectMessages(conversationId: string): Promise<DirectMessage[]> {
    return this.request(`/direct-conversations/${conversationId}/messages?limit=100`, { auth: true });
  }

  createDirectMessage(conversationId: string, content: string, replyToMessageId?: string): Promise<DirectMessage> {
    return this.request(`/direct-conversations/${conversationId}/messages`, { method: 'POST', body: { content, ...(replyToMessageId === undefined ? {} : { replyToMessageId }) }, auth: true });
  }

  updateDirectMessage(messageId: string, content: string): Promise<DirectMessage> {
    return this.request(`/direct-messages/${messageId}`, { method: 'PATCH', body: { content }, auth: true });
  }

  setDirectMessageReaction(messageId: string, emoji: string, active: boolean): Promise<DirectMessage> {
    return this.request(`/direct-messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: active ? 'PUT' : 'DELETE', auth: true });
  }

  async markDirectConversationRead(conversationId: string, messageId: string): Promise<void> {
    await this.request(`/direct-conversations/${conversationId}/read`, { method: 'PUT', body: { messageId }, auth: true });
  }

  async deleteDirectMessage(messageId: string): Promise<void> {
    await this.request(`/direct-messages/${messageId}`, { method: 'DELETE', auth: true });
  }

  uploadDirectMessageAttachment(messageId: string, file: File): Promise<DirectMessage> {
    const formData = new FormData();
    formData.set('file', file, file.name);
    return this.request(`/direct-messages/${messageId}/attachments`, { method: 'POST', formData, auth: true });
  }

  deleteDirectMessageAttachment(attachmentId: string): Promise<DirectMessage> {
    return this.request(`/direct-attachments/${attachmentId}`, { method: 'DELETE', auth: true });
  }

  downloadDirectMessageAttachment(attachmentId: string): Promise<Blob> {
    return this.request(`/direct-attachments/${attachmentId}/content`, { auth: true, responseType: 'blob' });
  }

  connectVoiceChannel(channelId: string): Promise<RoomConnection> {
    return this.request(`/channels/${channelId}/connect`, { method: 'POST', auth: true });
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

  async kickMediaParticipant(connection: RoomConnection, participantIdentity: string): Promise<void> {
    const resource = connection.contextType === 'channel' ? 'channels' : 'rooms';
    await this.request(`/${resource}/${connection.roomId}/participants/${encodeURIComponent(participantIdentity)}`, { method: 'DELETE', auth: true });
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
    const resource = connection.contextType === 'channel' ? 'channels' : 'rooms';
    return this.request(`/${resource}/${connection.roomId}/screen-share/${action}`, {
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

  private async deviceName(): Promise<string> {
    return `Ватрушка · ${await window.desktop.getPlatform()} Desktop`;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, formData, auth = false, guestToken, retry = true, responseType = 'json', headers, ...init } = options;
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
        ...(formData ? { body: formData } : body === undefined ? {} : { body: JSON.stringify(body) }),
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
    if (responseType === 'blob') return response.blob() as Promise<T>;
    return response.json() as Promise<T>;
  }
}

export const apiClient = new ApiClient();
