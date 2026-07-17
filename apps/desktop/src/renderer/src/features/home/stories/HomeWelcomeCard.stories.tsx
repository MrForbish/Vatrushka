import type { Meta, StoryObj } from '@storybook/react-vite';

import { HomeWelcomeCard } from '../components/HomeWelcomeCard';

const user = { id: 'owner', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner' as const, hasPassword: true, twoFactorEnabled: true };

const meta = {
  title: 'Home/HomeWelcomeCard',
  component: HomeWelcomeCard,
  decorators: [(Story) => <div style={{ width: 850 }}><Story /></div>],
  args: { user, audioReady: true, connection: 'healthy' },
} satisfies Meta<typeof HomeWelcomeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const AudioSetupRequired: Story = { args: { audioReady: false } };
export const ConnectionDegraded: Story = { args: { connection: 'degraded' } };
export const Offline: Story = { args: { connection: 'offline' } };
export const LongUsername: Story = { args: { user: { ...user, displayName: 'Очень длинное отображаемое имя пользователя Vatrushka' } } };
export const FounderBadge: Story = {};
