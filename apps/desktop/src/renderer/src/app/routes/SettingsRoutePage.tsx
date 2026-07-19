import { useEffect, useRef, useState } from "react";

import type {
  LocalSettings,
  PublicUser,
  ServerDetail,
  ServerPermission,
  ServerSummary,
  UserNotificationPreferences,
  UserPresence,
  UserPrivacySettings,
} from "@vatrushka/shared";

import type { AudioDevices } from "../../audio-devices";
import { SecurityCenter, type SecurityTab } from "../../features/security";
import {
  ServerSettingsPage,
  SettingsPageState,
  SettingsShell,
  UserAccountSettingsPage,
  UserAudioSettingsPage,
  UserNotificationSettingsPage,
  UserPresenceSettingsPage,
  UserPrivacySettingsPage,
  UserProfileSettingsPage,
} from "../../features/settings";
import { apiClient } from "../../api";
import {
  ConfirmDialog,
  WorkspaceLibrary,
  type WorkspaceNavigationItem,
} from "../../ui";
import type { SettingsRoute } from "./route-paths";
import { serverSettingsPath, userSettingsPath } from "./route-paths";
import { serverSettingsNavigation } from "./server-settings.routes";
import { userSettingsNavigation } from "./user-settings.routes";

export interface SettingsRoutePageProps {
  busy: boolean;
  devices: AudioDevices;
  directUnreadCount: number;
  error: string | null;
  inputLevel: number;
  loading: boolean;
  microphoneId: string | undefined;
  outputId: string | undefined;
  presence: UserPresence | null;
  presenceEnabled: boolean;
  route: SettingsRoute;
  settings: LocalSettings;
  server: ServerDetail | null;
  serverSettingsRevision: number;
  servers: ServerSummary[];
  user: PublicUser;
  voiceConnected: boolean;
  onBack(): void;
  onCreateServer(): void;
  onDirectMessages(): void;
  onHome(): void;
  onNavigate(path: string): void;
  onMicrophone(deviceId: string): void;
  onNotificationSettingsChange(
    settings: Pick<
      LocalSettings,
      "desktopNotificationsEnabled" | "messageSoundsEnabled"
    >,
  ): void;
  onOpenServer(serverId: string): void;
  onServerChanged(): Promise<void>;
  onServerDeleted(): void;
  onOutput(deviceId: string): void;
  onRefreshDevices(): void;
  onTestOutput(): void;
  onLoadPresence(): Promise<UserPresence>;
  onUpdatePresence(input: {
    preference: UserPresence["preference"];
    customText: string | null;
    customTextExpiresAt: string | null;
  }): Promise<UserPresence>;
  onPresenceChange(presence: UserPresence): void;
  onLoadPrivacy(): Promise<UserPrivacySettings>;
  onLoadNotificationPreferences(): Promise<UserNotificationPreferences>;
  onUpdateNotificationPreferences(
    input: Omit<UserNotificationPreferences, "updatedAt">,
  ): Promise<UserNotificationPreferences>;
  onUpdatePrivacy(
    input: Pick<
      UserPrivacySettings,
      "directMessages" | "presenceVisibility" | "activityVisible"
    >,
  ): Promise<UserPrivacySettings>;
  onCurrentSessionRevoked(): void;
  onLogout(): void;
  onUserChange(user: PublicUser): void;
}

const sectionPermission: Partial<
  Record<(typeof serverSettingsNavigation)[number]["section"], ServerPermission>
> = {
  overview: "MANAGE_SERVER",
  appearance: "MANAGE_SERVER",
  members: "VIEW_SERVER",
  roles: "MANAGE_ROLES",
  channels: "MANAGE_CHANNELS",
  invites: "MANAGE_INVITES",
  moderation: "MANAGE_SERVER_SECURITY",
  "audit-log": "VIEW_AUDIT_LOG",
  danger: "MANAGE_SERVER",
};

const userSecurityTabs = {
  security: "protection",
  sessions: "sessions",
  activity: "activity",
} as const satisfies Partial<
  Record<(typeof userSettingsNavigation)[number]["section"], SecurityTab>
