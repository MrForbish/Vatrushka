import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { IconButton } from '../primitives';
import { SystemToolbar } from './SystemToolbar';

const meta = {
  title: 'Layouts/System Toolbar',
  component: SystemToolbar,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ minHeight: 180, background: 'var(--color-canvas)' }}>
      <SystemToolbar>
        <IconButton icon="bell" label="Открыть уведомления" size="sm" type="button" />
      </SystemToolbar>
    </div>
  ),
} satisfies Meta<typeof SystemToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotificationControl: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Открыть уведомления' });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('[Escape]');
    await expect(button).toBeVisible();
  },
};
