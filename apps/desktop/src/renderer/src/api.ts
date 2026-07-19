import {
  API_PREFIX,
  type ApiErrorBody,
  type DesktopAuthCompletionPath,
  type DesktopAuthSession,
  type DirectConversationSummary,
  type DirectMessage,
  type DirectMessageCandidate,
  type ConversationMessage,
  type ConversationMessagePage,
  type ConversationMentionType,
  type ConversationReadState,
  type ConversationMemberReadState,
  type ConversationSummary,
  type InternalNotification,
  type UserUnreadSummary,
  type UserNotificationPreferences,
  type ServerNotificationPreferences,
  type ConversationNotificationPreferences,
  type HomeDashboardResponse,
  type PasswordLoginChallenge,
  type PublicUser,
  type PublicServerSummary,
  type RoomConnection,
  type ServerChannel,
  type ServerDetail,
  type ServerAuditLogEntry,
  type ServerPermission,
  type ServerRole,
  type ServerSummary,
  type CreatedServerInvite,
  type ServerAppearanceSettings,
  type ServerAuditLogPage,
  type ServerBanSettings,
  type ServerChannelCategory,
  type ServerChannelSettings,
  type ServerInviteSettings,
  type ServerModerationSettings,
  type ServerOverviewSettings,
  type ServerSettingsMember,
  type TextMessage,
  type MessageNotificationPage,
  type MessageMentionInput,
  type TwoFactorSetup,
  type TwoFactorEnableResult,
  type UserSession,
  type SecurityEvent,
  type UserPresence,
  type UserPrivacySettings,
  type PresencePreference,
  type DirectMessagePrivacy,
  type PresenceVisibility,
  type BlockedUserSettings,
  type UserAccountSettings,
  type UserProfileSettings,
  type ServerVoiceStateDto,
  type MoveVoiceMemberAccepted,
  type MoveVoiceMemberRequest,
} from "@vatrushka/shared";

const apiBase = `${(import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "")}${API_PREFIX}`;
const realtimeUrl = `${(import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "").replace(/^http/u, "ws")}/ws`;

