import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ConnectionState,
  type LocalTrack,
  type RemoteTrack,
} from "livekit-client";

import type {
  RoomConnection,
  VoiceChannelParticipant,
} from "@vatrushka/shared";

import { audioDeviceOptions, cameraDeviceOptions } from "../../audio-devices";
import type { MediaSnapshot, ParticipantView } from "../../media";
import { ScreenAnnotationCanvas } from "../screen-share/ScreenAnnotationCanvas";
import type { ScreenAnnotationStroke } from "../screen-share/annotations";
import {
  Badge,
  Icon,
  IconButton,
  Popover,
  Slider,
  VoiceParticipantTile,
  type VoiceParticipantViewModel,
} from "../../ui";
import "./room-view.css";

interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras?: MediaDeviceInfo[];
}

export interface RoomViewProps {
  connection: RoomConnection;
  snapshot: MediaSnapshot;
  devices: AudioDevices;
  microphoneId: string | undefined;
  microphoneVolume?: number;
  cameraId?: string | undefined;
  outputId: string | undefined;
  outputVolume?: number;
  busy: boolean;
  error: string | null;
  participantNames?: Record<string, string> | undefined;
  participantAvatars?: Record<string, string | null> | undefined;
  voiceParticipants?: VoiceChannelParticipant[] | undefined;
  onMute(): void;
  onDeafen?(): void;
  onShare(): void;
  onCamera?(): void;
  onLeave(): void;
  onKick(identity: string): void;
  onMicrophone(value: string): void;
  onMicrophoneVolume?(value: number): void;
  onCameraDevice?(value: string): void;
  onOutput(value: string): void;
  onOutputVolume?(value: number): void;
  onStartAudio(): void;
  onScreenAudioMute(): void;
  onScreenAudioVolume(value: number): void;
  onScreenAnnotationStroke?(stroke: ScreenAnnotationStroke): void;
  onScreenAnnotationUndo?(): void;
  onScreenAnnotationClear?(): void;
  onParticipantMute(identity: string, muted: boolean): void;
  onParticipantVolume(identity: string, volume: number): void;
}

function participantModel(
  participant: ParticipantView,
  participantNames: Record<string, string> = {},
  participantAvatars: Record<string, string | null> = {},
  voiceParticipants: VoiceChannelParticipant[] = [],
): VoiceParticipantViewModel {
  const userId = /^user_([^_]+)_/u.exec(participant.identity)?.[1];
  const voiceState = voiceParticipants.find((item) => item.userId === userId);
  return {
    id: participant.identity,
    name: userId
      ? (participantNames[userId] ?? participant.displayName)
      : participant.displayName,
    avatarUrl: userId ? (participantAvatars[userId] ?? null) : null,
    isLocal: participant.isLocal,
    isMuted: participant.isMuted,
    isDeafened: voiceState?.deafened ?? false,
    isSpeaking: participant.isSpeaking,
    isScreenSharing:
      participant.isScreenSharing ||
      (voiceState?.screenSharing ?? false),
    locallyMuted: participant.locallyMuted,
    volume: participant.volume,
    audioLevel: participant.audioLevel,
    presence: voiceState?.presence ?? "online",
    statusLabel: participant.isOwner
      ? "Владелец сервера"
      : participant.connectionQuality,
    ...(participant.platformRole === "owner"
      ? { badge: "founder" as const }
      : participant.platformRole === "admin"
        ? { badge: "admin" as const }
        : {}),
  };
}

