import { useCallback, useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

import { Avatar, Badge, Icon, IconButton } from '../primitives';
import './messaging.css';

export interface MessageReactionViewModel {
  emoji: string;
  count: number;
  reactedByCurrentUser?: boolean;
}

export interface MessageAttachmentViewModel {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  canDelete?: boolean;
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
  attachments?: MessageAttachmentViewModel[];
}

export interface MessageListProps {
  messages: MessageViewModel[];
  channelName: string;
  emptyDescription?: string;
  emptyTitle?: string;
  onDelete?: (messageId: string) => void;
  onEdit?: (message: MessageViewModel) => void;
  onReply?: (message: MessageViewModel) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onDownloadAttachment?: (attachmentId: string, fileName: string) => void;
  onDeleteAttachment?: (attachmentId: string) => void;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function isGroupedWithPrevious(message: MessageViewModel, previous: MessageViewModel | undefined): boolean {
  if (previous === undefined || previous.authorId !== message.authorId || message.replyPreview !== undefined) return false;
  const distance = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return distance >= 0 && distance <= 5 * 60 * 1_000;
}

export function MessageList({ channelName, emptyDescription = 'Здесь появится первая история вашего сервера.', emptyTitle, messages, onDelete, onDeleteAttachment, onDownloadAttachment, onEdit, onReaction, onReply }: MessageListProps): React.JSX.Element {
  const scrollElement = useRef<HTMLDivElement>(null);
  const stickToLatest = useRef(true);
  const virtualized = messages.length > 50;
  const getItemKey = useCallback((index: number) => messages[index]?.id ?? index, [messages]);
  const virtualizer = useVirtualizer({
    count: messages.length,
    enabled: virtualized,
    estimateSize: (index) => messages[index]?.attachments?.length ? 148 : messages[index]?.replyPreview ? 108 : 78,
    getItemKey,
    getScrollElement: () => scrollElement.current,
    overscan: 8,
  });

  useEffect(() => {
    stickToLatest.current = true;
  }, [channelName]);

  useEffect(() => {
    if (messages.length === 0 || !stickToLatest.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (virtualized) virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      else if (scrollElement.current) scrollElement.current.scrollTop = scrollElement.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, virtualized, virtualizer]);

  if (messages.length === 0) {
    return <div className="vui-message-empty"><span><Icon name="hash" size={28} /></span><h2>{emptyTitle ?? `Начало канала #${channelName}`}</h2><p>{emptyDescription}</p></div>;
  }
  const renderMessage = (message: MessageViewModel, index: number, virtualItem?: VirtualItem): React.JSX.Element => {
    const grouped = isGroupedWithPrevious(message, messages[index - 1]);
    return (
          <article {...(virtualItem === undefined ? {} : { 'data-index': virtualItem.index, ref: virtualizer.measureElement, style: { transform: `translateY(${virtualItem.start}px)` } })} aria-posinset={index + 1} aria-setsize={messages.length} className="vui-message" data-grouped={grouped || undefined} data-privileged={message.authorBadge !== undefined || undefined} data-virtualized={virtualItem === undefined ? undefined : true} key={message.id}>
            {grouped ? <span aria-hidden="true" className="vui-message__avatar-space" /> : <Avatar name={message.authorName} size="md" />}
            <div className="vui-message__content">
              {message.replyPreview === undefined ? null : <div className="vui-message__reply"><Icon name="reply" size={14} /><strong>{message.replyPreview.authorName}</strong><span>{message.replyPreview.content}</span></div>}
              {grouped ? <span className="vui-sr-only">{message.authorName}</span> : <header><strong>{message.authorName}</strong>{message.authorBadge === 'founder' ? <Badge tone="founder">DEV</Badge> : message.authorBadge === 'admin' ? <Badge tone="primary">ADMIN</Badge> : null}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{message.edited === true ? <small>изменено</small> : null}</header>}
              <p>{message.content}</p>
              {message.attachments === undefined || message.attachments.length === 0 ? null : <div className="vui-message__attachments">{message.attachments.map((attachment) => <div className="vui-message-attachment" key={attachment.id}><span aria-hidden="true"><Icon name="attachment" size={20} /></span><span><strong title={attachment.fileName}>{attachment.fileName}</strong><small>{formatFileSize(attachment.size)} · {attachment.mimeType}</small></span>{onDownloadAttachment === undefined ? null : <IconButton icon="download" label={`Скачать ${attachment.fileName}`} onClick={() => onDownloadAttachment(attachment.id, attachment.fileName)} size="sm" type="button" />}{attachment.canDelete === true && onDeleteAttachment !== undefined ? <IconButton icon="close" label={`Удалить ${attachment.fileName}`} onClick={() => onDeleteAttachment(attachment.id)} size="sm" type="button" /> : null}</div>)}</div>}
              {message.reactions === undefined || message.reactions.length === 0 ? null : <div aria-label="Реакции" className="vui-message__reactions">{message.reactions.map((reaction) => <button aria-pressed={reaction.reactedByCurrentUser} disabled={onReaction === undefined} key={reaction.emoji} onClick={() => onReaction?.(message.id, reaction.emoji)} type="button"><span>{reaction.emoji}</span><strong>{reaction.count}</strong></button>)}</div>}
            </div>
            <div aria-label={`Действия с сообщением ${message.authorName}`} className="vui-message__actions" role="group">
              {onReply === undefined ? null : <IconButton icon="reply" label="Ответить" onClick={() => onReply(message)} size="sm" type="button" />}
              {onReaction === undefined ? null : <IconButton icon="emoji" label="Добавить реакцию 👍" onClick={() => onReaction(message.id, '👍')} size="sm" type="button" />}
              {message.canEdit === true && onEdit !== undefined ? <IconButton icon="edit" label="Редактировать сообщение" onClick={() => onEdit(message)} size="sm" type="button" /> : null}
              {message.canDelete === true && onDelete !== undefined ? <IconButton icon="close" label="Удалить сообщение" onClick={() => onDelete(message.id)} size="sm" type="button" /> : null}
            </div>
          </article>
    );
  };
  const content = virtualized
    ? <div className="vui-message-list__virtual" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualItem) => renderMessage(messages[virtualItem.index]!, virtualItem.index, virtualItem))}</div>
    : messages.map((message, index) => renderMessage(message, index));
  return (
    <div aria-label={`Сообщения канала ${channelName}`} className="vui-message-list" onScroll={(event) => { const element = event.currentTarget; stickToLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }} ref={scrollElement} role="feed">
      {content}
    </div>
  );
}