export class ClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: unknown = null,
    readonly requestId: string | null = null,
  ) {
    super(
      status >= 500 && requestId
        ? `${message} · код поддержки ${requestId}`
        : message,
    );
    this.name = "ClientError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  formData?: FormData;
  auth?: boolean;
  retry?: boolean;
  responseType?: "blob" | "json";
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<PublicUser> | null = null;
  private user: PublicUser | null = null;

  currentUser(): PublicUser | null {
    return this.user;
  }

  async realtimeCredentials(
    forceRefresh = false,
  ): Promise<{ token: string; url: string }> {
    if (forceRefresh || !this.accessToken) await this.refresh();
    if (!this.accessToken)
      throw new ClientError("UNAUTHORIZED", "Сессия не найдена", 401);
    return { token: this.accessToken, url: realtimeUrl };
  }

  async restoreSession(): Promise<PublicUser | null> {
    try {
      const response = await window.desktop.refreshAuthSession();
      if (!response) return null;
      this.acceptAccess(response);
      return response.user;
    } catch {
      return null;
    }
  }

  requestRegistration(
    email: string,
    password: string,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    return this.request("/auth/register/request-code", {
      method: "POST",
      body: { email, password },
    });
  }

  async verifyRegistration(
    email: string,
    code: string,
  ): Promise<DesktopAuthSession & { isNewUser: boolean }> {
    return this.completeAuth("/auth/register/verify-code", {
      email,
      code,
      deviceName: await this.deviceName(),
    }, true);
  }

  beginPasswordLogin(
    email: string,
    password: string,
    factor: "auto" | "email" | "totp" | "recovery" = "auto",
  ): Promise<PasswordLoginChallenge> {
    return this.request("/auth/password/begin", {
      method: "POST",
      body: { email, password, factor },
    });
  }

  async completePasswordLogin(
    email: string,
    password: string,
    code: string,
    factor: "email" | "totp" | "recovery",
    rememberSession = true,
  ): Promise<DesktopAuthSession & { isNewUser: boolean }> {
    return this.completeAuth("/auth/password/complete", {
      email,
      password,
      code,
      factor,
      deviceName: await this.deviceName(),
    }, rememberSession);
  }

  requestPasswordReset(
    email: string,
  ): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    return this.request("/auth/password/reset/request-code", {
      method: "POST",
      body: { email },
    });
  }

  completePasswordReset(
    email: string,
    code: string,
    password: string,
  ): Promise<{ status: "PASSWORD_RESET" }> {
    return this.request("/auth/password/reset/complete", {
      method: "POST",
      body: { email, code, password },
    });
  }

  requestPasswordSetup(): Promise<{
    status: "CODE_SENT";
    retryAfterSeconds: number;
  }> {
    return this.request("/me/password/request-code", {
      method: "POST",
      auth: true,
    });
  }

  async setPassword(code: string, password: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>("/me/password", {
      method: "PUT",
      body: { code, password },
      auth: true,
    });
    this.user = user;
    return user;
  }

  beginTwoFactorSetup(): Promise<TwoFactorSetup> {
    return this.request("/me/2fa/setup", { method: "POST", auth: true });
  }

  async enableTwoFactor(code: string): Promise<TwoFactorEnableResult> {
    const result = await this.request<TwoFactorEnableResult>("/me/2fa/enable", {
      method: "POST",
      body: { code },
      auth: true,
    });
    this.user = result.user;
    return result;
  }

  async disableTwoFactor(code: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>("/me/2fa", {
      method: "DELETE",
      body: { code },
      auth: true,
    });
    this.user = user;
    return user;
  }

  regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    return this.request("/me/2fa/recovery-codes", {
      method: "POST",
      body: { code },
      auth: true,
    });
  }

  listSessions(): Promise<UserSession[]> {
    return this.request("/auth/sessions", { auth: true });
  }

  async setSessionTrusted(sessionId: string, trusted: boolean): Promise<void> {
    await this.request(`/auth/sessions/${sessionId}`, {
      method: "PATCH",
      body: { trusted },
      auth: true,
    });
  }

  async revokeSession(sessionId: string): Promise<{ current: boolean }> {
    const result = await this.request<{ current: boolean }>(
      `/auth/sessions/${sessionId}`,
      { method: "DELETE", auth: true },
    );
    if (result.current) await this.clearSession();
    return result;
  }

  revokeOtherSessions(): Promise<{ revokedCount: number }> {
    return this.request("/auth/sessions", { method: "DELETE", auth: true });
  }

  listSecurityEvents(): Promise<SecurityEvent[]> {
    return this.request("/me/security-events", { auth: true });
  }

  async updateProfile(displayName: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>("/me", {
      method: "PATCH",
      body: { displayName },
      auth: true,
    });
    this.user = user;
    return user;
  }

  getPresence(): Promise<UserPresence> {
    return this.request("/me/presence", { auth: true });
  }

  heartbeatPresence(idle: boolean): Promise<UserPresence> {
    return this.request("/me/presence/heartbeat", {
      method: "POST",
      body: { idle },
      auth: true,
    });
  }

  updatePresence(input: {
    preference: PresencePreference;
    customText: string | null;
    customTextExpiresAt: string | null;
  }): Promise<UserPresence> {
    return this.request("/me/presence", {
      method: "PATCH",
      body: input,
      auth: true,
    });
  }

  getPrivacySettings(): Promise<UserPrivacySettings> {
    return this.request("/me/privacy", { auth: true });
  }

  updatePrivacySettings(input: {
    directMessages: DirectMessagePrivacy;
    presenceVisibility: PresenceVisibility;
    activityVisible: boolean;
  }): Promise<UserPrivacySettings> {
    return this.request("/me/privacy", {
      method: "PATCH",
      body: input,
      auth: true,
    });
  }

  async logout(): Promise<void> {
    try {
      await window.desktop.logoutAuthSession();
    } finally {
      this.accessToken = null;
      this.user = null;
    }
  }

  listServers(): Promise<ServerSummary[]> {
    return this.request("/servers", { auth: true });
  }

  listPublicServers(
    search = "",
    limit = 20,
    offset = 0,
  ): Promise<PublicServerSummary[]> {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search.trim()) query.set("search", search.trim());
    return this.request(`/public-servers?${query.toString()}`, { auth: true });
  }

  joinPublicServer(serverId: string): Promise<ServerDetail> {
    return this.request(`/public-servers/${serverId}/join`, {
      method: "POST",
      auth: true,
    });
  }

  getHomeDashboard(): Promise<HomeDashboardResponse> {
    return this.request("/home", { auth: true });
  }

  async recordOpenedChannel(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}/activity/open`, {
      method: "POST",
      auth: true,
    });
  }

  async recordLeftVoiceChannel(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}/activity/leave`, {
      method: "POST",
      auth: true,
    });
  }

  createServer(name: string): Promise<ServerDetail> {
    return this.request("/servers", {
      method: "POST",
      body: { name },
      auth: true,
    });
  }

  acceptServerInvite(inviteToken: string): Promise<ServerDetail> {
    return this.request(`/invites/${encodeURIComponent(inviteToken)}/accept`, {
      method: "POST",
      auth: true,
    });
  }

  getServer(serverId: string): Promise<ServerDetail> {
    return this.request(`/servers/${serverId}`, { auth: true });
  }

  getUserProfileSettings(): Promise<UserProfileSettings> {
    return this.request("/users/me/profile", { auth: true });
  }

  updateUserProfileSettings(
    input: Pick<UserProfileSettings, "displayName" | "username" | "bio">,
  ): Promise<UserProfileSettings> {
    return this.request("/users/me/profile", {
      method: "PATCH",
      body: input,
      auth: true,
    });
  }

  async uploadUserAvatar(file: File): Promise<UserProfileSettings> {
    const intent = await this.request<{
      objectKey: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("/users/me/avatar/upload-intent", {
      method: "POST",
      body: { mimeType: file.type, sizeBytes: file.size },
      auth: true,
    });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.headers,
      body: file,
    });
    if (!response.ok)
      throw new ClientError(
        "MEDIA_UPLOAD_FAILED",
        "Не удалось загрузить аватар",
        response.status,
      );
    return this.request("/users/me/avatar", {
      method: "PUT",
      body: { objectKey: intent.objectKey },
      auth: true,
    });
  }

  resetUserAvatar(): Promise<UserProfileSettings> {
    return this.request("/users/me/avatar", {
      method: "PUT",
      body: { objectKey: null },
      auth: true,
    });
  }

  async uploadUserProfileCover(file: File): Promise<UserProfileSettings> {
    const intent = await this.request<{
      objectKey: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("/users/me/profile-cover/upload-intent", {
      method: "POST",
      body: { mimeType: file.type, sizeBytes: file.size },
      auth: true,
    });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.headers,
      body: file,
    });
    if (!response.ok)
      throw new ClientError(
        "MEDIA_UPLOAD_FAILED",
        "Не удалось загрузить обложку профиля",
        response.status,
      );
    return this.request("/users/me/profile-cover", {
      method: "PUT",
      body: { objectKey: intent.objectKey },
      auth: true,
    });
  }

  resetUserProfileCover(): Promise<UserProfileSettings> {
    return this.request("/users/me/profile-cover", {
      method: "PUT",
      body: { objectKey: null },
      auth: true,
    });
  }

  requestEmailChange(input: {
    email: string;
    password: string;
    totpCode: string | null;
  }): Promise<{ status: "CODE_SENT"; retryAfterSeconds: number }> {
    return this.request("/users/me/email-change/request", {
      method: "POST",
      body: input,
      auth: true,
    });
  }

  async confirmEmailChange(code: string): Promise<PublicUser> {
    const user = await this.request<PublicUser>(
      "/users/me/email-change/confirm",
      { method: "POST", body: { code }, auth: true },
    );
    this.user = user;
    return user;
  }

  listBlockedUsers(): Promise<BlockedUserSettings[]> {
    return this.request("/users/me/blocked-users", { auth: true });
  }

  async blockUser(userId: string): Promise<void> {
    await this.request(`/users/me/blocked-users/${userId}`, {
      method: "PUT",
      auth: true,
    });
  }

  async unblockUser(userId: string): Promise<void> {
    await this.request(`/users/me/blocked-users/${userId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  getUserAccountSettings(): Promise<UserAccountSettings> {
    return this.request("/users/me/account", { auth: true });
  }

  scheduleAccountDeactivation(reauthentication: {
    password: string;
    totpCode: string | null;
  }): Promise<UserAccountSettings> {
    return this.request("/users/me/deactivation", {
      method: "POST",
      body: reauthentication,
      auth: true,
    });
  }

  cancelAccountDeactivation(): Promise<UserAccountSettings> {
    return this.request("/users/me/deactivation", {
      method: "DELETE",
      auth: true,
    });
  }

  exportPersonalData(): Promise<Record<string, unknown>> {
    return this.request("/users/me/export", { auth: true });
  }

  getServerOverviewSettings(serverId: string): Promise<ServerOverviewSettings> {
    return this.request(`/servers/${serverId}/settings/overview`, {
      auth: true,
    });
  }

  updateServerOverviewSettings(
    serverId: string,
    input: Omit<
      ServerOverviewSettings,
      "id" | "ownerUserId" | "ownerDisplayName" | "updatedAt"
    >,
  ): Promise<ServerOverviewSettings> {
    return this.request(`/servers/${serverId}/settings/overview`, {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  getServerAppearanceSettings(
    serverId: string,
  ): Promise<ServerAppearanceSettings> {
    return this.request(`/servers/${serverId}/settings/appearance`, {
      auth: true,
    });
  }

  async uploadServerAppearance(
    serverId: string,
    kind: "icon" | "banner",
    file: File,
  ): Promise<string> {
    const intent = await this.request<{
      objectKey: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>(`/servers/${serverId}/settings/appearance/upload-intent`, {
      method: "POST",
      body: { kind, mimeType: file.type, sizeBytes: file.size },
      auth: true,
    });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.headers,
      body: file,
    });
    if (!response.ok)
      throw new ClientError(
        "MEDIA_UPLOAD_FAILED",
        "Не удалось загрузить изображение",
        response.status,
      );
    return intent.objectKey;
  }

  updateServerAppearanceSettings(
    serverId: string,
    input: {
      iconObjectKey?: string | null;
      bannerObjectKey?: string | null;
      accentColor: string | null;
      version: number;
    },
  ): Promise<ServerAppearanceSettings> {
    return this.request(`/servers/${serverId}/settings/appearance`, {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  listServerSettingsMembers(
    serverId: string,
    search = "",
  ): Promise<ServerSettingsMember[]> {
    const query = search.trim()
      ? `?search=${encodeURIComponent(search.trim())}`
      : "";
    return this.request(`/servers/${serverId}/settings/members${query}`, {
      auth: true,
    });
  }

  async updateServerSettingsMember(
    serverId: string,
    userId: string,
    input: { mutedUntil?: string | null; deafened?: boolean },
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings/members/${userId}`, {
      method: "PATCH",
      body: input,
      auth: true,
    });
  }

  async updateOwnServerDisplayName(
    serverId: string,
    displayName: string | null,
  ): Promise<void> {
    await this.request(`/servers/${serverId}/members/me/display-name`, {
      method: "PATCH",
      body: { displayName },
      auth: true,
    });
  }

  async updatePrivateServerMemberAlias(
    serverId: string,
    userId: string,
    alias: string | null,
  ): Promise<void> {
    await this.request(`/servers/${serverId}/members/${userId}/private-alias`, {
      method: "PATCH",
      body: { alias },
      auth: true,
    });
  }

  getServerChannelSettings(
    serverId: string,
  ): Promise<{
    categories: ServerChannelCategory[];
    channels: ServerChannelSettings[];
  }> {
    return this.request(`/servers/${serverId}/settings/channels`, {
      auth: true,
    });
  }

  createServerCategory(
    serverId: string,
    name: string,
    position?: number,
  ): Promise<ServerChannelCategory> {
    return this.request(`/servers/${serverId}/settings/categories`, {
      method: "POST",
      body: { name, ...(position === undefined ? {} : { position }) },
      auth: true,
    });
  }

  async updateServerCategory(
    serverId: string,
    categoryId: string,
    input: { name?: string; position?: number },
  ): Promise<void> {
    await this.request(
      `/servers/${serverId}/settings/categories/${categoryId}`,
      { method: "PATCH", body: input, auth: true },
    );
  }

  async deleteServerCategory(
    serverId: string,
    categoryId: string,
  ): Promise<void> {
    await this.request(
      `/servers/${serverId}/settings/categories/${categoryId}`,
      { method: "DELETE", auth: true },
    );
  }

  async updateServerChannelSettings(
    serverId: string,
    channelId: string,
    input: Partial<
      Omit<ServerChannelSettings, "id" | "type" | "archivedAt">
    > & { archived?: boolean; version: number },
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings/channels/${channelId}`, {
      method: "PATCH",
      body: input,
      auth: true,
    });
  }

  listServerInvites(serverId: string): Promise<ServerInviteSettings[]> {
    return this.request(`/servers/${serverId}/settings/invites`, {
      auth: true,
    });
  }

  createServerInvite(
    serverId: string,
    input: {
      destinationChannelId: string | null;
      expiresInSeconds: number | null;
      maxUses: number | null;
    },
  ): Promise<CreatedServerInvite> {
    return this.request(`/servers/${serverId}/settings/invites`, {
      method: "POST",
      body: input,
      auth: true,
    });
  }

  async revokeServerInvite(serverId: string, inviteId: string): Promise<void> {
    await this.request(`/servers/${serverId}/settings/invites/${inviteId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  getServerModerationSettings(
    serverId: string,
  ): Promise<ServerModerationSettings> {
    return this.request(`/servers/${serverId}/settings/moderation`, {
      auth: true,
    });
  }

  updateServerModerationSettings(
    serverId: string,
    input: ServerModerationSettings,
  ): Promise<ServerModerationSettings> {
    return this.request(`/servers/${serverId}/settings/moderation`, {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  listServerBans(serverId: string): Promise<ServerBanSettings[]> {
    return this.request(`/servers/${serverId}/settings/bans`, { auth: true });
  }

  async banServerMember(
    serverId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings/bans/${userId}`, {
      method: "POST",
      body: { reason },
      auth: true,
    });
  }

  async unbanServerMember(serverId: string, userId: string): Promise<void> {
    await this.request(`/servers/${serverId}/settings/bans/${userId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  listServerSettingsAudit(
    serverId: string,
    options: {
      before?: string;
      action?: string;
      actorUserId?: string;
      limit?: number;
    } = {},
  ): Promise<ServerAuditLogPage> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
    if (options.before) query.set("before", options.before);
    if (options.action) query.set("action", options.action);
    if (options.actorUserId) query.set("actorUserId", options.actorUserId);
    return this.request(
      `/servers/${serverId}/settings/audit-log?${query.toString()}`,
      { auth: true },
    );
  }

  revokeAllServerInvites(
    serverId: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<{ revoked: number }> {
    return this.request(`/servers/${serverId}/settings/revoke-invites`, {
      method: "POST",
      body: reauthentication,
      auth: true,
    });
  }

  async archiveServer(
    serverId: string,
    archived: boolean,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings/archive`, {
      method: "POST",
      body: { archived, ...reauthentication },
      auth: true,
    });
  }

  async transferServerOwnership(
    serverId: string,
    userId: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings/transfer-ownership`, {
      method: "POST",
      body: { userId, ...reauthentication },
      auth: true,
    });
  }

  async deleteServerPermanently(
    serverId: string,
    confirmation: string,
    reauthentication: { password: string; totpCode: string | null },
  ): Promise<void> {
    await this.request(`/servers/${serverId}/settings`, {
      method: "DELETE",
      body: { confirmation, ...reauthentication },
      auth: true,
    });
  }

  createServerChannel(
    serverId: string,
    name: string,
    type: "text" | "voice",
  ): Promise<ServerChannel> {
    return this.request(`/servers/${serverId}/channels`, {
      method: "POST",
      body: { name, type },
      auth: true,
    });
  }

  async deleteServerChannel(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  createServerRole(
    serverId: string,
    name: string,
    color: string,
    permissions: ServerPermission[],
  ): Promise<ServerRole> {
    return this.request(`/servers/${serverId}/roles`, {
      method: "POST",
      body: { name, color, permissions },
      auth: true,
    });
  }

  updateServerRole(
    serverId: string,
    roleId: string,
    values: Partial<Pick<ServerRole, "name" | "color" | "permissions">>,
  ): Promise<ServerRole> {
    return this.request(`/servers/${serverId}/roles/${roleId}`, {
      method: "PATCH",
      body: values,
      auth: true,
    });
  }

  reorderServerRole(
    serverId: string,
    roleId: string,
    position: number,
  ): Promise<ServerRole> {
    return this.request(`/servers/${serverId}/roles/${roleId}/position`, {
      method: "PATCH",
      body: { position },
      auth: true,
    });
  }

  async deleteServerRole(serverId: string, roleId: string): Promise<void> {
    await this.request(`/servers/${serverId}/roles/${roleId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  async assignServerMemberRoles(
    serverId: string,
    userId: string,
    roleIds: string[],
  ): Promise<void> {
    await this.request(`/servers/${serverId}/members/${userId}/roles`, {
      method: "PUT",
      body: { roleIds },
      auth: true,
    });
  }

  async setChannelPermissionOverwrite(
    channelId: string,
    targetType: "ROLE" | "MEMBER",
    targetId: string,
    allow: ServerPermission[],
    deny: ServerPermission[],
  ): Promise<void> {
    await this.request(
      `/channels/${channelId}/overwrites/${targetType}/${targetId}`,
      { method: "PUT", body: { allow, deny }, auth: true },
    );
  }

  listServerAuditLog(serverId: string): Promise<ServerAuditLogEntry[]> {
    return this.request(`/servers/${serverId}/audit-log`, { auth: true });
  }

  async kickServerMember(serverId: string, userId: string): Promise<void> {
    await this.request(`/servers/${serverId}/members/${userId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  getServerVoiceState(serverId: string): Promise<ServerVoiceStateDto> {
    return this.request(`/servers/${serverId}/voice-state`, { auth: true });
  }

  moveVoiceMember(
    serverId: string,
    input: MoveVoiceMemberRequest,
  ): Promise<MoveVoiceMemberAccepted> {
    return this.request(`/servers/${serverId}/voice/moves`, {
      method: "POST",
      body: input,
      auth: true,
    });
  }

  pollVoiceMoveRequest(): Promise<RoomConnection | null> {
    return this.request("/voice/move-request", { auth: true });
  }

  listConversations(): Promise<ConversationSummary[]> {
    return this.request("/conversations", { auth: true });
  }

  listConversationMessages(
    conversationId: string,
    options: { before?: string; after?: string; limit?: number } = {},
  ): Promise<ConversationMessagePage> {
    const query = new URLSearchParams();
    if (options.before) query.set("before", options.before);
    if (options.after) query.set("after", options.after);
    query.set("limit", String(options.limit ?? 100));
    return this.request(
      `/conversations/${conversationId}/messages?${query.toString()}`,
      { auth: true },
    );
  }

  createConversationMessage(
    conversationId: string,
    input: {
      clientMessageId: string;
      content: string;
      replyToMessageId?: string;
      attachmentIds?: string[];
      mentions?: Array<{
        type: ConversationMentionType;
        userId?: string;
        roleId?: string;
        start?: number;
        length?: number;
      }>;
    },
  ): Promise<ConversationMessage> {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: input,
      auth: true,
    });
  }

  updateConversationMessage(
    conversationId: string,
    messageId: string,
    content: string,
    mentions: Array<{
      type: ConversationMentionType;
      userId?: string;
      roleId?: string;
      start?: number;
      length?: number;
    }> = [],
  ): Promise<ConversationMessage> {
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}`,
      { method: "PATCH", body: { content, mentions }, auth: true },
    );
  }

  async deleteConversationMessage(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.request(
      `/conversations/${conversationId}/messages/${messageId}`,
      { method: "DELETE", auth: true },
    );
  }

  setConversationReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<ConversationMessage> {
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: active ? "PUT" : "DELETE", auth: true },
    );
  }

  updateConversationReadState(
    conversationId: string,
    input: { lastDeliveredMessageId?: string; lastReadMessageId?: string },
  ): Promise<ConversationReadState> {
    return this.request(`/conversations/${conversationId}/read-state`, {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  listConversationReadStates(
    conversationId: string,
  ): Promise<ConversationMemberReadState[]> {
    return this.request(`/conversations/${conversationId}/read-states`, {
      auth: true,
    });
  }

  getUnreadSummary(): Promise<UserUnreadSummary> {
    return this.request("/me/unread", { auth: true });
  }

  getNotificationPreferences(): Promise<UserNotificationPreferences> {
    return this.request("/me/notification-preferences", { auth: true });
  }

  updateNotificationPreferences(
    input: Omit<UserNotificationPreferences, "updatedAt">,
  ): Promise<UserNotificationPreferences> {
    return this.request("/me/notification-preferences", {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  getServerNotificationPreferences(
    serverId: string,
  ): Promise<ServerNotificationPreferences> {
    return this.request(`/servers/${serverId}/notification-preferences`, {
      auth: true,
    });
  }

  updateServerNotificationPreferences(
    serverId: string,
    input: Omit<ServerNotificationPreferences, "serverId" | "updatedAt">,
  ): Promise<ServerNotificationPreferences> {
    return this.request(`/servers/${serverId}/notification-preferences`, {
      method: "PUT",
      body: input,
      auth: true,
    });
  }

  getConversationNotificationPreferences(
    conversationId: string,
  ): Promise<ConversationNotificationPreferences> {
    return this.request(
      `/conversations/${conversationId}/notification-preferences`,
      { auth: true },
    );
  }

  updateConversationNotificationPreferences(
    conversationId: string,
    input: Omit<
      ConversationNotificationPreferences,
      "conversationId" | "updatedAt"
    >,
  ): Promise<ConversationNotificationPreferences> {
    return this.request(
      `/conversations/${conversationId}/notification-preferences`,
      { method: "PUT", body: input, auth: true },
    );
  }

  listNotifications(
    before?: string,
    unreadOnly = false,
  ): Promise<InternalNotification[]> {
    const query = new URLSearchParams({
      limit: "100",
      unreadOnly: String(unreadOnly),
    });
    if (before) query.set("before", before);
    return this.request(`/notifications?${query.toString()}`, { auth: true });
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await this.request(`/notifications/${notificationId}/read`, {
      method: "PATCH",
      auth: true,
    });
  }

  async dismissNotification(notificationId: string): Promise<void> {
    await this.request(`/notifications/${notificationId}/dismiss`, {
      method: "PATCH",
      auth: true,
    });
  }

  markAllNotificationsRead(): Promise<{ updated: number }> {
    return this.request("/notifications/read-all", {
      method: "POST",
      auth: true,
    });
  }

  async uploadConversationAttachment(file: File): Promise<string> {
    const intent = await this.request<{
      attachmentId: string;
      uploadUrl: string;
      headers: Record<string, string>;
      expiresAt: string;
    }>("/attachments/intents", {
      method: "POST",
      body: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      },
      auth: true,
    });
    const headers = new Headers();
    for (const [name, value] of Object.entries(intent.headers))
      if (name.toLowerCase() !== "content-length") headers.set(name, value);
    const uploaded = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers,
      body: file,
    });
    if (!uploaded.ok)
      throw new ClientError(
        "MEDIA_UPLOAD_FAILED",
        "Не удалось загрузить вложение",
        uploaded.status,
      );
    await this.request(`/attachments/${intent.attachmentId}/finalize`, {
      method: "POST",
      auth: true,
    });
    return intent.attachmentId;
  }

  async downloadConversationAttachment(attachmentId: string): Promise<Blob> {
    const target = await this.request<{ url: string; expiresAt: string }>(
      `/attachments/${attachmentId}/url`,
      { auth: true },
    );
    const response = await fetch(target.url);
    if (!response.ok)
      throw new ClientError(
        "MEDIA_DOWNLOAD_FAILED",
        "Не удалось скачать вложение",
        response.status,
      );
    return response.blob();
  }

  deleteConversationAttachment(
    attachmentId: string,
  ): Promise<ConversationMessage> {
    return this.request(`/conversation-attachments/${attachmentId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  listMessages(channelId: string): Promise<TextMessage[]> {
    return this.request(`/channels/${channelId}/messages?limit=100`, {
      auth: true,
    });
  }

  listMessageNotifications(
    since: string | null,
    afterId: string | null,
  ): Promise<MessageNotificationPage> {
    const cursor =
      since === null
        ? ""
        : `&since=${encodeURIComponent(since)}${afterId === null ? "" : `&afterId=${encodeURIComponent(afterId)}`}`;
    return this.request(`/notifications/messages?limit=20${cursor}`, {
      auth: true,
    });
  }

  createMessage(
    channelId: string,
    content: string,
    mentions: MessageMentionInput[] = [],
    replyToMessageId?: string,
  ): Promise<TextMessage> {
    return this.request(`/channels/${channelId}/messages`, {
      method: "POST",
      body: {
        content,
        mentions,
        ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      },
      auth: true,
    });
  }

  updateMessage(
    messageId: string,
    content: string,
    mentions: MessageMentionInput[] = [],
  ): Promise<TextMessage> {
    return this.request(`/messages/${messageId}`, {
      method: "PATCH",
      body: { content, mentions },
      auth: true,
    });
  }

  setMessageReaction(
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<TextMessage> {
    return this.request(
      `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: active ? "PUT" : "DELETE", auth: true },
    );
  }

  async markChannelRead(channelId: string, messageId: string): Promise<void> {
    await this.request(`/channels/${channelId}/read`, {
      method: "PUT",
      body: { messageId },
      auth: true,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.request(`/messages/${messageId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  uploadMessageAttachment(messageId: string, file: File): Promise<TextMessage> {
    const formData = new FormData();
    formData.set("file", file, file.name);
    return this.request(`/messages/${messageId}/attachments`, {
      method: "POST",
      formData,
      auth: true,
    });
  }

  deleteMessageAttachment(attachmentId: string): Promise<TextMessage> {
    return this.request(`/attachments/${attachmentId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  downloadMessageAttachment(attachmentId: string): Promise<Blob> {
    return this.request(`/attachments/${attachmentId}/content`, {
      auth: true,
      responseType: "blob",
    });
  }

  listDirectConversations(): Promise<DirectConversationSummary[]> {
    return this.request("/direct-conversations", { auth: true });
  }

  listDirectMessageCandidates(): Promise<DirectMessageCandidate[]> {
    return this.request("/direct-conversations/candidates", { auth: true });
  }

  createDirectConversation(
    participantUserId: string,
  ): Promise<DirectConversationSummary> {
    return this.request("/direct-conversations", {
      method: "POST",
      body: { userId: participantUserId },
      auth: true,
    });
  }

  listDirectMessages(conversationId: string): Promise<DirectMessage[]> {
    return this.request(
      `/direct-conversations/${conversationId}/messages?limit=100`,
      { auth: true },
    );
  }

  createDirectMessage(
    conversationId: string,
    content: string,
    replyToMessageId?: string,
  ): Promise<DirectMessage> {
    return this.request(`/direct-conversations/${conversationId}/messages`, {
      method: "POST",
      body: {
        content,
        ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      },
      auth: true,
    });
  }

  updateDirectMessage(
    messageId: string,
    content: string,
  ): Promise<DirectMessage> {
    return this.request(`/direct-messages/${messageId}`, {
      method: "PATCH",
      body: { content },
      auth: true,
    });
  }

  setDirectMessageReaction(
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<DirectMessage> {
    return this.request(
      `/direct-messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: active ? "PUT" : "DELETE", auth: true },
    );
  }

  async markDirectConversationRead(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.request(`/direct-conversations/${conversationId}/read`, {
      method: "PUT",
      body: { messageId },
      auth: true,
    });
  }

  async deleteDirectMessage(messageId: string): Promise<void> {
    await this.request(`/direct-messages/${messageId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  uploadDirectMessageAttachment(
    messageId: string,
    file: File,
  ): Promise<DirectMessage> {
    const formData = new FormData();
    formData.set("file", file, file.name);
    return this.request(`/direct-messages/${messageId}/attachments`, {
      method: "POST",
      formData,
      auth: true,
    });
  }

  deleteDirectMessageAttachment(attachmentId: string): Promise<DirectMessage> {
    return this.request(`/direct-attachments/${attachmentId}`, {
      method: "DELETE",
      auth: true,
    });
  }

  downloadDirectMessageAttachment(attachmentId: string): Promise<Blob> {
    return this.request(`/direct-attachments/${attachmentId}/content`, {
      auth: true,
      responseType: "blob",
    });
  }

  connectVoiceChannel(channelId: string): Promise<RoomConnection> {
    return this.request(`/channels/${channelId}/connect`, {
      method: "POST",
      auth: true,
    });
  }

  async kickMediaParticipant(
    connection: RoomConnection,
    participantIdentity: string,
  ): Promise<void> {
    await this.request(
      `/channels/${connection.channelId}/participants/${encodeURIComponent(participantIdentity)}`,
      { method: "DELETE", auth: true },
    );
  }

  claimScreenShare(connection: RoomConnection): Promise<{ expiresAt: string }> {
    return this.channelScreenShareAction(connection, "claim");
  }

  heartbeatScreenShare(
    connection: RoomConnection,
  ): Promise<{ expiresAt: string }> {
    return this.channelScreenShareAction(connection, "heartbeat");
  }

  async releaseScreenShare(connection: RoomConnection): Promise<void> {
    await this.channelScreenShareAction(connection, "release");
  }

  private channelScreenShareAction(
    connection: RoomConnection,
    action: "claim" | "heartbeat" | "release",
  ): Promise<{ expiresAt: string }> {
    return this.request(
      `/channels/${connection.channelId}/screen-share/${action}`,
      {
        method: "POST",
        body: { participantIdentity: connection.participantIdentity },
        auth: true,
      },
    );
  }

  private async refresh(): Promise<PublicUser> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const response = await window.desktop.refreshAuthSession();
      if (!response)
        throw new ClientError("UNAUTHORIZED", "Сессия не найдена", 401);
      this.acceptAccess(response);
      return response.user;
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async completeAuth(
    path: DesktopAuthCompletionPath,
    body: unknown,
    rememberSession: boolean,
  ): Promise<DesktopAuthSession & { isNewUser: boolean }> {
    const result = await window.desktop.completeAuthSession(
      path,
      body,
      apiBase,
      rememberSession,
    );
    if (!result.ok)
      throw new ClientError(
        result.error?.code ?? "UNKNOWN_ERROR",
        result.error?.message ?? "Не удалось завершить вход",
        result.status,
        result.error?.details,
      );
    this.acceptAccess(result.session);
    return result.session;
  }

  private acceptAccess(response: DesktopAuthSession): void {
    this.accessToken = response.accessToken;
    this.user = response.user;
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    this.user = null;
    await window.desktop.clearAuthSession();
  }

  private async deviceName(): Promise<string> {
    return `Ватрушка · ${await window.desktop.getPlatform()} Desktop`;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const {
      body,
      formData,
      auth = false,
      retry = true,
      responseType = "json",
      headers,
      ...init
    } = options;
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", "application/json");
    if (body !== undefined)
      requestHeaders.set("Content-Type", "application/json");
    if (auth && this.accessToken)
      requestHeaders.set("Authorization", `Bearer ${this.accessToken}`);

    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: requestHeaders,
        ...(formData
          ? { body: formData }
          : body === undefined
            ? {}
            : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ClientError(
        "NETWORK_ERROR",
        "Не удалось подключиться к серверу",
        0,
      );
    }

    if (response.status === 401 && auth && retry) {
      try {
        await this.refresh();
        return this.request<T>(path, { ...options, retry: false });
      } catch (caught) {
        if (caught instanceof ClientError && caught.status === 401)
          await this.clearSession();
        throw caught;
      }
    }
    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      throw new ClientError(
        error?.code ?? "UNKNOWN_ERROR",
        error?.message ?? "Неизвестная ошибка сервера",
        response.status,
        error?.details,
        error?.requestId ?? response.headers.get("x-request-id"),
      );
    }
    if (response.status === 204) return undefined as T;
    if (responseType === "blob") return response.blob() as Promise<T>;
    return response.json() as Promise<T>;
  }
}

export const apiClient = new ApiClient();