>;

function securityTabPath(tab: SecurityTab): string {
  if (tab === "recovery") return userSettingsPath("security", "backup-codes");
  if (tab === "protection") return userSettingsPath("security");
  return userSettingsPath(
    tab === "notifications"
      ? "notifications"
      : tab === "sessions"
        ? "sessions"
        : "activity",
  );
}

const loadUserProfileSettings = () => apiClient.getUserProfileSettings();
const loadBlockedUsers = () => apiClient.listBlockedUsers();
const loadUserAccountSettings = () => apiClient.getUserAccountSettings();

export function SettingsRoutePage(
  props: SettingsRoutePageProps,
): React.JSX.Element {
  const [pageDirty, setPageDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const requestNavigation = (action: () => void): void => {
    if (!pageDirty) {
      action();
      return;
    }
    pendingNavigationRef.current = action;
    setDiscardOpen(true);
  };
  const discardAndContinue = (): void => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setPageDirty(false);
    setDiscardOpen(false);
    action?.();
  };

  useEffect(() => {
    if (!pageDirty) return undefined;
    const blockWindowClose = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", blockWindowClose);
    return () => window.removeEventListener("beforeunload", blockWindowClose);
  }, [pageDirty]);

  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    activeVoice: false,
  }));
  const workspaceLibrary = (
    <WorkspaceLibrary
      {...(props.route.kind === "server"
        ? { activeWorkspaceId: props.route.serverId }
        : {})}
      directUnreadCount={props.directUnreadCount}
      onCreate={() => requestNavigation(props.onCreateServer)}
      onDirectMessages={() => requestNavigation(props.onDirectMessages)}
      onHome={() => requestNavigation(props.onHome)}
      onSelect={(serverId) =>
        requestNavigation(() => props.onOpenServer(serverId))
      }
      workspaces={workspaces}
    />
  );

  if (props.route.kind === "user") {
    const securityTab =
      props.route.subpage === "backup-codes"
        ? "recovery"
        : userSecurityTabs[
            props.route.section as keyof typeof userSecurityTabs
          ];
    const content =
      props.route.section === "profile" ? (
        <UserProfileSettingsPage
          onAvatar={(file) => apiClient.uploadUserAvatar(file)}
          onCover={(file) => apiClient.uploadUserProfileCover(file)}
          onDirtyChange={setPageDirty}
          onLoad={loadUserProfileSettings}
          onResetAvatar={() => apiClient.resetUserAvatar()}
          onResetCover={() => apiClient.resetUserProfileCover()}
          onSave={(input) => apiClient.updateUserProfileSettings(input)}
          onUserChange={props.onUserChange}
          user={props.user}
        />
      ) : props.route.section === "status" && props.presenceEnabled ? (
        <UserPresenceSettingsPage
          onDirtyChange={setPageDirty}
          onLoad={props.onLoadPresence}
          onPresenceChange={props.onPresenceChange}
          onSave={props.onUpdatePresence}
          presence={props.presence}
        />
      ) : props.route.section === "audio" ? (
        <UserAudioSettingsPage
          busy={props.busy}
          devices={props.devices}
          inputLevel={props.inputLevel}
          microphoneId={props.microphoneId}
          onMicrophone={props.onMicrophone}
          onOutput={props.onOutput}
          onRefresh={props.onRefreshDevices}
          onTestOutput={props.onTestOutput}
          outputId={props.outputId}
          voiceConnected={props.voiceConnected}
        />
      ) : props.route.section === "notifications" ? (
        <UserNotificationSettingsPage
          dndActive={props.presence?.preference === "do_not_disturb"}
          onDirtyChange={setPageDirty}
          onLoad={props.onLoadNotificationPreferences}
          onPreviewSound={props.onTestOutput}
          onSave={props.onUpdateNotificationPreferences}
        />
      ) : props.route.section === "privacy" ? (
        <UserPrivacySettingsPage
          onDirtyChange={setPageDirty}
          onLoad={props.onLoadPrivacy}
          onLoadBlocked={loadBlockedUsers}
          onSave={props.onUpdatePrivacy}
          onUnblock={(userId) => apiClient.unblockUser(userId)}
        />
      ) : props.route.section === "account" ? (
        <UserAccountSettingsPage
          onCancelDeactivation={() => apiClient.cancelAccountDeactivation()}
          onConfirmEmail={(code) => apiClient.confirmEmailChange(code)}
          onDeactivate={(input) => apiClient.scheduleAccountDeactivation(input)}
          onExport={() => apiClient.exportPersonalData()}
          onLoad={loadUserAccountSettings}
          onLogout={props.onLogout}
          onRequestEmail={(input) => apiClient.requestEmailChange(input)}
          onUserChange={props.onUserChange}
          user={props.user}
        />
      ) : (
        <SecurityCenter
          dndActive={props.presence?.preference === "do_not_disturb"}
          onClose={props.onBack}
          onCurrentSessionRevoked={props.onCurrentSessionRevoked}
          onSectionChange={(tab) => props.onNavigate(securityTabPath(tab))}
          onSettingsChange={props.onNotificationSettingsChange}
          onUserChange={props.onUserChange}
          open
          presentation="page"
          section={securityTab ?? "protection"}
          settings={props.settings}
          user={props.user}
        />
      );
    return (
      <>
        <SettingsShell
          activeSection={props.route.section}
          entityLabel="Личные настройки"
          entityName={props.user.displayName ?? props.user.email}
          items={userSettingsNavigation}
          onBack={() => requestNavigation(props.onBack)}
          onSelect={(section) =>
            requestNavigation(() => props.onNavigate(userSettingsPath(section)))
          }
          workspaceLibrary={workspaceLibrary}
        >
          {content}
        </SettingsShell>
        <ConfirmDialog
          confirmLabel="Не сохранять"
          danger
          description="Внесённые изменения будут потеряны."
          onClose={() => {
            pendingNavigationRef.current = null;
            setDiscardOpen(false);
          }}
          onConfirm={discardAndContinue}
          open={discardOpen}
          title="Отменить изменения?"
        />
      </>
    );
  }

  const serverRoute = props.route;
  const serverSummary = props.servers.find(
    (candidate) => candidate.id === serverRoute.serverId,
  );
  const entityName =
    props.server?.id === serverRoute.serverId
      ? props.server.name
      : (serverSummary?.name ?? "Сервер");
  const isOwner = props.server?.ownerUserId === props.user.id;
  const availableItems = serverSettingsNavigation.filter((item) => {
    if (isOwner) return true;
    const permission = sectionPermission[item.section];
    return (
      permission === undefined ||
      props.server?.permissions.includes(permission) === true
    );
  });
  const hasAccess =
    isOwner ||
    availableItems.some((item) => item.section === serverRoute.section);
  const navigationItems =
    availableItems.length > 0
      ? availableItems
      : serverSettingsNavigation.slice(0, 1);
  const navigationSection = hasAccess
    ? serverRoute.section
    : navigationItems[0]!.section;

  return (
    <SettingsShell
      activeSection={navigationSection}
      entityLabel="Настройки сервера"
      entityName={entityName}
      items={navigationItems}
      onBack={props.onBack}
      onSelect={(section) =>
        props.onNavigate(serverSettingsPath(serverRoute.serverId, section))
      }
      workspaceLibrary={workspaceLibrary}
    >
      {props.loading ? (
        <SettingsPageState kind="loading" />
      ) : props.error !== null ? (
        <SettingsPageState description={props.error} kind="error" />
      ) : !hasAccess ? (
        <SettingsPageState kind="permission" />
      ) : props.server === null ? (
        <SettingsPageState kind="loading" />
      ) : (
        <ServerSettingsPage
          currentUserId={props.user.id}
          key={`${serverRoute.serverId}:${serverRoute.section}`}
          onChanged={props.onServerChanged}
          onDeleted={props.onServerDeleted}
          refreshRevision={props.serverSettingsRevision}
          section={serverRoute.section}
          server={props.server}
        />
      )}
    </SettingsShell>
  );
}
