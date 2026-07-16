import { useEffect, useRef, type ReactNode } from 'react';
import { ConnectionState, type LocalTrack, type RemoteTrack } from 'livekit-client';

import type { RoomConnection } from '@vatrushka/shared';

import type { MediaSnapshot, ParticipantView } from '../../media';
import {
  Badge,
  Button,
  Icon,
  IconButton,
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
  locked: boolean;
  busy: boolean;
  error: string | null;
  onMute(): void;
  onShare(): void;
  onCopy(): void;
  onLeave(): void;
  onLock(): void;
  onClose(): void;
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
    statusLabel: participant.isOwner ? 'Владелец комнаты' : participant.isGuest ? 'Гость' : participant.connectionQuality,
    ...(participant.platformRole === 'owner' ? { badge: 'founder' as const } : participant.platformRole === 'admin' ? { badge: 'admin' as const } : participant.isGuest ? { badge: 'guest' as const } : {}),
  };
}

function deviceOptions(devices: MediaDeviceInfo[], label: string): Array<{ value: string; label: string }> {
  return [{ value: 'default', label: 'Системное устройство' }, ...devices.filter((device) => device.deviceId !== 'default').map((device, index) => ({ value: device.deviceId, label: device.label || `${label} ${index + 1}` }))];
}

export function RoomView(props: RoomViewProps): React.JSX.Element {
  const reconnecting = props.snapshot.connectionState === ConnectionState.Reconnecting || props.snapshot.connectionState === ConnectionState.SignalReconnecting;
  const isChannel = props.connection.contextType === 'channel';
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
    <main className="vui-room">
      <aside className="vui-room__sidebar">
        <div className="vui-room__brand"><span aria-hidden="true">В</span><strong>Ватрушка</strong></div>
        <section className="vui-room__meta"><Badge tone={isChannel ? 'primary' : 'neutral'}>{isChannel ? 'Голосовой канал' : 'Временная комната'}</Badge><span>{isChannel ? 'Код сервера' : 'Код комнаты'}</span><div><strong>{props.connection.code}</strong><Button aria-label="Копировать приглашение" icon="copy" onClick={props.onCopy} size="sm" type="button" variant="quiet" /></div><p><Icon name="users" size={16} />{props.snapshot.participants.length}{isChannel ? ' участников' : ' / 5 участников'}</p></section>
        <section className="vui-room__roster"><header><span>В канале</span><Badge>{props.snapshot.participants.length}</Badge></header>{participantModels.map((participant) => <div data-speaking={participant.isSpeaking || undefined} key={participant.id}><span aria-hidden="true">{participant.name.slice(0, 1).toUpperCase()}</span><span><strong>{participant.name}{participant.isLocal === true ? ' (вы)' : ''}</strong><small>{participant.isSpeaking === true ? 'Говорит' : participant.statusLabel}</small></span><Icon name={participant.isMuted === true ? 'micOff' : 'mic'} size={15} /></div>)}</section>
        {props.connection.isOwner && !isChannel ? <section className="vui-room__owner"><span>Управление комнатой</span><Button disabled={props.busy} icon={props.locked ? 'invite' : 'lock'} onClick={props.onLock} size="sm" variant="secondary">{props.locked ? 'Открыть вход' : 'Закрыть вход'}</Button><Button disabled={props.busy} icon="close" onClick={props.onClose} size="sm" variant="danger">Завершить комнату</Button></section> : null}
      </aside>

      <section className="vui-room__stage">
        <header className="vui-room__topbar"><div><span className="vui-room__connection" data-state={props.snapshot.connectionState} /><strong>{reconnecting ? 'Переподключение…' : props.snapshot.connectionState === ConnectionState.Connected ? 'Связь установлена' : 'Подключение…'}</strong></div><span>{isChannel ? 'Голосовой канал сервера' : `Комната ${props.connection.code}`}</span></header>
        <div className="vui-room__content">
          {props.snapshot.screenTrack === null
            ? <div className="vui-room__voice-stage">{activeModel === null ? <div className="vui-room__empty"><Icon name="voice" size={38} /><h1>Ожидаем участников</h1></div> : <VoiceParticipantTile {...participantActions} featured participant={activeModel} />}{stripParticipants.length === 0 ? null : <VoiceParticipantStrip {...participantActions} participants={stripParticipants} />}</div>
            : <div className="vui-room__stream-stage"><div className="vui-room__stream"><ScreenTrack track={props.snapshot.screenTrack} /><div className="vui-room__stream-label"><Badge tone="danger">LIVE</Badge><span>Экран показывает <strong>{props.snapshot.screenSharerName ?? 'участник'}</strong></span></div>{props.snapshot.hasScreenShareAudio ? <div className="vui-room__stream-audio"><div className="vui-room__stream-audio-label"><Icon name="volume" size={18} /><span><strong>Звук трансляции</strong><small>Громкость меняется только для вас</small></span></div><div className="vui-room__stream-audio-controls"><button aria-label={props.snapshot.screenShareAudioMuted ? 'Включить звук трансляции' : 'Выключить звук трансляции'} aria-pressed={props.snapshot.screenShareAudioMuted} onClick={props.onScreenAudioMute} type="button"><Icon name={props.snapshot.screenShareAudioMuted ? 'volumeOff' : 'volume'} size={18} /></button><Slider label="Громкость трансляции" max={100} min={0} onChange={(event) => props.onScreenAudioVolume(Number(event.target.value) / 100)} value={props.snapshot.screenShareAudioMuted ? 0 : Math.round(props.snapshot.screenShareAudioVolume * 100)} valueLabel={`${props.snapshot.screenShareAudioMuted ? 0 : Math.round(props.snapshot.screenShareAudioVolume * 100)}%`} /></div></div> : null}</div><VoiceParticipantStrip {...participantActions} participants={stripParticipants} /></div>}
        </div>
        {!props.snapshot.canPlayAudio ? <button className="vui-room__audio-gate" onClick={props.onStartAudio}>Нажмите, чтобы включить звук участников</button> : null}
        {props.error || props.snapshot.error ? <div className="vui-room__error" role="alert">{props.error ?? props.snapshot.error}</div> : null}
        <div className="vui-room__controls"><VoiceControlDock><VoiceControlButton active={props.snapshot.isMuted} disabled={props.connection.canSpeak === false} icon={props.snapshot.isMuted ? 'micOff' : 'mic'} label={props.connection.canSpeak === false ? 'Роль не разрешает говорить' : props.snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={props.onMute} testId="mute-control" /><div className="vui-room__devices"><div><strong>Аудиоустройства</strong><IconButton icon="refresh" label="Обновить список аудиоустройств" onClick={props.onRefreshDevices} size="sm" type="button" /></div><Select label="Устройство ввода" onChange={(event) => props.onMicrophone(event.target.value)} options={deviceOptions(props.devices.inputs, 'Микрофон')} value={props.microphoneId ?? 'default'} /><Select label="Устройство вывода" onChange={(event) => props.onOutput(event.target.value)} options={deviceOptions(props.devices.outputs, 'Динамики')} value={props.outputId ?? 'default'} /></div><VoiceControlButton active={props.snapshot.isScreenSharing} disabled={props.busy || props.connection.canStream === false} icon="screen" label={props.connection.canStream === false ? 'Роль не разрешает показ' : props.snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} onClick={props.onShare} testId="screen-share-control" /><VoiceControlButton icon="copy" label="Пригласить" onClick={props.onCopy} testId="copy-invite-control" /><VoiceControlButton danger icon="logout" label="Выйти" onClick={props.onLeave} testId="leave-control" /></VoiceControlDock></div>
      </section>
    </main>
  );
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
