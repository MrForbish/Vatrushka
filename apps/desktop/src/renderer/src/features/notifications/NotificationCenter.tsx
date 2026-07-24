import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { DesktopUpdateState, InternalNotification } from '@vatrushka/shared';

import { Avatar, Badge, Button, Icon, IconButton } from '../../ui';
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
  updateState?: DesktopUpdateState | undefined;
  updateInstallBlocked?: boolean | undefined;
  onInstallUpdate?(): void;
  onRetryUpdate?(): void;
  onCheckUpdate?(): void;
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
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function NotificationCenter({ hasMore = false, items, loadingMore = false, onCheckUpdate, onDismiss, onInstallUpdate, onLoadMore, onMarkAllRead, onOpen, onRead, onRetryUpdate, updateInstallBlocked = false, updateState }: NotificationCenterProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [seenUpdateKey, setSeenUpdateKey] = useState<string | null>(null);
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<'idle' | 'checking' | 'latest'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const updateVisible = updateState !== undefined && ['available', 'downloading', 'ready', 'error'].includes(updateState.status);
  const updateKey = updateVisible ? `${updateState.status}:${updateState.version ?? ''}:${updateState.message ?? ''}` : null;
  const updateUnread = updateKey !== null && updateKey !== seenUpdateKey;
  const unreadItems = items.filter((item) => item.readAt === null).length;
  const unreadCount = items.filter((item) => item.readAt === null).length + (updateUnread ? 1 : 0);
  const filtered = useMemo(() => items.filter((item) => filter === 'all' || item.type === filter || (filter === 'system' && (item.type === 'system' || item.type === 'moderation' || item.type === 'server_invite'))), [filter, items]);
  useEffect(() => {
    if (open && updateKey !== null) setSeenUpdateKey(updateKey);
  }, [open, updateKey]);
  useEffect(() => {
    if (updateState?.status === 'up-to-date' && updateCheckFeedback === 'checking') {
      setUpdateCheckFeedback('latest');
      const timeout = window.setTimeout(() => setUpdateCheckFeedback('idle'), 2_000);
      return () => window.clearTimeout(timeout);
    }
    if (['available', 'downloading', 'ready', 'error'].includes(updateState?.status ?? '')) setUpdateCheckFeedback('idle');
    return undefined;
  }, [updateCheckFeedback, updateState?.status]);
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    const animationFrame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);
  const showUpdate = updateVisible && (filter === 'all' || filter === 'system');

  const panel = !open
    ? null
    : createPortal(
        <>
          <button aria-label="Закрыть уведомления" className="vui-notification-center__backdrop" onClick={() => setOpen(false)} type="button" />
          <div aria-labelledby="vui-notification-center-title" aria-modal="true" className="vui-notification-center__panel" id="vui-notification-center-panel" ref={panelRef} role="dialog" tabIndex={-1}>
            <header>
              <span className="vui-notification-center__heading">
                <span className="vui-notification-center__heading-icon"><Icon name="bell" size={30} /></span>
                <span>
                  <strong id="vui-notification-center-title">Уведомления</strong>
                  <small>Важные события собраны здесь</small>
                </span>
              </span>
              <IconButton icon="close" label="Закрыть" onClick={() => setOpen(false)} size="sm" type="button" />
            </header>
            <nav aria-label="Фильтр уведомлений">
              {filters.map((item) => (
                <button aria-current={filter === item.value ? 'page' : undefined} key={item.value} onClick={() => setFilter(item.value)} type="button">
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="vui-notification-center__actions">
              {unreadItems > 0 ? <Button className="vui-notification-center__mark-all" onClick={onMarkAllRead} size="sm" type="button" variant="quiet"><Icon name="check" size={19} />Прочитать всё</Button> : null}
              <span>
                {onCheckUpdate ? <Button disabled={updateCheckFeedback === 'checking' || updateState?.status === 'checking' || updateState?.status === 'downloading'} onClick={() => { setUpdateCheckFeedback('checking'); onCheckUpdate(); }} size="sm" type="button" variant="quiet">{updateCheckFeedback === 'latest' ? 'Последняя версия' : updateCheckFeedback === 'checking' ? 'Проверяем…' : 'Проверить обновления'}</Button> : null}
              </span>
            </div>
            <div className="vui-notification-center__list">
              {showUpdate && updateState ? (
                <article className="vui-notification-center__update" data-status={updateState.status}>
                  <span className="vui-notification-center__icon">
                    <Icon name="download" size={18} />
                  </span>
                  <span className="vui-notification-center__copy">
                    <span>
                      <strong>Обновление клиента</strong>
                      {updateUnread ? <Badge tone="primary">Новое</Badge> : null}
                    </span>
                    <p>{updateState.status === 'available' ? `Найдена версия ${updateState.version ?? ''}. Начинаем загрузку.` : updateState.status === 'downloading' ? `Загружаем версию ${updateState.version ?? ''}: ${updateState.percent ?? 0}%` : updateState.status === 'ready' ? `Версия ${updateState.version ?? ''} готова к установке.` : (updateState.message ?? 'Не удалось проверить или загрузить обновление.')}</p>
                    {updateState.status === 'downloading' ? <progress aria-label="Загрузка обновления" max={100} value={updateState.percent ?? 0} /> : null}
                    {updateState.status === 'ready' && onInstallUpdate ? (
                      <Button disabled={updateInstallBlocked} onClick={onInstallUpdate} size="sm" type="button">
                        {updateInstallBlocked ? 'После выхода из голоса' : 'Перезапустить и обновить'}
                      </Button>
                    ) : null}
                    {updateState.status === 'error' && onRetryUpdate ? (
                      <Button onClick={onRetryUpdate} size="sm" type="button" variant="quiet">
                        Повторить проверку
                      </Button>
                    ) : null}
                  </span>
                </article>
              ) : null}
              {filtered.length === 0 && !showUpdate ? (
                <div className="vui-notification-center__empty">
                  <Icon name="bell" size={30} />
                  <strong>Здесь пока тихо</strong>
                  <span>Новые сообщения, упоминания и ответы появятся в этом списке.</span>
                </div>
              ) : (
                filtered.map((item) => {
                  const preview = typeof item.payload.preview === 'string' && item.payload.preview.trim() ? item.payload.preview : titles[item.type];
                  return (
                    <article data-unread={item.readAt === null || undefined} key={item.id}>
                      <button
                        className="vui-notification-center__item"
                        onClick={() => {
                          if (item.readAt === null) onRead(item.id);
                          onOpen(item);
                          setOpen(false);
                        }}
                        type="button"
                      >
                        <span className="vui-notification-center__icon">{item.actorAvatarUrl ? <Avatar name={item.actorDisplayName ?? 'Участник'} size="sm" src={item.actorAvatarUrl} /> : <Icon name={item.type === 'mention' ? 'invite' : item.type === 'reply' ? 'reply' : item.type === 'direct_message' ? 'message' : 'bell'} size={18} />}</span>
                        <span className="vui-notification-center__copy">
                          <span>
                            <strong>{titles[item.type]}</strong>
                            {item.readAt === null ? <Badge tone="primary">Новое</Badge> : null}
                          </span>
                          <small>
                            {item.actorDisplayName ?? item.conversationTitle ?? 'Ватрушка'}
                            {item.conversationTitle ? ` · ${item.conversationTitle}` : ''}
                          </small>
                          <p>{preview.slice(0, 180)}</p>
                          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                        </span>
                      </button>
                      <IconButton className="vui-notification-center__dismiss" icon="close" label="Скрыть уведомление" onClick={() => onDismiss(item.id)} size="sm" type="button" />
                    </article>
                  );
                })
              )}
              {hasMore && onLoadMore ? (
                <Button className="vui-notification-center__more" disabled={loadingMore} onClick={onLoadMore} size="sm" type="button" variant="quiet">
                  {loadingMore ? 'Загружаем…' : 'Показать более ранние'}
                </Button>
              ) : null}
            </div>
          </div>
        </>,
        document.body,
      );

  return (
    <div className="vui-notification-center" data-open={open || undefined} data-settings={window.location.pathname.startsWith('/settings') || undefined}>
      <button aria-expanded={open} aria-controls="vui-notification-center-panel" aria-haspopup="dialog" aria-label={`Уведомления${unreadCount > 0 ? `, непрочитанных: ${unreadCount}` : ''}`} className="vui-notification-center__trigger" onClick={() => setOpen((current) => !current)} ref={triggerRef} type="button">
        <Icon name="bell" size={19} />
        {unreadCount === 0 ? null : <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {panel}
    </div>
  );
}
