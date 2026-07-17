import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ContinueSection } from '../components/ContinueSection';
import { HomeWidgetSkeleton } from '../components/HomeWidgetSkeleton';

const meta = {
  title: 'Home/ContinueSection',
  component: ContinueSection,
  decorators: [(Story) => <div style={{ width: 850 }}><Story /></div>],
  args: { onOpen: fn(), items: [] },
} satisfies Meta<typeof ContinueSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextDestination: Story = { args: { items: [{ id: 'text', type: 'text_channel', title: 'Команда разработки', subtitle: '# общий-чат', participantCount: 8, active: false, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'text_channel', serverId: 'server-1', channelId: 'text-1' } }] } };
export const VoiceDestination: Story = { args: { items: [{ id: 'voice', type: 'voice_channel', title: 'Разговорная', subtitle: 'Space Community', participantCount: 3, active: false, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'voice_channel', serverId: 'server-2', channelId: 'voice-1' } }] } };
export const ActiveCall: Story = { args: { items: [{ id: 'call', type: 'active_call', title: 'Голосовой чат 1', subtitle: 'Команда разработки', participantCount: 4, active: true, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'voice_channel', serverId: 'server-1', channelId: 'voice-2' } }] } };
export const NoParticipants: Story = { args: { items: [{ id: 'empty', type: 'server', title: 'Друзья', subtitle: 'Игровой сервер', participantCount: 0, active: false, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'server', serverId: 'server-2' } }] } };
export const Loading: Story = { render: () => <HomeWidgetSkeleton label="Загрузка блока Продолжить" /> };
