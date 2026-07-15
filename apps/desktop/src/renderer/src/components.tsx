import { useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ConnectionState } from 'livekit-client';
import type { LocalTrack, RemoteTrack } from 'livekit-client';

import {
  colorForIdentity,
  initials,
  type DesktopSourceInfo,
  type PublicUser,
  type RoomConnection,
} from '@vatrushka/shared';

import type { MediaSnapshot, ParticipantView } from './media.js';

type IconName = 'mic' | 'micOff' | 'screen' | 'copy' | 'leave' | 'lock' | 'unlock' | 'close' | 'users' | 'spark' | 'headphones' | 'chevron';

export function Icon({ name }: { name: IconName }): ReactNode {
  const paths: Record<IconName, ReactNode> = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    micOff: <><path d="m4 4 16 16M9 9v2a3 3 0 0 0 4.8 2.4M15 9V6a3 3 0 0 0-5.1-2.1M18.4 15.5A7 7 0 0 0 19 11M5 11a7 7 0 0 0 10.7 5.9M12 18v3M9 21h6" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    leave: <><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>,
    close: <><path d="M5 5l14 14M19 5 5 19" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2M18 19h1a2 2 0 0 0 2-2v-3h-3v5ZM6 19H5a2 2 0 0 1-2-2v-3h3v5Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Brand(): ReactNode {
  return <div className="brand"><span className="brandMark" aria-hidden="true"><span /></span><span>Ватрушка</span></div>;
}

interface AuthPanelProps {
  stage: 'email' | 'otp';
  email: string;
  code: string;
  retrySeconds: number;
  busy: boolean;
  error: string | null;
  onEmailChange(value: string): void;
  onCodeChange(value: string): void;
  onRequest(): void;
  onVerify(): void;
  onBack(): void;
}

export function AuthPanel(props: AuthPanelProps): ReactNode {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (props.stage === 'email') props.onRequest(); else props.onVerify();
  };
  return <main className="centerPage">
    <section className="authCard" aria-labelledby="auth-title">
      <Brand />
      <div className="eyebrow">Пространство для разговора</div>
      <h1 id="auth-title">{props.stage === 'email' ? 'Войдите без пароля' : 'Проверьте почту'}</h1>
      <p className="lede">{props.stage === 'email' ? 'Мы отправим короткий одноразовый код. Никаких паролей и лишних профилей.' : <>Шестизначный код отправлен на <strong>{props.email}</strong></>}</p>
      <form onSubmit={submit} className="stack">
        {props.stage === 'email' ? <label className="field"><span>Email</span><input type="email" autoComplete="email" autoFocus value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="you@example.com" /></label> : <label className="field"><span>Код из письма</span><input className="otpInput" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={props.code} onChange={(event) => props.onCodeChange(event.target.value.replace(/\D/gu, '').slice(0, 6))} placeholder="••••••" /></label>}
        {props.error && <div className="errorBanner" role="alert">{props.error}</div>}
        <button className="primaryButton" type="submit" disabled={props.busy || (props.stage === 'otp' && props.code.length !== 6)}>{props.busy ? 'Подождите…' : props.stage === 'email' ? 'Получить код' : 'Продолжить'} <Icon name="chevron" /></button>
      </form>
      {props.stage === 'otp' && <div className="authLinks"><button className="textButton" onClick={props.onBack}>Изменить email</button><button className="textButton" onClick={props.onRequest} disabled={props.retrySeconds > 0 || props.busy}>{props.retrySeconds > 0 ? `Отправить снова через ${props.retrySeconds} с` : 'Отправить снова'}</button></div>}
      <p className="privacyNote">Код действует 10 минут. Мы не рассылаем рекламу.</p>
    </section>
  </main>;
}

