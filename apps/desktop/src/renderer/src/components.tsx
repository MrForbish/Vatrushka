import type { FormEvent, ReactNode } from 'react';

import {
  colorForIdentity,
  initials,
  type PlatformRole,
  type PublicUser,
  type ServerSummary,
} from '@vatrushka/shared';

type IconName = 'chevron' | 'headphones' | 'message' | 'plus' | 'refresh' | 'spark' | 'users';

export function Icon({ name }: { name: IconName }): ReactNode {
  const paths: Record<IconName, ReactNode> = {
    chevron: <path d="m9 18 6-6-6-6" />,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2M18 19h1a2 2 0 0 0 2-2v-3h-3v5ZM6 19H5a2 2 0 0 1-2-2v-3h3v5Z" /></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-2.6L20 7M4 17l2.2 1.6A7 7 0 0 0 18 16" /></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  };
  return <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>;
}

export function Brand(): ReactNode {
  return <div className="brand"><span aria-hidden="true" className="brandMark"><span /></span><span>Ватрушка</span></div>;
}

interface AuthPanelProps {
  mode: 'password' | 'register';
  stage: 'credentials' | 'otp';
  factor: 'email' | 'totp' | 'recovery';
  totpAvailable: boolean;
  email: string;
  code: string;
  password: string;
  passwordConfirmation: string;
  retrySeconds: number;
  busy: boolean;
  error: string | null;
  onMode(value: 'password' | 'register'): void;
  onEmailChange(value: string): void;
  onCodeChange(value: string): void;
  onPasswordChange(value: string): void;
  onPasswordConfirmationChange(value: string): void;
  onRequest(): void;
  onVerify(): void;
  onFactor(value: 'email' | 'totp' | 'recovery'): void;
  onBack(): void;
}

export function AuthPanel(props: AuthPanelProps): ReactNode {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (props.stage === 'credentials') props.onRequest(); else props.onVerify();
  };
  const title = props.stage === 'otp'
    ? props.factor === 'totp' ? 'Код из приложения' : props.factor === 'recovery' ? 'Резервный код' : 'Проверьте почту'
    : props.mode === 'register' ? 'Создайте аккаунт' : 'С возвращением';
  const description = props.stage === 'otp'
    ? props.factor === 'totp'
      ? 'Введите шестизначный код из приложения-аутентификатора.'
      : props.factor === 'recovery'
        ? 'Введите один из сохранённых одноразовых recovery-кодов.'
        : <>Шестизначный код отправлен на <strong>{props.email}</strong></>
    : props.mode === 'register'
      ? 'Email будет подтверждён одноразовым кодом. Пароль хранится только в виде защищённого хеша.'
      : 'После проверки пароля подтвердите вход кодом из почты, приложением 2FA или recovery-кодом.';
  const invalidRegistration = props.mode === 'register' && props.passwordConfirmation !== props.password;
  return <main className="centerPage">
    <section aria-labelledby="auth-title" className="authCard">
      <Brand />
      <div className="eyebrow">Ваши серверы и каналы</div>
      <h1 id="auth-title">{title}</h1>
      <p className="lede">{description}</p>
      {props.stage === 'credentials' ? <div aria-label="Режим авторизации" className="authModeTabs" role="tablist"><button aria-selected={props.mode === 'password'} className={props.mode === 'password' ? 'active' : ''} onClick={() => props.onMode('password')} role="tab" type="button">Вход</button><button aria-selected={props.mode === 'register'} className={props.mode === 'register' ? 'active' : ''} onClick={() => props.onMode('register')} role="tab" type="button">Регистрация</button></div> : null}
      <form className="stack" onSubmit={submit}>
        {props.stage === 'credentials' ? <>
          <label className="field"><span>Email</span><input autoComplete="email" autoFocus onChange={(event) => props.onEmailChange(event.target.value)} placeholder="you@example.com" type="email" value={props.email} /></label>
          <label className="field"><span>Пароль</span><input autoComplete={props.mode === 'register' ? 'new-password' : 'current-password'} maxLength={128} minLength={10} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Минимум 10 символов" type="password" value={props.password} /></label>
          {props.mode === 'register' ? <label className="field"><span>Повторите пароль</span><input aria-invalid={props.passwordConfirmation.length > 0 && invalidRegistration} autoComplete="new-password" maxLength={128} minLength={10} onChange={(event) => props.onPasswordConfirmationChange(event.target.value)} type="password" value={props.passwordConfirmation} /></label> : null}
          {props.mode === 'register' && props.passwordConfirmation.length > 0 && invalidRegistration ? <p className="fieldError" role="alert">Пароли не совпадают</p> : null}
        </> : <label className="field"><span>{props.factor === 'totp' ? 'Код 2FA' : props.factor === 'recovery' ? 'Резервный код' : 'Код из письма'}</span><input autoComplete="one-time-code" autoFocus className="otpInput" inputMode={props.factor === 'recovery' ? 'text' : 'numeric'} maxLength={props.factor === 'recovery' ? 14 : 6} onChange={(event) => props.onCodeChange(props.factor === 'recovery' ? event.target.value.toUpperCase().replace(/[^A-Z2-9-]/gu, '').slice(0, 14) : event.target.value.replace(/\D/gu, '').slice(0, 6))} placeholder={props.factor === 'recovery' ? 'XXXX-XXXX-XXXX' : '••••••'} value={props.code} /></label>}
        {props.error ? <div className="errorBanner" role="alert">{props.error}</div> : null}
        <button className="primaryButton" disabled={props.busy || (props.stage === 'otp' && props.code.length !== (props.factor === 'recovery' ? 14 : 6)) || (props.stage === 'credentials' && (props.password.length < 10 || invalidRegistration))} type="submit">{props.busy ? 'Подождите…' : props.stage === 'otp' ? 'Подтвердить вход' : props.mode === 'register' ? 'Создать аккаунт' : 'Продолжить'} <Icon name="chevron" /></button>
      </form>
      {props.stage === 'otp' ? <div className="authLinks"><button className="textButton" onClick={props.onBack} type="button">Назад</button>{props.factor === 'email' ? <button className="textButton" disabled={props.retrySeconds > 0 || props.busy} onClick={props.onRequest} type="button">{props.retrySeconds > 0 ? `Отправить снова через ${props.retrySeconds} с` : 'Отправить снова'}</button> : null}{props.mode === 'password' && props.factor !== 'email' ? <button className="textButton" disabled={props.busy} onClick={() => props.onFactor('email')} type="button">Получить код на email</button> : null}{props.mode === 'password' && props.factor !== 'totp' && props.totpAvailable ? <button className="textButton" disabled={props.busy} onClick={() => props.onFactor('totp')} type="button">Использовать 2FA</button> : null}{props.mode === 'password' && props.totpAvailable && props.factor !== 'recovery' ? <button className="textButton" disabled={props.busy} onClick={() => props.onFactor('recovery')} type="button">Ввести recovery-код</button> : null}</div> : null}
      <p className="privacyNote">Вход без пароля не поддерживается. Коды подтверждения действуют 10 минут.</p>
    </section>
  </main>;
}

