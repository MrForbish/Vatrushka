import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionState, type LocalTrack, type RemoteTrack } from 'livekit-client';

import type { RoomConnection } from '@vatrushka/shared';

import { audioDeviceOptions } from '../../audio-devices';
import type { MediaSnapshot, ParticipantView } from '../../media';
import {
  Badge,
  Icon,
  IconButton,
  Popover,
  Select,
  Slider,
  VoiceControlButton,
  VoiceControlDock,
  VoiceParticipantStrip,
  VoiceParticipantTile,
  type VoiceParticipantViewModel,
} from '../../ui';
import './room-view.css';

interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

export interface RoomViewProps {
  connection: RoomConnection;
  snapshot: MediaSnapshot;
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  busy: boolean;
  error: string | null;
  participantNames?: Record<string, string> | undefined;
  onMute(): void;
  onShare(): void;
  onCopy(): void;
  onLeave(): void;
  onKick(identity: string): void;
  onMicrophone(value: string): void;
  onOutput(value: string): void;
  onRefreshDevices(): void;
  onStartAudio(): void;
  onScreenAudioMute(): void;
  onScreenAudioVolume(value: number): void;
  onParticipantMute(identity: string, muted: boolean): void;
  onParticipantVolume(identity: string, volume: number): void;
}

function participantModel(participant: ParticipantView, participantNames: Record<string, string> = {}): VoiceParticipantViewModel {
  const userId = /^user_([^_]+)_/u.exec(participant.identity)?.[1];
  return {
    id: participant.identity,
    name: userId ? participantNames[userId] ?? participant.displayName : participant.displayName,
    isLocal: participant.isLocal,
    isMuted: participant.isMuted,
    isSpeaking: participant.isSpeaking,
    isScreenSharing: participant.isScreenSharing,
    locallyMuted: participant.locallyMuted,
    volume: participant.volume,
    audioLevel: participant.audioLevel,
    statusLabel: participant.isOwner ? 'Владелец сервера' : participant.connectionQuality,
    ...(participant.platformRole === 'owner' ? { badge: 'founder' as const } : participant.platformRole === 'admin' ? { badge: 'admin' as const } : {}),
  };
}

