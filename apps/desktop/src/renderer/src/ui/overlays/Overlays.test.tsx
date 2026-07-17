import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Popover } from '../primitives';
import { Modal } from './Overlays';

function ModalScenario(): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return <Modal onClose={() => setOpen(false)} open={open} title="Настройки"><p>Содержимое</p></Modal>;
}

function PopoverScenario(): React.JSX.Element {
  return <Popover label="Аудиоустройства" trigger="Устройства"><button type="button">Обновить</button></Popover>;
}

describe('overlay dismissal', () => {
  it('closes a modal by clicking the empty backdrop', () => {
    render(<ModalScenario />);

    fireEvent.mouseDown(document.querySelector('.vui-overlay')!);
    expect(screen.queryByRole('dialog', { name: 'Настройки' })).not.toBeInTheDocument();
  });

  it('closes a settings popover by clicking outside it', async () => {
    render(<PopoverScenario />);
    await userEvent.click(screen.getByRole('button', { name: 'Устройства' }));
    expect(screen.getByRole('dialog', { name: 'Аудиоустройства' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Аудиоустройства' })).not.toBeInTheDocument();
  });
});
