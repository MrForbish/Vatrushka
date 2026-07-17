import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { HomeWidgetSkeleton } from '../components/HomeWidgetSkeleton';
import type { HomeOnboardingStep } from '../model/home.types';

const steps: HomeOnboardingStep[] = [
  { id: 'create_server', title: 'Создайте сервер', description: 'Соберите общение в одном пространстве.', complete: false, destination: null },
  { id: 'configure_channels', title: 'Настройте каналы', description: 'Подготовьте текстовые и голосовые каналы.', complete: false, destination: null },
  { id: 'invite_members', title: 'Пригласите участников', description: 'Отправьте короткую ссылку на сервер.', complete: false, destination: null },
];

const meta = { title: 'Home/OnboardingChecklist', component: OnboardingChecklist, decorators: [(Story) => <div style={{ width: 850 }}><Story /></div>], args: { steps, onCreate: fn(), onOpen: fn() } } satisfies Meta<typeof OnboardingChecklist>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoStepsComplete: Story = { args: { steps: steps.map((step) => ({ ...step, complete: false })) } };
export const Partial: Story = {};
export const Complete: Story = { args: { steps: steps.map((step) => ({ ...step, complete: true })) } };
export const Loading: Story = { render: () => <HomeWidgetSkeleton label="Загрузка onboarding" rows={3} /> };
