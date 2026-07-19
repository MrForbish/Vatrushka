import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';

import { codePointLength, type ConversationMentionDraft, type MessageDeliveryState } from '@vatrushka/shared';

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
  authorAvatarUrl?: string | null;
  authorBadge?: 'admin' | 'founder';
  content: string;
  mentions?: Array<{
    key: string;
    userId?: string | undefined;
    roleId?: string | undefined;
    displayName: string;
    start: number;
    length: number;
  }>;
  createdAt: string;
  edited?: boolean;
  own?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  replyPreview?: { authorName: string; content: string };
  reactions?: MessageReactionViewModel[];
  attachments?: MessageAttachmentViewModel[];
  deliveryState?: MessageDeliveryState;
  deleted?: boolean;
}

const deliveryLabels: Record<MessageDeliveryState, string> = {
  sending: 'Отправляем…',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не удалось отправить',
};

const emojiShortcodes: Record<string, string> = {
  angry: '😡',
  clap: '👏',
  coffee: '☕',
  cry: '😢',
  fire: '🔥',
  heart: '❤️',
  joy: '😂',
  laugh: '🤣',
  ok_hand: '👌',
  party: '🥳',
  pray: '🙏',
  rocket: '🚀',
  sad: '😢',
  smile: '😊',
  sob: '😭',
  sparkles: '✨',
  star: '⭐',
  tada: '🎉',
  thinking: '🤔',
  thumbsdown: '👎',
  thumbsup: '👍',
  wave: '👋',
  wink: '😉',
};

function renderPlainContent(content: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  const tokenPattern = /(https?:\/\/[^\s<>]+|:[a-z0-9_+-]+:)/giu;
  let cursor = 0;
  for (const match of content.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) result.push(content.slice(cursor, start));
    const token = match[0];
    const shortcode = /^:([a-z0-9_+-]+):$/iu.exec(token);
    if (shortcode) {
      result.push(emojiShortcodes[shortcode[1]!.toLowerCase()] ?? token);
    } else {
      const trailing = /[),.!?;:]+$/u.exec(token)?.[0] ?? '';
      const href = trailing ? token.slice(0, -trailing.length) : token;
      result.push(
        <a
          href={href}
          key={`${keyPrefix}:url:${start}`}
          onClick={(event) => {
            event.preventDefault();
            void window.desktop.openExternal(href);
          }}
          rel="noreferrer"
        >
          {href}
        </a>,
      );
      if (trailing) result.push(trailing);
    }
    cursor = start + token.length;
  }
  if (cursor < content.length) result.push(content.slice(cursor));
  return result;
}

function renderMessageContent(content: string, mentions: MessageViewModel['mentions'], onMention?: (mention: NonNullable<MessageViewModel['mentions']>[number]) => void): ReactNode {
  if (mentions === undefined || mentions.length === 0) return renderPlainContent(content, 'plain');
  const codePoints = [...content];
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((left, right) => left.start - right.start)) {
    if (mention.start < cursor || mention.start + mention.length > codePoints.length) continue;
    if (mention.start > cursor) result.push(...renderPlainContent(codePoints.slice(cursor, mention.start).join(''), `segment:${cursor}`));
    const label = `@${mention.displayName}`;
    result.push(
      onMention === undefined ? (
        <span className="vui-message__mention" {...(mention.userId ? { 'data-user-id': mention.userId } : {})} key={`${mention.key}:${mention.start}`}>
          {label}
        </span>
      ) : (
        <button className="vui-message__mention" {...(mention.userId ? { 'data-user-id': mention.userId } : {})} key={`${mention.key}:${mention.start}`} onClick={() => onMention(mention)} type="button">
          {label}
        </button>
      ),
    );
    cursor = mention.start + mention.length;
  }
  if (cursor < codePoints.length) result.push(...renderPlainContent(codePoints.slice(cursor).join(''), `segment:${cursor}`));
  return result.length === 0 ? renderPlainContent(content, 'fallback') : result;
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
  onLoadAttachment?: ((attachmentId: string) => Promise<Blob>) | undefined;
  hasOlder?: boolean | undefined;
  loadingOlder?: boolean | undefined;
  onLoadOlder?: (() => void) | undefined;
  onRetry?: ((messageId: string) => void) | undefined;
  onMention?: ((mention: NonNullable<MessageViewModel['mentions']>[number]) => void) | undefined;
  firstUnreadMessageId?: string | null | undefined;
  targetMessageId?: string | null | undefined;
}

