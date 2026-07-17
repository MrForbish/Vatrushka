import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { serverSettingsNavigation, userSettingsNavigation } from '../../../app/routes';
import { WorkspaceLibrary, type WorkspaceNavigationItem } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import { SettingsPlaceholderPage } from '../pages/SettingsPlaceholderPage';
import { SettingsShell } from './SettingsShell';

const workspaces: WorkspaceNavigationItem[] = [
  { id: 'vatrushka', name: 'Команда Ватрушки', memberCount: 18, activeVoice: true },
  { id: 'friends', name: 'Друзья и игры', memberCount: 42 },
];

interface SettingsStoryProps {
  scope: 'server' | 'user';
  onBack(): void;
  onNavigate(section: string): void;
}

function SettingsStory({ onBack, onNavigate, scope }: SettingsStoryProps): React.JSX.Element {
  const workspace = <WorkspaceLibrary {...(scope === 'server' ? { activeWorkspaceId: 'vatrushka' } : {})} onCreate={() => undefined} onDirectMessages={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />;
  if (scope === 'server') return <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={onBack} onSelect={onNavigate} workspaceLibrary={workspace}><SettingsPlaceholderPage description="Основные параметры сервера" scope="server" title="Обзор" /></SettingsShell>;
  return <SettingsShell activeSection="profile" entityLabel="Личные настройки" entityName="Илья Форбиш" items={userSettingsNavigation} onBack={onBack} onSelect={onNavigate} workspaceLibrary={workspace}><SettingsPlaceholderPage description="Имя, аватар и представление" scope="user" title="Мой профиль" /></SettingsShell>;
}

const meta = {
  title: 'Features/Settings/Settings Shell',
  component: SettingsStory,
  parameters: { layout: 'fullscreen' },
  args: { scope: 'server', onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof SettingsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ServerOverview: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Роли и права/u }));
    await expect(args.onNavigate).toHaveBeenCalledWith('roles');
    await expect(canvas.queryByRole('button', { name: 'Открыть участников' })).not.toBeInTheDocument();
  },
};

export const UserProfile: Story = { args: { scope: 'user' } };

export const Loading: Story = {
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SettingsPageState kind="loading" /></SettingsShell>,
};

export const NetworkError: Story = {
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SettingsPageState kind="error" onAction={() => undefined} /></SettingsShell>,
};

export const PermissionRevoked: Story = {
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation.slice(0, 1)} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SettingsPageState kind="permission" /></SettingsShell>,
};

export const VersionConflict: Story = {
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SettingsPageState kind="conflict" onAction={() => undefined} /></SettingsShell>,
};

export const UnsavedChanges: Story = {
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SettingsPlaceholderPage description="Основные параметры сервера" scope="server" title="Обзор" /><SettingsSaveBar onCancel={() => undefined} onSave={() => undefined} state="dirty" /></SettingsShell>,
};
