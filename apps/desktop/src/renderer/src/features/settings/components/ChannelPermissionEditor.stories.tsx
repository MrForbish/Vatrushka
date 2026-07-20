import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { ServerDetail } from '@vatrushka/shared';

import { ChannelPermissionEditor } from './ChannelPermissionEditor';

const server: ServerDetail = {
  id: 'server-1', name: 'Космодром', description: null, inviteUrl: 'https://myvatrushka.ru/i/example', ownerUserId: 'user-owner', memberCount: 3, createdAt: '2026-07-01T00:00:00.000Z', permissions: ['MANAGE_ROLES'],
  roles: [
    { id: 'role-owner', serverId: 'server-1', name: 'Владелец', color: '#f0b35b', position: 100, isDefault: true, kind: 'OWNER', permissions: [] },
    { id: 'role-speaker', serverId: 'server-1', name: 'Ведущий', color: '#53a6a6', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'] },
    { id: 'role-everyone', serverId: 'server-1', name: '@everyone', color: '#8f91a8', position: 0, isDefault: true, kind: 'EVERYONE', permissions: ['VIEW_CHANNEL'] },
  ],
  members: [
    { userId: 'user-owner', displayName: 'Илья Форбиш', serverDisplayName: null, privateAlias: null, platformRole: 'owner', joinedAt: '2026-07-01T00:00:00.000Z', roles: [] },
    { userId: 'user-anna', displayName: 'Анна Белова', serverDisplayName: null, privateAlias: null, platformRole: 'member', joinedAt: '2026-07-02T00:00:00.000Z', roles: [] },
  ],
  channels: [
    { id: 'channel-general', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0, permissionOverwrites: [{ channelId: 'channel-general', targetType: 'ROLE', targetId: 'role-speaker', allow: [], deny: ['MENTION_EVERYONE'] }] },
    { id: 'channel-stage', serverId: 'server-1', name: 'Сцена', type: 'voice', position: 1, unreadCount: 0, permissionOverwrites: [] },
  ],
};

const meta = {
  title: 'Features/Settings/Channel Permissions',
  component: ChannelPermissionEditor,
  args: { server, onSave: fn(() => Promise.resolve()) },
  decorators: [(Story) => <div style={{ maxWidth: 1080, padding: 24 }}><Story /></div>],
} satisfies Meta<typeof ChannelPermissionEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoleOverride: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const mentions = canvas.getByRole('group', { name: 'Право Упоминать всех' });
    await expect(within(mentions).getByRole('button', { name: 'Запретить' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(mentions).getByRole('button', { name: 'Разрешить' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить права канала' }));
    await expect(args.onSave).toHaveBeenCalled();
  },
};

export const MemberOverride: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Для кого', expanded: false }));
    await userEvent.click(page.getByRole('option', { name: 'Участник' }));
    await expect(canvas.getByText('Илья Форбиш')).toBeInTheDocument();
  },
};
