import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { MemberPanel, WorkspaceLibrary } from './Navigation';

const meta = {
  title: 'Navigation/Workspace Library',
  component: WorkspaceLibrary,
  parameters: { layout: 'fullscreen' },
  args: {
    activeWorkspaceId: 'team',
    directUnreadCount: 4,
    onDirectMessages: fn(),
    workspaces: [
      { id: 'team', name: 'Команда Ватрушки', memberCount: 18, statusLabel: '8 в сети', unread: true, mentionCount: 3, activeVoice: true },
      { id: 'friends', name: 'Друзья и игры', memberCount: 42, statusLabel: '12 в сети' },
    ],
    onSelect: fn(),
    onHome: fn(),
    onCreate: fn(),
    onJoin: fn(),
  },
  decorators: [(Story) => <div style={{ width: 220, height: 680 }}><Story /></div>],
} satisfies Meta<typeof WorkspaceLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Друзья и игры/u }));
    await expect(args.onSelect).toHaveBeenCalledWith('friends');
    await userEvent.click(canvas.getByRole('button', { name: /Создать сервер/u }));
    await expect(args.onCreate).toHaveBeenCalledOnce();
  },
};

export const MemberStates: Story = {
  render: () => <div style={{ width: 280, height: 680 }}><MemberPanel members={[{ id: 'founder', name: 'Илья Форбиш', founder: true, status: 'online' }, { id: 'online', name: 'Анна Белова', roleLabel: 'Frontend', status: 'online' }, { id: 'idle', name: 'Максим Орлов', roleLabel: 'Backend', status: 'idle' }, { id: 'dnd', name: 'Ольга Ветрова', roleLabel: 'Дизайнер', status: 'dnd' }, { id: 'offline', name: 'Сергей Котов', status: 'offline' }]} /></div>,
};
