import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DirectConversationSummary, DirectMessage } from '@vatrushka/shared';

import { DirectMessagesView } from './DirectMessagesView';

const noop = (): void => undefined;

const conversation: DirectConversationSummary = {
  id: 'conversation-1',
  participant: { userId: 'user-2', displayName: 'Мария', platformRole: 'member' },
  lastMessage: { authorUserId: 'user-2', content: 'Привет!', createdAt: '2026-01-01T10:00:00.000Z' },
  unreadCount: 2,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const message: DirectMessage = {
  id: 'message-1',
  conversationId: conversation.id,
  authorUserId: 'user-2',
  authorDisplayName: 'Мария',
  authorPlatformRole: 'member',
  content: 'Привет!',
  replyTo: null,
  reactions: [],
  attachments: [],
  createdAt: '2026-01-01T10:00:00.000Z',
  editedAt: null,
};

describe('direct messages UI', () => {
  it('shows unread conversations and starts a conversation with a shared member', async () => {
    const onCreateConversation = vi.fn();
    const onMessageReaction = vi.fn();
    render(<DirectMessagesView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Анна', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} servers={[{ id: 'server-1', name: 'Команда', inviteCode: 'ABCD2345', ownerUserId: 'user-1', memberCount: 3, createdAt: '2026-01-01T00:00:00.000Z' }]} conversations={[conversation]} candidates={[{ userId: 'user-3', displayName: 'Максим', platformRole: 'member', sharedServerNames: ['Команда'] }]} activeConversationId={conversation.id} messages={[message]} messageDraft="" serverName="" serverInvite="" busy={false} error={null} onHome={noop} onSwitchServer={noop} onConversation={noop} onCreateConversation={onCreateConversation} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={onMessageReaction} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onServerName={noop} onServerInvite={noop} onCreateServer={noop} onJoinServer={noop} onSecurity={noop} onLogout={noop} />);

    expect(screen.getAllByText('Привет!').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию 👍' }));
    expect(onMessageReaction).toHaveBeenCalledWith('message-1', '👍');
    await userEvent.click(screen.getByRole('button', { name: /Новый/u }));
    await userEvent.selectOptions(screen.getByLabelText('Участник общего сервера'), 'user-3');
    await userEvent.click(screen.getByRole('button', { name: 'Открыть диалог' }));
    expect(onCreateConversation).toHaveBeenCalledWith('user-3');
  });
});
