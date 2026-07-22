import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { Avatar, Badge, Button, Icon } from '../primitives';
import {
  MemberPanel,
  ServerContext,
  ServerTopBar,
  UserProfileDock,
  WorkspaceLibrary,
  type ChannelNavigationItem,
  type MemberNavigationItem,
  type WorkspaceNavigationItem,
} from '../navigation';
import { AppShell } from './AppShell';
import './app-shell.stories.css';

interface ShellScenarioProps {
  onChannel: (id: string) => void;
  onWorkspace: (id: string) => void;
  onCreate: () => void;
  onDeafenToggle: () => void;
  onSecurity: () => void;
  onLogout: () => void;
  onMicrophoneToggle: () => void;
  onStatus: () => void;
}

const workspaces: WorkspaceNavigationItem[] = [
  { id: 'vatrushka', name: 'Команда Ватрушки', memberCount: 18, statusLabel: '8 в сети', unread: true, mentionCount: 3, activeVoice: true },
  { id: 'friends', name: 'Друзья и игры', memberCount: 42, statusLabel: '12 в сети', unread: true },
  { id: 'study', name: 'TypeScript Lab', memberCount: 9, statusLabel: '3 в сети' },
];

const channels: ChannelNavigationItem[] = [
  { id: 'general', name: 'общий', type: 'text', unread: true, unreadCount: 7 },
  { id: 'planning', name: 'планирование', type: 'text', mentionCount: 2 },
  { id: 'news', name: 'релизы-и-новости', type: 'text' },
  { id: 'lounge', name: 'Разговорная', type: 'voice', participantCount: 4 },
  { id: 'focus', name: 'Фокус-комната', type: 'voice' },
];

const members: MemberNavigationItem[] = [
  { id: 'founder', name: 'Илья Форбиш', founder: true, status: 'online' },
  { id: 'anna', name: 'Анна Белова', roleLabel: 'Frontend', status: 'online' },
  { id: 'max', name: 'Максим Орлов', roleLabel: 'Backend', status: 'idle' },
  { id: 'olga', name: 'Ольга Ветрова', roleLabel: 'Дизайнер', status: 'dnd' },
  { id: 'sergey', name: 'Сергей Котов', status: 'offline' },
];

function StoryChannel(): React.JSX.Element {
  return (
    <div className="vui-shell-story-stage">
      <div className="vui-shell-story-empty"><span><Icon name="hash" size={28} /></span><Badge tone="primary">Текстовый канал</Badge><h1>Начало канала #общий</h1><p>Обсуждайте проект, делитесь файлами и собирайте решения в одном месте.</p></div>
      <div className="vui-shell-story-message"><Avatar name="Илья Форбиш" status="online" /><span><strong>Илья Форбиш <Badge tone="founder">CEO Founder</Badge></strong><p>Встречаемся здесь после релиза App Shell.</p></span></div>
      <div className="vui-shell-story-composer"><span>Написать в #общий</span><Button icon="send" size="sm">Отправить</Button></div>
    </div>
  );
}

function ShellScenario({ onChannel, onCreate, onDeafenToggle, onLogout, onMicrophoneToggle, onSecurity, onStatus, onWorkspace }: ShellScenarioProps): React.JSX.Element {
  const library = <WorkspaceLibrary activeWorkspaceId="vatrushka" onCreate={onCreate} onHome={() => undefined} onSelect={onWorkspace} workspaces={workspaces} />;
  const profile = <UserProfileDock audioControls={{ connected: true, microphoneMuted: false, deafened: false, onMicrophoneToggle, onDeafenToggle }} email="founder@myvatrushka.ru" founder name="Илья Форбиш" onLogout={onLogout} onSecurity={onSecurity} onStatus={onStatus} />;
  const context = <ServerContext activeChannelId="general" canManageChannels canManageRoles name="Команда Ватрушки" onChannel={onChannel} onCopyInvite={() => undefined} onCreateChannel={() => undefined} onDeleteChannel={() => undefined} onManageRoles={() => undefined} profile={profile} textChannels={channels.filter((channel) => channel.type === 'text')} voiceChannels={channels.filter((channel) => channel.type === 'voice')} />;
  return <AppShell members={<MemberPanel members={members} />} serverContext={context} topBar={<ServerTopBar channelName="общий" channelType="text" description="Главное пространство команды" memberCount={18} />} workspaceLibrary={library}><StoryChannel /></AppShell>;
}

const meta = {
  title: 'Layouts/App Shell',
  component: ShellScenario,
  parameters: { layout: 'fullscreen' },
  args: {
    onChannel: fn(),
    onWorkspace: fn(),
    onCreate: fn(),
    onDeafenToggle: fn(),
    onSecurity: fn(),
    onLogout: fn(),
    onMicrophoneToggle: fn(),
    onStatus: fn(),
  },
} satisfies Meta<typeof ShellScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullServer: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /планирование/u }));
    await expect(args.onChannel).toHaveBeenCalledWith('planning');
    await userEvent.click(canvas.getByRole('button', { name: 'Выключить микрофон' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Отключить входящий звук и микрофон' }));
    await expect(args.onMicrophoneToggle).toHaveBeenCalledOnce();
    await expect(args.onDeafenToggle).toHaveBeenCalledOnce();
    await expect(canvas.getAllByText('CEO Founder').length).toBeGreaterThan(0);
    const statusButton = canvas.getByRole('button', { name: 'Изменить статус' });
    await userEvent.click(statusButton);
    await expect(screen.getByRole('menu', { name: 'Статус активности' })).toBeVisible();
    await userEvent.keyboard('[Escape]');
    await expect(screen.queryByRole('menu', { name: 'Статус активности' })).not.toBeInTheDocument();
    await expect(statusButton).toHaveFocus();
  },
};

export const ResponsiveMemberDrawer: Story = {
  play: async () => {
    const trigger = screen.getByRole('button', { name: 'Открыть участников' });
    await userEvent.click(trigger);
    const drawer = await screen.findByRole('dialog', { name: 'Участники сервера' });
    await waitFor(() => expect(drawer).toBeVisible());
    await expect(within(drawer).getByText('Илья Форбиш')).toBeInTheDocument();
    await userEvent.keyboard('[Escape]');
    await expect(screen.queryByRole('dialog', { name: 'Участники сервера' })).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};
