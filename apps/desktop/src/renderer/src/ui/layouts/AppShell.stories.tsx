import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { Avatar, Badge, Button, Icon } from '../primitives';
import {
  MemberPanel,
  GlobalSidebar,
  ServerContext,
  ServerTopBar,
  UserProfileDock,
  VoiceProfileConnection,
  type WorkspaceNavigationItem,
  type ChannelNavigationItem,
  type MemberNavigationItem,
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

const channels: ChannelNavigationItem[] = [
  { id: 'general', name: 'общий', type: 'text', unread: true, unreadCount: 7 },
  { id: 'planning', name: 'планирование', type: 'text', mentionCount: 2 },
  { id: 'news', name: 'релизы-и-новости', type: 'text' },
  { id: 'lounge', name: 'Разговорная', type: 'voice', participantCount: 4 },
  { id: 'focus', name: 'Фокус-комната', type: 'voice' },
];

const serverCards: WorkspaceNavigationItem[] = [
  { id: 'vatrushka', name: 'Команда Ватрушки', memberCount: 18, iconUrl: null, bannerUrl: null, accentColor: '#8357f6', activeVoice: true },
  { id: 'friends', name: 'Друзья и игры', memberCount: 42, iconUrl: null, bannerUrl: null, accentColor: '#3ed4df' },
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

function ShellScenario({ onChannel, onDeafenToggle, onLogout, onMicrophoneToggle, onSecurity, onStatus, onWorkspace }: ShellScenarioProps): React.JSX.Element {
  const voiceConnection = <VoiceProfileConnection channelName="Raid" participantCount={3} state="connected" microphoneMuted={false} deafened={false} onMicrophoneToggle={onMicrophoneToggle} onDeafenToggle={onDeafenToggle} onOpen={() => undefined} onLeave={() => undefined} />;
  const profile = <UserProfileDock email="founder@myvatrushka.ru" enableTilt founder name="Founder" onLogout={onLogout} onSecurity={onSecurity} onStatus={onStatus} voiceConnection={voiceConnection} />;
  const globalSidebar = <GlobalSidebar activeSection="server" activeServerId="vatrushka" onDirectMessages={() => undefined} onHome={() => undefined} onServerSelect={onWorkspace} profile={profile} servers={serverCards} />;
  const context = <ServerContext activeChannelId="general" canManageChannels canManageRoles name="Команда Ватрушки" onChannel={onChannel} onCopyInvite={() => undefined} onCreateChannel={() => undefined} onDeleteChannel={() => undefined} onManageRoles={() => undefined} textChannels={channels.filter((channel) => channel.type === 'text')} voiceChannels={channels.filter((channel) => channel.type === 'voice')} />;
  return <AppShell globalSidebar={globalSidebar} members={<MemberPanel members={members} />} serverContext={context} topBar={<ServerTopBar channelName="общий" channelType="text" description="Главное пространство команды" memberCount={18} />}><StoryChannel /></AppShell>;
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
    await userEvent.click(canvas.getByRole('button', { name: 'Выключить звук' }));
    await expect(args.onMicrophoneToggle).toHaveBeenCalledOnce();
    await expect(args.onDeafenToggle).toHaveBeenCalledOnce();
    await expect(canvas.getAllByText('CEO Founder').length).toBeGreaterThan(0);
    const statusButton = canvas.getByRole('button', { name: 'Изменить статус' });
    await userEvent.click(statusButton);
    await expect(screen.getByRole('menu', { name: 'Статус активности' })).toBeVisible();
    await userEvent.keyboard('[Escape]');
    await expect(screen.queryByRole('menu', { name: 'Статус активности' })).not.toBeInTheDocument();
    await expect(statusButton).toHaveFocus();
    const returnToVoice = canvas.getAllByRole('button', { name: 'Вернуться в голосовой канал' })[0]!;
    await userEvent.click(returnToVoice);
    await expect(returnToVoice).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Покинуть голосовой канал' })).toBeEnabled();
  },
};

// Keep visual tests free of the asynchronous interaction sequence above.
// The interaction story remains the behavioural contract for AppShell.
export const VisualFullServer: Story = {};

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
