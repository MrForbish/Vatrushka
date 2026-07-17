import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';

import { HomePage } from '../pages/HomePage';

const microphone = { deviceId: 'microphone-studio', groupId: 'input', kind: 'audioinput', label: 'HyperX QuadCast S', toJSON: () => ({}) } as MediaDeviceInfo;
const headset = { deviceId: 'headset-usb', groupId: 'output', kind: 'audiooutput', label: 'Arctis Nova 7', toJSON: () => ({}) } as MediaDeviceInfo;
const user = { id: 'owner', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner' as const, hasPassword: true, twoFactorEnabled: true };
const servers = [
  { id: 'server-1', name: 'Команда разработки', inviteUrl: 'https://myvatrushka.ru/i/development', ownerUserId: 'owner', memberCount: 8, createdAt: '2026-07-17T10:00:00.000Z' },
  { id: 'server-2', name: 'Друзья и игры', inviteUrl: 'https://myvatrushka.ru/i/friends', ownerUserId: 'friend', memberCount: 14, createdAt: '2026-07-16T10:00:00.000Z' },
];

const meta = {
  title: 'Home/HomePage',
  component: HomePage,
  parameters: { layout: 'fullscreen' },
  args: { user, version: '0.4.4', devices: { inputs: [microphone], outputs: [headset] }, microphoneId: microphone.deviceId, outputId: headset.deviceId, busy: false, error: null, servers, serverName: '', directUnreadCount: 3, activeSpaces: [{ id: 'space-1', type: 'voice_channel', title: 'Разговорная', subtitle: 'Команда разработки', participants: [{ id: '1', displayName: 'Анна' }, { id: '2', displayName: 'Максим' }], participantCount: 2, hasVoiceActivity: true, unreadCount: 0, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'voice_channel', serverId: 'server-1', channelId: 'voice-1' } }], recentActivity: [{ id: 'activity-1', type: 'opened_channel', title: 'Открыт # общий-чат', context: 'Команда разработки', occurredAt: '2026-07-17T12:10:00.000Z', destination: { type: 'text_channel', serverId: 'server-1', channelId: 'text-1' } }], onLogout: fn(), onSecurity: fn(), onMicrophone: fn(), onOutput: fn(), onRefreshDevices: fn(), onTestOutput: fn(), onServerName: fn(), onCreateServer: fn(), onOpenServer: fn(), onOpenDestination: fn(), onReturnToCall: fn(), onDirectMessages: fn(), onCopyInvite: fn() },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReturningUser: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(canvas.queryByText(/войти по коду/iu)).not.toBeInTheDocument(); await expect(canvas.getByRole('heading', { name: /добро пожаловать/iu })).toBeInTheDocument(); } };
export const NewUser: Story = { args: { servers: [], activeSpaces: [], recentActivity: [], devices: { inputs: [], outputs: [] }, microphoneId: undefined, outputId: undefined, directUnreadCount: 0 } };
export const ActiveCall: Story = { args: { connection: { roomId: 'voice-1', ownerUserId: 'owner', livekitUrl: 'wss://livekit.example.test', livekitToken: 'token', participantIdentity: 'user_owner_desktop', participantDisplayName: 'Илья Форбиш', isOwner: true, contextType: 'channel', serverId: 'server-1', channelId: 'voice-1', serverName: 'Команда разработки', channelName: 'Разговорная' } } };
export const Offline: Story = { args: { dashboardError: 'Нет подключения к серверу.', error: null } };
export const PartialWidgetError: Story = { args: { error: 'Не удалось обновить недавнюю активность.' } };
export const CompactWidth: Story = { parameters: { viewport: { defaultViewport: 'desktop' } } };
export const ProfileDrawerMode: Story = { parameters: { viewport: { defaultViewport: 'desktop' } } };
