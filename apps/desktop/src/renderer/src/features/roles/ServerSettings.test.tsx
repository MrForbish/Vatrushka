import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { serverPermissions, type ServerDetail } from '@vatrushka/shared';

import { ServerSettings } from './ServerSettings';

const server: ServerDetail = {
  id: 'server-1',
  name: 'Космодром',
  inviteUrl: 'https://myvatrushka.ru/i/SPACE123test',
  ownerUserId: 'user-owner',
  memberCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: [...serverPermissions],
  roles: [
    { id: 'role-owner', serverId: 'server-1', name: 'Владелец', color: '#f0b35b', position: 100, isDefault: true, kind: 'OWNER', permissions: [...serverPermissions] },
    { id: 'role-moderator', serverId: 'server-1', name: 'Модератор', color: '#d77b63', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'MANAGE_OWN_MESSAGES'] },
    { id: 'role-speaker', serverId: 'server-1', name: 'Ведущий', color: '#53a6a6', position: 5, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] },
    { id: 'role-everyone', serverId: 'server-1', name: '@everyone', color: '#8f91a8', position: 0, isDefault: true, kind: 'EVERYONE', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'] },
  ],
  members: [
    { userId: 'user-owner', displayName: 'Илья', serverDisplayName: null, privateAlias: null, platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', roles: [] },
    { userId: 'user-member', displayName: 'Анна', serverDisplayName: null, privateAlias: null, platformRole: 'member', joinedAt: '2026-01-02T00:00:00.000Z', roles: [] },
  ],
  channels: [
    { id: 'channel-general', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0, permissions: [...serverPermissions], permissionOverwrites: [{ channelId: 'channel-general', targetType: 'ROLE', targetId: 'role-moderator', allow: [], deny: ['SEND_MESSAGES'] }] },
  ],
};

function renderSettings(overrides: Partial<ComponentProps<typeof ServerSettings>> = {}) {
  const props: ComponentProps<typeof ServerSettings> = {
    open: true,
    server,
    currentUserId: 'user-owner',
    auditLog: [{ id: 'audit-1', serverId: 'server-1', actorUserId: 'user-owner', actorDisplayName: 'Илья', action: 'ROLE_UPDATED', targetType: 'ROLE', targetId: 'role-moderator', before: { name: 'Помощник' }, after: { name: 'Модератор' }, createdAt: '2026-01-03T12:00:00.000Z' }],
    busy: false,
    error: null,
    onClose: vi.fn(),
    onCreateRole: vi.fn(),
    onUpdateRole: vi.fn(),
    onDeleteRole: vi.fn(),
    onReorderRole: vi.fn(),
    onAssignRoles: vi.fn(),
    onSetChannelOverwrite: vi.fn(),
    onLoadAudit: vi.fn(),
    ...overrides,
  };
  render(<ServerSettings {...props} />);
  return props;
}

describe('server role settings', () => {
  it('requires confirmation for administrator and saves the role', async () => {
    const props = renderSettings();
    const administrator = screen.getByRole('checkbox', { name: /Администратор/u });
    await userEvent.click(administrator);
    expect(screen.getByRole('heading', { name: 'Включить право администратора?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Дать полный доступ' }));
    expect(administrator).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(props.onUpdateRole).toHaveBeenCalledWith('role-moderator', expect.objectContaining({ permissions: expect.arrayContaining(['ADMINISTRATOR']) }));
  });

  it('edits tri-state channel overwrites and loads the audit log', async () => {
    const onSetChannelOverwrite = vi.fn();
    const onLoadAudit = vi.fn();
    renderSettings({ onSetChannelOverwrite, onLoadAudit });

    await userEvent.click(screen.getByRole('button', { name: 'Права каналов' }));
    const sendMessages = screen.getByRole('group', { name: 'Право Отправлять сообщения' });
    expect(within(sendMessages).getByRole('button', { name: 'Запретить' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(sendMessages).getByRole('button', { name: 'Разрешить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить права канала' }));
    expect(onSetChannelOverwrite).toHaveBeenCalledWith('channel-general', 'ROLE', 'role-moderator', expect.arrayContaining(['SEND_MESSAGES']), expect.not.arrayContaining(['SEND_MESSAGES']));

    await userEvent.click(screen.getByRole('button', { name: 'Журнал аудита' }));
    expect(onLoadAudit).toHaveBeenCalledOnce();
    expect(screen.getByText('Изменена роль')).toBeInTheDocument();
    expect(screen.getByText('Помощник → Модератор')).toBeInTheDocument();
  });

  it('reorders custom roles by drag and drop without moving system roles', () => {
    const onReorderRole = vi.fn();
    renderSettings({ onReorderRole });
    const moderator = screen.getByRole('button', { name: /^Модератор5 прав$/u }).closest('.vui-settings-role-row');
    const speaker = screen.getByRole('button', { name: /^Ведущий2 прав$/u }).closest('.vui-settings-role-row');
    const everyone = screen.getByRole('button', { name: /@everyone/u }).closest('.vui-settings-role-row');
    expect(moderator).toHaveAttribute('draggable', 'true');
    expect(everyone).toHaveAttribute('draggable', 'false');

    fireEvent.dragStart(moderator!);
    fireEvent.drop(speaker!);
    expect(onReorderRole).toHaveBeenCalledWith('role-moderator', 5);
    onReorderRole.mockClear();
    fireEvent.dragStart(moderator!);
    fireEvent.drop(everyone!);
    expect(onReorderRole).not.toHaveBeenCalled();
  });
});
