import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button, IconButton } from './Primitives';
import './stories.css';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    children: 'Подключиться',
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Подключиться' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const States: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="primitive-demo">
      <div className="primitive-demo__group"><h3>Variants</h3><div className="primitive-demo__row"><Button>Основная</Button><Button variant="secondary">Вторичная</Button><Button variant="quiet">Тихая</Button><Button variant="danger">Удалить</Button></div></div>
      <div className="primitive-demo__group"><h3>Sizes & icons</h3><div className="primitive-demo__row"><Button icon="sparkles" size="sm">Маленькая</Button><Button icon="sparkles">Средняя</Button><Button icon="sparkles" size="lg">Большая</Button></div></div>
      <div className="primitive-demo__group"><h3>System states</h3><div className="primitive-demo__row"><Button loading>Загрузка</Button><Button disabled>Недоступно</Button><Button variant="secondary">Очень длинная русская подпись действия</Button></div></div>
      <div className="primitive-demo__group"><h3>Icon buttons</h3><div className="primitive-demo__row"><IconButton icon="settings" label="Настройки" /><IconButton active icon="sparkles" label="Активный инструмент" /><IconButton disabled icon="close" label="Закрыть недоступно" /></div></div>
    </main>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button');
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
