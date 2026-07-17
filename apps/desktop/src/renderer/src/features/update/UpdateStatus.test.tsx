import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpdateStatus } from './UpdateStatus.js';

describe('UpdateStatus', () => {
  it('reports download progress accessibly', () => {
    render(<UpdateStatus state={{ status: 'downloading', currentVersion: '0.4.0', version: '0.5.0', percent: 42 }} onInstall={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '42');
    expect(screen.getByText(/42%/u)).toBeInTheDocument();
  });

  it('installs a downloaded update only after explicit confirmation', () => {
    const onInstall = vi.fn();
    render(<UpdateStatus state={{ status: 'ready', currentVersion: '0.4.0', version: '0.5.0' }} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it.each(['idle', 'checking', 'up-to-date', 'error', 'unsupported'] as const)('stays hidden for %s when no update is available', (status) => {
    const { container } = render(<UpdateStatus state={{ status, currentVersion: '0.4.0' }} onInstall={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('can be dismissed while the update downloads', () => {
    render(<UpdateStatus state={{ status: 'downloading', currentVersion: '0.4.0', version: '0.5.0', percent: 42 }} onInstall={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление об обновлении' }));
    expect(screen.queryByText('Обновление клиента')).not.toBeInTheDocument();
  });
});
