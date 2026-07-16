import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ConnectionState } from 'livekit-client';
import type { LocalTrack, RemoteTrack } from 'livekit-client';

import {
  colorForIdentity,
  initials,
  type DesktopSourceInfo,
  type PlatformRole,
  type PublicUser,
  type RoomConnection,
  type ServerDetail,
  type ServerPermission,
  type ServerSummary,
  type TextMessage,
  type TwoFactorSetup,
  serverPermissions,
} from '@vatrushka/shared';

import type { MediaSnapshot, ParticipantView } from './media.js';

type IconName = 'mic' | 'micOff' | 'screen' | 'copy' | 'leave' | 'lock' | 'unlock' | 'close' | 'users' | 'spark' | 'headphones' | 'chevron' | 'volume' | 'volumeOff' | 'refresh' | 'hash' | 'voice' | 'plus' | 'settings' | 'send' | 'message';

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
    volume: <><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 5a9 9 0 0 1 0 14" /></>,
    volumeOff: <><path d="M11 5 6 9H2v6h4l5 4V5ZM16 9l5 5M21 9l-5 5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-2.6L20 7M4 17l2.2 1.6A7 7 0 0 0 18 16" /></>,
    hash: <><path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" /></>,
    voice: <><path d="M6 9v6M10 6v12M14 4v16M18 8v8" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Brand(): ReactNode {
  return <div className="brand"><span className="brandMark" aria-hidden="true"><span /></span><span>Ватрушка</span></div>;
}

interface AuthPanelProps {
  mode: 'password' | 'email' | 'register';
  stage: 'credentials' | 'otp';
  factor: 'email' | 'totp';
  totpAvailable: boolean;
  email: string;
  code: string;
  password: string;
  passwordConfirmation: string;
  retrySeconds: number;
  busy: boolean;
  error: string | null;
  onMode(value: 'password' | 'email' | 'register'): void;
  onEmailChange(value: string): void;
  onCodeChange(value: string): void;
  onPasswordChange(value: string): void;
  onPasswordConfirmationChange(value: string): void;
  onRequest(): void;
  onVerify(): void;
  onFactor(value: 'email' | 'totp'): void;
  onBack(): void;
}

