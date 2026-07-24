import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import { IconButton, Popover, Tooltip } from './Primitives';
import './stories.css';

const meta = { title: 'Primitives/Tooltip & Popover', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  render: () => (
    <main className="primitive-demo">
      <div className="primitive-demo__row">
        <Tooltip content="Настройки аудиоустройств"><IconButton icon="settings" label="Открыть настройки" /></Tooltip>
        <Popover label="Быстрые настройки" trigger="Выбрать устройство">
          <span className="primitive-demo__popover-copy"><strong>Устройство вывода</strong><span>Динамики (Realtek Audio)</span></span>
        </Popover>
      </div>
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Выбрать устройство' });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(screen.getByRole('dialog', { name: 'Быстрые настройки' })).toBeVisible();
    await userEvent.click(trigger);
    await expect(screen.queryByRole('dialog', { name: 'Быстрые настройки' })).not.toBeInTheDocument();
  },
};
