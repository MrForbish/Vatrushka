import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationCenter } from './NotificationCenter';

it('filters, reads and dismisses notifications', () => {
  const onRead = vi.fn();
  const onDismiss = vi.fn();
  render(<NotificationCenter items={[{ id: '11111111-1111-4111-8111-111111111111', type: 'mention', actorUserId: null, conversationId: null, messageId: null, payload: { preview: 'Привет' }, createdAt: new Date().toISOString(), readAt: null, dismissedAt: null }]} onDismiss={onDismiss} onMarkAllRead={vi.fn()} onOpen={vi.fn()} onRead={onRead} />);
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByText('Привет'));
  expect(onRead).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  fireEvent.click(screen.getByRole('button', { name: /Уведомления/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
  expect(onDismiss).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
});