const reactionChoices = ['👍', '👎', '❤️', '🔥', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '🥳', '😮', '😱', '🤯', '😢', '😭', '😡', '🤬', '🤔', '🫡', '🤝', '🙏', '👏', '🙌', '💪', '👀', '✅', '❌', '💯', '🎉', '🚀', '✨', '💡', '⚡', '⭐', '🎯', '🏆', '🐱', '🐶', '🍰', '🧇', '☕', '🍕', '🎮', '💻', '🛠️'];

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

export function MessageList({ channelName, emptyDescription = 'Здесь появится первая история вашего сервера.', emptyTitle, firstUnreadMessageId = null, hasOlder = false, loadingOlder = false, messages, onDelete, onDeleteAttachment, onDownloadAttachment, onEdit, onLoadAttachment, onLoadOlder, onMention, onReaction, onReply, onRetry, targetMessageId = null }: MessageListProps): React.JSX.Element {
  const scrollElement = useRef<HTMLDivElement>(null);
  const stickToLatest = useRef(true);
  const previousLatestId = useRef<string | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);
  const prependSnapshot = useRef<{ height: number; top: number } | null>(null);
  const virtualized = messages.length > 50;
  const getItemKey = useCallback((index: number) => messages[index]?.id ?? index, [messages]);
  const virtualizer = useVirtualizer({
    count: messages.length,
    enabled: virtualized,
    estimateSize: (index) => (messages[index]?.attachments?.length ? 148 : messages[index]?.replyPreview ? 108 : 78),
    getItemKey,
    getScrollElement: () => scrollElement.current,
    overscan: 8,
  });

  useEffect(() => {
    stickToLatest.current = true;
    previousLatestId.current = null;
    setUnseenCount(0);
  }, [channelName]);

  useEffect(() => {
    const latestId = messages.at(-1)?.id ?? null;
    if (previousLatestId.current !== null && latestId !== previousLatestId.current && !stickToLatest.current) setUnseenCount((current) => current + 1);
    previousLatestId.current = latestId;
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 || !stickToLatest.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (virtualized) virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      else if (scrollElement.current) scrollElement.current.scrollTop = scrollElement.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, virtualized, virtualizer]);

  useLayoutEffect(() => {
    const snapshot = prependSnapshot.current;
    const element = scrollElement.current;
    if (snapshot === null || element === null || loadingOlder) return;
    element.scrollTop = snapshot.top + element.scrollHeight - snapshot.height;
    prependSnapshot.current = null;
  }, [loadingOlder, messages.length]);

  useEffect(() => {
    if (targetMessageId === null) return;
    const index = messages.findIndex((message) => message.id === targetMessageId);
    if (index < 0) return;
    if (virtualized) virtualizer.scrollToIndex(index, { align: 'center' });
    const frame = window.requestAnimationFrame(() => {
      const element = scrollElement.current?.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`);
      element?.scrollIntoView({ block: 'center' });
      element?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, targetMessageId, virtualized, virtualizer]);

  if (messages.length === 0) {
    return (
      <div className="vui-message-empty">
        <span>
          <Icon name="hash" size={28} />
        </span>
        <h2>{emptyTitle ?? `Начало канала #${channelName}`}</h2>
        <p>{emptyDescription}</p>
      </div>
    );
  }
  const renderMessage = (message: MessageViewModel, index: number, virtualItem?: VirtualItem): React.JSX.Element => {
    const grouped = isGroupedWithPrevious(message, messages[index - 1]);
    return (
      <article
        {...(virtualItem === undefined
          ? {}
          : {
              'data-index': virtualItem.index,
              ref: virtualizer.measureElement,
              style: { transform: `translateY(${virtualItem.start}px)` },
            })}
        aria-posinset={index + 1}
        aria-setsize={messages.length}
        className="vui-message"
        data-author-badge={message.authorBadge}
        data-grouped={grouped || undefined}
        data-message-id={message.id}
        data-targeted={message.id === targetMessageId || undefined}
        data-virtualized={virtualItem === undefined ? undefined : true}
        key={message.id}
        tabIndex={message.id === targetMessageId ? -1 : undefined}
      >
        {message.id === firstUnreadMessageId ? <UnreadDivider /> : null}
        {grouped ? <span aria-hidden="true" className="vui-message__avatar-space" /> : <Avatar name={message.authorName} size="md" {...(message.authorAvatarUrl ? { src: message.authorAvatarUrl } : {})} />}
        <div className="vui-message__content">
          {message.replyPreview === undefined ? null : (
            <div className="vui-message__reply">
              <Icon name="reply" size={14} />
              <strong>{message.replyPreview.authorName}</strong>
              <span>{message.replyPreview.content}</span>
            </div>
          )}
          {grouped ? (
            <span className="vui-sr-only">{message.authorName}</span>
          ) : (
            <header>
              <strong>{message.authorName}</strong>
              {message.authorBadge === 'founder' ? <Badge tone="founder">CEO Founder</Badge> : message.authorBadge === 'admin' ? <Badge tone="primary">ADMIN</Badge> : null}
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {message.edited === true ? <small>изменено</small> : null}
            </header>
          )}
          {message.deleted === true ? <p className="vui-message__tombstone">Сообщение удалено</p> : message.content.trim().length === 0 ? null : <p>{renderMessageContent(message.content, message.mentions, onMention)}</p>}
          {message.deleted === true || message.attachments === undefined || message.attachments.length === 0 ? null : (
            <div className="vui-message__attachments">
              {message.attachments.map((attachment) => (
                <MessageAttachmentCard attachment={attachment} key={attachment.id} onDelete={onDeleteAttachment} onDownload={onDownloadAttachment} onLoad={onLoadAttachment} />
              ))}
            </div>
          )}
          {message.reactions === undefined || message.reactions.length === 0 ? null : (
            <div aria-label="Реакции" className="vui-message__reactions">
              {message.reactions.map((reaction) => (
                <button aria-pressed={reaction.reactedByCurrentUser} disabled={onReaction === undefined} key={reaction.emoji} onClick={() => onReaction?.(message.id, reaction.emoji)} type="button">
                  <span>{reaction.emoji}</span>
                  <strong>{reaction.count}</strong>
                </button>
              ))}
            </div>
          )}
          {message.deliveryState === undefined ? null : (
            <div className="vui-message__delivery" data-state={message.deliveryState}>
              <span>{deliveryLabels[message.deliveryState]}</span>
              {message.deliveryState !== 'failed' || onRetry === undefined ? null : (
                <button onClick={() => onRetry(message.id)} type="button">
                  Повторить
                </button>
              )}
            </div>
          )}
        </div>
        {message.deleted === true ? null : (
          <div aria-label={`Действия с сообщением ${message.authorName}`} className="vui-message__actions" role="group">
            {onReply === undefined ? null : <IconButton icon="reply" label="Ответить" onClick={() => onReply(message)} size="sm" type="button" />}
            {onReaction === undefined ? null : <ReactionPicker messageId={message.id} onReaction={onReaction} />}
            {message.canEdit === true && onEdit !== undefined ? <IconButton icon="edit" label="Редактировать сообщение" onClick={() => onEdit(message)} size="sm" type="button" /> : null}
            {message.canDelete === true && onDelete !== undefined ? <IconButton icon="close" label="Удалить сообщение" onClick={() => onDelete(message.id)} size="sm" type="button" /> : null}
          </div>
        )}
      </article>
    );
  };
  const content = virtualized ? (
    <div className="vui-message-list__virtual" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => renderMessage(messages[virtualItem.index]!, virtualItem.index, virtualItem))}
    </div>
  ) : (
    messages.map((message, index) => renderMessage(message, index))
  );
  return (
    <div
      aria-label={`Сообщения канала ${channelName}`}
      className="vui-message-list"
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        if (stickToLatest.current) setUnseenCount(0);
      }}
      ref={scrollElement}
      role="feed"
    >
      {firstUnreadMessageId && messages.some((message) => message.id === firstUnreadMessageId) ? (
        <button className="vui-message-list__jump-unread" onClick={() => scrollElement.current?.querySelector<HTMLElement>(`[data-message-id="${firstUnreadMessageId}"]`)?.scrollIntoView({ block: 'center' })} type="button">
          К новым сообщениям
        </button>
      ) : null}
      {unseenCount > 0 ? (
        <button
          className="vui-message-list__jump-latest"
          onClick={() => {
            const element = scrollElement.current;
            if (element)
              element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth',
              });
            stickToLatest.current = true;
            setUnseenCount(0);
          }}
          type="button"
        >
          Новые сообщения: {unseenCount}
        </button>
      ) : null}
      {hasOlder && onLoadOlder !== undefined ? (
        <button
          className="vui-message-list__older"
          disabled={loadingOlder}
          onClick={() => {
            const element = scrollElement.current;
            if (element)
              prependSnapshot.current = {
                height: element.scrollHeight,
                top: element.scrollTop,
              };
            onLoadOlder();
          }}
          type="button"
        >
          {loadingOlder ? 'Загружаем историю…' : 'Показать более ранние сообщения'}
        </button>
      ) : null}
      {content}
    </div>
  );
}

