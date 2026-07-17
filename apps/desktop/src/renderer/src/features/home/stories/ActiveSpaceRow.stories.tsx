import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ActiveSpacesSection } from '../components/ActiveSpacesSection';

const base = { id: 'voice-1', type: 'voice_channel' as const, title: 'Разговорная', subtitle: 'Команда разработки', participants: [{ id: '1', displayName: 'Анна' }, { id: '2', displayName: 'Максим' }, { id: '3', displayName: 'Ольга' }], participantCount: 3, hasVoiceActivity: true, unreadCount: 0, lastActivityAt: '2026-07-17T12:00:00.000Z', destination: { type: 'voice_channel' as const, serverId: 'server-1', channelId: 'voice-1' } };

const meta = {
  title: 'Home/ActiveSpacesSection',
  component: ActiveSpacesSection,
  decorators: [(Story) => <div style={{ width: 650 }}><Story /></div>],
  args: { onOpen: fn(), items: [base] },
} satisfies Meta<typeof ActiveSpacesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VoiceActive: Story = {};
export const TextActivity: Story = { args: { items: [{ ...base, id: 'text', type: 'text_channel', title: 'общий-чат', hasVoiceActivity: false, unreadCount: 7 }] } };
export const Unread: Story = { args: { items: [{ ...base, unreadCount: 12 }] } };
export const ManyParticipants: Story = { args: { items: [{ ...base, participantCount: 9 }] } };
export const Empty: Story = { args: { items: [] } };
