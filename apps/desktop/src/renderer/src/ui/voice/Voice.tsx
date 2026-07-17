import type { CSSProperties, ReactNode } from 'react';

import { AudioLevelMeter, Avatar, Badge, Icon, Slider, type IconName } from '../primitives';
import './voice.css';

export interface VoiceParticipantViewModel {
  id: string;
  name: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
  locallyMuted?: boolean;
  volume?: number;
  audioLevel?: number;
  statusLabel?: string;
  badge?: 'admin' | 'founder';
}

export interface VoiceParticipantTileProps {
  participant: VoiceParticipantViewModel;
  featured?: boolean;
  canKick?: boolean;
  onKick?: (id: string) => void;
  onLocalMute?: (id: string, muted: boolean) => void;
  onVolume?: (id: string, volume: number) => void;
  showControls?: boolean;
}

export function VoiceParticipantTile({ canKick = false, featured = false, onKick, onLocalMute, onVolume, participant, showControls = true }: VoiceParticipantTileProps): React.JSX.Element {
  const audioLevel = Math.max(0, Math.min(1, participant.audioLevel ?? 0));
  const volume = participant.locallyMuted === true ? 0 : participant.volume ?? 1;
  return (
    <article className="vui-voice-participant" data-featured={featured || undefined} data-speaking={participant.isSpeaking || undefined} style={{ '--voice-level': audioLevel } as CSSProperties}>
      <div className="vui-voice-participant__portrait"><Avatar name={participant.name} size="lg" status={participant.isSpeaking === true ? 'online' : 'offline'} /><span aria-hidden="true" className="vui-voice-participant__pulse" /></div>
      <div className="vui-voice-participant__identity"><span><strong>{participant.name}{participant.isLocal === true ? ' (вы)' : ''}</strong>{participant.badge === 'founder' ? <Badge tone="founder">DEV</Badge> : participant.badge === 'admin' ? <Badge tone="primary">ADMIN</Badge> : null}</span><small>{participant.isSpeaking === true ? 'Говорит' : participant.statusLabel ?? 'В голосовом канале'}</small></div>
      <div className="vui-voice-participant__signals"><AudioLevelMeter label={`Уровень голоса ${participant.name}`} segments={featured ? 16 : 8} value={audioLevel} />{participant.isScreenSharing === true ? <Badge tone="success"><Icon name="screen" size={12} /> LIVE</Badge> : null}<span aria-label={participant.isMuted === true ? 'Микрофон выключен' : 'Микрофон включён'} role="img"><Icon name={participant.isMuted === true ? 'micOff' : 'mic'} size={17} /></span></div>
      {participant.isLocal === true || !showControls ? null : <div className="vui-voice-participant__controls"><button aria-label={participant.locallyMuted === true ? 'Включить локально' : 'Заглушить локально'} aria-pressed={participant.locallyMuted === true} onClick={() => onLocalMute?.(participant.id, participant.locallyMuted !== true)} type="button"><Icon name={participant.locallyMuted === true ? 'volumeOff' : 'volume'} size={16} /><span>{participant.locallyMuted === true ? 'Включить локально' : 'Заглушить локально'}</span></button><Slider className="vui-slider--compact" label={`Громкость ${participant.name}`} max={100} min={0} onChange={(event) => onVolume?.(participant.id, Number(event.target.value) / 100)} value={Math.round(volume * 100)} valueLabel={`${Math.round(volume * 100)}%`} />{canKick && onKick !== undefined ? <button aria-label={`Исключить ${participant.name}`} className="vui-voice-participant__kick" onClick={() => onKick(participant.id)} type="button"><Icon name="close" size={15} /><span>Исключить</span></button> : null}</div>}
    </article>
  );
}

export interface VoiceParticipantStripProps extends Omit<VoiceParticipantTileProps, 'featured' | 'participant'> {
  participants: VoiceParticipantViewModel[];
}

export function VoiceParticipantStrip({ participants, ...actions }: VoiceParticipantStripProps): React.JSX.Element {
  return <div aria-label="Участники голосового канала" className="vui-voice-strip">{participants.map((participant) => <VoiceParticipantTile {...actions} key={participant.id} participant={participant} />)}</div>;
}

export interface VoiceControlButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
  onClick: () => void;
}

export function VoiceControlButton({ active = false, danger = false, disabled = false, icon, label, onClick, testId }: VoiceControlButtonProps): React.JSX.Element {
  return <button aria-label={label} aria-pressed={active} className="vui-voice-control" data-active={active || undefined} data-danger={danger || undefined} data-testid={testId} disabled={disabled} onClick={onClick} title={label} type="button"><span><Icon name={icon} size={20} /></span><small>{label}</small></button>;
}

export function VoiceControlDock({ children }: { children: ReactNode }): React.JSX.Element {
  return <footer aria-label="Управление голосовым каналом" className="vui-voice-control-dock">{children}</footer>;
}