function ReactionPicker({ messageId, onReaction }: { messageId: string; onReaction(messageId: string, emoji: string): void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const toggle = (): void => {
    if (!open && root.current) {
      const rect = root.current.getBoundingClientRect();
      const menuWidth = 320;
      const menuHeight = 300;
      const left = Math.max(16, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16));
      const top = window.innerHeight - rect.bottom >= menuHeight + 8 ? rect.bottom + 8 : Math.max(16, rect.top - menuHeight - 8);
      setPosition({ left, top });
    }
    setOpen((value) => !value);
  };
  return (
    <div className="vui-reaction-picker" ref={root}>
      <IconButton active={open} icon="emoji" label="Добавить реакцию" onClick={toggle} size="sm" type="button" />
      {open
        ? createPortal(
            <div aria-label="Выберите реакцию" className="vui-reaction-picker__menu" ref={menu} role="menu" style={{ left: position.left, top: position.top }}>
              {reactionChoices.map((emoji) => (
                <button
                  aria-label={`Реакция ${emoji}`}
                  key={emoji}
                  onClick={() => {
                    onReaction(messageId, emoji);
                    setOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MessageAttachmentCard({ attachment, onDelete, onDownload, onLoad }: { attachment: MessageAttachmentViewModel; onDelete?: ((attachmentId: string) => void) | undefined; onDownload?: ((attachmentId: string, fileName: string) => void) | undefined; onLoad?: ((attachmentId: string) => Promise<Blob>) | undefined }): React.JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const image = attachment.mimeType.startsWith('image/');
  useEffect(() => {
    if (!image || onLoad === undefined || attachment.id.startsWith('optimistic_')) return;
    let active = true;
    let objectUrl: string | null = null;
    void onLoad(attachment.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, image, onLoad]);
  useEffect(() => {
    if (!lightbox) return undefined;
    const close = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLightbox(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [lightbox]);
  return (
    <>
      <div className="vui-message-attachment" data-image={imageUrl !== null ? true : undefined}>
        {imageUrl === null ? (
          <span aria-hidden="true">
            <Icon name="attachment" size={20} />
          </span>
        ) : (
          <button aria-label={`Открыть ${attachment.fileName}`} className="vui-message-attachment__preview" onClick={() => setLightbox(true)} type="button">
            <img alt={attachment.fileName} src={imageUrl} />
          </button>
        )}
        <span>
          <strong title={attachment.fileName}>{attachment.fileName}</strong>
          <small>
            {formatFileSize(attachment.size)} · {attachment.mimeType}
          </small>
        </span>
        {onDownload === undefined ? null : <IconButton icon="download" label={`Скачать ${attachment.fileName}`} onClick={() => onDownload(attachment.id, attachment.fileName)} size="sm" type="button" />}
        {attachment.canDelete === true && onDelete !== undefined ? <IconButton icon="close" label={`Удалить ${attachment.fileName}`} onClick={() => onDelete(attachment.id)} size="sm" type="button" /> : null}
      </div>
      {lightbox && imageUrl
        ? createPortal(
            <div
              aria-label={`Просмотр ${attachment.fileName}`}
              aria-modal="true"
              className="vui-image-lightbox"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setLightbox(false);
              }}
              role="dialog"
            >
              <img alt={attachment.fileName} src={imageUrl} />
              <IconButton icon="close" label="Закрыть изображение" onClick={() => setLightbox(false)} type="button" />
              {onDownload ? <IconButton icon="download" label={`Скачать ${attachment.fileName}`} onClick={() => onDownload(attachment.id, attachment.fileName)} type="button" /> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export interface MessageComposerProps {
  value: string;
  channelName: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
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
  mentions?: ConversationMentionDraft[];
  mentionCandidates?: MentionCandidate[];
  onMentionsChange?: (mentions: ConversationMentionDraft[]) => void;
}

export type MentionCandidate = { type: 'user'; userId: string; displayName: string; detail?: string } | { type: 'role'; roleId: string; displayName: string; detail?: string } | { type: 'everyone'; displayName: string; detail?: string };

function mentionKey(mention: MentionCandidate | ConversationMentionDraft): string {
  return mention.type === 'user' ? `user:${mention.userId ?? ''}` : mention.type === 'role' ? `role:${mention.roleId ?? ''}` : 'everyone';
}

function mentionTrigger(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(?:^|\s)@([^\s@]{0,64})$/u.exec(before);
  if (!match) return null;
  return {
    start: before.length - (match[1]?.length ?? 0) - 1,
    query: match[1] ?? '',
  };
}

function reconcileMentions(previous: string, next: string, mentions: ConversationMentionDraft[]): ConversationMentionDraft[] {
  const left = [...previous];
  const right = [...next];
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  const oldEnd = left.length - suffix;
  const delta = right.length - left.length;
  return mentions.flatMap((mention) => {
    const end = mention.start + mention.length;
    if (end <= prefix) return [mention];
    if (mention.start >= oldEnd) return [{ ...mention, start: mention.start + delta }];
    return [];
  });
}

export function MessageComposer({ attachments = [], busy = false, canSend = true, channelName, context, leadingActions, mentionCandidates = [], mentions = [], onCancelContext, onChange, onFilesSelected, onMentionsChange, onRemoveAttachment, onSubmit, placeholder, value }: MessageComposerProps): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [activeCandidate, setActiveCandidate] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRoot = useRef<HTMLDivElement>(null);
  const hasPayload = value.trim().length > 0 || (context?.mode !== 'edit' && attachments.length > 0);
  const uniqueMentioned = new Set(mentions.map(mentionKey));
  const candidates = trigger === null ? [] : mentionCandidates.filter((candidate) => (uniqueMentioned.size < 10 || uniqueMentioned.has(mentionKey(candidate))) && candidate.displayName.toLocaleLowerCase('ru-RU').includes(trigger.query.toLocaleLowerCase('ru-RU'))).slice(0, 8);
  useEffect(() => {
    setActiveCandidate(0);
  }, [trigger?.query]);
  useEffect(() => {
    if (!emojiOpen) return undefined;
    const close = (event: PointerEvent): void => {
      if (!emojiRoot.current?.contains(event.target as Node)) setEmojiOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEmojiOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [emojiOpen]);
  const submit = (event?: FormEvent): void => {
    event?.preventDefault();
    if (canSend && !busy && hasPayload) onSubmit();
  };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = [...(event.target.files ?? [])];
    if (files.length > 0) onFilesSelected?.(files);
    event.target.value = '';
  };
  const insertEmoji = (emoji: string): void => {
    const start = textarea.current?.selectionStart ?? value.length;
    const end = textarea.current?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    updateValue(next, start + emoji.length);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const updateValue = (next: string, caret: number): void => {
    const nextMentions = reconcileMentions(value, next, mentions);
    onChange(next);
    onMentionsChange?.(nextMentions);
    setTrigger(mentionTrigger(next, caret));
  };
  const selectMention = (candidate: MentionCandidate): void => {
    if (trigger === null) return;
    const caret = textarea.current?.selectionStart ?? value.length;
    const before = value.slice(0, trigger.start);
    const after = value.slice(caret);
    const separator = after.length === 0 || /^\s/u.test(after) ? '' : ' ';
    const label = `@${candidate.displayName}`;
    const next = `${before}${label}${separator}${after}`;
    const nextMentions = reconcileMentions(value, next, mentions);
    nextMentions.push({
      type: candidate.type,
      ...(candidate.type === 'user' ? { userId: candidate.userId } : candidate.type === 'role' ? { roleId: candidate.roleId } : {}),
      displayName: candidate.displayName,
      start: codePointLength(before),
      length: codePointLength(label),
    });
    nextMentions.sort((left, right) => left.start - right.start);
    onChange(next);
    onMentionsChange?.(nextMentions);
    setTrigger(null);
    const nextCaret = before.length + label.length + separator.length;
    window.requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (candidates.length > 0 && trigger !== null) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveCandidate((current) => (current + (event.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectMention(candidates[activeCandidate] ?? candidates[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setTrigger(null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form className="vui-message-composer" onSubmit={submit}>
      {context === undefined ? null : (
        <div className="vui-message-composer__context">
          <Icon name={context.mode === 'edit' ? 'edit' : 'reply'} size={16} />
          <span>
            <strong>{context.mode === 'edit' ? 'Редактирование' : 'Ответ'}</strong>
            {context.label}
          </span>
          {onCancelContext === undefined ? null : <IconButton icon="close" label="Отменить" onClick={onCancelContext} size="sm" type="button" />}
        </div>
      )}
      {attachments.length === 0 ? null : (
        <div aria-label="Файлы к отправке" className="vui-message-composer__attachments">
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              <Icon name="attachment" size={16} />
              <span>
                <strong title={attachment.name}>{attachment.name}</strong>
                <small>{formatFileSize(attachment.size)}</small>
              </span>
              {onRemoveAttachment === undefined ? null : <IconButton icon="close" label={`Убрать ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)} size="sm" type="button" />}
            </div>
          ))}
        </div>
      )}
      <div className="vui-message-composer__body">
        <div className="vui-message-composer__tools">
          {leadingActions}
          <input accept=".gif,.jpg,.jpeg,.pdf,.png,.txt,.webp,.zip,application/pdf,application/zip,image/gif,image/jpeg,image/png,image/webp,text/plain" aria-label="Выбрать вложения" className="vui-sr-only" disabled={!canSend || busy || onFilesSelected === undefined} multiple onChange={selectFiles} ref={fileInput} type="file" />
          <IconButton disabled={!canSend || busy || onFilesSelected === undefined || attachments.length >= 4} icon="attachment" label={attachments.length >= 4 ? 'Можно прикрепить не больше четырёх файлов' : 'Прикрепить файлы'} onClick={() => fileInput.current?.click()} size="sm" type="button" />
          <div className="vui-message-composer__emoji" ref={emojiRoot}>
            <IconButton active={emojiOpen} disabled={!canSend || busy} icon="emoji" label="Выбрать emoji" onClick={() => setEmojiOpen((current) => !current)} size="sm" type="button" />
            {emojiOpen ? (
              <div aria-label="Emoji" className="vui-message-composer__emoji-menu" role="menu">
                {reactionChoices.map((emoji) => (
                  <button aria-label={`Вставить ${emoji}`} key={emoji} onClick={() => insertEmoji(emoji)} role="menuitem" type="button">
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="vui-message-composer__editor">
          {candidates.length === 0 ? null : (
            <div aria-label="Упомянуть участника или роль" className="vui-message-composer__mentions" role="listbox">
              {candidates.map((candidate, index) => (
                <button aria-selected={index === activeCandidate} key={mentionKey(candidate)} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(candidate)} role="option" type="button">
                  <Avatar name={candidate.displayName} size="sm" />
                  <span>
                    <strong>{candidate.displayName}</strong>
                    <small>{candidate.detail ?? (candidate.type === 'user' ? '@участник' : candidate.type === 'role' ? '@роль' : 'Все участники')}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <textarea
            aria-label="Сообщение"
            disabled={!canSend}
            maxLength={4000}
            onChange={(event) => updateValue(event.target.value, event.target.selectionStart)}
            onClick={(event) => setTrigger(mentionTrigger(value, event.currentTarget.selectionStart))}
            onKeyDown={onComposerKeyDown}
            onPaste={(event) => {
              const images = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, 4 - attachments.length));
              if (images.length > 0 && onFilesSelected) {
                event.preventDefault();
                onFilesSelected(images);
              }
            }}
            placeholder={canSend ? (placeholder ?? `Написать в #${channelName}`) : 'У вас нет права отправлять сообщения'}
            ref={textarea}
            rows={1}
            value={value}
          />
        </div>
        <IconButton disabled={!canSend || busy || !hasPayload} icon="send" label={context?.mode === 'edit' ? 'Сохранить сообщение' : 'Отправить сообщение'} size="md" type="submit" />
      </div>
      {canSend ? null : (
        <div className="vui-message-composer__permission">
          <Icon name="lock" size={14} />
          Отправка сообщений запрещена вашей ролью
        </div>
      )}
    </form>
  );
}

export interface UnreadDividerProps {
  label?: string;
}

export function UnreadDivider({ label = 'Новые сообщения' }: UnreadDividerProps): React.JSX.Element {
  return (
    <div className="vui-unread-divider" role="separator">
      <span>{label}</span>
    </div>
  );
}

export interface SystemMessageCardProps {
  icon?: 'bell' | 'invite' | 'voice' | 'warning';
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'neutral' | 'primary' | 'warning';
}

export function SystemMessageCard({ action, description, icon = 'bell', title, tone = 'neutral' }: SystemMessageCardProps): React.JSX.Element {
  return (
    <article className={`vui-system-message vui-system-message--${tone}`}>
      <span aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action}
    </article>
  );
}
