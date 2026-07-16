import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Input, PasswordInput, SearchInput, Select } from './Primitives';
import './stories.css';

const meta = { title: 'Primitives/Form fields', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function FieldCatalog(): React.JSX.Element {
  const [search, setSearch] = useState('голосовой');
  return (
    <main className="primitive-demo">
      <div className="primitive-demo__grid">
        <Input hint="От 3 до 32 символов" label="Название канала" placeholder="Например, Общение" />
        <Input error="Это название уже занято" label="Название сервера" value="Ватрушка" readOnly />
        <Input disabled label="Системный идентификатор" value="server_01JZA" readOnly />
        <PasswordInput defaultValue="secret-password" label="Пароль" />
        <SearchInput defaultValue={search} label="Поиск каналов" onValueChange={setSearch} />
        <Select defaultValue="onest" label="Шрифт интерфейса" options={[{ value: 'onest', label: 'Onest' }, { value: 'system', label: 'Системный' }, { value: 'legacy', label: 'Manrope (legacy)', disabled: true }]} />
      </div>
    </main>
  );
}

export const Catalog: Story = { render: () => <FieldCatalog /> };

export const KeyboardAndValidation: Story = {
  render: () => <main className="primitive-demo primitive-demo--compact"><Input error="Введите адрес в формате name@example.ru" label="Электронная почта" placeholder="name@example.ru" /></main>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Электронная почта' });
    await userEvent.type(input, 'wrong-address');
    await expect(input).toHaveValue('wrong-address');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription('Введите адрес в формате name@example.ru');
  },
};

export const PasswordVisibility: Story = {
  render: () => <main className="primitive-demo primitive-demo--compact"><PasswordInput defaultValue="vatrushka" label="Пароль" /></main>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Пароль');
    await expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(canvas.getByRole('button', { name: 'Показать пароль' }));
    await expect(input).toHaveAttribute('type', 'text');
    await expect(canvas.getByRole('button', { name: 'Скрыть пароль' })).toBeVisible();
  },
};
