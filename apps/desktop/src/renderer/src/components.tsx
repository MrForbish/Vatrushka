import type { FormEvent, ReactNode } from 'react';

import authGamingHeroUrl from './assets/auth-gaming-hero.png';
import brandMarkUrl from './assets/brand-mark.png';

import {
  Badge as UiBadge,
  Button as UiButton,
  Checkbox as UiCheckbox,
  Icon as UiIcon,
  Input as UiInput,
  PasswordInput as UiPasswordInput,
  SegmentedControl as UiSegmentedControl,
} from './ui';

interface AuthPanelProps {
  mode: 'password' | 'register' | 'reset';
  stage: 'credentials' | 'otp';
  factor: 'email' | 'totp' | 'recovery';
  totpAvailable: boolean;
  email: string;
  code: string;
  password: string;
  passwordConfirmation: string;
  rememberSession: boolean;
  retrySeconds: number;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onMode(value: 'password' | 'register'): void;
  onReset(): void;
  onEmailChange(value: string): void;
  onCodeChange(value: string): void;
  onPasswordChange(value: string): void;
  onPasswordConfirmationChange(value: string): void;
  onRememberSessionChange(value: boolean): void;
  onRequest(): void;
  onVerify(): void;
  onFactor(value: 'email' | 'totp' | 'recovery'): void;
  onBack(): void;
}

function AuthBrand(): ReactNode {
  return <div className="vui-auth-brand"><img alt="Логотип Ватрушки" height="52" src={brandMarkUrl} width="52" /><strong>ВАТРУШКА</strong></div>;
}

function AuthHero({ profile = false }: { profile?: boolean }): ReactNode {
  return <section aria-label="Ватрушка — играйте вместе" className="vui-auth-visual">
    <img alt="" aria-hidden="true" className="vui-auth-game-art" src={authGamingHeroUrl} />
    <AuthBrand />
    <div className="vui-auth-visual__copy">
      <span className="vui-auth-kicker">{profile ? 'Профиль почти готов' : 'Для тех, кто играет вместе'}</span>
      <h2>{profile ? <>Остался<br /><em>один шаг.</em></> : <>Собирай своих.<br /><em>И врывайся.</em></>}</h2>
      <p>{profile ? 'Выберите имя, под которым вас узнают тиммейты.' : 'Создано для игр. Создано для побед.'}</p>
    </div>
  </section>;
}

