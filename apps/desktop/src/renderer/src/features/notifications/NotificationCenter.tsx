import { useMemo, useState } from 'react';

import type { InternalNotification } from '@vatrushka/shared';

import { Badge, Button, Icon, IconButton } from '../../ui';
import './notification-center.css';

type NotificationFilter = 'all' | 'direct_message' | 'mention' | 'reply' | 'system';

export interface NotificationCenterProps {
  items: InternalNotification[];
  onDismiss(id: string): void;
  onMarkAllRead(): void;
  onOpen(item: InternalNotification): void;
  onRead(id: string): void;
  hasMore?: boolean | undefined;
  loadingMore?: boolean | undefined;
  onLoadMore?(): void;
}

const filters: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'direct_message', label: 'ЛС' },
  { value: 'mention', label: 'Упоминания' },
  { value: 'reply', label: 'Ответы' },
  { value: 'system', label: 'Системные' },
];

const titles: Record<InternalNotification['type'], string> = {
  message: 'Новое сообщение',
  direct_message: 'Личное сообщение',
  mention: 'Вас упомянули',
  reply: 'Новый ответ',
  server_invite: 'Приглашение на сервер',
  moderation: 'Событие модерации',
  system: 'Системное уведомление',
};

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return 'только что';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(value));
}

export function NotificationCenter({ hasMore = false, items, loadingMore = false, onDismiss, onLoadMore, onMarkAllRead, onOpen, onRead }: NotificationCenterProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const unreadCount = items.filter((item) => item.readAt === null).length;
  const filtered = useMemo(() => items.filter((item) => filter === 'all' || item.type === filter || filter === 'system' && (item.type === 'system' || item.type === 'moderation' || item.type === 'server_invite')), [filter, items]);

  return (
    <div className="vui-notification-center" data-open={open || undefined}>
      <button aria-expanded={open} aria-label={`Уведомления${unreadCount > 0 ? `, непрочитанных: ${unreadCount}` : ''}`} className="vui-notification-center__trigger" onClick={() => setOpen((current) => !current)} type="button">
        <Icon name="bell" size={19} />
        {unreadCount === 0 ? null : <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open ? <button aria-label="Закрыть уведомления" className="vui-notification-center__backdrop" onClick={() => setOpen(false)} type="button" /> : null}
      <aside aria-label="Центр уведомлений" className="vui-notification-center__panel">
        <header>
          <span><strong>Уведомления</strong><small>Важные события собраны здесь</small></span>
          <IconButton icon="close" label="Закрыть" onClick={() => setOpen(false)} size="sm" type="button" />
        </header>
        <nav aria-label="Фильтр уведомлений">{filters.map((item) => <button aria-current={filter === item.value ? 'page' : undefined} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</nav>
        <div className="vui-notification-center__actions"><span>{unreadCount === 0 ? 'Всё прочитано' : `${unreadCount} непрочитано`}</span><Button disabled={unreadCount === 0} onClick={onMarkAllRead} size="sm" type="button" variant="quiet">Прочитать всё</Button></div>
        <div className="vui-notification-center__list">
          {filtered.length === 0 ? <div className="vui-notification-center__empty"><Icon name="bell" size={30} /><strong>Здесь пока тихо</strong><span>Новые сообщения, упоминания и ответы появятся в этом списке.</span></div> : filtered.map((item) => {
            const preview = typeof item.payload.preview === 'string' && item.payload.preview.trim() ? item.payload.preview : titles[item.type];
            return <article data-unread={item.readAt === null || undefined} key={item.id}>
              <button className="vui-notification-center__item" onClick={() => { if (item.readAt === null) onRead(item.id); onOpen(item); setOpen(false); }} type="button">
                <span className="vui-notification-center__icon"><Icon name={item.type === 'mention' ? 'invite' : item.type === 'reply' ? 'reply' : item.type === 'direct_message' ? 'message' : 'bell'} size={18} /></span>
                <span className="vui-notification-center__copy"><span><strong>{titles[item.type]}</strong>{item.readAt === null ? <Badge tone="primary">Новое</Badge> : null}</span><small>{item.actorDisplayName ?? item.conversationTitle ?? 'Ватрушка'}{item.conversationTitle ? ` · ${item.conversationTitle}` : ''}</small><p>{preview.slice(0, 180)}</p><time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time></span>
              </button>
              <IconButton className="vui-notification-center__dismiss" icon="close" label="Скрыть уведомление" onClick={() => onDismiss(item.id)} size="sm" type="button" />
            </article>;
          })}
          {hasMore && onLoadMore ? <Button className="vui-notification-center__more" disabled={loadingMore} onClick={onLoadMore} size="sm" type="button" variant="quiet">{loadingMore ? 'Загружаем…' : 'Показать более ранние'}</Button> : null}
        </div>
      </aside>
    </div>
  );
}
