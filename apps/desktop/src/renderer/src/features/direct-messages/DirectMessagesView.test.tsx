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
    render(<DirectMessagesView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Анна', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} servers={[{ id: 'server-1', name: 'Команда', inviteUrl: 'https://myvatrushka.ru/i/ABCD2345test', ownerUserId: 'user-1', memberCount: 3, createdAt: '2026-01-01T00:00:00.000Z' }]} conversations={[conversation]} candidates={[{ userId: 'user-3', displayName: 'Максим', platformRole: 'member', sharedServerNames: ['Команда'] }]} activeConversationId={conversation.id} messages={[message]} messageDraft="" serverName="" busy={false} error={null} onHome={noop} onSwitchServer={noop} onConversation={noop} onCreateConversation={onCreateConversation} onBlockParticipant={noop} onUnblockParticipant={noop} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={onMessageReaction} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);

    expect(screen.getAllByText('Привет!').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Реакция 👍' }));
    expect(onMessageReaction).toHaveBeenCalledWith('message-1', '👍');
    await userEvent.click(screen.getByRole('button', { name: /Новый/u }));
    await userEvent.click(screen.getByLabelText('Участник общего сервера'));
    await userEvent.click(screen.getByRole('option', { name: 'Максим · Команда' }));
    await userEvent.click(screen.getByRole('button', { name: 'Открыть диалог' }));
    expect(onCreateConversation).toHaveBeenCalledWith('user-3');
  });

  it('filters the real conversation list without changing the active dialog', async () => {
    const secondConversation: DirectConversationSummary = {
      ...conversation,
      id: 'conversation-2',
      participant: {
        userId: 'user-4',
        displayName: 'Максим',
        platformRole: 'member',
      },
      lastMessage: {
        authorUserId: 'user-4',
        content: 'Созвон после обеда',
        createdAt: '2026-01-01T10:10:00.000Z',
      },
    };
    render(<DirectMessagesView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Анна', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} servers={[]} conversations={[conversation, secondConversation]} candidates={[]} activeConversationId={conversation.id} messages={[message]} messageDraft="" serverName="" busy={false} error={null} onHome={noop} onSwitchServer={noop} onConversation={noop} onCreateConversation={noop} onBlockParticipant={noop} onUnblockParticipant={noop} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск личных диалогов' }), 'максим');

    expect(screen.getByRole('button', { name: /Максим/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Мария/u })).not.toBeInTheDocument();
    expect(screen.getByText('Привет!')).toBeInTheDocument();
  });

  it('confirms blocking and disables the composer for a blocked participant', async () => {
    const onBlockParticipant = vi.fn();
    const { rerender } = render(<DirectMessagesView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Анна', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} servers={[]} conversations={[conversation]} candidates={[]} activeConversationId={conversation.id} messages={[message]} messageDraft="" serverName="" busy={false} error={null} onHome={noop} onSwitchServer={noop} onConversation={noop} onCreateConversation={noop} onBlockParticipant={onBlockParticipant} onUnblockParticipant={noop} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Заблокировать' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Заблокировать' })[1]!);
    expect(onBlockParticipant).toHaveBeenCalledWith('user-2');

    rerender(<DirectMessagesView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Анна', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} servers={[]} conversations={[conversation]} candidates={[]} activeConversationId={conversation.id} messages={[message]} messageDraft="" serverName="" busy={false} error={null} blockedParticipantIds={['user-2']} onHome={noop} onSwitchServer={noop} onConversation={noop} onCreateConversation={noop} onBlockParticipant={noop} onUnblockParticipant={noop} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);
    expect(screen.getByText('Новые сообщения недоступны, пока вы его не разблокируете.')).toBeInTheDocument();
    expect(document.querySelector('.vui-message-composer textarea')).toBeNull();
  });
});
