import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { DirectMessagesView } from './DirectMessagesView';

const meta = {
  title: 'Features/Direct Messages',
  component: DirectMessagesView,
  parameters: { layout: 'fullscreen' },
  args: {
    user: { id: 'founder', email: 'founder@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true },
    servers: [{ id: 'team', name: 'Команда Ватрушки', inviteUrl: 'https://myvatrushka.ru/i/ABCD2345test', ownerUserId: 'founder', memberCount: 18, createdAt: '2026-01-01T00:00:00.000Z' }],
    conversations: [{ id: 'dm-1', participant: { userId: 'anna', displayName: 'Анна Белова', platformRole: 'member' }, lastMessage: { authorUserId: 'anna', content: 'Макеты уже готовы', createdAt: '2026-01-01T10:05:00.000Z' }, unreadCount: 3, createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T10:05:00.000Z' }],
    candidates: [{ userId: 'max', displayName: 'Максим Орлов', platformRole: 'member', sharedServerNames: ['Команда Ватрушки'] }],
    activeConversationId: 'dm-1',
    messages: [{ id: 'dm-message-1', conversationId: 'dm-1', authorUserId: 'anna', authorDisplayName: 'Анна Белова', authorPlatformRole: 'member', content: 'Макеты уже готовы', replyTo: null, reactions: [{ emoji: '👍', count: 2, reactedByCurrentUser: false }], attachments: [], createdAt: '2026-01-01T10:05:00.000Z', editedAt: null }],
    messageDraft: '',
    serverName: '',
    busy: false,
    error: null,
    onHome: fn(),
    onSwitchServer: fn(),
    onConversation: fn(),
    onCreateConversation: fn(),
    onMessageDraft: fn(),
    onSendMessage: fn(),
    onUpdateMessage: fn(),
    onMessageReaction: fn(),
    onDeleteMessage: fn(),
    onDeleteAttachment: fn(),
    onDownloadAttachment: fn(),
    onServerName: fn(),
    onCreateServer: fn(),
    onSecurity: fn(),
    onLogout: fn(),
  },
} satisfies Meta<typeof DirectMessagesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveConversation: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Макеты уже готовы').length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Добавить реакцию' }));
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Реакция 👍' }));
    await expect(args.onMessageReaction).toHaveBeenCalledWith('dm-message-1', '👍');
  },
};

export const EmptyInbox: Story = {
  args: { activeConversationId: null, conversations: [], messages: [] },
};
