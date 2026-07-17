import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { PublicUser, SecurityEvent, ServerDetail } from '@vatrushka/shared';

import { serverSettingsNavigation, userSettingsNavigation } from '../../../app/routes';
import type { AudioDevices } from '../../../audio-devices';
import { SecurityCenter, type SecurityClient } from '../../security';
import { WorkspaceLibrary, type WorkspaceNavigationItem } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import { SettingsPlaceholderPage } from '../pages/SettingsPlaceholderPage';
import { UserAudioSettingsPage } from '../pages/UserAudioSettingsPage';
import { UserProfileSettingsPage } from '../pages/UserProfileSettingsPage';
import { UserPresenceSettingsPage } from '../pages/UserPresenceSettingsPage';
import { UserPrivacySettingsPage } from '../pages/UserPrivacySettingsPage';
import { ServerSettingsPage } from '../pages/ServerSettingsPage';
import { SettingsShell } from './SettingsShell';

const workspaces: WorkspaceNavigationItem[] = [
  { id: 'vatrushka', name: 'Команда Ватрушки', memberCount: 18, activeVoice: true },
  { id: 'friends', name: 'Друзья и игры', memberCount: 42 },
];
const storyServer: ServerDetail = {
  id: 'vatrushka', name: 'Команда Ватрушки', inviteUrl: 'https://myvatrushka.ru/i/example', ownerUserId: 'owner', memberCount: 18, createdAt: '2026-01-01T00:00:00.000Z',
  channels: [{ id: 'general', serverId: 'vatrushka', name: 'общий', type: 'text', position: 0, unreadCount: 0 }], roles: [], members: [], permissions: ['VIEW_SERVER', 'MANAGE_SERVER'],
};

const securityUser: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };
const audioDevices: AudioDevices = {
  inputs: [
    { deviceId: 'studio-mic', groupId: 'desk', kind: 'audioinput', label: 'Shure MV7 — рабочий стол', toJSON: () => ({}) },
    { deviceId: 'webcam-mic', groupId: 'camera', kind: 'audioinput', label: 'Микрофон Logitech Brio', toJSON: () => ({}) },
  ],
  outputs: [
    { deviceId: 'headphones', groupId: 'desk', kind: 'audiooutput', label: 'Наушники Arctis Nova 7', toJSON: () => ({}) },
    { deviceId: 'speakers', groupId: 'monitor', kind: 'audiooutput', label: 'Динамики монитора', toJSON: () => ({}) },
  ],
};
const dndPresence = { preference: 'do_not_disturb' as const, effectiveStatus: 'dnd' as const, customText: 'Фокус до релиза', customTextExpiresAt: null, updatedAt: '2026-07-17T10:00:00.000Z' };
const privacySettings = { directMessages: 'shared_servers' as const, presenceVisibility: 'shared_servers' as const, activityVisible: true, updatedAt: '2026-07-17T10:00:00.000Z' };
const securityClient: SecurityClient = {
  requestPasswordSetup: fn(() => Promise.resolve({ retryAfterSeconds: 60 })),
  setPassword: fn(() => Promise.resolve(securityUser)),
  beginTwoFactorSetup: fn(() => Promise.resolve({ secret: 'ABCDEFGHIJKLMNOP', otpauthUri: 'otpauth://totp/Vatrushka' })),
  enableTwoFactor: fn(() => Promise.resolve({ user: securityUser, recoveryCodes: ['ABCD-EFGH-JKLM'] })),
  disableTwoFactor: fn(() => Promise.resolve({ ...securityUser, twoFactorEnabled: false })),
  regenerateRecoveryCodes: fn(() => Promise.resolve({ recoveryCodes: ['ABCD-EFGH-JKLM'] })),
  listSessions: fn(() => Promise.resolve([])),
  setSessionTrusted: fn(() => Promise.resolve()),
  revokeSession: fn(() => Promise.resolve({ current: false })),
  revokeOtherSessions: fn(() => Promise.resolve({ revokedCount: 0 })),
  listSecurityEvents: fn(() => Promise.resolve<SecurityEvent[]>([])),
};

interface SettingsStoryProps {
  scope: 'server' | 'user';
  onBack(): void;
  onNavigate(section: string): void;
}

function SettingsStory({ onBack, onNavigate, scope }: SettingsStoryProps): React.JSX.Element {
  const workspace = <WorkspaceLibrary {...(scope === 'server' ? { activeWorkspaceId: 'vatrushka' } : {})} onCreate={() => undefined} onDirectMessages={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />;
  if (scope === 'server') return <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={onBack} onSelect={onNavigate} workspaceLibrary={workspace}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="overview" server={storyServer} /></SettingsShell>;
  return <SettingsShell activeSection="profile" entityLabel="Личные настройки" entityName="Илья Форбиш" items={userSettingsNavigation} onBack={onBack} onSelect={onNavigate} workspaceLibrary={workspace}><UserProfileSettingsPage onDirtyChange={() => undefined} onSave={(displayName) => Promise.resolve({ ...securityUser, displayName })} onUserChange={() => undefined} user={securityUser} /></SettingsShell>;
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

export const UserAudioDevices: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="audio" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserAudioSettingsPage busy={false} devices={audioDevices} inputLevel={0.34} microphoneId="studio-mic" onMicrophone={() => undefined} onOutput={() => undefined} onRefresh={() => undefined} onTestOutput={() => undefined} outputId="headphones" voiceConnected /></SettingsShell>,
};

export const UserPresenceDnd: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="status" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserPresenceSettingsPage onDirtyChange={() => undefined} onLoad={() => Promise.resolve(dndPresence)} onPresenceChange={() => undefined} onSave={() => Promise.resolve(dndPresence)} presence={dndPresence} /></SettingsShell>,
};

export const UserPrivacy: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="privacy" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserPrivacySettingsPage onDirtyChange={() => undefined} onLoad={() => Promise.resolve(privacySettings)} onSave={() => Promise.resolve(privacySettings)} /></SettingsShell>,
};

export const UserSecurityLiveSection: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="security" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><SecurityCenter client={securityClient} onClose={args.onBack} onCurrentSessionRevoked={() => undefined} onSectionChange={(section) => { args.onNavigate(section); }} onUserChange={() => undefined} open presentation="page" section="protection" user={securityUser} /></SettingsShell>,
};

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
