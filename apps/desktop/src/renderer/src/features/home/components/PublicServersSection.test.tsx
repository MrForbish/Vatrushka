import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PublicServersSection } from './PublicServersSection';

const official = {
  id: 'server-1',
  name: 'Ватрушка Official',
  description: 'Официальное сообщество',
  iconUrl: null,
  bannerUrl: null,
  accentColor: '#24c8db',
  memberCount: 42,
  featured: true,
  joined: false,
};

describe('PublicServersSection', () => {
  it('searches and joins a public server', async () => {
    const onJoin = vi.fn();
    const onSearch = vi.fn();
    render(<PublicServersSection busyServerId={null} error={null} loading={false} onJoin={onJoin} onOpen={vi.fn()} onRetry={vi.fn()} onSearch={onSearch} search="" servers={[official]} />);

    await userEvent.type(screen.getByLabelText('Поиск публичных серверов'), 'official');
    expect(onSearch).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Присоединиться' }));
    expect(onJoin).toHaveBeenCalledWith(official);
    expect(screen.getByText('Официальный сервер Ватрушки')).toBeInTheDocument();
  });
});
