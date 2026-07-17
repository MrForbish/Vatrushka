import { useEffect, useRef, type ReactNode } from 'react';
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

function participantModel(participant: ParticipantView): VoiceParticipantViewModel {
  return {
    id: participant.identity,
    name: participant.displayName,
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
  const participantModels = props.snapshot.participants.map(participantModel);
  const activeParticipant = props.snapshot.participants.find((participant) => participant.isSpeaking && !participant.isMuted) ?? props.snapshot.participants.find((participant) => participant.isLocal) ?? props.snapshot.participants[0] ?? null;
  const activeModel = activeParticipant === null ? null : participantModel(activeParticipant);
  const stripParticipants = props.snapshot.screenTrack === null && activeParticipant !== null ? participantModels.filter((participant) => participant.id !== activeParticipant.identity) : participantModels;
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
            ? <div className="vui-room__voice-stage">{activeModel === null ? <div className="vui-room__empty"><Icon name="voice" size={38} /><h1>Ожидаем участников</h1></div> : <VoiceParticipantTile {...participantActions} featured participant={activeModel} />}{stripParticipants.length === 0 ? null : <VoiceParticipantStrip {...participantActions} participants={stripParticipants} />}</div>
            : <div className="vui-room__stream-stage"><div className="vui-room__stream"><ScreenTrack track={props.snapshot.screenTrack} /><div className="vui-room__stream-label"><Badge tone="danger">LIVE</Badge><span>Экран показывает <strong>{props.snapshot.screenSharerName ?? 'участник'}</strong></span></div>{props.snapshot.hasScreenShareAudio ? <div className="vui-room__stream-audio"><div className="vui-room__stream-audio-label"><Icon name="volume" size={18} /><span><strong>Звук трансляции</strong><small>Громкость меняется только для вас</small></span></div><div className="vui-room__stream-audio-controls"><button aria-label={props.snapshot.screenShareAudioMuted ? 'Включить звук трансляции' : 'Выключить звук трансляции'} aria-pressed={props.snapshot.screenShareAudioMuted} onClick={props.onScreenAudioMute} type="button"><Icon name={props.snapshot.screenShareAudioMuted ? 'volumeOff' : 'volume'} size={18} /></button><Slider label="Громкость трансляции" max={100} min={0} onChange={(event) => props.onScreenAudioVolume(Number(event.target.value) / 100)} value={props.snapshot.screenShareAudioMuted ? 0 : Math.round(props.snapshot.screenShareAudioVolume * 100)} valueLabel={`${props.snapshot.screenShareAudioMuted ? 0 : Math.round(props.snapshot.screenShareAudioVolume * 100)}%`} /></div></div> : null}</div><VoiceParticipantStrip {...participantActions} participants={stripParticipants} /></div>}
        </div>
        {!props.snapshot.canPlayAudio ? <button className="vui-room__audio-gate" onClick={props.onStartAudio}>Нажмите, чтобы включить звук участников</button> : null}
        {props.error || props.snapshot.error ? <div className="vui-room__error" role="alert">{props.error ?? props.snapshot.error}</div> : null}
        <div className="vui-room__controls"><VoiceControlDock><VoiceControlButton active={props.snapshot.isMuted} disabled={props.connection.canSpeak === false} icon={props.snapshot.isMuted ? 'micOff' : 'mic'} label={props.connection.canSpeak === false ? 'Роль не разрешает говорить' : props.snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={props.onMute} testId="mute-control" /><div className="vui-room__device-popover"><Popover label="Выбор аудиоустройств" trigger={<span className="vui-room__device-trigger"><UiDeviceIcon /><small>Устройства</small></span>}><div className="vui-room__devices"><header><span><strong>Аудиоустройства</strong><small>Выбор применяется сразу</small></span><IconButton icon="refresh" label="Обновить список аудиоустройств" onClick={props.onRefreshDevices} size="sm" type="button" /></header><Select label="Устройство ввода" onValueChange={props.onMicrophone} options={audioDeviceOptions(props.devices.inputs, 'input')} value={props.microphoneId ?? 'default'} /><Select label="Устройство вывода" onValueChange={props.onOutput} options={audioDeviceOptions(props.devices.outputs, 'output')} value={props.outputId ?? 'default'} /></div></Popover></div><VoiceControlButton active={props.snapshot.isScreenSharing} disabled={props.busy || props.connection.canStream === false} icon="screen" label={props.connection.canStream === false ? 'Роль не разрешает показ' : props.snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} onClick={props.onShare} testId="screen-share-control" /><VoiceControlButton icon="copy" label="Пригласить" onClick={props.onCopy} testId="copy-invite-control" /><VoiceControlButton danger icon="logout" label="Выйти" onClick={props.onLeave} testId="leave-control" /></VoiceControlDock></div>
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

function ScreenTrack({ track }: { track: RemoteTrack | LocalTrack }): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <video ref={ref} autoPlay className="vui-room__video" playsInline />;
}