export function AuthPanel(props: AuthPanelProps): ReactNode {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (props.stage === 'credentials') props.onRequest(); else props.onVerify();
  };
  const title = props.stage === 'otp'
    ? props.factor === 'totp' ? 'Код из приложения' : 'Проверьте почту'
    : props.mode === 'register' ? 'Создайте аккаунт' : props.mode === 'password' ? 'С возвращением' : 'Войдите по email';
  const description = props.stage === 'otp'
    ? props.factor === 'totp'
      ? 'Введите шестизначный код из приложения-аутентификатора.'
      : <>Шестизначный код отправлен на <strong>{props.email}</strong></>
    : props.mode === 'register'
      ? 'Email будет подтверждён одноразовым кодом. Пароль хранится только в виде защищённого хеша.'
      : props.mode === 'password'
        ? 'После проверки пароля подтвердите вход кодом из почты или приложением 2FA.'
        : 'Подходит для старых аккаунтов без пароля.';
  return <main className="centerPage">
    <section className="authCard" aria-labelledby="auth-title">
      <Brand />
      <div className="eyebrow">Пространство для разговора</div>
      <h1 id="auth-title">{title}</h1>
      <p className="lede">{description}</p>
      {props.stage === 'credentials' && <div className="authModeTabs" role="tablist" aria-label="Способ входа"><button role="tab" aria-selected={props.mode === 'password'} className={props.mode === 'password' ? 'active' : ''} onClick={() => props.onMode('password')}>Пароль</button><button role="tab" aria-selected={props.mode === 'email'} className={props.mode === 'email' ? 'active' : ''} onClick={() => props.onMode('email')}>Код из почты</button><button role="tab" aria-selected={props.mode === 'register'} className={props.mode === 'register' ? 'active' : ''} onClick={() => props.onMode('register')}>Регистрация</button></div>}
      <form onSubmit={submit} className="stack">
        {props.stage === 'credentials' ? <><label className="field"><span>Email</span><input type="email" autoComplete="email" autoFocus value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="you@example.com" /></label>{props.mode !== 'email' && <label className="field"><span>Пароль</span><input type="password" autoComplete={props.mode === 'register' ? 'new-password' : 'current-password'} minLength={10} maxLength={128} value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Минимум 10 символов" /></label>}{props.mode === 'register' && <label className="field"><span>Повторите пароль</span><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={props.passwordConfirmation} onChange={(event) => props.onPasswordConfirmationChange(event.target.value)} /></label>}</> : <label className="field"><span>{props.factor === 'totp' ? 'Код 2FA' : 'Код из письма'}</span><input className="otpInput" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={props.code} onChange={(event) => props.onCodeChange(event.target.value.replace(/\D/gu, '').slice(0, 6))} placeholder="••••••" /></label>}
        {props.error && <div className="errorBanner" role="alert">{props.error}</div>}
        <button className="primaryButton" type="submit" disabled={props.busy || (props.stage === 'otp' && props.code.length !== 6) || (props.stage === 'credentials' && props.mode !== 'email' && props.password.length < 10)}>{props.busy ? 'Подождите…' : props.stage === 'otp' ? 'Подтвердить вход' : props.mode === 'register' ? 'Создать аккаунт' : props.mode === 'password' ? 'Продолжить' : 'Получить код'} <Icon name="chevron" /></button>
      </form>
      {props.stage === 'otp' && <div className="authLinks"><button className="textButton" onClick={props.onBack}>Назад</button>{props.factor === 'email' && <button className="textButton" onClick={props.onRequest} disabled={props.retrySeconds > 0 || props.busy}>{props.retrySeconds > 0 ? `Отправить снова через ${props.retrySeconds} с` : 'Отправить снова'}</button>}{props.mode === 'password' && props.factor === 'totp' && <button className="textButton" onClick={() => props.onFactor('email')} disabled={props.busy}>Получить код на email</button>}{props.mode === 'password' && props.factor === 'email' && props.totpAvailable && <button className="textButton" onClick={() => props.onFactor('totp')} disabled={props.busy}>Использовать 2FA</button>}</div>}
      <p className="privacyNote">Коды действуют 10 минут. Сервер не хранит пароль в открытом виде.</p>
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
  servers: ServerSummary[];
  serverName: string;
  serverInvite: string;
  directUnreadCount?: number;
  onRoomCode(value: string): void;
  onCreate(): void;
  onJoin(): void;
  onLogout(): void;
  onSecurity(): void;
  onMicrophone(value: string): void;
  onOutput(value: string): void;
  onRefreshDevices(): void;
  onServerName(value: string): void;
  onServerInvite(value: string): void;
  onCreateServer(): void;
  onJoinServer(): void;
  onOpenServer(serverId: string): void;
  onDirectMessages?(): void;
}

export function HomePanel(props: HomePanelProps): ReactNode {
  const name = props.user.displayName ?? props.user.email;
  return <main className="homePage">
    <header className="topbar"><Brand /><div className={`profileChip ${props.user.platformRole !== 'member' ? 'platformPrivileged' : ''}`}><Avatar identity={props.user.id} name={name} platformRole={props.user.platformRole} /><div><strong>{name}</strong><span>{props.user.email}</span>{props.user.platformRole !== 'member' && <PlatformBadge role={props.user.platformRole} />}</div><button className="quietButton" onClick={props.onSecurity}>Безопасность</button><button className="quietButton" onClick={props.onLogout}>Выйти</button></div></header>
    <section className="hero"><div><div className="eyebrow"><span className="liveDot" /> Голосовая комната без лишнего</div><h1>Соберите людей.<br /><em>Начните говорить.</em></h1><p>Временная комната до пяти человек. Приглашение одной ссылкой, голос и показ экрана.</p></div><div className="orb" aria-hidden="true"><span /><span /><span /></div></section>
    <section className="actionGrid">
      <article className="actionCard createCard"><div className="cardIcon"><Icon name="spark" /></div><div><h2>Новая комната</h2><p>Вы станете владельцем и сможете управлять входом.</p></div><button className="primaryButton" onClick={props.onCreate} disabled={props.busy}>Создать комнату <Icon name="chevron" /></button></article>
      <article className="actionCard"><div className="cardIcon secondary"><Icon name="users" /></div><div><h2>Присоединиться</h2><p>Введите код из приглашения — регистр не важен.</p></div><div className="joinRow"><label className="srOnly" htmlFor="room-code">Код комнаты</label><input id="room-code" className="codeInput" value={props.roomCode} onChange={(event) => props.onRoomCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ABC234" /><button className="secondaryButton" onClick={props.onJoin} disabled={props.busy || props.roomCode.length < 6}>Войти</button></div></article>
    </section>
    <section className="communityPanel"><header><div><div className="eyebrow">Постоянные пространства</div><h2>Ваши серверы</h2><p>Текстовые и голосовые каналы, роли, история сообщений и постоянное приглашение.</p></div><div className="communityHeaderActions">{props.onDirectMessages === undefined ? null : <button className="directMessagesShortcut" onClick={props.onDirectMessages} type="button"><Icon name="message" /><span>Личные сообщения</span>{(props.directUnreadCount ?? 0) === 0 ? null : <strong>{(props.directUnreadCount ?? 0) > 99 ? '99+' : props.directUnreadCount}</strong>}</button>}<span className="communityCount">{props.servers.length}</span></div></header>{props.servers.length > 0 && <div className="serverCards">{props.servers.map((server) => <button key={server.id} className="serverCard" onClick={() => props.onOpenServer(server.id)}><span className="serverMonogram">{server.name.slice(0, 2).toUpperCase()}</span><span><strong>{server.name}</strong><small>{server.memberCount} участников · {server.inviteCode}</small></span><Icon name="chevron" /></button>)}</div>}<div className="communityActions"><form onSubmit={(event) => { event.preventDefault(); props.onCreateServer(); }}><label className="field"><span>Новый сервер</span><input value={props.serverName} onChange={(event) => props.onServerName(event.target.value)} minLength={2} maxLength={60} placeholder="Например, Команда разработки" /></label><button className="secondaryButton" disabled={props.busy || props.serverName.trim().length < 2}><Icon name="plus" /> Создать</button></form><form onSubmit={(event) => { event.preventDefault(); props.onJoinServer(); }}><label className="field"><span>Код приглашения</span><input className="codeInput" value={props.serverInvite} onChange={(event) => props.onServerInvite(event.target.value.toUpperCase())} maxLength={8} placeholder="ABCD2345" /></label><button className="secondaryButton" disabled={props.busy || props.serverInvite.length !== 8}>Вступить</button></form></div></section>
    {props.error && <div className="errorBanner homeError" role="alert">{props.error}</div>}
    <section className="devicePanel"><div><h2><Icon name="headphones" /> Устройства звука</h2><p>Микрофон и динамики сохраняются только на этом компьютере.</p><button className="deviceRefresh" type="button" onClick={props.onRefreshDevices} disabled={props.busy}><Icon name="refresh" /> Разрешить доступ и обновить</button></div><DeviceSelect label="Устройство записи" value={props.microphoneId} devices={props.devices.inputs} onChange={props.onMicrophone} /><DeviceSelect label="Устройство воспроизведения" value={props.outputId} devices={props.devices.outputs} onChange={props.onOutput} /></section>
    <footer className="footer">Ватрушка {props.version} · Windows vNext</footer>
  </main>;
}

interface ServerViewProps {
  user: PublicUser;
  server: ServerDetail;
  servers: ServerSummary[];
  activeChannelId: string | null;
  messages: TextMessage[];
  messageDraft: string;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onSwitchServer(serverId: string): void;
  onChannel(channelId: string): void;
  onMessageDraft(value: string): void;
  onSendMessage(): void;
  onDeleteMessage(messageId: string): void;
  onConnectVoice(channelId: string): void;
  onCopyInvite(): void;
  onCreateChannel(name: string, type: 'text' | 'voice'): void;
  onDeleteChannel(channelId: string): void;
  onCreateRole(name: string, color: string, permissions: ServerPermission[]): void;
  onAssignRoles(userId: string, roleIds: string[]): void;
  onKickMember(userId: string): void;
}

const permissionLabels: Record<ServerPermission, string> = {
  VIEW_SERVER: 'Видеть сервер',
  MANAGE_SERVER: 'Управлять сервером',
  MANAGE_CHANNELS: 'Управлять каналами',
  MANAGE_ROLES: 'Управлять ролями',
  CREATE_INVITES: 'Создавать приглашения',
  KICK_MEMBERS: 'Исключать участников',
  VIEW_CHANNEL: 'Видеть каналы',
  SEND_MESSAGES: 'Отправлять сообщения',
  MANAGE_MESSAGES: 'Управлять сообщениями',
  CONNECT_VOICE: 'Подключаться к голосу',
  SPEAK: 'Говорить',
  STREAM: 'Демонстрировать экран',
  MUTE_MEMBERS: 'Отключать участников в голосе',
};

export function ServerView(props: ServerViewProps): ReactNode {
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice'>('text');
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#a86b4b');
  const [rolePermissions, setRolePermissions] = useState<ServerPermission[]>(['VIEW_SERVER', 'VIEW_CHANNEL']);
  const [memberId, setMemberId] = useState('');
  const [memberRoles, setMemberRoles] = useState<string[]>([]);
  const activeChannel = props.server.channels.find((channel) => channel.id === props.activeChannelId) ?? props.server.channels[0] ?? null;
  const canManageChannels = props.server.permissions.includes('MANAGE_CHANNELS');
  const canManageRoles = props.server.permissions.includes('MANAGE_ROLES');
  const canManageMessages = props.server.permissions.includes('MANAGE_MESSAGES');
  const canKickMembers = props.server.permissions.includes('KICK_MEMBERS');
  const assignableRoles = props.server.roles.filter((role) => !role.isDefault && role.name !== 'Владелец');
  const selectMember = (userId: string): void => {
    setMemberId(userId);
    const member = props.server.members.find((candidate) => candidate.userId === userId);
    setMemberRoles(member?.roles.filter((role) => assignableRoles.some((candidate) => candidate.id === role.id)).map((role) => role.id) ?? []);
  };
  return <main className="serverShell">
    <nav className="serverRail" aria-label="Серверы"><button className="railHome" title="На главную" onClick={props.onBack}><Brand /></button><div className="railServers">{props.servers.map((server) => <button key={server.id} className={server.id === props.server.id ? 'active' : ''} title={server.name} onClick={() => props.onSwitchServer(server.id)}>{server.name.slice(0, 2).toUpperCase()}</button>)}</div></nav>
    <aside className="channelSidebar"><header><div><span>Сервер</span><h1>{props.server.name}</h1></div><button title="Копировать приглашение" onClick={props.onCopyInvite}><Icon name="copy" /></button></header><button className="inviteCode" onClick={props.onCopyInvite}>Код · {props.server.inviteCode}</button>
      {(['text', 'voice'] as const).map((type) => <section className="channelGroup" key={type}><div className="channelGroupHeader"><span>{type === 'text' ? 'Текстовые каналы' : 'Голосовые каналы'}</span>{canManageChannels && <button title="Добавить канал" onClick={() => { setChannelType(type); setChannelFormOpen(true); }}><Icon name="plus" /></button>}</div>{props.server.channels.filter((channel) => channel.type === type).map((channel) => <div className={`channelRow ${channel.id === activeChannel?.id ? 'active' : ''}`} key={channel.id}><button onClick={() => props.onChannel(channel.id)}><Icon name={type === 'text' ? 'hash' : 'voice'} /><span>{channel.name}</span></button>{canManageChannels && <button className="channelDelete" title="Удалить канал" onClick={() => props.onDeleteChannel(channel.id)}><Icon name="close" /></button>}</div>)}</section>)}
      <div className="serverSidebarActions">{canManageRoles && <button onClick={() => setRolesOpen(true)}><Icon name="settings" /> Роли и права</button>}<button onClick={props.onBack}><Icon name="leave" /> На главную</button></div>
    </aside>
    <section className="channelStage">{activeChannel?.type === 'text' ? <><header className="channelStageHeader"><div><Icon name="hash" /><div><h2>{activeChannel.name}</h2><span>Текстовый канал · история сохраняется</span></div></div><span>{props.server.memberCount} участников</span></header><div className="messageList">{props.messages.length === 0 ? <div className="emptyMessages"><span><Icon name="hash" /></span><h2>Начало канала #{activeChannel.name}</h2><p>Здесь появится первая история вашего сервера.</p></div> : props.messages.map((message) => <article className={`message ${message.authorPlatformRole !== 'member' ? 'platformPrivileged' : ''}`} key={message.id}><Avatar identity={message.authorUserId} name={message.authorDisplayName} platformRole={message.authorPlatformRole} /><div><header><strong>{message.authorDisplayName}</strong>{message.authorPlatformRole !== 'member' && <PlatformBadge role={message.authorPlatformRole} />}<time>{new Date(message.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{message.editedAt && <small>изменено</small>}</header><p>{message.content}</p></div>{(message.authorUserId === props.user.id || canManageMessages) && <button className="messageDelete" title="Удалить сообщение" onClick={() => props.onDeleteMessage(message.id)}><Icon name="close" /></button>}</article>)}</div><form className="messageComposer" onSubmit={(event) => { event.preventDefault(); props.onSendMessage(); }}><textarea aria-label="Сообщение" value={props.messageDraft} onChange={(event) => props.onMessageDraft(event.target.value)} placeholder={`Написать в #${activeChannel.name}`} maxLength={4000} rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); props.onSendMessage(); } }} /><button aria-label="Отправить" disabled={props.busy || props.messageDraft.trim().length === 0}><Icon name="send" /></button></form></> : activeChannel?.type === 'voice' ? <div className="voiceLobby"><div className="voiceOrb"><Icon name="voice" /></div><div className="eyebrow">Голосовой канал</div><h1>{activeChannel.name}</h1><p>Подключитесь к разговору. Внутри доступны выбранные аудиоустройства, демонстрация экрана и её системный звук.</p><button className="primaryButton" disabled={props.busy || !props.server.permissions.includes('CONNECT_VOICE')} onClick={() => props.onConnectVoice(activeChannel.id)}><Icon name="headphones" /> Подключиться</button></div> : <div className="voiceLobby"><h1>На сервере пока нет каналов</h1>{canManageChannels && <button className="secondaryButton" onClick={() => setChannelFormOpen(true)}>Создать канал</button>}</div>}</section>
    <aside className="memberSidebar"><header><span>Участники</span><strong>{props.server.memberCount}</strong></header>{props.server.members.map((member) => <div className={`serverMember ${member.platformRole !== 'member' ? 'platformPrivileged' : ''}`} key={member.userId}><Avatar identity={member.userId} name={member.displayName} platformRole={member.platformRole} /><div><strong>{member.displayName}</strong><span>{member.userId === props.server.ownerUserId ? 'Владелец сервера' : member.roles.filter((role) => !role.isDefault).map((role) => role.name).join(' · ') || 'Участник'}</span>{member.platformRole !== 'member' && <PlatformBadge role={member.platformRole} />}</div>{canKickMembers && member.userId !== props.user.id && member.userId !== props.server.ownerUserId && <button className="memberKick" title="Исключить с сервера" onClick={() => props.onKickMember(member.userId)}><Icon name="close" /></button>}</div>)}</aside>
    {channelFormOpen && <div className="modalBackdrop"><form className="compactDialog" onSubmit={(event) => { event.preventDefault(); props.onCreateChannel(channelName, channelType); setChannelName(''); setChannelFormOpen(false); }}><header><div><div className="eyebrow">Новый канал</div><h2>{channelType === 'text' ? 'Текстовый' : 'Голосовой'} канал</h2></div><button type="button" className="modalClose" onClick={() => setChannelFormOpen(false)}><Icon name="close" /></button></header><label className="field"><span>Название</span><input autoFocus value={channelName} onChange={(event) => setChannelName(event.target.value)} minLength={1} maxLength={50} placeholder={channelType === 'text' ? 'новости' : 'Переговорная'} /></label><div className="channelTypeTabs"><button type="button" className={channelType === 'text' ? 'active' : ''} onClick={() => setChannelType('text')}><Icon name="hash" /> Текст</button><button type="button" className={channelType === 'voice' ? 'active' : ''} onClick={() => setChannelType('voice')}><Icon name="voice" /> Голос</button></div><button className="primaryButton" disabled={props.busy || channelName.trim().length === 0}>Создать канал</button></form></div>}
    {rolesOpen && <div className="modalBackdrop"><section className="roleDialog"><header><div><div className="eyebrow">Сервер</div><h2>Роли и права</h2></div><button className="modalClose" onClick={() => setRolesOpen(false)}><Icon name="close" /></button></header><div className="roleColumns"><div><h3>Роли</h3><div className="roleList">{props.server.roles.map((role) => <div key={role.id}><i style={{ background: role.color }} /><span><strong>{role.name}</strong><small>{role.permissions.length} прав</small></span>{role.isDefault && <em>базовая</em>}</div>)}</div><form className="roleCreate" onSubmit={(event) => { event.preventDefault(); props.onCreateRole(roleName, roleColor, rolePermissions); setRoleName(''); }}><h3>Новая роль</h3><div className="roleNameRow"><input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Название роли" maxLength={40} /><input type="color" value={roleColor} onChange={(event) => setRoleColor(event.target.value)} title="Цвет роли" /></div><div className="permissionGrid">{serverPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={rolePermissions.includes(permission)} onChange={(event) => setRolePermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} /><span>{permissionLabels[permission]}</span></label>)}</div><button className="secondaryButton" disabled={props.busy || roleName.trim().length === 0}>Создать роль</button></form></div><div><h3>Назначить участнику</h3><label className="field"><span>Участник</span><select value={memberId} onChange={(event) => selectMember(event.target.value)}><option value="">Выберите участника</option>{props.server.members.filter((member) => member.userId !== props.server.ownerUserId).map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>{memberId && <><div className="assignRoleList">{assignableRoles.length === 0 ? <p>Сначала создайте назначаемую роль.</p> : assignableRoles.map((role) => <label key={role.id}><input type="checkbox" checked={memberRoles.includes(role.id)} onChange={(event) => setMemberRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} /><i style={{ background: role.color }} /><span>{role.name}</span></label>)}</div><button className="primaryButton" disabled={props.busy} onClick={() => props.onAssignRoles(memberId, memberRoles)}>Сохранить роли</button></>}</div></div>{props.error && <div className="errorBanner" role="alert">{props.error}</div>}</section></div>}
    {props.error && !rolesOpen && <div className="errorBanner serverError" role="alert">{props.error}</div>}
  </main>;
}

interface SecurityPanelProps {
  user: PublicUser;
  stage: 'overview' | 'password' | 'totp-enable' | 'totp-disable';
  code: string;
  password: string;
  passwordConfirmation: string;
  setup: TwoFactorSetup | null;
  qrDataUrl: string | null;
  busy: boolean;
  error: string | null;
  onCode(value: string): void;
  onPassword(value: string): void;
  onPasswordConfirmation(value: string): void;
  onStartPassword(): void;
  onSavePassword(): void;
  onStartTwoFactor(): void;
  onEnableTwoFactor(): void;
  onAskDisable(): void;
  onDisableTwoFactor(): void;
  onBack(): void;
  onClose(): void;
}

export function SecurityPanel(props: SecurityPanelProps): ReactNode {
  return <div className="modalBackdrop"><section className="securityDialog" role="dialog" aria-modal="true" aria-labelledby="security-title"><header><div><div className="eyebrow">Аккаунт</div><h2 id="security-title">Безопасность</h2></div><button className="modalClose" aria-label="Закрыть настройки безопасности" onClick={props.onClose}><Icon name="close" /></button></header><div className="securityBody">{props.stage === 'overview' && <><div className="securityStatus"><div><span className={`securityState ${props.user.hasPassword ? 'enabled' : ''}`}><Icon name="lock" /></span><div><strong>Пароль</strong><p>{props.user.hasPassword ? 'Настроен. Каждый вход подтверждается вторым фактором.' : 'Не настроен. Сейчас доступен вход по одноразовому email-коду.'}</p></div></div><button className="secondaryButton" onClick={props.onStartPassword} disabled={props.busy}>{props.user.hasPassword ? 'Изменить' : 'Задать пароль'}</button></div><div className="securityStatus"><div><span className={`securityState ${props.user.twoFactorEnabled ? 'enabled' : ''}`}><Icon name="spark" /></span><div><strong>Приложение 2FA</strong><p>{props.user.twoFactorEnabled ? 'Включено. При входе можно использовать TOTP-код или резервный код из почты.' : 'Добавьте Microsoft Authenticator, Google Authenticator, 1Password или другое TOTP-приложение.'}</p></div></div><button className="secondaryButton" onClick={props.user.twoFactorEnabled ? props.onAskDisable : props.onStartTwoFactor} disabled={props.busy || !props.user.hasPassword}>{props.user.twoFactorEnabled ? 'Отключить' : 'Подключить'}</button></div>{!props.user.hasPassword && <p className="securityHint">Сначала задайте пароль — 2FA является вторым фактором и не работает отдельно от него.</p>}</>}{props.stage === 'password' && <form className="securityForm" onSubmit={(event) => { event.preventDefault(); props.onSavePassword(); }}><button type="button" className="textButton backLink" onClick={props.onBack}>← Назад</button><h3>{props.user.hasPassword ? 'Изменение пароля' : 'Новый пароль'}</h3><p>Код подтверждения отправлен на {props.user.email}.</p><label className="field"><span>Код из письма</span><input className="otpInput" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={props.code} onChange={(event) => props.onCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} /></label><label className="field"><span>Новый пароль</span><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={props.password} onChange={(event) => props.onPassword(event.target.value)} /></label><label className="field"><span>Повторите пароль</span><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={props.passwordConfirmation} onChange={(event) => props.onPasswordConfirmation(event.target.value)} /></label><button className="primaryButton" disabled={props.busy || props.code.length !== 6 || props.password.length < 10}>Сохранить пароль</button></form>}{props.stage === 'totp-enable' && <form className="securityForm totpForm" onSubmit={(event) => { event.preventDefault(); props.onEnableTwoFactor(); }}><button type="button" className="textButton backLink" onClick={props.onBack}>← Назад</button><h3>Подключение 2FA</h3><p>Отсканируйте QR-код приложением-аутентификатором, затем введите полученный код.</p>{props.qrDataUrl && <img className="totpQr" src={props.qrDataUrl} alt="QR-код для настройки двухфакторной аутентификации" />}{props.setup && <div className="totpSecret"><span>Ключ для ручного ввода</span><code>{props.setup.secret}</code><button type="button" className="textButton" onClick={() => void window.desktop.copyToClipboard(props.setup?.secret ?? '')}>Копировать</button></div>}<label className="field"><span>Код из приложения</span><input className="otpInput" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={props.code} onChange={(event) => props.onCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} /></label><button className="primaryButton" disabled={props.busy || props.code.length !== 6}>Включить 2FA</button></form>}{props.stage === 'totp-disable' && <form className="securityForm" onSubmit={(event) => { event.preventDefault(); props.onDisableTwoFactor(); }}><button type="button" className="textButton backLink" onClick={props.onBack}>← Назад</button><h3>Отключить 2FA?</h3><p>Введите текущий код из приложения-аутентификатора. После отключения вход будет подтверждаться по email.</p><label className="field"><span>Код из приложения</span><input className="otpInput" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={props.code} onChange={(event) => props.onCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} /></label><button className="primaryButton dangerButton" disabled={props.busy || props.code.length !== 6}>Отключить 2FA</button></form>}{props.error && <div className="errorBanner" role="alert">{props.error}</div>}</div></section></div>;
}

export function InvitePanel({ code, authenticated, error, busy, onJoin, onLogin, onGuest, onBack }: { code: string; authenticated: boolean; error: string | null; busy: boolean; onJoin(): void; onLogin(): void; onGuest(): void; onBack(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard inviteCard"><Brand /><div className="inviteGlyph"><Icon name="users" /></div><div className="eyebrow">Вас приглашают</div><h1>Комната <span className="accentText">{code}</span></h1><p className="lede">Голосовая встреча до пяти участников. Камера не используется.</p>{error && <div className="errorBanner" role="alert">{error}</div>}<div className="stack">{authenticated ? <button className="primaryButton" disabled={busy} onClick={onJoin}>Присоединиться <Icon name="chevron" /></button> : <><button className="primaryButton" onClick={onLogin}>Войти по email <Icon name="chevron" /></button><button className="secondaryButton fullButton" onClick={onGuest}>Продолжить гостем</button></>}<button className="textButton" onClick={onBack}>Вернуться назад</button></div></section></main>;
}

export function GuestJoinPanel({ code, name, busy, error, onName, onJoin, onBack }: { code: string; name: string; busy: boolean; error: string | null; onName(value: string): void; onJoin(): void; onBack(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard"><Brand /><div className="eyebrow">Гостевой вход · {code}</div><h1>Представьтесь участникам</h1><p className="lede">Аккаунт не создаётся. Гостевая сессия работает только в этой комнате.</p><form className="stack" onSubmit={(event) => { event.preventDefault(); onJoin(); }}><label className="field"><span>Ваше имя</span><input autoFocus minLength={2} maxLength={30} value={name} onChange={(event) => onName(event.target.value)} placeholder="Гость" /></label>{error && <div className="errorBanner" role="alert">{error}</div>}<button className="primaryButton" disabled={busy || name.trim().length < 2}>Войти в комнату <Icon name="chevron" /></button><button type="button" className="textButton" onClick={onBack}>Назад</button></form></section></main>;
}

export function RoomView({ connection, snapshot, devices, microphoneId, outputId, locked, busy, error, onMute, onShare, onCopy, onLeave, onLock, onClose, onKick, onMicrophone, onOutput, onStartAudio, onScreenAudioMute, onScreenAudioVolume }: { connection: RoomConnection; snapshot: MediaSnapshot; devices: AudioDevices; microphoneId: string | undefined; outputId: string | undefined; locked: boolean; busy: boolean; error: string | null; onMute(): void; onShare(): void; onCopy(): void; onLeave(): void; onLock(): void; onClose(): void; onKick(identity: string): void; onMicrophone(value: string): void; onOutput(value: string): void; onStartAudio(): void; onScreenAudioMute(): void; onScreenAudioVolume(value: number): void }): ReactNode {
  const reconnecting = snapshot.connectionState === ConnectionState.Reconnecting || snapshot.connectionState === ConnectionState.SignalReconnecting;
  const isChannel = connection.contextType === 'channel';
  return <main className="roomShell">
    <aside className="roomSidebar"><Brand /><div className="roomMeta"><span>{isChannel ? 'Код сервера' : 'Код комнаты'}</span><div><strong>{connection.code}</strong><button aria-label="Копировать приглашение" title="Копировать приглашение" onClick={onCopy}><Icon name="copy" /></button></div><p><Icon name="users" /> {snapshot.participants.length}{isChannel ? ' участников в канале' : ' / 5 участников'}</p></div>
      <div className="participantHeader"><span>Участники</span><span>{snapshot.participants.length}</span></div><div className="participantList">{snapshot.participants.map((participant) => <ParticipantRow key={participant.identity} participant={participant} canKick={connection.isOwner && !participant.isLocal} onKick={onKick} />)}</div>
      {connection.isOwner && !isChannel && <div className="ownerPanel"><span>Управление комнатой</span><button onClick={onLock} disabled={busy}><Icon name={locked ? 'unlock' : 'lock'} /> {locked ? 'Открыть вход' : 'Закрыть вход'}</button><button className="dangerText" onClick={onClose} disabled={busy}><Icon name="close" /> Завершить комнату</button></div>}
    </aside>
    <section className="roomStage"><header className="stageHeader"><div><span className={`stateDot ${snapshot.connectionState}`} /> <strong>{reconnecting ? 'Переподключение…' : snapshot.connectionState === ConnectionState.Connected ? 'Связь установлена' : 'Подключение…'}</strong></div><span>{isChannel ? 'Голосовой канал сервера' : `Комната ${connection.code}`}</span></header>
      <div className="shareCanvas">{snapshot.screenTrack ? <><ScreenTrack track={snapshot.screenTrack} /><div className="shareLabel"><span className="liveDot" /> Экран показывает {snapshot.screenSharerName ?? 'участник'}</div>{snapshot.hasScreenShareAudio && <div className="shareAudioControl"><button type="button" onClick={onScreenAudioMute} aria-label={snapshot.screenShareAudioMuted ? 'Включить звук трансляции' : 'Выключить звук трансляции'} title={snapshot.screenShareAudioMuted ? 'Включить звук трансляции' : 'Выключить звук трансляции'}><Icon name={snapshot.screenShareAudioMuted ? 'volumeOff' : 'volume'} /></button><label><span>Звук трансляции</span><input aria-label="Громкость трансляции" type="range" min="0" max="1" step="0.05" value={snapshot.screenShareAudioMuted ? 0 : snapshot.screenShareAudioVolume} onChange={(event) => onScreenAudioVolume(Number(event.target.value))} /></label><output>{snapshot.screenShareAudioMuted ? 0 : Math.round(snapshot.screenShareAudioVolume * 100)}%</output></div>}</> : <div className="emptyShare"><div className="emptyGlyph"><Icon name="screen" /></div><h1>Демонстрация не запущена</h1><p>{connection.canStream === false ? 'Ваша роль не разрешает демонстрировать экран в этом канале.' : 'Покажите монитор или отдельное окно. Одновременно доступна одна демонстрация.'}</p><button className="secondaryButton" disabled={busy || connection.canStream === false} onClick={onShare}><Icon name="screen" /> Начать показ</button></div>}</div>
      {!snapshot.canPlayAudio && <button className="audioGate" onClick={onStartAudio}>Нажмите, чтобы включить звук участников</button>}
      {(error || snapshot.error) && <div className="errorBanner roomError" role="alert">{error ?? snapshot.error}</div>}
      <footer className="controlDock"><ControlButton icon={snapshot.isMuted ? 'micOff' : 'mic'} label={connection.canSpeak === false ? 'Роль не разрешает говорить' : snapshot.isMuted ? 'Включить микрофон' : 'Выключить микрофон'} active={snapshot.isMuted} onClick={onMute} disabled={connection.canSpeak === false} testId="mute-control" /><div className="deviceMini"><DeviceSelect label="Микрофон" compact value={microphoneId} devices={devices.inputs} onChange={onMicrophone} /><DeviceSelect label="Вывод" compact value={outputId} devices={devices.outputs} onChange={onOutput} /></div><ControlButton icon="screen" label={connection.canStream === false ? 'Роль не разрешает показ' : snapshot.isScreenSharing ? 'Остановить показ' : 'Показать экран'} active={snapshot.isScreenSharing} onClick={onShare} disabled={busy || connection.canStream === false} testId="screen-share-control" /><ControlButton icon="copy" label="Пригласить" onClick={onCopy} testId="copy-invite-control" /><ControlButton icon="leave" label="Выйти" danger onClick={onLeave} testId="leave-control" /></footer>
    </section>
  </main>;
}

function ParticipantRow({ participant, canKick, onKick }: { participant: ParticipantView; canKick: boolean; onKick(identity: string): void }): ReactNode {
  return <div className={`participant ${participant.isSpeaking ? 'speaking' : ''} ${participant.platformRole !== 'member' ? 'platformPrivileged' : ''}`}><Avatar identity={participant.identity} name={participant.displayName} platformRole={participant.platformRole} /><div className="participantName"><strong>{participant.displayName}{participant.isLocal && ' (вы)'}</strong><span>{participant.isOwner ? 'Владелец комнаты' : participant.isGuest ? 'Гость' : participant.connectionQuality}{participant.isSpeaking && ' · говорит'}</span>{participant.platformRole !== 'member' && <PlatformBadge role={participant.platformRole} />}</div><span className="participantState" title={participant.isMuted ? 'Микрофон выключен' : 'Микрофон включён'}><Icon name={participant.isMuted ? 'micOff' : 'mic'} /></span>{participant.isScreenSharing && <span className="sharingBadge" title="Демонстрирует экран"><Icon name="screen" /></span>}{canKick && <button className="kickButton" aria-label={`Исключить ${participant.displayName}`} title="Исключить" onClick={() => onKick(participant.identity)}><Icon name="close" /></button>}</div>;
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
  const groups = [
    { type: 'screen' as const, title: 'Весь экран', hint: 'Мониторы целиком' },
    { type: 'window' as const, title: 'Окна приложений', hint: 'Только выбранное окно' },
  ];
  return <div className="modalBackdrop"><div className="sourceDialog" role="dialog" aria-modal="true" aria-labelledby="source-title" ref={dialog}><header><div><div className="eyebrow">Демонстрация экрана</div><h2 id="source-title">Что показать?</h2></div><button className="modalClose" aria-label="Закрыть выбор источника" onClick={onCancel}><Icon name="close" /></button></header><div className="sourceGroups">{groups.map((group) => { const items = sources.filter((source) => source.type === group.type); if (items.length === 0) return null; return <section className="sourceGroup" key={group.type}><div className="sourceGroupTitle"><h3>{group.title}</h3><span>{group.hint}</span></div><div className="sourceGrid">{items.map((source, index) => <button key={source.id} className="sourceCard" title={source.name} onClick={() => onSelect(source)}><span className="sourcePreview"><img src={source.thumbnailDataUrl} alt="" /><span className="sourceTypeBadge">{source.type === 'screen' ? `Экран ${index + 1}` : 'Приложение'}</span></span><span className="sourceCaption">{source.appIconDataUrl && <img className="sourceAppIcon" src={source.appIconDataUrl} alt="" />}<span><b>{source.name || (source.type === 'screen' ? `Монитор ${index + 1}` : 'Окно без названия')}</b><small>{source.type === 'screen' ? 'Будет виден весь монитор' : 'Остальные окна не попадут в кадр'}</small></span></span></button>)}</div></section>; })}</div><footer><label className="checkbox"><input type="checkbox" checked={includeAudio} onChange={(event) => onAudio(event.target.checked)} disabled={platform !== 'win32'} /><span><b>Передавать звук компьютера</b><small>Голоса из Ватрушки будут исключены, чтобы не возникало эха</small></span></label>{platform !== 'win32' && <small>Системный звук поддерживается на Windows</small>}<button className="textButton" onClick={onCancel}>Отмена</button></footer></div></div>;
}

function PlatformBadge({ role }: { role: Exclude<PlatformRole, 'member'> }): ReactNode {
  return <span className={`platformBadge ${role}`}>{role === 'owner' ? 'Создатель · Администратор' : 'Администратор'}</span>;
}

function Avatar({ identity, name, platformRole = 'member' }: { identity: string; name: string; platformRole?: PlatformRole }): ReactNode {
  return <span className={`avatar ${platformRole !== 'member' ? `platformAvatar ${platformRole}` : ''}`} style={{ '--avatar-color': colorForIdentity(identity) } as React.CSSProperties}>{initials(name)}</span>;
}

function DeviceSelect({ label, value, devices, onChange, compact = false }: { label: string; value: string | undefined; devices: MediaDeviceInfo[]; onChange(value: string): void; compact?: boolean }): ReactNode {
  return <label className={compact ? 'deviceSelect compact' : 'deviceSelect'}><span>{label}</span><select aria-label={label} value={value ?? 'default'} onChange={(event) => onChange(event.target.value)}><option value="default">Системное устройство</option>{devices.filter((device) => device.deviceId !== 'default').map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</select></label>;
}

function ControlButton({ icon, label, onClick, active = false, danger = false, disabled = false, testId }: { icon: IconName; label: string; onClick(): void; active?: boolean; danger?: boolean; disabled?: boolean; testId: string }): ReactNode {
  return <button className={`controlButton ${active ? 'active' : ''} ${danger ? 'danger' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} data-testid={testId}><span><Icon name={icon} /></span><small>{label}</small></button>;
}
