import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopSourceInfo } from '@vatrushka/shared';

import { SourcePicker } from './SourcePicker';

const sources: DesktopSourceInfo[] = [
  { id: 'screen:1:0', name: 'Экран 1', thumbnailDataUrl: 'data:image/png;base64,', type: 'screen', displayName: 'Основной монитор', width: 2560, height: 1440, audioAvailable: true },
  { id: 'window:2:0', name: 'Figma — Vatrushka', thumbnailDataUrl: 'data:image/png;base64,', appIconDataUrl: 'data:image/png;base64,', type: 'window', audioAvailable: true },
];

describe('screen share source picker', () => {
  it('separates screens and application windows and confirms the selected source', async () => {
    const onAudio = vi.fn();
    const onSelect = vi.fn();
    render(<SourcePicker sources={sources} includeAudio platform="win32" onAudio={onAudio} onSelect={onSelect} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Экран 1, 2560 × 1440' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/2560 × 1440 · со звуком · защита от дублирования включена/u)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Окно приложения$/u }));
    expect(screen.queryByRole('button', { name: 'Экран 1, 2560 × 1440' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Figma — Vatrushka, Только выбранное окно' }));
    await userEvent.click(screen.getByRole('radio', { name: /Без звука/u }));
    expect(onAudio).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Начать демонстрацию' }));
    expect(onSelect).toHaveBeenCalledWith(sources[1]);
  });

  it('explains when system audio is unavailable', () => {
    render(<SourcePicker sources={[{ ...sources[0]!, audioAvailable: false }]} includeAudio={false} platform="linux" onAudio={vi.fn()} onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /Передавать звук приложения/u })).toBeDisabled();
    expect(screen.getByText('Системный звук доступен только в приложении для Windows.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Без звука/u })).toBeChecked();
  });
});
