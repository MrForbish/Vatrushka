import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpdateStatus } from './UpdateStatus.js';

describe('UpdateStatus', () => {
  it('reports download progress accessibly', () => {
    render(<UpdateStatus state={{ status: 'downloading', currentVersion: '0.4.0', version: '0.5.0', percent: 42 }} onCheck={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '42');
    expect(screen.getByText(/42%/u)).toBeInTheDocument();
  });

  it('installs a downloaded update only after explicit confirmation', () => {
    const onInstall = vi.fn();
    render(<UpdateStatus state={{ status: 'ready', currentVersion: '0.4.0', version: '0.5.0' }} onCheck={vi.fn()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('stays hidden where auto-update is unsupported', () => {
    const { container } = render(<UpdateStatus state={{ status: 'unsupported', currentVersion: '0.4.0' }} onCheck={vi.fn()} onInstall={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
