import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { serverPermissions, type PublicUser, type SecurityEvent, type ServerDetail } from '@vatrushka/shared';

import { serverSettingsNavigation, userSettingsNavigation } from '../../../app/routes';
import type { AudioDevices } from '../../../audio-devices';
import { SecurityCenter, type SecurityClient } from '../../security';
import { WorkspaceLibrary, type WorkspaceNavigationItem } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import { UserAudioSettingsPage } from '../pages/UserAudioSettingsPage';
import { UserAccountSettingsPage } from '../pages/UserAccountSettingsPage';
import { UserNotificationSettingsPage } from '../pages/UserNotificationSettingsPage';
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
  id: 'vatrushka', name: 'Команда Ватрушки', description: 'Команда продукта и разработки.', inviteUrl: 'https://myvatrushka.ru/i/example', ownerUserId: 'owner', memberCount: 18, createdAt: '2026-01-01T00:00:00.000Z',
  channels: [{ id: 'general', serverId: 'vatrushka', name: 'общий', type: 'text', position: 0, unreadCount: 0 }],
  roles: [
    { id: 'owner-role', serverId: 'vatrushka', name: 'Владелец', color: '#f0b35b', position: 100, isDefault: true, kind: 'OWNER', permissions: [...serverPermissions] },
    { id: 'moderator-role', serverId: 'vatrushka', name: 'Модератор', color: '#d77b63', position: 10, isDefault: false, kind: 'CUSTOM', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_MESSAGES'] },
    { id: 'everyone-role', serverId: 'vatrushka', name: '@everyone', color: '#8f91a8', position: 0, isDefault: true, kind: 'EVERYONE', permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] },
  ],
  members: [], permissions: [...serverPermissions],
};

const securityUser: PublicUser = { id: 'user-1', email: 'owner@myvatrushka.ru', displayName: 'Илья Форбиш', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true };
const profileSettings = { id: securityUser.id, email: securityUser.email, displayName: securityUser.displayName!, username: 'mrforbish', bio: 'Создаю Ватрушку', avatarUrl: null, usernameChangedAt: null, updatedAt: '2026-07-18T10:00:00.000Z' };
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
const notificationSettings = { desktopEnabled: true, soundEnabled: true, previewMode: 'full' as const, directMessagesEnabled: true, mentionsEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursTimezone: 'Europe/Moscow', updatedAt: '2026-07-17T10:00:00.000Z' };
const accountSettings = { email: securityUser.email, emailVerified: true, pendingEmail: null, deactivationScheduledAt: null, deletionAt: null, ownsServers: false };
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
  return <SettingsShell activeSection="profile" entityLabel="Личные настройки" entityName="Илья Форбиш" items={userSettingsNavigation} onBack={onBack} onSelect={onNavigate} workspaceLibrary={workspace}><UserProfileSettingsPage onAvatar={() => Promise.resolve(profileSettings)} onDirtyChange={() => undefined} onLoad={() => Promise.resolve(profileSettings)} onResetAvatar={() => Promise.resolve(profileSettings)} onSave={(input) => Promise.resolve({ ...profileSettings, ...input })} onUserChange={() => undefined} user={securityUser} /></SettingsShell>;
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

export const ServerAppearance: Story = {
  render: (args) => <SettingsShell activeSection="appearance" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="appearance" server={storyServer} /></SettingsShell>,
};

export const ServerMembers: Story = {
  render: (args) => <SettingsShell activeSection="members" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="members" server={storyServer} /></SettingsShell>,
};

export const ServerChannels: Story = {
  render: (args) => <SettingsShell activeSection="channels" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="channels" server={storyServer} /></SettingsShell>,
};

export const ServerInvites: Story = {
  render: (args) => <SettingsShell activeSection="invites" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="invites" server={storyServer} /></SettingsShell>,
};

export const ServerModeration: Story = {
  render: (args) => <SettingsShell activeSection="moderation" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="moderation" server={storyServer} /></SettingsShell>,
};

export const ServerAuditLog: Story = {
  render: (args) => <SettingsShell activeSection="audit-log" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="audit-log" server={storyServer} /></SettingsShell>,
};

export const ServerDangerZone: Story = {
  render: (args) => <SettingsShell activeSection="danger" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="danger" server={storyServer} /></SettingsShell>,
};

export const UserProfile: Story = { args: { scope: 'user' } };

export const ServerRoles: Story = {
  render: (args) => <SettingsShell activeSection="roles" entityLabel="Настройки сервера" entityName={storyServer.name} items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary activeWorkspaceId={storyServer.id} onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><ServerSettingsPage onChanged={() => Promise.resolve()} onDeleted={() => undefined} section="roles" server={storyServer} /></SettingsShell>,
};

export const UserAudioDevices: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="audio" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserAudioSettingsPage appSoundVolume={1} busy={false} devices={audioDevices} inputLevel={0.34} microphoneId="studio-mic" onAppSoundVolume={() => undefined} onMicrophone={() => undefined} onOutput={() => undefined} onRefresh={() => undefined} onTestOutput={() => undefined} outputId="headphones" voiceConnected /></SettingsShell>,
};

export const UserPresenceDnd: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="status" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserPresenceSettingsPage onDirtyChange={() => undefined} onLoad={() => Promise.resolve(dndPresence)} onPresenceChange={() => undefined} onSave={() => Promise.resolve(dndPresence)} presence={dndPresence} /></SettingsShell>,
};

export const UserPrivacy: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="privacy" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserPrivacySettingsPage onDirtyChange={() => undefined} onLoad={() => Promise.resolve(privacySettings)} onLoadBlocked={() => Promise.resolve([])} onSave={() => Promise.resolve(privacySettings)} onUnblock={() => Promise.resolve()} /></SettingsShell>,
};

export const UserNotifications: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="notifications" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserNotificationSettingsPage dndActive={false} onDirtyChange={() => undefined} onLoad={() => Promise.resolve(notificationSettings)} onPreviewSound={() => undefined} onSave={() => Promise.resolve(notificationSettings)} /></SettingsShell>,
};

export const UserAccount: Story = {
  args: { scope: 'user' },
  render: (args) => <SettingsShell activeSection="account" entityLabel="Личные настройки" entityName={securityUser.displayName ?? securityUser.email} items={userSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><UserAccountSettingsPage onCancelDeactivation={() => Promise.resolve(accountSettings)} onConfirmEmail={() => Promise.resolve(securityUser)} onDeactivate={() => Promise.resolve(accountSettings)} onExport={() => Promise.resolve({ profile: securityUser })} onLoad={() => Promise.resolve(accountSettings)} onLogout={() => undefined} onRequestEmail={() => Promise.resolve()} onUserChange={() => undefined} user={securityUser} /></SettingsShell>,
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
  render: (args) => <SettingsShell activeSection="overview" entityLabel="Настройки сервера" entityName="Команда Ватрушки" items={serverSettingsNavigation} onBack={args.onBack} onSelect={args.onNavigate} workspaceLibrary={<WorkspaceLibrary onCreate={() => undefined} onHome={() => undefined} onSelect={() => undefined} workspaces={workspaces} />}><div><h1>Обзор</h1><p>Основные параметры сервера</p></div><SettingsSaveBar onCancel={() => undefined} onSave={() => undefined} state="dirty" /></SettingsShell>,
};