export function AuthPanel(props: AuthPanelProps): ReactNode {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (props.stage === 'credentials') props.onRequest(); else props.onVerify();
  };
  const title = props.mode === 'reset'
    ? props.stage === 'otp' ? 'Задайте новый пароль' : 'Восстановление пароля'
    : props.stage === 'otp'
      ? props.factor === 'totp' ? 'Код из приложения' : props.factor === 'recovery' ? 'Резервный код' : 'Проверьте почту'
      : props.mode === 'register' ? 'Создайте аккаунт' : 'Добро пожаловать';
  const description = props.mode === 'reset'
    ? props.stage === 'otp'
      ? <>Введите код, отправленный на <strong>{props.email}</strong>, и задайте новый пароль.</>
      : 'Укажите email аккаунта. Если адрес зарегистрирован, мы отправим одноразовый код.'
    : props.stage === 'otp'
      ? props.factor === 'totp'
        ? 'Введите шестизначный код из приложения-аутентификатора.'
        : props.factor === 'recovery'
          ? 'Введите один из сохранённых одноразовых recovery-кодов.'
          : <>Шестизначный код отправлен на <strong>{props.email}</strong></>
      : props.mode === 'register'
        ? 'Подтвердите email одноразовым кодом и сразу переходите к игре.'
        : 'Войдите в аккаунт, чтобы продолжить';
  const needsPasswordConfirmation = (props.mode === 'register' && props.stage === 'credentials') || (props.mode === 'reset' && props.stage === 'otp');
  const invalidPasswordConfirmation = needsPasswordConfirmation && props.passwordConfirmation !== props.password;
  const codeLength = props.factor === 'recovery' ? 14 : 6;
  const submitDisabled = props.busy
    || (props.mode === 'reset' && props.stage === 'credentials' && props.email.trim().length === 0)
    || (props.stage === 'otp' && (props.code.length !== codeLength || (props.mode === 'reset' && (props.password.length < 10 || invalidPasswordConfirmation))))
    || (props.stage === 'credentials' && props.mode !== 'reset' && (props.password.length < 10 || invalidPasswordConfirmation));

  return <main className="vui-auth-page">
    <AuthHero />
    <section className="vui-auth-surface"><div aria-labelledby="auth-title" className="vui-auth-card">
      <div className="vui-auth-card__mobile-brand"><AuthBrand /></div>
      <div className="vui-auth-card__heading"><span>{props.mode === 'reset' ? 'Безопасность аккаунта' : props.stage === 'otp' ? 'Защищённый вход' : 'Ватрушка'}</span><h1 id="auth-title">{title}</h1><p>{description}</p></div>
      {props.stage === 'credentials' && props.mode !== 'reset' ? <UiSegmentedControl label="Режим авторизации" onChange={props.onMode} options={[{ value: 'password', label: 'Вход' }, { value: 'register', label: 'Регистрация' }]} value={props.mode} /> : null}
      <form className="vui-auth-form" onSubmit={submit}>
        {props.stage === 'credentials' ? <><UiInput autoComplete="email" autoFocus label="Email" leadingIcon="message" onChange={(event) => props.onEmailChange(event.target.value)} placeholder="you@example.com" type="email" value={props.email} />{props.mode === 'reset' ? null : <UiPasswordInput autoComplete={props.mode === 'register' ? 'new-password' : 'current-password'} label="Пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Минимум 10 символов" value={props.password} />}{props.mode === 'register' ? <UiPasswordInput autoComplete="new-password" {...(props.passwordConfirmation.length > 0 && invalidPasswordConfirmation ? { error: 'Пароли не совпадают' } : {})} label="Повторите пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordConfirmationChange(event.target.value)} value={props.passwordConfirmation} /> : null}{props.mode === 'password' ? <div className="vui-auth-form__options"><UiCheckbox checked={props.rememberSession} label="Запомнить меня" onChange={(event) => props.onRememberSessionChange(event.target.checked)} /><button onClick={props.onReset} type="button">Забыли пароль?</button></div> : null}</> : <><UiInput autoComplete="one-time-code" autoFocus className="vui-auth-otp" inputMode={props.factor === 'recovery' ? 'text' : 'numeric'} label={props.factor === 'totp' ? 'Код 2FA' : props.factor === 'recovery' ? 'Резервный код' : 'Код из письма'} maxLength={codeLength} onChange={(event) => props.onCodeChange(props.factor === 'recovery' ? event.target.value.toUpperCase().replace(/[^A-Z2-9-]/gu, '').slice(0, 14) : event.target.value.replace(/\D/gu, '').slice(0, 6))} placeholder={props.factor === 'recovery' ? 'XXXX-XXXX-XXXX' : '••••••'} value={props.code} />{props.mode === 'reset' ? <><UiPasswordInput autoComplete="new-password" label="Новый пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Минимум 10 символов" value={props.password} /><UiPasswordInput autoComplete="new-password" {...(props.passwordConfirmation.length > 0 && invalidPasswordConfirmation ? { error: 'Пароли не совпадают' } : {})} label="Повторите новый пароль" maxLength={128} minLength={10} onChange={(event) => props.onPasswordConfirmationChange(event.target.value)} value={props.passwordConfirmation} /></> : null}</>}
        {props.notice ? <div className="vui-auth-notice" role="status"><UiIcon name="check" size={17} /><span>{props.notice}</span></div> : null}
        {props.error ? <div className="vui-auth-error" role="alert"><UiIcon name="warning" size={17} /><span>{props.error}</span></div> : null}
        <UiButton className="vui-auth-submit" disabled={submitDisabled} icon={props.stage === 'otp' ? 'check' : 'send'} loading={props.busy} size="lg" type="submit">{props.mode === 'reset' ? props.stage === 'otp' ? 'Сохранить новый пароль' : 'Отправить код' : props.stage === 'otp' ? 'Подтвердить вход' : props.mode === 'register' ? 'Создать аккаунт' : 'Продолжить'}</UiButton>
      </form>
      {props.stage === 'otp' ? <div className="vui-auth-links"><button onClick={props.onBack} type="button">Назад</button>{props.factor === 'email' ? <button disabled={props.retrySeconds > 0 || props.busy} onClick={props.onRequest} type="button">{props.retrySeconds > 0 ? `Повторить через ${props.retrySeconds} с` : 'Отправить снова'}</button> : null}{props.mode === 'password' && props.factor !== 'email' ? <button disabled={props.busy} onClick={() => props.onFactor('email')} type="button">Код на email</button> : null}{props.mode === 'password' && props.factor !== 'totp' && props.totpAvailable ? <button disabled={props.busy} onClick={() => props.onFactor('totp')} type="button">Код 2FA</button> : null}{props.mode === 'password' && props.totpAvailable && props.factor !== 'recovery' ? <button disabled={props.busy} onClick={() => props.onFactor('recovery')} type="button">Recovery-код</button> : null}</div> : props.mode === 'reset' ? <div className="vui-auth-links"><button onClick={() => props.onMode('password')} type="button">Вернуться ко входу</button></div> : null}
      <div className="vui-auth-security"><UiIcon name="lock" size={14} /><span>{props.mode === 'reset' ? 'После восстановления все активные сессии будут завершены.' : 'Пароль не хранится на устройстве. Код действует 10 минут.'}</span></div>
    </div></section>
  </main>;
}

export function ProfilePanel({ value, busy, error, onChange, onSave }: { value: string; busy: boolean; error: string | null; onChange(value: string): void; onSave(): void }): ReactNode {
  return <main className="vui-auth-page vui-auth-page--profile"><AuthHero profile /><section className="vui-auth-surface"><div className="vui-auth-card"><div className="vui-auth-card__mobile-brand"><AuthBrand /></div><div className="vui-auth-card__heading"><UiBadge tone="success"><UiIcon name="check" size={13} /> Email подтверждён</UiBadge><h1>Как к вам обращаться?</h1><p>Имя можно будет изменить позже в настройках.</p></div><form className="vui-auth-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}><UiInput autoFocus label="Отображаемое имя" maxLength={30} minLength={2} onChange={(event) => onChange(event.target.value)} placeholder="Например, Алекс" value={value} />{error ? <div className="vui-auth-error" role="alert"><UiIcon name="warning" size={17} />{error}</div> : null}<UiButton disabled={busy || value.trim().length < 2} icon="check" loading={busy} size="lg">Сохранить и продолжить</UiButton></form></div></section></main>;
}
