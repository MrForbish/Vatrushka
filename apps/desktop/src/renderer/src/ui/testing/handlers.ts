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
];
