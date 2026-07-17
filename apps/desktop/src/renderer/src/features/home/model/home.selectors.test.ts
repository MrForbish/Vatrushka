import { describe, expect, it } from 'vitest';
import type { HomeActiveSpaceItem, RoomConnection, ServerSummary } from '@vatrushka/shared';

import { selectActiveSpaces, selectContinueItems, selectOnboardingSteps, selectRecentActivity } from './home.selectors';

const servers: ServerSummary[] = [
  { id: 'server-1', name: 'Команда', inviteUrl: 'https://example.test/i/team', ownerUserId: 'owner', memberCount: 8, createdAt: '2026-07-17T00:00:00.000Z' },
  { id: 'server-2', name: 'Друзья', inviteUrl: 'https://example.test/i/friends', ownerUserId: 'friend', memberCount: 4, createdAt: '2026-07-16T00:00:00.000Z' },
  { id: 'server-3', name: 'Учёба', inviteUrl: 'https://example.test/i/study', ownerUserId: 'teacher', memberCount: 12, createdAt: '2026-07-15T00:00:00.000Z' },
];

describe('home selectors', () => {
  it('prioritizes the active call and limits Continue to two items', () => {
    const connection: RoomConnection = { roomId: 'voice', ownerUserId: 'owner', livekitUrl: 'wss://livekit.test', livekitToken: 'token', participantIdentity: 'user_owner_desktop', participantDisplayName: 'Owner', isOwner: true, contextType: 'channel', serverId: 'server-2', channelId: 'voice-1', serverName: 'Друзья', channelName: 'Разговорная' };
    const result = selectContinueItems(servers, connection);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'active_call', title: 'Разговорная', destination: { serverId: 'server-2', channelId: 'voice-1' } });
    expect(result[1]).toMatchObject({ type: 'server', destination: { serverId: 'server-1' } });
  });

  it('derives onboarding completion without mentioning manual codes', () => {
    const steps = selectOnboardingSteps(0, false, true);
    expect(steps.find((step) => step.id === 'create_server')?.complete).toBe(false);
    expect(JSON.stringify(steps)).not.toMatch(/по коду/iu);
  });

  it('prioritizes voice activity and limits active spaces to four', () => {
    const destination = { type: 'text_channel' as const, serverId: 'server-1', channelId: 'text-1' };
    const spaces: HomeActiveSpaceItem[] = Array.from({ length: 5 }, (_, index) => ({ id: `text-${index}`, type: 'text_channel' as const, title: 'общий', subtitle: 'Команда', participants: [], participantCount: 0, hasVoiceActivity: false, unreadCount: index, lastActivityAt: `2026-07-1${index + 1}T00:00:00.000Z`, destination }));
    spaces.push({ ...spaces[0]!, id: 'voice', type: 'voice_channel', participantCount: 3, hasVoiceActivity: true, destination: { type: 'voice_channel', serverId: 'server-1', channelId: 'voice-1' } });
    const result = selectActiveSpaces(spaces);
    expect(result).toHaveLength(4);
    expect(result[0]?.id).toBe('voice');
  });

  it('sorts recent activity newest first and limits it to five', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ id: `${index}`, type: 'opened_channel' as const, title: 'Канал', context: 'Сервер', occurredAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`, destination: null }));
    const result = selectRecentActivity(items);
    expect(result).toHaveLength(5);
    expect(result[0]?.id).toBe('6');
  });
});
