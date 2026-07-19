import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

import { NotificationCenter } from './NotificationCenter';

const meta = {
  title: 'Features/Notifications/Notification Center',
  component: NotificationCenter,
  parameters: { layout: 'fullscreen' },
  args: {
    onDismiss: fn(),
    onInstallUpdate: fn(),
    onMarkAllRead: fn(),
    onOpen: fn(),
    onRead: fn(),
    onRetryUpdate: fn(),
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'mention',
        actorUserId: 'user-1',
        actorDisplayName: 'Анна',
        conversationId: 'conversation-1',
        conversationTitle: 'общий',
        serverId: 'server-1',
        channelId: 'channel-1',
        messageId: '42',
        payload: {
          preview: 'Посмотри, пожалуйста, новый макет главной страницы.',
        },
        createdAt: new Date().toISOString(),
        readAt: null,
        dismissedAt: null,
      },
    ],
  },
} satisfies Meta<typeof NotificationCenter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UpdateReady: Story = {
  args: {
    items: [],
    updateState: { status: 'ready', currentVersion: '0.7.0', version: '0.7.1' },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Уведомления/u }));
  },
};
