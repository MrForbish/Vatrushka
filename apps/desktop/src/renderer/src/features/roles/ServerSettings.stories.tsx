import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import { serverPermissions, type ServerDetail, type ServerPermission } from '@vatrushka/shared';

import { ServerSettings } from './ServerSettings';

const server: ServerDetail = {
  id: 'server-1', name: 'Космодром', inviteCode: 'SPACE123', ownerUserId: 'user-owner', memberCount: 4, createdAt: '2026-07-01T00:00:00.000Z', permissions: [...serverPermissions],
  roles: [
    { id: 'role-owner', serverId: 'server-1', name: 'Владелец', color: '#f0b35b', position: 100, isDefault: true, kind: 'OWNER', permissions: [...serverPermissions] },
    { id: 'role-moderator', serverId: 'server-1', name: 'Модератор', color: '#d77b63', position: 20, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'SPEAK', 'KICK_MEMBERS', 'MANAGE_MESSAGES'] },
    { id: 'role-speaker', serverId: 'server-1', name: 'Ведущий', color: '#53a6a6', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'SPEAK', 'STREAM_SCREEN', 'STREAM_APPLICATION_AUDIO'] },
    { id: 'role-everyone', serverId: 'server-1', name: '@everyone', color: '#8f91a8', position: 0, isDefault: true, kind: 'EVERYONE', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'SPEAK'] },
  ],
  members: [
    { userId: 'user-owner', displayName: 'Илья Форбиш', platformRole: 'owner', joinedAt: '2026-07-01T00:00:00.000Z', roles: [] },
    { userId: 'user-anna', displayName: 'Анна Белова', platformRole: 'member', joinedAt: '2026-07-02T00:00:00.000Z', roles: [{ id: 'role-speaker', serverId: 'server-1', name: 'Ведущий', color: '#53a6a6', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] }] },
    { userId: 'user-max', displayName: 'Максим Орлов', platformRole: 'member', joinedAt: '2026-07-03T00:00:00.000Z', roles: [] },
  ],
  channels: [
    { id: 'channel-general', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0, permissions: [...serverPermissions], permissionOverwrites: [{ channelId: 'channel-general', targetType: 'ROLE', targetId: 'role-speaker', allow: ['SEND_MESSAGES'], deny: ['MENTION_EVERYONE'] }] },
    { id: 'channel-stage', serverId: 'server-1', name: 'Сцена', type: 'voice', position: 1, unreadCount: 0, permissions: [...serverPermissions], permissionOverwrites: [] },
  ],
};

const meta = {
  title: 'Features/Server Settings',
  component: ServerSettings,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    server,
    currentUserId: 'user-owner',
    auditLog: [
      { id: 'audit-1', serverId: 'server-1', actorUserId: 'user-owner', actorDisplayName: 'Илья Форбиш', action: 'ROLE_UPDATED', targetType: 'ROLE', targetId: 'role-moderator', before: { name: 'Помощник' }, after: { name: 'Модератор' }, createdAt: '2026-07-17T09:20:00.000Z' },
      { id: 'audit-2', serverId: 'server-1', actorUserId: 'user-owner', actorDisplayName: 'Илья Форбиш', action: 'CHANNEL_OVERWRITE_UPDATED', targetType: 'CHANNEL_OVERWRITE', targetId: 'channel-general', before: null, after: { allow: ['SEND_MESSAGES'], deny: ['MENTION_EVERYONE'] }, createdAt: '2026-07-17T08:45:00.000Z' },
    ],
    busy: false,
    error: null,
    onClose: fn(), onCreateRole: fn(), onUpdateRole: fn(), onDeleteRole: fn(), onReorderRole: fn(), onAssignRoles: fn(), onSetChannelOverwrite: fn(), onLoadAudit: fn(),
  },
} satisfies Meta<typeof ServerSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoleEditor: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog', { name: 'Настройки сервера' });
    const canvas = within(dialog);
    await userEvent.click(canvas.getByRole('button', { name: /^Ведущий\s+9\s+прав$/u }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /Закреплять сообщения/u }));
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }));
    await expect(args.onUpdateRole).toHaveBeenCalled();
    const [roleId, values] = args.onUpdateRole.mock.calls[0] as [string, { permissions: ServerPermission[] }];
    await expect(roleId).toBe('role-speaker');
    await expect(values.permissions).toContain('PIN_MESSAGES');
  },
};

export const VisualRoles: Story = {};

export const ChannelOverrides: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog', { name: 'Настройки сервера' });
    const canvas = within(dialog);
    await userEvent.click(canvas.getByRole('button', { name: 'Права каналов' }));
    await userEvent.selectOptions(canvas.getByLabelText('Роль'), 'role-speaker');
    const mentions = canvas.getByRole('group', { name: 'Право Упоминать всех' });
    await expect(within(mentions).getByRole('button', { name: 'Запретить' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить права канала' }));
    await expect(args.onSetChannelOverwrite).toHaveBeenCalled();
  },
};

export const AuditLog: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog', { name: 'Настройки сервера' });
    const canvas = within(dialog);
    await userEvent.click(canvas.getByRole('button', { name: 'Журнал аудита' }));
    await expect(args.onLoadAudit).toHaveBeenCalledOnce();
    await expect(canvas.getByText('Изменена роль')).toBeInTheDocument();
  },
};