export function RoomView(props: RoomViewProps): React.JSX.Element {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const participantModels = props.snapshot.participants.map((participant) =>
    participantModel(
      participant,
      props.participantNames,
      props.participantAvatars,
      props.voiceParticipants,
    ),
  );
  const screenSharerName =
    participantModels.find((participant) => participant.isScreenSharing)
      ?.name ??
    props.snapshot.screenSharerName ??
    "участник";
  const cameraTracks = (props.snapshot.videoTracks ?? []).filter(
    (track) =>
      track.source === "camera" &&
      // LiveKit may retain a local publication briefly while the camera track
      // is being unpublished. Never keep a black local camera tile on screen
      // during that transition.
      (!track.isLocal || props.snapshot.isCameraEnabled),
  );
  const videoTracks = props.snapshot.videoTracks ?? [];
  const selectedTrack =
    videoTracks.find((track) => track.id === selectedTrackId) ??
    videoTracks.find((track) => track.source === "screen") ??
    cameraTracks[0] ??
    null;
  const showScreenTrack =
    props.snapshot.screenTrack !== null &&
    (selectedTrackId === null || selectedTrack?.source === "screen" || selectedTrack === null);
  useEffect(() => {
    if (selectedTrackId !== null && !videoTracks.some((track) => track.id === selectedTrackId)) {
      setSelectedTrackId(null);
      setIsFullscreen(false);
    }
  }, [selectedTrackId, videoTracks]);
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);
  const participantActions = {
    canKick: props.connection.isOwner,
    onKick: props.onKick,
    onLocalMute: props.onParticipantMute,
    onVolume: props.onParticipantVolume,
  };
  return (
    <section className="vui-room" data-fullscreen={isFullscreen || undefined}>
      <div className="vui-room__content">
        {selectedTrack === null && !showScreenTrack ? (
          <div className="vui-room__voice-stage">
            {participantModels.length === 0 ? (
              <div className="vui-room__empty">
                <Icon name="voice" size={38} />
                <h1>Ожидаем участников</h1>
              </div>
            ) : (
              <div
                className={`vui-room__participant-grid vui-room__participant-grid--count-${Math.min(participantModels.length, 4)}${participantModels.length === 1 ? " vui-room__participant-grid--single" : ""}`}
              >
                {participantModels.map((participant) => (
                  <VoiceParticipantTile
                    {...participantActions}
                    key={participant.id}
                    participant={participant}
                    showAudioLevel={false}
                    showMicStatusWhenMutedOnly
                  />
                ))}
              </div>
            )}
          </div>
        ) : showScreenTrack ? (
          <div className="vui-room__stream-stage">
            <div className="vui-room__stream">
              <ScreenTrack
                annotationEditable={props.snapshot.screenShareIsLocal}
                annotations={props.snapshot.screenAnnotations}
                audioAvailable={
                  props.snapshot.hasScreenShareAudio &&
                  !props.snapshot.screenShareIsLocal
                }
                muted={props.snapshot.screenShareAudioMuted}
                onMute={props.onScreenAudioMute}
                onVolume={props.onScreenAudioVolume}
                onAnnotationStroke={
                  props.onScreenAnnotationStroke ?? (() => undefined)
                }
                onAnnotationUndo={
                  props.onScreenAnnotationUndo ?? (() => undefined)
                }
                onAnnotationClear={
                  props.onScreenAnnotationClear ?? (() => undefined)
                }
                track={props.snapshot.screenTrack!}
                volume={props.snapshot.screenShareAudioVolume}
                fullscreen={isFullscreen}
                onOpen={() => setIsFullscreen((value) => !value)}
              />
              <div
                aria-label={`Экран показывает ${screenSharerName}`}
                className="vui-room__stream-presenter"
                tabIndex={0}
              >
                <span>Демонстрация экрана {screenSharerName}</span>
              </div>
              {videoTracks.length > 1 ? (
                <MediaTrackSwitcher
                  onSelect={setSelectedTrackId}
                  selectedTrackId={selectedTrack?.id ?? ""}
                  tracks={videoTracks}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="vui-room__stream-stage">
            <div className="vui-room__stream">
              <VideoTrack expanded onOpen={() => setIsFullscreen((value) => !value)} track={selectedTrack!} />
              {videoTracks.length > 1 ? (
                <MediaTrackSwitcher
                  onSelect={setSelectedTrackId}
                  selectedTrackId={selectedTrack!.id}
                  tracks={videoTracks}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
      {!props.snapshot.canPlayAudio ? (
        <button className="vui-room__audio-gate" onClick={props.onStartAudio}>
          Нажмите, чтобы включить звук участников
        </button>
      ) : null}
      {props.error || props.snapshot.error ? (
        <div className="vui-room__error" role="alert">
          {props.error ?? props.snapshot.error}
        </div>
      ) : null}
      <div className="vui-room__controls">
        <footer className="vui-room__control-dock" aria-label="Управление голосовым каналом">
          <VoiceDeviceControl
            active={props.snapshot.isMuted}
            actionLabel={
              props.connection.canSpeak === false
                ? "Роль не разрешает говорить"
                : props.snapshot.isMuted
                  ? "Включить микрофон"
                  : "Выключить микрофон"
            }
            disabled={props.connection.canSpeak === false}
            icon={props.snapshot.isMuted ? "micOff" : "mic"}
            menuLabel="Выбрать устройство: Микрофон"
            onToggle={props.onMute}
            onValueChange={props.onMicrophone}
            onVolumeChange={props.onMicrophoneVolume ?? (() => undefined)}
            options={prioritizeSelectedDevice(
              audioDeviceOptions(props.devices.inputs, "input"),
              props.microphoneId ?? "default",
            )}
            selectLabel="Устройство ввода"
            testId="mute-control"
            value={props.microphoneId ?? "default"}
            volume={props.microphoneVolume ?? 0.5}
            volumeLabel="Громкость микрофона"
          />
          <VoiceDeviceControl
            active={props.snapshot.isDeafened}
            actionLabel={
              props.snapshot.isDeafened
                ? "Включить входящий звук"
                : "Отключить входящий звук и микрофон"
            }
            icon={props.snapshot.isDeafened ? "volumeOff" : "volume"}
            menuLabel="Выбрать устройство: Звук"
            onToggle={props.onDeafen ?? (() => undefined)}
            onValueChange={props.onOutput}
            onVolumeChange={props.onOutputVolume ?? (() => undefined)}
            options={prioritizeSelectedDevice(
              audioDeviceOptions(props.devices.outputs, "output"),
              props.outputId ?? "default",
            )}
            selectLabel="Устройство вывода"
            testId="deafen-control"
            value={props.outputId ?? "default"}
            volume={props.outputVolume ?? 0.5}
            volumeLabel="Громкость вывода"
          />
          <VoiceDeviceControl
            active={props.snapshot.isCameraEnabled === true}
            disabled={
              props.busy ||
              props.connection.canStreamVideo !== true ||
              (props.devices.cameras?.length ?? 0) === 0 ||
              props.snapshot.connectionState !== ConnectionState.Connected
            }
            icon={props.snapshot.isCameraEnabled === true ? "camera" : "cameraOff"}
            actionLabel={
              props.connection.canStreamVideo === false
                ? "Роль не разрешает камеру"
                : props.connection.canStreamVideo !== true
                  ? "Сервер ещё не поддерживает публикацию камеры"
                : (props.devices.cameras?.length ?? 0) === 0
                  ? "Камера не найдена"
                : props.snapshot.connectionState !== ConnectionState.Connected
                  ? "Дождитесь подключения к голосовому серверу"
                  : props.snapshot.isCameraEnabled === true
                    ? "Выключить камеру"
                    : "Включить камеру"
            }
            menuLabel="Выбрать устройство: Камера"
            onToggle={props.onCamera ?? (() => undefined)}
            onValueChange={props.onCameraDevice ?? (() => undefined)}
            options={prioritizeSelectedDevice(
              cameraDeviceOptions(props.devices.cameras ?? []),
              props.cameraId ?? "default",
            )}
            selectLabel="Камера"
            testId="camera-control"
            value={props.cameraId ?? "default"}
          />
          <VoiceDockAction
            active={props.snapshot.isScreenSharing}
            disabled={
              props.busy ||
              props.connection.canStream === false ||
              props.snapshot.connectionState !== ConnectionState.Connected
            }
            icon="screen"
            label={
              props.connection.canStream === false
                ? "Роль не разрешает показ"
                : props.snapshot.connectionState !== ConnectionState.Connected
                  ? "Дождитесь подключения к голосовому серверу"
                  : props.snapshot.isScreenSharing
                    ? "Остановить показ"
                    : "Демонстрация"
            }
            onClick={props.onShare}
            testId="screen-share-control"
          />
          <VoiceDockAction
            danger
            icon="phone"
            label="Покинуть голосовой канал"
            onClick={props.onLeave}
            testId="leave-control"
          />
        </footer>
      </div>
    </section>
  );
}

function MediaTrackSwitcher({
  onSelect,
  selectedTrackId,
  tracks,
}: {
  onSelect(id: string): void;
  selectedTrackId: string;
  tracks: NonNullable<MediaSnapshot["videoTracks"]>;
}): React.JSX.Element {
  return (
    <div className="vui-room__media-switcher" aria-label="Переключение демонстрации и камер">
      {tracks.map((track) => (
        <VideoTrack
          compact
          key={track.id}
          onOpen={onSelect}
          selected={track.id === selectedTrackId}
          track={track}
        />
      ))}
    </div>
  );
}

function VideoTrack({
  compact = false,
  expanded = false,
  onOpen,
  selected = false,
  track,
}: {
  compact?: boolean;
  expanded?: boolean;
  onOpen?(id: string): void;
  selected?: boolean;
  track: NonNullable<MediaSnapshot["videoTracks"]>[number];
}): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.track.attach(element);
    return () => {
      track.track.detach(element);
    };
  }, [track.track]);
  const content = (
    <>
      <video
        autoPlay
        className="vui-room__camera-video"
        data-source={track.source}
        muted={track.isLocal}
        playsInline
        ref={ref}
      />
      <div className="vui-room__camera-label">
        <span>{track.participantDisplayName}</span>
        {track.source === "screen" ? <Badge tone="primary">Демонстрация экрана</Badge> : null}
      </div>
    </>
  );
  if (!onOpen)
    return (
      <div
        className="vui-room__camera-tile"
        data-compact={compact || undefined}
        data-expanded={expanded || undefined}
        data-stage={expanded || undefined}
      >
        {content}
      </div>
    );
  return (
    <button
      aria-label={`Открыть ${track.source === "camera" ? "камеру" : "демонстрацию экрана"}: ${track.participantDisplayName}`}
      className="vui-room__camera-tile"
      data-compact={compact || undefined}
      data-expanded={expanded || undefined}
      data-selected={selected || undefined}
      onClick={() => onOpen(track.id)}
      type="button"
    >
      {content}
    </button>
  );
}

interface VoiceDockActionProps {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick(): void;
  testId: string;
}

function VoiceDockAction({
  active = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onClick,
  testId,
}: VoiceDockActionProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="vui-room__dock-action"
      data-active={active || undefined}
      data-danger={danger || undefined}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
    </button>
  );
}

interface VoiceDeviceControlProps {
  active: boolean;
  actionLabel: string;
  disabled?: boolean;
  icon: Parameters<typeof Icon>[0]["name"];
  menuLabel: string;
  onToggle(): void;
  onValueChange(value: string): void;
  onVolumeChange?(value: number): void;
  options: Array<{ label: string; value: string }>;
  selectLabel: string;
  testId: string;
  value: string;
  volume?: number;
  volumeLabel?: string;
}

function prioritizeSelectedDevice<T extends { value: string }>(
  options: T[],
  selectedValue: string,
): T[] {
  const selected = options.find((option) => option.value === selectedValue);
  return selected
    ? [selected, ...options.filter((option) => option.value !== selectedValue)]
    : options;
}

function VoiceDeviceControl({
  active,
  actionLabel,
  disabled = false,
  icon,
  menuLabel,
  onToggle,
  onValueChange,
  onVolumeChange,
  options,
  selectLabel,
  testId,
  value,
  volume,
  volumeLabel,
}: VoiceDeviceControlProps): React.JSX.Element {
  return (
    <div className="vui-room__device-control">
      <div>
        <button
          aria-pressed={active}
          className="vui-room__device-main"
          data-active={active || undefined}
          data-testid={testId}
          disabled={disabled}
          onClick={onToggle}
          title={actionLabel}
          type="button"
        >
          <Icon name={icon} size={20} />
          <span className="vui-sr-only">{actionLabel}</span>
        </button>
        <Popover
          className="vui-room__device-popover"
          label={menuLabel}
          placement="top-end"
          trigger={
            <span className="vui-room__device-menu">
              <Icon name="chevronDown" size={16} />
              <span className="vui-sr-only">{menuLabel}</span>
            </span>
          }
        >
          {({ close }) => (
          <div className="vui-room__devices">
            <div aria-label={selectLabel} className="vui-room__device-options" role="listbox">
              {options.map((option) => (
                <button
                  aria-selected={option.value === value}
                  key={option.value}
                  onClick={() => {
                    onValueChange(option.value);
                    close();
                  }}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {option.value === value ? <Icon name="check" size={16} /> : null}
                </button>
              ))}
            </div>
            {onVolumeChange !== undefined && volume !== undefined && volumeLabel !== undefined ? (
              <Slider
                label={volumeLabel}
                max={100}
                min={0}
                onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                value={Math.round(volume * 100)}
                valueLabel={`${Math.round(volume * 100)}%`}
              />
            ) : null}
          </div>
          )}
        </Popover>
      </div>
    </div>
  );
}

function ScreenTrack({
  annotationEditable,
  annotations,
  audioAvailable,
  fullscreen,
  muted,
  onAnnotationClear,
  onAnnotationStroke,
  onAnnotationUndo,
  onMute,
  onOpen,
  onVolume,
  track,
  volume,
}: {
  annotationEditable: boolean;
  annotations: ScreenAnnotationStroke[];
  audioAvailable: boolean;
  fullscreen: boolean;
  muted: boolean;
  onAnnotationClear(): void;
  onAnnotationStroke(stroke: ScreenAnnotationStroke): void;
  onAnnotationUndo(): void;
  onMute(): void;
  onOpen(): void;
  onVolume(value: number): void;
  track: RemoteTrack | LocalTrack;
  volume: number;
}): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  const [resolution, setResolution] = useState("Определяем качество…");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [annotationColor, setAnnotationColor] = useState("#22d3ee");
  const [annotationSize, setAnnotationSize] = useState(4);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  useEffect(() => {
    if (menu === null) return undefined;
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const updateResolution = (): void => {
    const element = ref.current;
    if (element?.videoWidth && element.videoHeight)
      setResolution(`${element.videoWidth} × ${element.videoHeight}`);
  };
  return (
    <div
      className="vui-room__video-frame"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          drawing ||
          annotationEditable ||
          target.closest("button, input, label, select") !== null
        )
          return;
        onOpen();
      }}
      onContextMenu={(event) => {
        if (!audioAvailable) return;
        event.preventDefault();
        setMenu({
          x: Math.min(event.clientX, window.innerWidth - 280),
          y: Math.min(event.clientY, window.innerHeight - 180),
        });
      }}
    >
      <video
        ref={ref}
        autoPlay
        className="vui-room__video"
        onLoadedMetadata={updateResolution}
        onResize={updateResolution}
        playsInline
      />
      <ScreenAnnotationCanvas
        active={drawing}
        color={annotationColor}
        editable={annotationEditable}
        onStroke={onAnnotationStroke}
        size={annotationSize}
        strokes={annotations}
        videoRef={ref}
      />
      {annotationEditable ? (
        <div
          aria-label="Рисование поверх демонстрации"
          className="vui-room__annotation-tools"
          role="toolbar"
        >
          <button
            aria-pressed={drawing}
            className="vui-room__annotation-toggle"
            onClick={() => setDrawing((value) => !value)}
            type="button"
          >
            {drawing ? "Готово" : "Рисовать"}
          </button>
          {drawing ? (
            <>
              <span
                aria-label="Цвет линии"
                className="vui-room__annotation-colors"
              >
                {["#22d3ee", "#8b5cf6", "#facc15", "#fb7185", "#f8fafc"].map(
                  (color) => (
                    <button
                      aria-label={`Цвет ${color}`}
                      aria-pressed={annotationColor === color}
                      key={color}
                      onClick={() => setAnnotationColor(color)}
                      style={{ backgroundColor: color }}
                      type="button"
                    />
                  ),
                )}
              </span>
              <label className="vui-room__annotation-size">
                Толщина
                <select
                  onChange={(event) =>
                    setAnnotationSize(Number(event.target.value))
                  }
                  value={annotationSize}
                >
                  <option value={2}>Тонкая</option>
                  <option value={4}>Средняя</option>
                  <option value={8}>Толстая</option>
                </select>
              </label>
              <button
                disabled={annotations.length === 0}
                onClick={onAnnotationUndo}
                type="button"
              >
                Отменить
              </button>
              <button
                disabled={annotations.length === 0}
                onClick={onAnnotationClear}
                type="button"
              >
                Очистить
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <span className="vui-room__stream-quality">{resolution} · 60 FPS</span>
      <IconButton
        className="vui-room__fullscreen"
        icon="screen"
        label={fullscreen ? "Выйти из полноэкранного режима" : "Открыть полноэкранный режим"}
        onClick={onOpen}
        type="button"
      />
      {menu && audioAvailable
        ? createPortal(
            <div
              className="vui-room__stream-context"
              ref={menuRef}
              role="menu"
              style={{ left: menu.x, top: menu.y }}
            >
              <strong>Звук демонстрации</strong>
              <button
                aria-pressed={muted}
                onClick={onMute}
                role="menuitem"
                type="button"
              >
                <Icon name={muted ? "volumeOff" : "volume"} size={17} />
                {muted ? "Включить звук" : "Отключить звук"}
              </button>
              <Slider
                label="Громкость демонстрации"
                max={100}
                min={0}
                onChange={(event) => onVolume(Number(event.target.value) / 100)}
                value={muted ? 0 : Math.round(volume * 100)}
                valueLabel={`${muted ? 0 : Math.round(volume * 100)}%`}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
