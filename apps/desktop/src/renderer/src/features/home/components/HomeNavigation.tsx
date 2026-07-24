import { type ReactNode } from "react";

import type {
  EffectivePresenceStatus,
  PresencePreference,
  PublicUser,
  ServerSummary,
} from "@vatrushka/shared";

import {
  UserProfileDock,
  GlobalSidebar,
  type WorkspaceNavigationItem,
} from "../../../ui";

export interface HomeNavigationProps {
  user: PublicUser;
  servers: ServerSummary[];
  onCreate: () => void;
  onDirectMessages?: (() => void) | undefined;
  onOpenServer: (serverId: string) => void;
  onSecurity: () => void;
  onLogout: () => void;
  onStatus?: ((status: PresencePreference) => void | Promise<void>) | undefined;
  status?: EffectivePresenceStatus | undefined;
  networkAvailable?: boolean;
  profileCoverUrl?: string | null | undefined;
  voiceProfileConnection?: ReactNode | undefined;
}

export function HomeNavigation({
  networkAvailable = true,
  onCreate,
  onDirectMessages,
  onLogout,
  onOpenServer,
  onSecurity,
  onStatus,
  profileCoverUrl,
  servers,
  status,
  user,
  voiceProfileConnection,
}: HomeNavigationProps): React.JSX.Element {
  const name = user.displayName ?? user.email;
  const serverCards: WorkspaceNavigationItem[] = servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    iconUrl: server.iconUrl ?? null,
    bannerUrl: server.bannerUrl ?? null,
    accentColor: server.accentColor ?? null,
  }));
  return (
    <GlobalSidebar
      activeSection="home"
      disabled={!networkAvailable}
      onCommunity={() => {
        const firstServer = servers[0];
        if (firstServer) onOpenServer(firstServer.id);
        else onCreate();
      }}
      onDirectMessages={onDirectMessages ?? (() => undefined)}
      onHome={() => undefined}
      onServerSelect={onOpenServer}
      profile={<UserProfileDock
        avatarUrl={user.avatarUrl ?? null}
        coverUrl={profileCoverUrl}
        email={user.email}
        founder={user.platformRole === "owner"}
        name={name}
        enableTilt
        onLogout={onLogout}
        onSecurity={onSecurity}
        {...(onStatus ? { onStatus } : {})}
        {...(status ? { status } : {})}
        voiceConnection={voiceProfileConnection}
      />}
      servers={serverCards}
    />
  );
}
