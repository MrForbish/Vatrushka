import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationCenter } from './NotificationCenter';

it('filters, reads and dismisses notifications', () => {
  const onRead = vi.fn();
  const onDismiss = vi.fn();
  render(
    <NotificationCenter
      items={[
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'mention',
          actorUserId: null,
          conversationId: null,
          messageId: null,
          payload: { preview: 'Привет' },
          createdAt: new Date().toISOString(),
          readAt: null,
          dismissedAt: null,
        },
      ]}
      onDismiss={onDismiss}
      onMarkAllRead={vi.fn()}
      onOpen={vi.fn()}
      onRead={onRead}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByText('Привет'));
  expect(onRead).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
  expect(onDismiss).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
});

it('requests the next page only when older notifications exist', () => {
  const onLoadMore = vi.fn();
  render(<NotificationCenter hasMore items={[]} loadingMore={false} onDismiss={vi.fn()} onLoadMore={onLoadMore} onMarkAllRead={vi.fn()} onOpen={vi.fn()} onRead={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Показать более ранние' }));
  expect(onLoadMore).toHaveBeenCalledOnce();
});

it('keeps one actionable client update inside the notification center', () => {
  const onInstallUpdate = vi.fn();
  render(
    <NotificationCenter
      items={[]}
      onDismiss={vi.fn()}
      onInstallUpdate={onInstallUpdate}
      onMarkAllRead={vi.fn()}
      onOpen={vi.fn()}
      onRead={vi.fn()}
      updateState={{
        status: 'ready',
        currentVersion: '0.7.0',
        version: '0.7.1',
      }}
    />,
  );
  expect(screen.getByRole('button', { name: /непрочитанных: 1/u })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  expect(screen.getByText('Версия 0.7.1 готова к установке.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Перезапустить и обновить' }));
  expect(onInstallUpdate).toHaveBeenCalledOnce();
  expect(screen.queryByText('Установлена актуальная версия')).not.toBeInTheDocument();
});

it('offers a manual update check without manufacturing an unread notification', () => {
  const onCheckUpdate = vi.fn();
  render(<NotificationCenter items={[]} onCheckUpdate={onCheckUpdate} onDismiss={vi.fn()} onMarkAllRead={vi.fn()} onOpen={vi.fn()} onRead={vi.fn()} updateState={{ status: 'up-to-date', currentVersion: '0.8.8' }} />);

  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Проверить обновления' }));

  expect(onCheckUpdate).toHaveBeenCalledOnce();
  expect(screen.queryByText('Обновление клиента')).not.toBeInTheDocument();
});

it('renders its panel in the document portal and restores focus after Escape', () => {
  render(<NotificationCenter items={[]} onDismiss={vi.fn()} onMarkAllRead={vi.fn()} onOpen={vi.fn()} onRead={vi.fn()} />);

  const trigger = screen.getByRole('button', { name: /Уведомления/u });
  fireEvent.click(trigger);
  const panel = screen.getByRole('dialog', { name: 'Уведомления' });

  expect(panel.parentElement).toBe(document.body);
  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('dialog', { name: 'Центр уведомлений' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('closes the portal panel when clicking outside it', () => {
  render(<NotificationCenter items={[]} onDismiss={vi.fn()} onMarkAllRead={vi.fn()} onOpen={vi.fn()} onRead={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомления' }));

  expect(screen.queryByRole('dialog', { name: 'Центр уведомлений' })).not.toBeInTheDocument();
});