export function RoomView(props: RoomViewProps): React.JSX.Element {
  const reconnecting = props.snapshot.connectionState === ConnectionState.Reconnecting || props.snapshot.connectionState === ConnectionState.SignalReconnecting;
  const participantModels = props.snapshot.participants.map((participant) => participantModel(participant, props.participantNames));
  const screenSharerName = participantModels.find((participant) => participant.isScreenSharing)?.name ?? props.snapshot.screenSharerName ?? 'участник';
  const stripParticipants = participantModels;
  const participantActions = {
    canKick: props.connection.isOwner,
    onKick: props.onKick,
    onLocalMute: props.onParticipantMute,
    onVolume: props.onParticipantVolume,
  };

  return (
    <section className="vui-room">
      <header className="vui-room__topbar"><div><span className="vui-room__connection" data-state={props.snapshot.connectionState} /><strong>{reconnecting ? 'Переподключение…' : props.snapshot.connectionState === ConnectionState.Connected ? 'Голосовая связь активна' : 'Подключение…'}</strong></div><span><Icon name="users" size={15} />{props.snapshot.participants.length} в канале</span></header>
        <div className="vui-room__content">
          {props.snapshot.screenTrack === null
            ? <div className="vui-room__voice-stage">{participantModels.length === 0 ? <div className="vui-room__empty"><Icon name="voice" size={38} /><h1>Ожидаем участников</h1></div> : <div className="vui-room__participant-grid">{participantModels.map((participant) => <VoiceParticipantTile {...participantActions} key={participant.id} participant={participant} />)}</div>}</div>
            : <div className="vui-room__stream-stage"><div className="vui-room__stream"><ScreenTrack audioAvailable={props.snapshot.hasScreenShareAudio && !props.snapshot.screenShareIsLocal} muted={props.snapshot.screenShareAudioMuted} onMute={props.onScreenAudioMute} onVolume={props.onScreenAudioVolume} track={props.snapshot.screenTrack} volume={props.snapshot.screenShareAudioVolume} /><div className="vui-room__stream-label"><Badge tone="danger">LIVE</Badge><span>Экран показывает <strong>{screenSharerName}</strong></span></div></div><VoiceParticipantStrip {...participantActions} participants={stripParticipants} /></div>}
        </div>
        {!props.snapshot.canPlayAudio ? <button className="vui-room__audio-gate" onClick={props.onStartAudio}>Нажмите, чтобы включить звук участников</button> : null}
        {props.error || props.snapshot.error ? <div className="vui-room__error" role="alert">{props.error ?? props.snapshot.error}</div> : null}
        <div className="vui-room__controls"><VoiceControlDock><VoiceControlButton active={props.snapshot.isMuted} disabled={props.connection.canSpeak === false} icon={props.snapshot.isMuted ? 'micOff' : 'mic'} label={props.connection.canSpeak === false ? 'Роль не разрешает говорить' : props.snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={props.onMute} testId="mute-control" /><div className="vui-room__device-popover"><Popover label="Выбор аудиоустройств" trigger={<span className="vui-room__device-trigger"><UiDeviceIcon /><small>Устройства</small></span>}><div className="vui-room__devices"><header><span><strong>Аудиоустройства</strong><small>Выбор применяется сразу</small></span><IconButton icon="refresh" label="Обновить список аудиоустройств" onClick={props.onRefreshDevices} size="sm" type="button" /></header><Select label="Устройство ввода" onValueChange={props.onMicrophone} options={audioDeviceOptions(props.devices.inputs, 'input')} value={props.microphoneId ?? 'default'} /><Select label="Устройство вывода" onValueChange={props.onOutput} options={audioDeviceOptions(props.devices.outputs, 'output')} value={props.outputId ?? 'default'} /></div></Popover></div><VoiceControlButton active={props.snapshot.isScreenSharing} disabled={props.busy || props.connection.canStream === false || props.snapshot.connectionState !== ConnectionState.Connected} icon="screen" label={props.connection.canStream === false ? 'Роль не разрешает показ' : props.snapshot.connectionState !== ConnectionState.Connected ? 'Дождитесь подключения к голосовому серверу' : props.snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} onClick={props.onShare} testId="screen-share-control" /><VoiceControlButton icon="copy" label="Пригласить" onClick={props.onCopy} testId="copy-invite-control" /><VoiceControlButton danger icon="logout" label="Выйти" onClick={props.onLeave} testId="leave-control" /></VoiceControlDock></div>
    </section>
  );
}

function UiDeviceIcon(): React.JSX.Element {
  return <span aria-hidden="true" className="vui-room__device-icon"><Icon name="settings" size={20} /></span>;
}

export interface VoiceConnectionPanelProps {
  channelName: string;
  snapshot: MediaSnapshot;
  canShare: boolean;
  onOpen(): void;
  onMute(): void;
  onShare(): void;
  onLeave(): void;
}

export function VoiceConnectionPanel({ canShare, channelName, onLeave, onMute, onOpen, onShare, snapshot }: VoiceConnectionPanelProps): React.JSX.Element {
  const connected = snapshot.connectionState === ConnectionState.Connected;
  return <section className="vui-voice-connection"><button className="vui-voice-connection__summary" onClick={onOpen} type="button"><span className="vui-room__connection" data-state={snapshot.connectionState} /><span><strong>{connected ? 'Голосовая связь подключена' : 'Подключение…'}</strong><small>{channelName} · {snapshot.participants.length} участников</small></span></button><div><IconButton active={snapshot.isMuted} icon={snapshot.isMuted ? 'micOff' : 'mic'} label={snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={onMute} size="sm" type="button" /><IconButton active={snapshot.isScreenSharing} disabled={!canShare} icon="screen" label={snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} onClick={onShare} size="sm" type="button" /><IconButton className="vui-voice-connection__leave" icon="logout" label="Выйти из голосового канала" onClick={onLeave} size="sm" type="button" /></div></section>;
}

function ScreenTrack({ audioAvailable, muted, onMute, onVolume, track, volume }: { audioAvailable: boolean; muted: boolean; onMute(): void; onVolume(value: number): void; track: RemoteTrack | LocalTrack; volume: number }): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState('Определяем качество…');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  useEffect(() => {
    if (menu === null) return undefined;
    const close = (event: MouseEvent): void => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  const updateResolution = (): void => {
    const element = ref.current;
    if (element?.videoWidth && element.videoHeight) setResolution(`${element.videoWidth} × ${element.videoHeight}`);
  };
  return <div className="vui-room__video-frame" ref={containerRef} onContextMenu={(event) => { if (!audioAvailable) return; event.preventDefault(); setMenu({ x: Math.min(event.clientX, window.innerWidth - 280), y: Math.min(event.clientY, window.innerHeight - 180) }); }}><video ref={ref} autoPlay className="vui-room__video" onLoadedMetadata={updateResolution} onResize={updateResolution} playsInline /><span className="vui-room__stream-quality">{resolution} · 60 FPS</span><IconButton className="vui-room__fullscreen" icon="screen" label="Открыть на весь экран" onClick={() => void containerRef.current?.requestFullscreen()} type="button" />{menu && audioAvailable ? createPortal(<div className="vui-room__stream-context" ref={menuRef} role="menu" style={{ left: menu.x, top: menu.y }}><strong>Звук демонстрации</strong><button aria-pressed={muted} onClick={onMute} role="menuitem" type="button"><Icon name={muted ? 'volumeOff' : 'volume'} size={17} />{muted ? 'Включить звук' : 'Отключить звук'}</button><Slider label="Громкость демонстрации" max={100} min={0} onChange={(event) => onVolume(Number(event.target.value) / 100)} value={muted ? 0 : Math.round(volume * 100)} valueLabel={`${muted ? 0 : Math.round(volume * 100)}%`} /></div>, document.body) : null}</div>;
}
