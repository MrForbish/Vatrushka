import type { LocalSettings, PublicUser, ServerDetail, ServerPermission, ServerSummary } from '@vatrushka/shared';

import { SecurityCenter, type SecurityTab } from '../../features/security';
import { SettingsPageState, SettingsPlaceholderPage, SettingsShell } from '../../features/settings';
import { WorkspaceLibrary, type WorkspaceNavigationItem } from '../../ui';
import type { SettingsRoute } from './route-paths';
import { serverSettingsPath, userSettingsPath } from './route-paths';
import { serverSettingsNavigation } from './server-settings.routes';
import { userSettingsNavigation } from './user-settings.routes';

export interface SettingsRoutePageProps {
  directUnreadCount: number;
  error: string | null;
  loading: boolean;
  route: SettingsRoute;
  settings: LocalSettings;
  server: ServerDetail | null;
  servers: ServerSummary[];
  user: PublicUser;
  onBack(): void;
  onCreateServer(): void;
  onDirectMessages(): void;
  onHome(): void;
  onNavigate(path: string): void;
  onNotificationSettingsChange(settings: Pick<LocalSettings, 'desktopNotificationsEnabled' | 'messageSoundsEnabled'>): void;
  onOpenServer(serverId: string): void;
  onCurrentSessionRevoked(): void;
  onUserChange(user: PublicUser): void;
}

const sectionPermission: Partial<Record<(typeof serverSettingsNavigation)[number]['section'], ServerPermission>> = {
  overview: 'MANAGE_SERVER',
  appearance: 'MANAGE_SERVER',
  members: 'VIEW_SERVER',
  roles: 'MANAGE_ROLES',
  channels: 'MANAGE_CHANNELS',
  invites: 'MANAGE_INVITES',
  moderation: 'MANAGE_SERVER_SECURITY',
  'audit-log': 'VIEW_AUDIT_LOG',
  danger: 'MANAGE_SERVER',
};

const userSecurityTabs = {
  notifications: 'notifications',
  security: 'protection',
  sessions: 'sessions',
  activity: 'activity',
} as const satisfies Partial<Record<(typeof userSettingsNavigation)[number]['section'], SecurityTab>>;

function securityTabPath(tab: SecurityTab): string {
  if (tab === 'recovery') return userSettingsPath('security', 'backup-codes');
  if (tab === 'protection') return userSettingsPath('security');
  return userSettingsPath(tab === 'notifications' ? 'notifications' : tab === 'sessions' ? 'sessions' : 'activity');
}

export function SettingsRoutePage(props: SettingsRoutePageProps): React.JSX.Element {
  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({ id: server.id, name: server.name, memberCount: server.memberCount, activeVoice: false }));
  const workspaceLibrary = <WorkspaceLibrary {...(props.route.kind === 'server' ? { activeWorkspaceId: props.route.serverId } : {})} directUnreadCount={props.directUnreadCount} onCreate={props.onCreateServer} onDirectMessages={props.onDirectMessages} onHome={props.onHome} onSelect={props.onOpenServer} workspaces={workspaces} />;

  if (props.route.kind === 'user') {
    const item = userSettingsNavigation.find((candidate) => candidate.section === props.route.section)!;
    const securityTab = props.route.subpage === 'backup-codes' ? 'recovery' : userSecurityTabs[props.route.section as keyof typeof userSecurityTabs];
    return (
      <SettingsShell activeSection={props.route.section} entityLabel="Личные настройки" entityName={props.user.displayName ?? props.user.email} items={userSettingsNavigation} onBack={props.onBack} onSelect={(section) => props.onNavigate(userSettingsPath(section))} workspaceLibrary={workspaceLibrary}>
        {securityTab === undefined
          ? <SettingsPlaceholderPage description={item.description} scope="user" title={item.label} />
          : <SecurityCenter onClose={props.onBack} onCurrentSessionRevoked={props.onCurrentSessionRevoked} onSectionChange={(tab) => props.onNavigate(securityTabPath(tab))} onSettingsChange={props.onNotificationSettingsChange} onUserChange={props.onUserChange} open presentation="page" section={securityTab} settings={props.settings} user={props.user} />}
      </SettingsShell>
    );
  }

  const serverRoute = props.route;
  const serverSummary = props.servers.find((candidate) => candidate.id === serverRoute.serverId);
  const entityName = props.server?.id === serverRoute.serverId ? props.server.name : serverSummary?.name ?? 'Сервер';
  const isOwner = props.server?.ownerUserId === props.user.id;
  const availableItems = serverSettingsNavigation.filter((item) => {
    if (isOwner) return true;
    const permission = sectionPermission[item.section];
    return permission === undefined || props.server?.permissions.includes(permission) === true;
  });
  const activeItem = serverSettingsNavigation.find((candidate) => candidate.section === serverRoute.section)!;
  const hasAccess = isOwner || availableItems.some((item) => item.section === serverRoute.section);
  const navigationItems = availableItems.length > 0 ? availableItems : serverSettingsNavigation.slice(0, 1);
  const navigationSection = hasAccess ? serverRoute.section : navigationItems[0]!.section;

  return (
    <SettingsShell activeSection={navigationSection} entityLabel="Настройки сервера" entityName={entityName} items={navigationItems} onBack={props.onBack} onSelect={(section) => props.onNavigate(serverSettingsPath(serverRoute.serverId, section))} workspaceLibrary={workspaceLibrary}>
      {props.loading ? <SettingsPageState kind="loading" />
        : props.error !== null ? <SettingsPageState description={props.error} kind="error" />
          : !hasAccess ? <SettingsPageState kind="permission" />
            : <SettingsPlaceholderPage description={activeItem.description} scope="server" title={activeItem.label} />}
    </SettingsShell>
  );
}
