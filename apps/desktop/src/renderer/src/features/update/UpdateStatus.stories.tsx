import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { UpdateStatus } from './UpdateStatus';

const meta = {
  title: 'Features/Client Update',
  component: UpdateStatus,
  args: {
    state: { status: 'downloading', currentVersion: '0.4.0', version: '0.5.0', percent: 42 },
    onCheck: fn(),
    onInstall: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <main style={{ minHeight: '100vh', background: '#100b0a' }}><Story /></main>],
} satisfies Meta<typeof UpdateStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Downloading: Story = {};
export const Ready: Story = { args: { state: { status: 'ready', currentVersion: '0.4.0', version: '0.5.0', percent: 100 } } };
export const Error: Story = { args: { state: { status: 'error', currentVersion: '0.4.0', message: 'Не удалось проверить обновления.' } } };
