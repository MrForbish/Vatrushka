import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ServerDetail } from '@vatrushka/shared';

import { ChannelPermissionEditor } from './ChannelPermissionEditor';

const server: ServerDetail = {
  id: 'server-1',
  name: 'Космодром',
  description: null,
  inviteUrl: 'https://myvatrushka.ru/i/example',
  ownerUserId: 'user-owner',
  memberCount: 2,
  createdAt: '2026-07-01T00:00:00.000Z',
  permissions: ['MANAGE_ROLES'],
  roles: [
    { id: 'role-owner', serverId: 'server-1', name: 'Владелец', color: '#f0b35b', position: 100, isDefault: true, kind: 'OWNER', permissions: [] },
    { id: 'role-speaker', serverId: 'server-1', name: 'Ведущий', color: '#53a6a6', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'] },
  ],
  members: [
    { userId: 'user-owner', displayName: 'Илья', serverDisplayName: null, privateAlias: null, platformRole: 'owner', joinedAt: '2026-07-01T00:00:00.000Z', roles: [] },
    { userId: 'user-anna', displayName: 'Анна', serverDisplayName: null, privateAlias: null, platformRole: 'member', joinedAt: '2026-07-02T00:00:00.000Z', roles: [] },
  ],
  channels: [
    {
      id: 'channel-general', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0,
      permissionOverwrites: [{ channelId: 'channel-general', targetType: 'ROLE', targetId: 'role-speaker', allow: [], deny: ['SEND_MESSAGES'] }],
    },
  ],
};

describe('ChannelPermissionEditor', () => {
  it('loads and persists tri-state channel overrides', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<ChannelPermissionEditor onSave={onSave} server={server} />);

    const sendMessages = screen.getByRole('group', { name: 'Право Отправлять сообщения' });
    expect(within(sendMessages).getByRole('button', { name: 'Запретить' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(sendMessages).getByRole('button', { name: 'Разрешить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить права канала' }));

    expect(onSave).toHaveBeenCalledWith(
      'channel-general',
      'ROLE',
      'role-speaker',
      expect.arrayContaining(['SEND_MESSAGES']),
      expect.not.arrayContaining(['SEND_MESSAGES']),
    );
    expect(await screen.findByText('Права канала сохранены')).toBeInTheDocument();
  });
});
