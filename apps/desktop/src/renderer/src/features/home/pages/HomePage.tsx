import { useState, type ReactNode } from "react";
import type {
  EffectivePresenceStatus,
  GamingHomeConnectionQuality,
  HomeDashboardResponse,
  HomeDestination,
  PresencePreference,
  PublicUser,
  RoomConnection,
  ServerSummary,
} from "@vatrushka/shared";

import type { AudioDevices } from "../../../audio-devices";
import {
  AppShell,
  Button,
  Input,
  Modal,
} from "../../../ui";
import { HomeV2 } from "../components/HomeV2";
import { HomeNavigation } from "../components/HomeNavigation";
import { HomeWidgetError } from "../components/HomeWidgetError";
import { HomeWidgetSkeleton } from "../components/HomeWidgetSkeleton";
import "../home.css";

export interface HomePageProps {
  user: PublicUser;
  version: string;
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  microphoneMuted?: boolean;
  voicePingMs?: number | null;
  voiceConnectionQuality?: GamingHomeConnectionQuality | undefined;
  busy: boolean;
  error: string | null;
  servers: ServerSummary[];
  serverName: string;
  directUnreadCount?: number;
  connection?: RoomConnection | null;
  dashboard?: HomeDashboardResponse | undefined;
  dashboardLoading?: boolean;
  dashboardError?: string | null;
  onRetryDashboard?: (() => void) | undefined;
  onLogout: () => void;
  onStatus?: ((status: PresencePreference) => void | Promise<void>) | undefined;
  status?: EffectivePresenceStatus | undefined;
  onSecurity: () => void;
  onAudioSettings?: (() => void) | undefined;
  onServerName: (value: string) => void;
  onCreateServer: () => void;
  onOpenServer: (serverId: string) => void;
  onOpenDestination?: ((destination: HomeDestination) => void) | undefined;
  onJoinVoice?: ((serverId: string, channelId: string) => void) | undefined;
  onMessageFriend?: ((userId: string) => void) | undefined;
  onDirectMessages?: (() => void) | undefined;
  profileCoverUrl?: string | null | undefined;
  voiceProfileConnection?: ReactNode | undefined;
}

export function HomePage(props: HomePageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const effectiveServers = props.dashboard?.servers ?? props.servers;
  const gaming = props.dashboard?.gaming;
  const connectionQuality = props.dashboardError
    ? "offline"
    : (props.voiceConnectionQuality ?? gaming?.voiceStatus.connectionQuality ?? (props.error ? "poor" : "excellent"));
  const displayName = props.dashboard?.user.displayName ?? props.user.displayName ?? props.user.email;

  const openDestination = (serverId: string, channelId: string): void => {
    if (props.connection?.serverId === serverId && props.connection.channelId === channelId && props.onOpenDestination) {
      props.onOpenDestination({ type: "voice_channel", serverId, channelId });
    } else if (props.onJoinVoice) {
      props.onJoinVoice(serverId, channelId);
    } else if (props.onOpenDestination) {
      props.onOpenDestination({ type: "voice_channel", serverId, channelId });
    } else {
      props.onOpenServer(serverId);
    }
  };

  return (
    <>
      <AppShell
        globalSidebar={
          <HomeNavigation
            networkAvailable={connectionQuality !== "offline"}
            onCreate={() => setCreateOpen(true)}
            onDirectMessages={props.onDirectMessages}
            onLogout={props.onLogout}
            onOpenServer={props.onOpenServer}
            onSecurity={props.onSecurity}
            onStatus={props.onStatus}
            profileCoverUrl={props.profileCoverUrl}
            voiceProfileConnection={props.voiceProfileConnection}
            servers={effectiveServers}
            status={props.status ?? props.dashboard?.user.presence}
            user={props.user}
          />
        }
        variant="home"
      >
        <div aria-label="Главная страница" className="home-dashboard home-dashboard--v2" tabIndex={0}>
          {props.dashboardError || props.error ? (
            <HomeWidgetError
              message={props.dashboard === undefined
                ? (props.dashboardError ?? props.error ?? "Нет соединения с Vatrushka")
                : "Нет соединения с Vatrushka. Показываем последние доступные данные."}
              onRetry={props.onRetryDashboard}
            />
          ) : null}
          {props.dashboardLoading && gaming === undefined ? (
            <div className="home-dashboard__v2-skeleton">
              <HomeWidgetSkeleton label="Загрузка главной страницы" rows={4} />
              <HomeWidgetSkeleton label="Загрузка друзей" rows={4} />
            </div>
          ) : (
            <HomeV2
              activeSpaces={gaming?.activeSpaces ?? []}
              displayName={displayName}
              friends={gaming?.friendsInGame ?? []}
              onJoin={openDestination}
              onMessage={(userId) => props.onMessageFriend?.(userId)}
              onOpenServer={props.onOpenServer}
              quickReturn={gaming?.quickReturn ?? []}
            />
          )}
        </div>
      </AppShell>
      <Modal
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)} type="button" variant="quiet">Отмена</Button>
            <Button disabled={connectionQuality === "offline" || props.busy || props.serverName.trim().length < 2} icon="plus" loading={props.busy} onClick={props.onCreateServer} type="button">Создать</Button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Новый сервер"
      >
        <Input autoFocus id="home-server-name" label="Название" maxLength={60} minLength={2} onChange={(event) => props.onServerName(event.target.value)} placeholder="Игровое сообщество" value={props.serverName} />
      </Modal>
    </>
  );
}
