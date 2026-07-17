import type { RoomConnection, ServerSummary } from '@vatrushka/shared';

import type { HomeActiveSpaceItem, HomeContinueItem, HomeOnboardingStep, HomeRecentActivityItem } from './home.types';

export function selectActiveSpaces(items: HomeActiveSpaceItem[]): HomeActiveSpaceItem[] {
  return [...items].sort((left, right) => {
    if (left.type !== right.type) return left.type === 'voice_channel' ? -1 : 1;
    if (left.participantCount !== right.participantCount) return right.participantCount - left.participantCount;
    if (left.unreadCount !== right.unreadCount) return right.unreadCount - left.unreadCount;
    return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
  }).slice(0, 4);
}

export function selectRecentActivity(items: HomeRecentActivityItem[]): HomeRecentActivityItem[] {
  return [...items].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 5);
}

export function selectContinueItems(servers: ServerSummary[], connection: RoomConnection | null): HomeContinueItem[] {
  const items: HomeContinueItem[] = [];
  if (connection !== null) {
    items.push({
      id: `call-${connection.channelId}`,
      type: 'active_call',
      title: connection.channelName ?? 'Голосовой канал',
      subtitle: connection.serverName ?? 'Активный звонок',
      participantCount: 1,
      active: true,
      lastActivityAt: new Date().toISOString(),
      destination: { type: 'voice_channel', serverId: connection.serverId, channelId: connection.channelId },
    });
  }

  for (const server of servers) {
    if (items.length >= 2) break;
    if (server.id === connection?.serverId) continue;
    items.push({
      id: `server-${server.id}`,
      type: 'server',
      title: server.name,
      subtitle: 'Ваше пространство',
      participantCount: server.memberCount,
      active: false,
      lastActivityAt: server.createdAt,
      destination: { type: 'server', serverId: server.id },
    });
  }
  return items;
}

export function selectOnboardingSteps(serverCount: number, hasInput: boolean, hasOutput: boolean): HomeOnboardingStep[] {
  return [
    { id: 'create_server', title: 'Создайте свой сервер', description: 'Соберите общение в одном пространстве.', complete: serverCount > 0, destination: null },
    { id: 'configure_channels', title: 'Настройте каналы', description: 'Подготовьте текстовые и голосовые каналы.', complete: serverCount > 0, destination: null },
    { id: 'invite_members', title: 'Пригласите участников', description: hasInput && hasOutput ? 'Отправьте короткую ссылку-приглашение.' : 'После создания сервера проверьте звук и отправьте ссылку.', complete: serverCount > 1, destination: null },
  ];
}