export interface MessageComposerProps {
  value: string;
  channelName: string;
  attachments?: Array<{ id: string; name: string; size: number; mimeType: string }>;
  busy?: boolean;
  canSend?: boolean;
  context?: { mode: 'edit' | 'reply'; label: string };
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancelContext?: () => void;
  onFilesSelected?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  leadingActions?: ReactNode;
  placeholder?: string;
}

export function MessageComposer({ attachments = [], busy = false, canSend = true, channelName, context, leadingActions, onCancelContext, onChange, onFilesSelected, onRemoveAttachment, onSubmit, placeholder, value }: MessageComposerProps): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  const submit = (event?: FormEvent): void => {
    event?.preventDefault();
    if (canSend && !busy && value.trim().length > 0) onSubmit();
  };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = [...(event.target.files ?? [])];
    if (files.length > 0) onFilesSelected?.(files);
    event.target.value = '';
  };
  return (
    <form className="vui-message-composer" onSubmit={submit}>
      {context === undefined ? null : <div className="vui-message-composer__context"><Icon name={context.mode === 'edit' ? 'edit' : 'reply'} size={16} /><span><strong>{context.mode === 'edit' ? 'Редактирование' : 'Ответ'}</strong>{context.label}</span>{onCancelContext === undefined ? null : <IconButton icon="close" label="Отменить" onClick={onCancelContext} size="sm" type="button" />}</div>}
      {attachments.length === 0 ? null : <div aria-label="Файлы к отправке" className="vui-message-composer__attachments">{attachments.map((attachment) => <div key={attachment.id}><Icon name="attachment" size={16} /><span><strong title={attachment.name}>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></span>{onRemoveAttachment === undefined ? null : <IconButton icon="close" label={`Убрать ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)} size="sm" type="button" />}</div>)}</div>}
      <div className="vui-message-composer__body">
        <div className="vui-message-composer__tools">{leadingActions}<input accept=".gif,.jpg,.jpeg,.pdf,.png,.txt,.webp,.zip,application/pdf,application/zip,image/gif,image/jpeg,image/png,image/webp,text/plain" aria-label="Выбрать вложения" className="vui-sr-only" disabled={!canSend || busy || onFilesSelected === undefined} multiple onChange={selectFiles} ref={fileInput} type="file" /><IconButton disabled={!canSend || busy || onFilesSelected === undefined || attachments.length >= 4} icon="attachment" label={attachments.length >= 4 ? 'Можно прикрепить не больше четырёх файлов' : 'Прикрепить файлы'} onClick={() => fileInput.current?.click()} size="sm" type="button" /><IconButton disabled icon="emoji" label="Emoji и GIF пока недоступны" size="sm" type="button" /><IconButton disabled icon="mic" label="Голосовые сообщения появятся позже" size="sm" type="button" /></div>
        <textarea aria-label="Сообщение" disabled={!canSend} maxLength={4000} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={canSend ? placeholder ?? `Написать в #${channelName}` : 'У вас нет права отправлять сообщения'} rows={1} value={value} />
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
