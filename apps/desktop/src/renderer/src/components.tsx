import type { FormEvent, ReactNode } from 'react';

import { type PublicUser, type ServerSummary } from '@vatrushka/shared';

import { audioDeviceOptions, type AudioDevices } from './audio-devices';
import {
  AppShell,
  Badge as UiBadge,
  Button as UiButton,
  Icon as UiIcon,
  IconButton as UiIconButton,
  Input as UiInput,
  PasswordInput as UiPasswordInput,
  SegmentedControl as UiSegmentedControl,
  Select as UiSelect,
  WorkspaceLibrary,
  type WorkspaceNavigationItem,
} from './ui';

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
  const submitDisabled = props.busy || (props.stage === 'otp' && props.code.length !== (props.factor === 'recovery' ? 14 : 6)) || (props.stage === 'credentials' && (props.password.length < 10 || invalidRegistration));
  return <main className="vui-auth-page">
    <section className="vui-auth-visual">
      <div className="vui-auth-brand"><span><UiIcon name="voice" size={22} /></span><strong>VATRUSHKA</strong></div>
      <div className="vui-auth-visual__copy"><UiBadge tone="primary"><UiIcon name="sparkles" size={13} /> Своё пространство</UiBadge><h2>Голос, чаты и серверы.<br /><em>Без лишнего шума.</em></h2><p>Всё для общения команды — в одном защищённом desktop-клиенте.</p></div>
      <div className="vui-auth-preview" aria-hidden="true"><span className="vui-auth-preview__rail" /><div><span /><span /><span /></div><i /><i /></div>
      <ul className="vui-auth-benefits"><li><UiIcon name="lock" size={16} /><span><strong>Пароль + 2FA</strong><small>Защищённые сессии</small></span></li><li><UiIcon name="voice" size={16} /><span><strong>Живой голос</strong><small>С реальными устройствами</small></span></li><li><UiIcon name="screen" size={16} /><span><strong>Демонстрация</strong><small>Экран и звук приложения</small></span></li></ul>
    </section>
    <section className="vui-auth-surface"><div aria-labelledby="auth-title" className="vui-auth-card">
      <div className="vui-auth-card__mobile-brand"><div className="vui-auth-brand"><span><UiIcon name="voice" size={20} /></span><strong>VATRUSHKA</strong></div></div>
      <div className="vui-auth-card__heading"><span>{props.stage === 'otp' ? 'Защищённый вход' : 'Добро пожаловать'}</span><h1 id="auth-title">{title}</h1><p>{description}</p></div>
      {props.stage === 'credentials' ? <UiSegmentedControl label="Режим авторизации" onChange={props.onMode} options={[{ value: 'password', label: 'Вход' }, { value: 'register', label: 'Регистрация' }]} value={props.mode} /> : null}
      <form className="vui-auth-form" onSubmit={submit}>
        {props.stage === 'credentials' ? <><UiInput autoComplete="email" autoFocus label="Email" leadingIcon="message" onChange={(event) => props.onEmailChange(event.target.value)} placeholder="you@example.com" type="email" value={props.email} /><UiPasswordInput autoComplete={props.mode === 'register' ? 'new-password' : 'current-password'} label="Пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Минимум 10 символов" value={props.password} />{props.mode === 'register' ? <UiPasswordInput autoComplete="new-password" {...(props.passwordConfirmation.length > 0 && invalidRegistration ? { error: 'Пароли не совпадают' } : {})} label="Повторите пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordConfirmationChange(event.target.value)} value={props.passwordConfirmation} /> : null}</> : <UiInput autoComplete="one-time-code" autoFocus className="vui-auth-otp" inputMode={props.factor === 'recovery' ? 'text' : 'numeric'} label={props.factor === 'totp' ? 'Код 2FA' : props.factor === 'recovery' ? 'Резервный код' : 'Код из письма'} maxLength={props.factor === 'recovery' ? 14 : 6} onChange={(event) => props.onCodeChange(props.factor === 'recovery' ? event.target.value.toUpperCase().replace(/[^A-Z2-9-]/gu, '').slice(0, 14) : event.target.value.replace(/\D/gu, '').slice(0, 6))} placeholder={props.factor === 'recovery' ? 'XXXX-XXXX-XXXX' : '••••••'} value={props.code} />}
        {props.error ? <div className="vui-auth-error" role="alert"><UiIcon name="warning" size={17} /><span>{props.error}</span></div> : null}
        <UiButton className="vui-auth-submit" disabled={submitDisabled} icon={props.stage === 'otp' ? 'check' : 'send'} loading={props.busy} size="lg" type="submit">{props.stage === 'otp' ? 'Подтвердить вход' : props.mode === 'register' ? 'Создать аккаунт' : 'Продолжить'}</UiButton>
      </form>
      {props.stage === 'otp' ? <div className="vui-auth-links"><button onClick={props.onBack} type="button">Назад</button>{props.factor === 'email' ? <button disabled={props.retrySeconds > 0 || props.busy} onClick={props.onRequest} type="button">{props.retrySeconds > 0 ? `Повторить через ${props.retrySeconds} с` : 'Отправить снова'}</button> : null}{props.mode === 'password' && props.factor !== 'email' ? <button disabled={props.busy} onClick={() => props.onFactor('email')} type="button">Код на email</button> : null}{props.mode === 'password' && props.factor !== 'totp' && props.totpAvailable ? <button disabled={props.busy} onClick={() => props.onFactor('totp')} type="button">Код 2FA</button> : null}{props.mode === 'password' && props.totpAvailable && props.factor !== 'recovery' ? <button disabled={props.busy} onClick={() => props.onFactor('recovery')} type="button">Recovery-код</button> : null}</div> : null}
      <div className="vui-auth-security"><UiIcon name="lock" size={14} /><span>Вход без пароля отключён. Код действует 10 минут.</span></div>
    </div></section>
  </main>;
}

export function ProfilePanel({ value, busy, error, onChange, onSave }: { value: string; busy: boolean; error: string | null; onChange(value: string): void; onSave(): void }): ReactNode {
  return <main className="vui-auth-page vui-auth-page--profile"><section className="vui-auth-visual"><div className="vui-auth-brand"><span><UiIcon name="voice" size={22} /></span><strong>VATRUSHKA</strong></div><div className="vui-auth-visual__copy"><UiBadge tone="success"><UiIcon name="check" size={13} /> Email подтверждён</UiBadge><h2>Почти готово.</h2><p>Выберите имя, под которым вас увидят участники серверов.</p></div></section><section className="vui-auth-surface"><div className="vui-auth-card"><div className="vui-auth-card__heading"><span>Профиль</span><h1>Как к вам обращаться?</h1><p>Имя можно будет изменить позже.</p></div><form className="vui-auth-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}><UiInput autoFocus label="Отображаемое имя" maxLength={30} minLength={2} onChange={(event) => onChange(event.target.value)} placeholder="Например, Алекс" value={value} />{error ? <div className="vui-auth-error" role="alert"><UiIcon name="warning" size={17} />{error}</div> : null}<UiButton disabled={busy || value.trim().length < 2} icon="check" loading={busy} size="lg">Сохранить и продолжить</UiButton></form></div></section></main>;
}

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
  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({ id: server.id, name: server.name, memberCount: server.memberCount }));
  const namedInputs = props.devices.inputs.some((device) => device.deviceId !== 'default' && device.label.trim().length > 0);
  const namedOutputs = props.devices.outputs.some((device) => device.deviceId !== 'default' && device.label.trim().length > 0);
  return <AppShell
    members={<aside className="vui-home-activity"><header><span>Статус</span><UiBadge tone="success">В сети</UiBadge></header><div className="vui-home-activity__avatar">{name.slice(0, 1).toUpperCase()}</div><strong>{name}</strong><small>{props.user.email}</small><div className="vui-home-activity__tip"><UiIcon name="info" size={17} /><span>Выбор аудиоустройств хранится только на этом компьютере.</span></div></aside>}
    topBar={<div className="vui-home-topbar"><UiIcon name="home" size={19} /><span><strong>Главная</strong><small>Серверы, личные сообщения и настройка звука</small></span><UiBadge>v{props.version}</UiBadge><UiIconButton icon="settings" label="Безопасность и настройки" onClick={props.onSecurity} size="sm" type="button" /><UiIconButton icon="logout" label="Выйти из аккаунта" onClick={props.onLogout} size="sm" type="button" /></div>}
    workspaceLibrary={<WorkspaceLibrary directUnreadCount={props.directUnreadCount ?? 0} onCreate={() => document.getElementById('home-server-name')?.focus()} {...(props.onDirectMessages === undefined ? {} : { onDirectMessages: props.onDirectMessages })} onHome={() => undefined} onJoin={() => document.getElementById('home-server-invite')?.focus()} onSelect={props.onOpenServer} workspaces={workspaces} />}
  >
    <div className="vui-home-dashboard"><section className="vui-home-welcome"><div><UiBadge tone="primary"><span className="vui-home-live" /> Ватрушка готова</UiBadge><h1>Добро пожалова, <em>{name}</em></h1><p>Выберите сервер или создайте новое пространство для вашей команды.</p></div><span className="vui-home-welcome__mark"><UiIcon name="voice" size={34} /></span></section>
    <section className="vui-home-section" id="home-servers"><header><div><span>Ваши пространства</span><h2>Серверы</h2></div><UiBadge>{props.servers.length}</UiBadge></header>{props.servers.length > 0 ? <div className="vui-home-server-grid">{props.servers.map((server) => <button key={server.id} onClick={() => props.onOpenServer(server.id)} type="button"><span>{server.name.slice(0, 2).toUpperCase()}</span><div><strong>{server.name}</strong><small>{server.memberCount} участников</small></div><UiIcon name="chevronDown" size={17} /></button>)}</div> : <div className="vui-home-empty"><span><UiIcon name="users" size={28} /></span><strong>Серверов пока нет</strong><p>Создайте первый или войдите по коду.</p></div>}</section>
    <section className="vui-home-actions" id="home-create"><form onSubmit={(event) => { event.preventDefault(); props.onCreateServer(); }}><span className="vui-home-action-icon"><UiIcon name="plus" size={20} /></span><div><h2>Новый сервер</h2><p>Готовые текстовый и голосовой каналы.</p></div><UiInput id="home-server-name" label="Название" maxLength={60} minLength={2} onChange={(event) => props.onServerName(event.target.value)} placeholder="Команда разработки" value={props.serverName} /><UiButton disabled={props.busy || props.serverName.trim().length < 2} icon="plus" type="submit">Создать</UiButton></form><form onSubmit={(event) => { event.preventDefault(); props.onJoinServer(); }}><span className="vui-home-action-icon vui-home-action-icon--cyan"><UiIcon name="invite" size={20} /></span><div><h2>Войти по коду</h2><p>Код из восьми символов от владельца.</p></div><UiInput id="home-server-invite" className="vui-home-code" label="Код приглашения" maxLength={8} onChange={(event) => props.onServerInvite(event.target.value.toUpperCase())} placeholder="ABCD2345" value={props.serverInvite} /><UiButton disabled={props.busy || props.serverInvite.length !== 8} icon="link" type="submit" variant="secondary">Войти</UiButton></form></section>
    <section className="vui-home-audio" id="home-audio"><header><div><span><UiIcon name="headphones" size={20} /></span><div><h2>Аудиоустройства</h2><p>Реальные устройства Windows. Выбор применяется сразу.</p></div></div><UiButton disabled={props.busy} icon="refresh" onClick={props.onRefreshDevices} size="sm" type="button" variant="quiet">Обновить</UiButton></header><div><DeviceSelect devices={props.devices.inputs} kind="input" label="Микрофон" onChange={props.onMicrophone} value={props.microphoneId} /><DeviceSelect devices={props.devices.outputs} kind="output" label="Динамики / наушники" onChange={props.onOutput} value={props.outputId} /></div>{namedInputs && namedOutputs ? <p className="vui-home-audio__status"><UiIcon name="check" size={14} /> Названия устройств получены от Windows</p> : <p className="vui-home-audio__status vui-home-audio__status--warning"><UiIcon name="warning" size={14} /> Если названия скрыты, нажмите «Обновить» и разрешите доступ к микрофону.</p>}</section>
    {props.error ? <div className="vui-home-error" role="alert"><UiIcon name="warning" size={17} />{props.error}</div> : null}</div>
  </AppShell>;
}

function DeviceSelect({ kind, label, value, devices, onChange }: { kind: 'input' | 'output'; label: string; value: string | undefined; devices: MediaDeviceInfo[]; onChange(value: string): void }): ReactNode {
  return <UiSelect label={label} onValueChange={onChange} options={audioDeviceOptions(devices, kind)} value={value ?? 'default'} />;
}
