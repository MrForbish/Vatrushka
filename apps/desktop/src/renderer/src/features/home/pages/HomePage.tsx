import { useState } from "react";
import type {
  GamingHomeConnectionQuality,
  HomeDashboardResponse,
  HomeDestination,
  PublicUser,
  RoomConnection,
  ServerSummary,
} from "@vatrushka/shared";

import type { AudioDevices } from "../../../audio-devices";
import { AppShell, Button, Icon, Input, Modal } from "../../../ui";
import {
  ActiveVoiceSpacesSection,
  FriendsInGameSection,
  QuickReturnSection,
  VoiceStatusBar,
} from "../components/GamingHome";
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
  onSecurity: () => void;
  onAudioSettings?: (() => void) | undefined;
  onServerName: (value: string) => void;
  onCreateServer: () => void;
  onOpenServer: (serverId: string) => void;
  onOpenDestination?: ((destination: HomeDestination) => void) | undefined;
  onJoinVoice?: ((serverId: string, channelId: string) => void) | undefined;
  onMessageFriend?: ((userId: string) => void) | undefined;
  onDirectMessages?: (() => void) | undefined;
}

export function HomePage(props: HomePageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const effectiveServers = props.dashboard?.servers ?? props.servers;
  const gaming = props.dashboard?.gaming;
  const microphone = props.devices.inputs.find((device) => device.deviceId === props.microphoneId) ?? props.devices.inputs[0];
  const output = props.devices.outputs.find((device) => device.deviceId === props.outputId) ?? props.devices.outputs[0];
  const connectionQuality = props.dashboardError
    ? "offline"
    : (props.voiceConnectionQuality ?? gaming?.voiceStatus.connectionQuality ?? (props.error ? "poor" : "excellent"));
  const voiceStatus = {
    microphone: {
      available: microphone !== undefined,
      enabled: microphone !== undefined && props.microphoneMuted !== true,
      label: microphone?.label || null,
    },
    output: {
      available: output !== undefined,
      label: output?.label || null,
    },
    pingMs: props.voicePingMs ?? gaming?.voiceStatus.pingMs ?? null,
    connectionQuality,
  } as const;
  const openDestination = (serverId: string, channelId: string): void => {
    if (props.onJoinVoice) props.onJoinVoice(serverId, channelId);
    else if (props.onOpenDestination) props.onOpenDestination({ type: "voice_channel", serverId, channelId });
    else props.onOpenServer(serverId);
  };
  const openSpaces = (): void => {
    const first = gaming?.activeSpaces[0];
    if (first) props.onOpenServer(first.serverId);
  };

  return (
    <>
      <AppShell
        topBar={
          <div className="home-header">
            <Icon name="home" size={19} />
            <span><strong>Главная</strong><small>Игровой центр Vatrushka</small></span>
          </div>
        }
        variant="home"
        workspaceLibrary={
          <HomeNavigation
            directUnreadCount={props.directUnreadCount ?? 0}
            networkAvailable={connectionQuality !== "offline"}
            onCreate={() => setCreateOpen(true)}
            onDirectMessages={props.onDirectMessages}
            onLogout={props.onLogout}
            onOpenServer={props.onOpenServer}
            onSecurity={props.onSecurity}
            onSpaces={openSpaces}
            servers={effectiveServers}
            user={props.user}
          />
        }
      >
        <div className="home-dashboard home-dashboard--gaming">
          <div className="home-dashboard__inner gaming-home">
            {props.dashboardError || props.error ? (
              <HomeWidgetError
                message={props.dashboard === undefined ? (props.dashboardError ?? props.error ?? "Нет соединения с Vatrushka") : "Нет соединения с Vatrushka. Показываем последние доступные данные."}
                onRetry={props.onRetryDashboard}
              />
            ) : null}
            <VoiceStatusBar onAudioSettings={props.onAudioSettings ?? props.onSecurity} status={voiceStatus} />
            {props.dashboardLoading && gaming === undefined ? (
              <>
                <HomeWidgetSkeleton label="Загрузка быстрого возврата" rows={3} />
                <HomeWidgetSkeleton label="Загрузка активных пространств" rows={4} />
                <HomeWidgetSkeleton label="Загрузка друзей" rows={4} />
              </>
            ) : (
              <>
                <QuickReturnSection items={gaming?.quickReturn ?? []} onJoin={openDestination} />
                <ActiveVoiceSpacesSection items={gaming?.activeSpaces ?? []} onJoin={openDestination} onShowAll={openSpaces} />
                <FriendsInGameSection
                  friends={gaming?.friendsInGame ?? []}
                  onJoin={openDestination}
                  onMessage={(userId) => props.onMessageFriend?.(userId)}
                  onShowAll={() => props.onDirectMessages?.()}
                />
              </>
            )}
          </div>
        </div>
        <span className="home-app-version">v{props.version}</span>
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
