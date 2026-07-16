import type { FormEvent, ReactNode } from 'react';

import { Avatar, Badge, Icon, IconButton } from '../primitives';
import './messaging.css';

export interface MessageReactionViewModel {
  emoji: string;
  count: number;
  reactedByCurrentUser?: boolean;
}

export interface MessageViewModel {
  id: string;
  authorId: string;
  authorName: string;
  authorBadge?: 'admin' | 'founder';
  content: string;
  createdAt: string;
  edited?: boolean;
  own?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  replyPreview?: { authorName: string; content: string };
  reactions?: MessageReactionViewModel[];
}

export interface MessageListProps {
  messages: MessageViewModel[];
  channelName: string;
  emptyDescription?: string;
  onDelete?: (messageId: string) => void;
  onEdit?: (message: MessageViewModel) => void;
  onReply?: (message: MessageViewModel) => void;
  onReaction?: (messageId: string, emoji: string) => void;
}

function isGroupedWithPrevious(message: MessageViewModel, previous: MessageViewModel | undefined): boolean {
  if (previous === undefined || previous.authorId !== message.authorId || message.replyPreview !== undefined) return false;
  const distance = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return distance >= 0 && distance <= 5 * 60 * 1_000;
}

export function MessageList({ channelName, emptyDescription = 'Здесь появится первая история вашего сервера.', messages, onDelete, onEdit, onReaction, onReply }: MessageListProps): React.JSX.Element {
  if (messages.length === 0) {
    return <div className="vui-message-empty"><span><Icon name="hash" size={28} /></span><h2>Начало канала #{channelName}</h2><p>{emptyDescription}</p></div>;
  }
  return (
    <div aria-label={`Сообщения канала ${channelName}`} className="vui-message-list" role="feed">
      {messages.map((message, index) => {
        const grouped = isGroupedWithPrevious(message, messages[index - 1]);
        return (
          <article aria-posinset={index + 1} aria-setsize={messages.length} className="vui-message" data-grouped={grouped || undefined} data-privileged={message.authorBadge !== undefined || undefined} key={message.id}>
            {grouped ? <span aria-hidden="true" className="vui-message__avatar-space" /> : <Avatar name={message.authorName} size="md" />}
            <div className="vui-message__content">
              {message.replyPreview === undefined ? null : <div className="vui-message__reply"><Icon name="reply" size={14} /><strong>{message.replyPreview.authorName}</strong><span>{message.replyPreview.content}</span></div>}
              {grouped ? <span className="vui-sr-only">{message.authorName}</span> : <header><strong>{message.authorName}</strong>{message.authorBadge === 'founder' ? <Badge tone="founder">DEV</Badge> : message.authorBadge === 'admin' ? <Badge tone="primary">ADMIN</Badge> : null}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{message.edited === true ? <small>изменено</small> : null}</header>}
              <p>{message.content}</p>
              {message.reactions === undefined || message.reactions.length === 0 ? null : <div aria-label="Реакции" className="vui-message__reactions">{message.reactions.map((reaction) => <button aria-pressed={reaction.reactedByCurrentUser} key={reaction.emoji} onClick={() => onReaction?.(message.id, reaction.emoji)} type="button"><span>{reaction.emoji}</span><strong>{reaction.count}</strong></button>)}</div>}
            </div>
            <div aria-label={`Действия с сообщением ${message.authorName}`} className="vui-message__actions" role="group">
              {onReply === undefined ? null : <IconButton icon="reply" label="Ответить" onClick={() => onReply(message)} size="sm" type="button" />}
              {onReaction === undefined ? null : <IconButton icon="emoji" label="Добавить реакцию 👍" onClick={() => onReaction(message.id, '👍')} size="sm" type="button" />}
              {message.canEdit === true && onEdit !== undefined ? <IconButton icon="edit" label="Редактировать сообщение" onClick={() => onEdit(message)} size="sm" type="button" /> : null}
              {message.canDelete === true && onDelete !== undefined ? <IconButton icon="close" label="Удалить сообщение" onClick={() => onDelete(message.id)} size="sm" type="button" /> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export interface MessageComposerProps {
  value: string;
  channelName: string;
  busy?: boolean;
  canSend?: boolean;
  context?: { mode: 'edit' | 'reply'; label: string };
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancelContext?: () => void;
  leadingActions?: ReactNode;
}

export function MessageComposer({ busy = false, canSend = true, channelName, context, leadingActions, onCancelContext, onChange, onSubmit, value }: MessageComposerProps): React.JSX.Element {
  const submit = (event?: FormEvent): void => {
    event?.preventDefault();
    if (canSend && !busy && value.trim().length > 0) onSubmit();
  };
  return (
    <form className="vui-message-composer" onSubmit={submit}>
      {context === undefined ? null : <div className="vui-message-composer__context"><Icon name={context.mode === 'edit' ? 'edit' : 'reply'} size={16} /><span><strong>{context.mode === 'edit' ? 'Редактирование' : 'Ответ'}</strong>{context.label}</span>{onCancelContext === undefined ? null : <IconButton icon="close" label="Отменить" onClick={onCancelContext} size="sm" type="button" />}</div>}
      <div className="vui-message-composer__body">
        <div className="vui-message-composer__tools">{leadingActions}<IconButton disabled icon="attachment" label="Вложения пока недоступны" size="sm" type="button" /><IconButton disabled icon="emoji" label="Emoji и GIF пока недоступны" size="sm" type="button" /><IconButton disabled icon="mic" label="Голосовые сообщения появятся позже" size="sm" type="button" /></div>
        <textarea aria-label="Сообщение" disabled={!canSend} maxLength={4000} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={canSend ? `Написать в #${channelName}` : 'У вас нет права отправлять сообщения'} rows={1} value={value} />
        <IconButton disabled={!canSend || busy || value.trim().length === 0} icon="send" label={context?.mode === 'edit' ? 'Сохранить сообщение' : 'Отправить сообщение'} size="md" type="submit" />
      </div>
      {canSend ? null : <div className="vui-message-composer__permission"><Icon name="lock" size={14} />Отправка сообщений запрещена вашей ролью</div>}
    </form>
  );
}

export interface UnreadDividerProps {
  label?: string;
}

export function UnreadDivider({ label = 'Новые сообщения' }: UnreadDividerProps): React.JSX.Element {
  return <div className="vui-unread-divider" role="separator"><span>{label}</span></div>;
}

export interface SystemMessageCardProps {
  icon?: 'bell' | 'invite' | 'voice' | 'warning';
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'primary' | 'warning';
}

export function SystemMessageCard({ action, description, icon = 'bell', title, tone = 'neutral' }: SystemMessageCardProps): React.JSX.Element {
  return <article className={`vui-system-message vui-system-message--${tone}`}><span aria-hidden="true"><Icon name={icon} size={20} /></span><div><strong>{title}</strong><p>{description}</p></div>{action}</article>;
}