export function ProfilePanel({ value, busy, error, onChange, onSave }: { value: string; busy: boolean; error: string | null; onChange(value: string): void; onSave(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard"><Brand /><div className="eyebrow">Последний штрих</div><h1>Как к вам обращаться?</h1><p className="lede">Это имя увидят участники комнаты. Его всегда можно изменить позднее.</p><form className="stack" onSubmit={(event) => { event.preventDefault(); onSave(); }}><label className="field"><span>Отображаемое имя</span><input autoFocus value={value} minLength={2} maxLength={30} onChange={(event) => onChange(event.target.value)} placeholder="Например, Алекс" /></label>{error && <div className="errorBanner" role="alert">{error}</div>}<button className="primaryButton" disabled={busy || value.trim().length < 2}>Сохранить <Icon name="chevron" /></button></form></section></main>;
}

interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

interface HomePanelProps {
  user: PublicUser;
  version: string;
  roomCode: string;
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  busy: boolean;
  error: string | null;
  onRoomCode(value: string): void;
  onCreate(): void;
  onJoin(): void;
  onLogout(): void;
  onMicrophone(value: string): void;
  onOutput(value: string): void;
}

export function HomePanel(props: HomePanelProps): ReactNode {
  const name = props.user.displayName ?? props.user.email;
  return <main className="homePage">
    <header className="topbar"><Brand /><div className="profileChip"><Avatar identity={props.user.id} name={name} /><div><strong>{name}</strong><span>{props.user.email}</span></div><button className="quietButton" onClick={props.onLogout}>Выйти</button></div></header>
    <section className="hero"><div><div className="eyebrow"><span className="liveDot" /> Голосовая комната без лишнего</div><h1>Соберите людей.<br /><em>Начните говорить.</em></h1><p>Временная комната до пяти человек. Приглашение одной ссылкой, голос и показ экрана.</p></div><div className="orb" aria-hidden="true"><span /><span /><span /></div></section>
    <section className="actionGrid">
      <article className="actionCard createCard"><div className="cardIcon"><Icon name="spark" /></div><div><h2>Новая комната</h2><p>Вы станете владельцем и сможете управлять входом.</p></div><button className="primaryButton" onClick={props.onCreate} disabled={props.busy}>Создать комнату <Icon name="chevron" /></button></article>
      <article className="actionCard"><div className="cardIcon secondary"><Icon name="users" /></div><div><h2>Присоединиться</h2><p>Введите код из приглашения — регистр не важен.</p></div><div className="joinRow"><label className="srOnly" htmlFor="room-code">Код комнаты</label><input id="room-code" className="codeInput" value={props.roomCode} onChange={(event) => props.onRoomCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ABC234" /><button className="secondaryButton" onClick={props.onJoin} disabled={props.busy || props.roomCode.length < 6}>Войти</button></div></article>
    </section>
    {props.error && <div className="errorBanner homeError" role="alert">{props.error}</div>}
    <section className="devicePanel"><div><h2><Icon name="headphones" /> Звук</h2><p>Выбранные устройства сохраняются только на этом компьютере.</p></div><DeviceSelect label="Микрофон" value={props.microphoneId} devices={props.devices.inputs} onChange={props.onMicrophone} /><DeviceSelect label="Вывод звука" value={props.outputId} devices={props.devices.outputs} onChange={props.onOutput} /></section>
    <footer className="footer">Ватрушка {props.version} · Windows MVP</footer>
  </main>;
}

export function InvitePanel({ code, authenticated, error, busy, onJoin, onLogin, onGuest, onBack }: { code: string; authenticated: boolean; error: string | null; busy: boolean; onJoin(): void; onLogin(): void; onGuest(): void; onBack(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard inviteCard"><Brand /><div className="inviteGlyph"><Icon name="users" /></div><div className="eyebrow">Вас приглашают</div><h1>Комната <span className="accentText">{code}</span></h1><p className="lede">Голосовая встреча до пяти участников. Камера не используется.</p>{error && <div className="errorBanner" role="alert">{error}</div>}<div className="stack">{authenticated ? <button className="primaryButton" disabled={busy} onClick={onJoin}>Присоединиться <Icon name="chevron" /></button> : <><button className="primaryButton" onClick={onLogin}>Войти по email <Icon name="chevron" /></button><button className="secondaryButton fullButton" onClick={onGuest}>Продолжить гостем</button></>}<button className="textButton" onClick={onBack}>Вернуться назад</button></div></section></main>;
}

export function GuestJoinPanel({ code, name, busy, error, onName, onJoin, onBack }: { code: string; name: string; busy: boolean; error: string | null; onName(value: string): void; onJoin(): void; onBack(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard"><Brand /><div className="eyebrow">Гостевой вход · {code}</div><h1>Представьтесь участникам</h1><p className="lede">Аккаунт не создаётся. Гостевая сессия работает только в этой комнате.</p><form className="stack" onSubmit={(event) => { event.preventDefault(); onJoin(); }}><label className="field"><span>Ваше имя</span><input autoFocus minLength={2} maxLength={30} value={name} onChange={(event) => onName(event.target.value)} placeholder="Гость" /></label>{error && <div className="errorBanner" role="alert">{error}</div>}<button className="primaryButton" disabled={busy || name.trim().length < 2}>Войти в комнату <Icon name="chevron" /></button><button type="button" className="textButton" onClick={onBack}>Назад</button></form></section></main>;
}

export function RoomView({ connection, snapshot, devices, microphoneId, outputId, locked, busy, error, onMute, onShare, onCopy, onLeave, onLock, onClose, onKick, onMicrophone, onOutput, onStartAudio }: { connection: RoomConnection; snapshot: MediaSnapshot; devices: AudioDevices; microphoneId: string | undefined; outputId: string | undefined; locked: boolean; busy: boolean; error: string | null; onMute(): void; onShare(): void; onCopy(): void; onLeave(): void; onLock(): void; onClose(): void; onKick(identity: string): void; onMicrophone(value: string): void; onOutput(value: string): void; onStartAudio(): void }): ReactNode {
  const reconnecting = snapshot.connectionState === ConnectionState.Reconnecting || snapshot.connectionState === ConnectionState.SignalReconnecting;
  return <main className="roomShell">
    <aside className="roomSidebar"><Brand /><div className="roomMeta"><span>Код комнаты</span><div><strong>{connection.code}</strong><button aria-label="Копировать приглашение" title="Копировать приглашение" onClick={onCopy}><Icon name="copy" /></button></div><p><Icon name="users" /> {snapshot.participants.length} / 5 участников</p></div>
      <div className="participantHeader"><span>Участники</span><span>{snapshot.participants.length}</span></div><div className="participantList">{snapshot.participants.map((participant) => <ParticipantRow key={participant.identity} participant={participant} canKick={connection.isOwner && !participant.isLocal} onKick={onKick} />)}</div>
      {connection.isOwner && <div className="ownerPanel"><span>Управление комнатой</span><button onClick={onLock} disabled={busy}><Icon name={locked ? 'unlock' : 'lock'} /> {locked ? 'Открыть вход' : 'Закрыть вход'}</button><button className="dangerText" onClick={onClose} disabled={busy}><Icon name="close" /> Завершить комнату</button></div>}
    </aside>
    <section className="roomStage"><header className="stageHeader"><div><span className={`stateDot ${snapshot.connectionState}`} /> <strong>{reconnecting ? 'Переподключение…' : snapshot.connectionState === ConnectionState.Connected ? 'Связь установлена' : 'Подключение…'}</strong></div><span>Комната {connection.code}</span></header>
      <div className="shareCanvas">{snapshot.screenTrack ? <><ScreenTrack track={snapshot.screenTrack} /><div className="shareLabel"><span className="liveDot" /> Экран показывает {snapshot.screenSharerName ?? 'участник'}</div></> : <div className="emptyShare"><div className="emptyGlyph"><Icon name="screen" /></div><h1>Демонстрация не запущена</h1><p>Покажите монитор или отдельное окно. Одновременно доступна одна демонстрация.</p><button className="secondaryButton" disabled={busy} onClick={onShare}><Icon name="screen" /> Начать показ</button></div>}</div>
      {!snapshot.canPlayAudio && <button className="audioGate" onClick={onStartAudio}>Нажмите, чтобы включить звук участников</button>}
      {(error || snapshot.error) && <div className="errorBanner roomError" role="alert">{error ?? snapshot.error}</div>}
      <footer className="controlDock"><ControlButton icon={snapshot.isMuted ? 'micOff' : 'mic'} label={snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} active={snapshot.isMuted} onClick={onMute} testId="mute-control" /><div className="deviceMini"><DeviceSelect label="Микрофон" compact value={microphoneId} devices={devices.inputs} onChange={onMicrophone} /><DeviceSelect label="Вывод" compact value={outputId} devices={devices.outputs} onChange={onOutput} /></div><ControlButton icon="screen" label={snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} active={snapshot.isScreenSharing} onClick={onShare} disabled={busy} testId="screen-share-control" /><ControlButton icon="copy" label="Пригласить" onClick={onCopy} testId="copy-invite-control" /><ControlButton icon="leave" label="Выйти" danger onClick={onLeave} testId="leave-control" /></footer>
    </section>
  </main>;
}

function ParticipantRow({ participant, canKick, onKick }: { participant: ParticipantView; canKick: boolean; onKick(identity: string): void }): ReactNode {
  return <div className={`participant ${participant.isSpeaking ? 'speaking' : ''}`}><Avatar identity={participant.identity} name={participant.displayName} /><div className="participantName"><strong>{participant.displayName}{participant.isLocal && ' (вы)'}</strong><span>{participant.isOwner ? 'Владелец' : participant.isGuest ? 'Гость' : participant.connectionQuality}{participant.isSpeaking && ' · говорит'}</span></div><span className="participantState" title={participant.isMuted ? 'Микрофон выключен' : 'Микрофон включён'}><Icon name={participant.isMuted ? 'micOff' : 'mic'} /></span>{participant.isScreenSharing && <span className="sharingBadge" title="Демонстрирует экран"><Icon name="screen" /></span>}{canKick && <button className="kickButton" aria-label={`Исключить ${participant.displayName}`} title="Исключить" onClick={() => onKick(participant.identity)}><Icon name="close" /></button>}</div>;
}

function ScreenTrack({ track }: { track: RemoteTrack | LocalTrack }): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <video ref={ref} className="screenVideo" autoPlay playsInline />;
}

export function SourcePicker({ sources, includeAudio, platform, onAudio, onSelect, onCancel }: { sources: DesktopSourceInfo[]; includeAudio: boolean; platform: string; onAudio(value: boolean): void; onSelect(source: DesktopSourceInfo): void; onCancel(): void }): ReactNode {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);
  return <div className="modalBackdrop"><div className="sourceDialog" role="dialog" aria-modal="true" aria-labelledby="source-title" ref={dialog}><header><div><div className="eyebrow">Демонстрация экрана</div><h2 id="source-title">Что показать?</h2></div><button className="modalClose" aria-label="Закрыть выбор источника" onClick={onCancel}><Icon name="close" /></button></header><div className="sourceGrid">{sources.map((source) => <button key={source.id} className="sourceCard" onClick={() => onSelect(source)}><img src={source.thumbnailDataUrl} alt="" /><span><b>{source.name}</b><small>{source.type === 'screen' ? 'Монитор' : 'Окно'}</small></span></button>)}</div><footer><label className="checkbox"><input type="checkbox" checked={includeAudio} onChange={(event) => onAudio(event.target.checked)} disabled={platform !== 'win32'} /><span>Передавать системный звук</span></label>{platform !== 'win32' && <small>В MVP системный звук поддерживается на Windows</small>}<button className="textButton" onClick={onCancel}>Отмена</button></footer></div></div>;
}

function Avatar({ identity, name }: { identity: string; name: string }): ReactNode {
  return <span className="avatar" style={{ '--avatar-color': colorForIdentity(identity) } as React.CSSProperties}>{initials(name)}</span>;
}

function DeviceSelect({ label, value, devices, onChange, compact = false }: { label: string; value: string | undefined; devices: MediaDeviceInfo[]; onChange(value: string): void; compact?: boolean }): ReactNode {
  return <label className={compact ? 'deviceSelect compact' : 'deviceSelect'}><span>{label}</span><select aria-label={label} value={value ?? 'default'} onChange={(event) => onChange(event.target.value)}><option value="default">Системное устройство</option>{devices.filter((device) => device.deviceId !== 'default').map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</select></label>;
}

function ControlButton({ icon, label, onClick, active = false, danger = false, disabled = false, testId }: { icon: IconName; label: string; onClick(): void; active?: boolean; danger?: boolean; disabled?: boolean; testId: string }): ReactNode {
  return <button className={`controlButton ${active ? 'active' : ''} ${danger ? 'danger' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} data-testid={testId}><span><Icon name={icon} /></span><small>{label}</small></button>;
}