export function ProfilePanel({ value, busy, error, onChange, onSave }: { value: string; busy: boolean; error: string | null; onChange(value: string): void; onSave(): void }): ReactNode {
  return <main className="centerPage"><section className="authCard"><Brand /><div className="eyebrow">Последний штрих</div><h1>Как к вам обращаться?</h1><p className="lede">Это имя увидят участники ваших серверов. Его всегда можно изменить позднее.</p><form className="stack" onSubmit={(event) => { event.preventDefault(); onSave(); }}><label className="field"><span>Отображаемое имя</span><input autoFocus maxLength={30} minLength={2} onChange={(event) => onChange(event.target.value)} placeholder="Например, Алекс" value={value} /></label>{error ? <div className="errorBanner" role="alert">{error}</div> : null}<button className="primaryButton" disabled={busy || value.trim().length < 2}>Сохранить <Icon name="chevron" /></button></form></section></main>;
}

interface AudioDevices { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; }

interface HomePanelProps {
  user: PublicUser;
  version: string;
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  busy: boolean;
  error: string | null;
  servers: ServerSummary[];
  serverName: string;
  serverInvite: string;
  directUnreadCount?: number;
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
    <header className="topbar"><Brand /><div className={`profileChip ${props.user.platformRole !== 'member' ? 'platformPrivileged' : ''}`}><Avatar identity={props.user.id} name={name} platformRole={props.user.platformRole} /><div><strong>{name}</strong><span>{props.user.email}</span>{props.user.platformRole !== 'member' ? <PlatformBadge role={props.user.platformRole} /> : null}</div><button className="quietButton" onClick={props.onSecurity}>Безопасность</button><button className="quietButton" onClick={props.onLogout}>Выйти</button></div></header>
    <section className="hero"><div><div className="eyebrow"><span className="liveDot" /> Постоянное пространство для вашей компании</div><h1>Соберите сервер.<br /><em>Оставайтесь на связи.</em></h1><p>Текстовые и голосовые каналы, роли, личные сообщения и демонстрация экрана — в одном месте.</p></div><div aria-hidden="true" className="orb"><span /><span /><span /></div></section>
    <section aria-label="Создание и подключение к серверу" className="actionGrid">
      <article className="actionCard createCard"><div className="cardIcon"><Icon name="spark" /></div><div><h2>Новый сервер</h2><p>Создайте пространство с готовыми текстовым и голосовым каналами.</p></div><form className="homeServerForm" onSubmit={(event) => { event.preventDefault(); props.onCreateServer(); }}><label className="field"><span>Название сервера</span><input maxLength={60} minLength={2} onChange={(event) => props.onServerName(event.target.value)} placeholder="Например, Команда разработки" value={props.serverName} /></label><button className="primaryButton" disabled={props.busy || props.serverName.trim().length < 2}><Icon name="plus" /> Создать сервер</button></form></article>
      <article className="actionCard"><div className="cardIcon secondary"><Icon name="users" /></div><div><h2>Войти по приглашению</h2><p>Введите восьмизначный код сервера или откройте ссылку-приглашение.</p></div><form className="homeServerForm" onSubmit={(event) => { event.preventDefault(); props.onJoinServer(); }}><label className="field"><span>Код приглашения</span><input className="codeInput" maxLength={8} onChange={(event) => props.onServerInvite(event.target.value.toUpperCase())} placeholder="ABCD2345" value={props.serverInvite} /></label><button className="secondaryButton" disabled={props.busy || props.serverInvite.length !== 8}>Вступить</button></form></article>
    </section>
    <section className="communityPanel"><header><div><div className="eyebrow">Ваши пространства</div><h2>Серверы</h2><p>Выберите сервер, чтобы открыть его каналы и участников.</p></div><div className="communityHeaderActions">{props.onDirectMessages === undefined ? null : <button className="directMessagesShortcut" onClick={props.onDirectMessages} type="button"><Icon name="message" /><span>Личные сообщения</span>{(props.directUnreadCount ?? 0) === 0 ? null : <strong>{(props.directUnreadCount ?? 0) > 99 ? '99+' : props.directUnreadCount}</strong>}</button>}<span className="communityCount">{props.servers.length}</span></div></header>{props.servers.length > 0 ? <div className="serverCards">{props.servers.map((server) => <button className="serverCard" key={server.id} onClick={() => props.onOpenServer(server.id)}><span className="serverMonogram">{server.name.slice(0, 2).toUpperCase()}</span><span><strong>{server.name}</strong><small>{server.memberCount} участников · {server.inviteCode}</small></span><Icon name="chevron" /></button>)}</div> : <div className="emptyServers"><Icon name="users" /><strong>У вас пока нет серверов</strong><span>Создайте первый сервер или войдите по коду приглашения выше.</span></div>}</section>
    {props.error ? <div className="errorBanner homeError" role="alert">{props.error}</div> : null}
    <section className="devicePanel"><div><h2><Icon name="headphones" /> Устройства звука</h2><p>Микрофон и динамики сохраняются только на этом компьютере.</p><button className="deviceRefresh" disabled={props.busy} onClick={props.onRefreshDevices} type="button"><Icon name="refresh" /> Разрешить доступ и обновить</button></div><DeviceSelect devices={props.devices.inputs} label="Устройство записи" onChange={props.onMicrophone} value={props.microphoneId} /><DeviceSelect devices={props.devices.outputs} label="Устройство воспроизведения" onChange={props.onOutput} value={props.outputId} /></section>
    <footer className="footer">Ватрушка {props.version} · Windows</footer>
  </main>;
}

function PlatformBadge({ role }: { role: Exclude<PlatformRole, 'member'> }): ReactNode {
  return <span className={`platformBadge ${role}`}>{role === 'owner' ? 'Создатель · Администратор' : 'Администратор'}</span>;
}

function Avatar({ identity, name, platformRole = 'member' }: { identity: string; name: string; platformRole?: PlatformRole }): ReactNode {
  return <span className={`avatar ${platformRole !== 'member' ? `platformAvatar ${platformRole}` : ''}`} style={{ '--avatar-color': colorForIdentity(identity) } as React.CSSProperties}>{initials(name)}</span>;
}

function DeviceSelect({ label, value, devices, onChange }: { label: string; value: string | undefined; devices: MediaDeviceInfo[]; onChange(value: string): void }): ReactNode {
  return <label className="deviceSelect"><span>{label}</span><select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value ?? 'default'}><option value="default">Системное устройство</option>{devices.filter((device) => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</select></label>;
}
