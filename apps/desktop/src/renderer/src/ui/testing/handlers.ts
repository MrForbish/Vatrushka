import { delay, http, HttpResponse } from 'msw';

export const defaultHandlers = [
  http.get('*/health', async () => {
    await delay(80);
    return HttpResponse.json({ ok: true, service: 'vatrushka-storybook' });
  }),
  http.get('*/api/v1/servers/vatrushka/settings/overview', () => HttpResponse.json({
    id: 'vatrushka', name: 'Команда Ватрушки', description: 'Разработка и уютные созвоны', language: 'ru', timezone: 'Europe/Moscow',
    systemChannelId: 'general', welcomeChannelId: 'general', defaultNotificationLevel: 'mentions', defaultVoiceInactivitySeconds: 600,
    ownerUserId: 'owner', ownerDisplayName: 'Илья Форбиш', version: 3, updatedAt: '2026-07-18T10:00:00.000Z',
  })),
  http.get('*/api/v1/servers/vatrushka/settings/appearance', () => HttpResponse.json({
    iconUrl: null, bannerUrl: null, accentColor: '#6f4ce6', version: 3,
  })),
  http.get('*/api/v1/servers/vatrushka/settings/members', () => HttpResponse.json([
    { userId: 'owner', displayName: 'Илья Форбиш', username: 'mrforbish', serverDisplayName: 'Максим', privateAlias: null, platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null, mutedUntil: null, deafened: false, roleIds: ['owner-role'] },
    { userId: 'member-1', displayName: 'Анна Петрова', username: 'anna', serverDisplayName: null, privateAlias: 'Аня', platformRole: 'member', joinedAt: '2026-03-12T00:00:00.000Z', lastActiveAt: null, mutedUntil: null, deafened: false, roleIds: ['moderator-role'] },
  ])),
  http.get('*/api/v1/servers/vatrushka/settings/channels', () => HttpResponse.json({
    categories: [{ id: 'cat-1', name: 'Общее', position: 0 }],
    channels: [
      { id: 'general', name: 'общий', type: 'text', position: 0, categoryId: 'cat-1', slowModeSeconds: 0, maxParticipants: null, bitrate: null, version: 2, archivedAt: null },
      { id: 'voice', name: 'Голосовой', type: 'voice', position: 1, categoryId: 'cat-1', slowModeSeconds: 0, maxParticipants: 12, bitrate: 128000, version: 3, archivedAt: null },
    ],
  })),
  http.get('*/api/v1/servers/vatrushka/settings/invites', () => HttpResponse.json([
    { id: 'invite-1', createdByUserId: 'owner', createdByDisplayName: 'Илья Форбиш', destinationChannelId: 'general', tokenPreview: 'myvatrushka.ru/i/va…8n', expiresAt: '2026-07-30T10:00:00.000Z', maxUses: 10, useCount: 4, revokedAt: null, createdAt: '2026-07-18T10:00:00.000Z' },
    { id: 'invite-2', createdByUserId: 'owner', createdByDisplayName: 'Илья Форбиш', destinationChannelId: null, tokenPreview: 'myvatrushka.ru/i/kh…2p', expiresAt: null, maxUses: null, useCount: 13, revokedAt: null, createdAt: '2026-07-15T10:00:00.000Z' },
  ])),
  http.get('*/api/v1/servers/vatrushka/settings/moderation', () => HttpResponse.json({
    verificationLevel: 'email_verified', newMemberRestrictionMinutes: 10, messageRateLimitPerMinute: 60, mentionLimitPerMessage: 10, rules: 'Уважайте участников и не публикуйте личные данные.', version: 2,
  })),
  http.get('*/api/v1/servers/vatrushka/settings/bans', () => HttpResponse.json([
    { userId: 'banned-1', displayName: 'Спам-бот', actorUserId: 'owner', actorDisplayName: 'Илья Форбиш', reason: 'Спам в личных сообщениях', createdAt: '2026-07-16T10:00:00.000Z' },
  ])),
  http.get('*/api/v1/servers/vatrushka/settings/audit-log', () => HttpResponse.json({
    entries: [
      { id: 'audit-1', serverId: 'vatrushka', actorUserId: 'owner', actorDisplayName: 'Илья Форбиш', action: 'SERVER_OVERVIEW_UPDATED', targetType: 'SERVER', targetId: 'vatrushka', before: null, after: null, createdAt: '2026-07-18T11:00:00.000Z' },
      { id: 'audit-2', serverId: 'vatrushka', actorUserId: 'owner', actorDisplayName: 'Илья Форбиш', action: 'INVITE_CREATED', targetType: 'INVITE', targetId: 'invite-1', before: null, after: null, createdAt: '2026-07-17T18:00:00.000Z' },
    ],
    nextCursor: null,
  })),
];
