import { useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import { Button, Checkbox, Input, Switch } from '../primitives';
import { ConfirmDialog, Drawer, Modal } from './Overlays';

const meta = {
  title: 'Overlays/Modal, ConfirmDialog & Drawer',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  args: { open: true, title: 'Подтверждение', description: 'Подтвердите действие', onConfirm: fn(), onClose: fn() },
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

function ModalScenario(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <main className="primitive-demo primitive-demo--compact">
      <Button onClick={() => setOpen(true)}>Открыть настройки канала</Button>
      <Modal
        description="Параметры применяются для всех участников канала."
        footer={<><Button onClick={close} variant="quiet">Отмена</Button><Button onClick={close}>Сохранить</Button></>}
        onClose={close}
        open={open}
        title="Настройки голосового канала"
      >
        <div className="vui-story-stack"><Input label="Название канала" value="Общение" readOnly /><Switch checked={true} label="Разрешить демонстрацию экрана" onCheckedChange={() => undefined} /></div>
      </Modal>
    </main>
  );
}

export const FocusManagement: Story = {
  render: () => <ModalScenario />,
  play: async () => {
    const opener = screen.getByRole('button', { name: 'Открыть настройки канала' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Настройки голосового канала' });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('button', { name: 'Закрыть окно' })).toHaveFocus();
    await userEvent.keyboard('[Escape]');
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
  },
};

export const ConfirmDestructive: Story = {
  args: { onConfirm: fn(), onClose: fn() },
  render: (args) => <ConfirmDialog danger description="Канал и вся история сообщений будут удалены без возможности восстановления." onClose={args.onClose} onConfirm={args.onConfirm} open title="Удалить канал «Общение»?" confirmLabel="Удалить канал" />,
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить канал' }));
    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
};

export const MemberDrawer: Story = {
  args: { onClose: fn() },
  render: (args) => (
    <Drawer description="Параметры участника на этом сервере" footer={<Button>Сохранить</Button>} onClose={args.onClose} open title="Илья Форбиш">
      <div className="vui-story-stack"><Checkbox defaultChecked label="Founder · Developer" description="Системный identity badge" /><Checkbox label="Заглушить на сервере" /></div>
    </Drawer>
  ),
};
