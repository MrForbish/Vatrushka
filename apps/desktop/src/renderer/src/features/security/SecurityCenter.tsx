import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';

import type { LocalSettings, PublicUser, SecurityEvent, TwoFactorEnableResult, TwoFactorSetup, UserSession } from '@vatrushka/shared';

import { apiClient } from '../../api';
import { Badge, Button, Input, PasswordInput, Switch } from '../../ui/primitives';
import { ConfirmDialog, Modal } from '../../ui/overlays';
import './security-center.css';

export type SecurityTab = 'protection' | 'notifications' | 'sessions' | 'recovery' | 'activity';
type ProtectionFlow = 'overview' | 'password' | 'totp-enable' | 'totp-disable' | 'recovery-regenerate';

export interface SecurityClient {
  requestPasswordSetup(): Promise<{ retryAfterSeconds: number }>;
  setPassword(code: string, password: string): Promise<PublicUser>;
  beginTwoFactorSetup(): Promise<TwoFactorSetup>;
  enableTwoFactor(code: string): Promise<TwoFactorEnableResult>;
  disableTwoFactor(code: string): Promise<PublicUser>;
  regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }>;
  listSessions(): Promise<UserSession[]>;
  setSessionTrusted(sessionId: string, trusted: boolean): Promise<void>;
  revokeSession(sessionId: string): Promise<{ current: boolean }>;
  revokeOtherSessions(): Promise<{ revokedCount: number }>;
  listSecurityEvents(): Promise<SecurityEvent[]>;
}

export interface SecurityCenterProps {
  open: boolean;
  user: PublicUser;
  presentation?: 'modal' | 'page';
  section?: SecurityTab;
  onSectionChange?: (section: SecurityTab) => void;
  onClose: () => void;
  onUserChange: (user: PublicUser) => void;
  onCurrentSessionRevoked: () => void;
  settings?: LocalSettings;
  onSettingsChange?: (settings: Pick<LocalSettings, 'desktopNotificationsEnabled' | 'messageSoundsEnabled'>) => void;
  client?: SecurityClient;
  dndActive?: boolean;
}

const eventCopy: Record<SecurityEvent['type'], { title: string; description: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  SESSION_CREATED: { title: 'Вход в аккаунт', description: 'Создана новая сессия', tone: 'success' },
  SESSION_REVOKED: { title: 'Сессия завершена', description: 'Доступ устройства отозван', tone: 'neutral' },
  PASSWORD_CHANGED: { title: 'Пароль изменён', description: 'Учётные данные обновлены', tone: 'success' },
  PASSWORD_RESET: { title: 'Пароль восстановлен', description: 'Все активные сессии завершены', tone: 'warning' },
  TWO_FACTOR_ENABLED: { title: '2FA включена', description: 'Добавлена защита приложением-аутентификатором', tone: 'success' },
  TWO_FACTOR_DISABLED: { title: '2FA отключена', description: 'Вход снова подтверждается по email', tone: 'warning' },
  RECOVERY_CODES_REGENERATED: { title: 'Резервные коды обновлены', description: 'Предыдущий набор больше не действует', tone: 'warning' },
  REFRESH_TOKEN_REUSE_DETECTED: { title: 'Подозрительная активность', description: 'Старый токен использован повторно; семейство сессии отозвано', tone: 'danger' },
  PROFILE_UPDATED: { title: 'Профиль изменён', description: 'Обновлены данные профиля', tone: 'neutral' },
  USERNAME_CHANGED: { title: 'Username изменён', description: 'Обновлён уникальный handle аккаунта', tone: 'warning' },
  EMAIL_CHANGED: { title: 'Email изменён', description: 'Новый адрес подтверждён', tone: 'warning' },
  ACCOUNT_DEACTIVATION_SCHEDULED: { title: 'Удаление запланировано', description: 'Начался 14-дневный срок отмены', tone: 'danger' },
  ACCOUNT_DEACTIVATION_CANCELLED: { title: 'Удаление отменено', description: 'Аккаунт остаётся активным', tone: 'success' },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие';
}

export function SecurityCenter({ client = apiClient, dndActive = false, onClose, onCurrentSessionRevoked, onSectionChange, onSettingsChange = () => undefined, onUserChange, open, presentation = 'modal', section, settings = { volume: 0.5, appSoundVolume: 0.5, desktopNotificationsEnabled: true, messageSoundsEnabled: true }, user }: SecurityCenterProps): React.JSX.Element {
  const [tab, setTab] = useState<SecurityTab>('protection');
  const [flow, setFlow] = useState<ProtectionFlow>('overview');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserSession | null>(null);
  const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);
  const activeTab = section ?? tab;

  const selectTab = (nextTab: SecurityTab): void => {
    if (section === undefined) setTab(nextTab);
    onSectionChange?.(nextTab);
    setFlow('overview');
    setError(null);
  };

  const loadSecurityData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [nextSessions, nextEvents] = await Promise.all([client.listSessions(), client.listSecurityEvents()]);
      setSessions(nextSessions);
      setEvents(nextEvents);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (section === undefined) setTab('protection');
    setFlow('overview');
    setCode('');
    setPassword('');
    setConfirmation('');
    setError(null);
    void loadSecurityData();
  }, [open]);

  useEffect(() => {
    if (section === undefined) return;
    setFlow('overview');
    setError(null);
  }, [section]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const startPassword = (): void => {
    void run(async () => {
      await client.requestPasswordSetup();
      setCode('');
      setFlow('password');
    });
  };

  const savePassword = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      if (password !== confirmation) throw new Error('Пароли не совпадают');
      const next = await client.setPassword(code, password);
      onUserChange(next);
      setFlow('overview');
      setCode('');
      setPassword('');
      setConfirmation('');
      await loadSecurityData();
    });
  };

  const startTotp = (): void => {
    void run(async () => {
      const nextSetup = await client.beginTwoFactorSetup();
      setSetup(nextSetup);
      setQrDataUrl(await QRCode.toDataURL(nextSetup.otpauthUri, { width: 220, margin: 1, color: { dark: '#07111b', light: '#f4f7fb' } }));
      setCode('');
      setFlow('totp-enable');
    });
  };

  const enableTotp = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      const result = await client.enableTwoFactor(code);
      onUserChange(result.user);
      setRecoveryCodes(result.recoveryCodes);
      selectTab('recovery');
      setCode('');
      await loadSecurityData();
    });
  };

  const disableTotp = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      onUserChange(await client.disableTwoFactor(code));
      setRecoveryCodes([]);
      setCode('');
      setFlow('overview');
      await loadSecurityData();
    });
  };

  const regenerateCodes = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      const result = await client.regenerateRecoveryCodes(code);
      setRecoveryCodes(result.recoveryCodes);
      setCode('');
      selectTab('recovery');
      await loadSecurityData();
    });
  };

  const toggleTrust = (session: UserSession): void => {
    void run(async () => {
      await client.setSessionTrusted(session.id, !session.trusted);
      setSessions((current) => current.map((item) => item.id === session.id ? { ...item, trusted: !item.trusted } : item));
    });
  };

  const confirmRevoke = (): void => {
    if (!revokeTarget) return;
    void run(async () => {
      const result = await client.revokeSession(revokeTarget.id);
      setRevokeTarget(null);
      if (result.current) {
        onCurrentSessionRevoked();
        onClose();
        return;
      }
      await loadSecurityData();
    });
  };

  const confirmRevokeOthers = (): void => {
    void run(async () => {
      await client.revokeOtherSessions();
      setRevokeOthersOpen(false);
      await loadSecurityData();
    });
  };

  const copyCodes = (): void => {
    void window.desktop.copyToClipboard(recoveryCodes.join('\n'));
  };

  const center = (
    <div className="security-center" data-presentation={presentation}>
        {presentation === 'modal' ? <nav aria-label="Разделы безопасности" className="security-center__tabs">
          {([['protection', 'Защита'], ['notifications', 'Уведомления'], ['sessions', 'Сессии'], ['recovery', 'Резервные коды'], ['activity', 'Активность']] as const).map(([value, label]) =>
            <button aria-current={activeTab === value ? 'page' : undefined} key={value} onClick={() => selectTab(value)} type="button">{label}</button>)}
        </nav> : null}

        <section className="security-center__content">
          {activeTab === 'protection' && flow === 'overview' && <div className="security-stack">
            <article className="security-card">
              <div><div className="security-card__title"><h3>Пароль</h3><Badge tone="success">Настроен</Badge></div><p>Пароль всегда подтверждается вторым фактором и хранится только как стойкий хеш.</p></div>
              <Button disabled={busy} onClick={startPassword} variant="secondary">Изменить пароль</Button>
            </article>
            <article className="security-card">
              <div><div className="security-card__title"><h3>Приложение 2FA</h3><Badge tone={user.twoFactorEnabled ? 'success' : 'neutral'}>{user.twoFactorEnabled ? 'Включено' : 'Выключено'}</Badge></div><p>Коды TOTP работают без доступа к почте. При включении выдаются десять одноразовых recovery-кодов.</p></div>
              <Button disabled={busy} onClick={user.twoFactorEnabled ? () => { setCode(''); setFlow('totp-disable'); } : startTotp} variant="secondary">{user.twoFactorEnabled ? 'Отключить' : 'Подключить 2FA'}</Button>
            </article>
            <article className="security-card">
              <div><div className="security-card__title"><h3>Резервные коды</h3><Badge tone={user.twoFactorEnabled ? 'success' : 'neutral'}>{user.twoFactorEnabled ? 'Доступны' : 'Нужна 2FA'}</Badge></div><p>Одноразовые коды помогут войти, если приложение-аутентификатор временно недоступно.</p></div>
              <Button disabled={busy || !user.twoFactorEnabled} onClick={() => selectTab('recovery')} variant="secondary">Управлять кодами</Button>
            </article>
            <aside className="security-notice"><strong>Уведомления включены</strong><span>При входе и критичных изменениях событие появится здесь, а уведомление уйдёт на {user.email}.</span></aside>
          </div>}

          {activeTab === 'protection' && flow === 'password' && <form className="security-form" onSubmit={savePassword}>
            <h3>Изменить пароль</h3><p>Шестизначный код отправлен на {user.email}.</p>
            <Input autoComplete="one-time-code" inputMode="numeric" label="Код из письма" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <PasswordInput autoComplete="new-password" label="Новый пароль" maxLength={128} minLength={10} onChange={(event) => setPassword(event.target.value)} value={password} />
            <PasswordInput autoComplete="new-password" label="Повторите пароль" maxLength={128} minLength={10} onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
            <div className="security-form__actions"><Button onClick={() => setFlow('overview')} type="button" variant="quiet">Назад</Button><Button disabled={code.length !== 6 || password.length < 10} loading={busy}>Сохранить</Button></div>
          </form>}

          {activeTab === 'notifications' && <div className="security-stack">
            <div className="security-section-heading"><div><h3>Уведомления о сообщениях</h3><p>Настройки хранятся только на этом компьютере и применяются сразу.</p></div></div>
            {dndActive ? <aside className="security-notice"><strong>Статус «Не беспокоить» активен</strong><span>Все звуки и системные уведомления временно отключены. Сообщения и счётчики непрочитанных продолжают обновляться.</span></aside> : null}
            <article className="security-card"><div><h3>Push-уведомления Windows</h3><p>Показывать автора, канал и текст нового сообщения, даже когда окно приложения открыто.</p></div><Switch checked={settings.desktopNotificationsEnabled} disabled={dndActive} label="Push-уведомления" onCheckedChange={(checked) => onSettingsChange({ desktopNotificationsEnabled: checked, messageSoundsEnabled: settings.messageSoundsEnabled })} /></article>
            <article className="security-card"><div><h3>Звук сообщения</h3><p>Проигрывать короткий ненавязчивый сигнал на выбранном устройстве вывода.</p></div><Switch checked={settings.messageSoundsEnabled} disabled={dndActive} label="Звуковые уведомления" onCheckedChange={(checked) => onSettingsChange({ desktopNotificationsEnabled: settings.desktopNotificationsEnabled, messageSoundsEnabled: checked })} /></article>
          </div>}

          {activeTab === 'protection' && flow === 'totp-enable' && <form className="security-form" onSubmit={enableTotp}>
            <h3>Подключить 2FA</h3><p>Отсканируйте QR-код, затем введите код из приложения.</p>
            {qrDataUrl && <img alt="QR-код для настройки 2FA" className="security-qr" src={qrDataUrl} />}
            {setup && <div className="security-secret"><span>Ключ для ручного ввода</span><code>{setup.secret}</code><Button onClick={() => void window.desktop.copyToClipboard(setup.secret)} size="sm" type="button" variant="quiet">Копировать</Button></div>}
            <Input autoComplete="one-time-code" inputMode="numeric" label="Код из приложения" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <div className="security-form__actions"><Button onClick={() => setFlow('overview')} type="button" variant="quiet">Назад</Button><Button disabled={code.length !== 6} loading={busy}>Включить 2FA</Button></div>
          </form>}

          {activeTab === 'protection' && flow === 'totp-disable' && <form className="security-form" onSubmit={disableTotp}>
            <h3>Отключить 2FA?</h3><p>Все recovery-коды будут удалены. Введите текущий код из приложения.</p>
            <Input autoComplete="one-time-code" inputMode="numeric" label="Код из приложения" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <div className="security-form__actions"><Button onClick={() => setFlow('overview')} type="button" variant="quiet">Назад</Button><Button disabled={code.length !== 6} loading={busy} variant="danger">Отключить 2FA</Button></div>
          </form>}

          {activeTab === 'sessions' && <div className="security-stack">
            <div className="security-section-heading"><div><h3>Активные устройства</h3><p>Отметка «Доверенное» подтверждает, что вы узнаёте устройство, но не отключает 2FA. Ротация токена не создаёт здесь дубликаты.</p></div><div className="security-section-actions"><Button disabled={busy || sessions.every((session) => session.current)} onClick={() => setRevokeOthersOpen(true)} size="sm" variant="danger">Завершить остальные</Button><Button disabled={loading} icon="refresh" onClick={() => void loadSecurityData()} size="sm" variant="quiet">Обновить</Button></div></div>
            {sessions.map((session) => <article className="session-card" key={session.id}>
              <div className="session-card__icon" aria-hidden="true">◈</div>
              <div className="session-card__copy"><div><strong>{session.deviceName}</strong>{session.current && <Badge tone="primary">Это устройство</Badge>}{session.trusted && <Badge tone="success">Доверенное</Badge>}</div><span>Активность: {formatDate(session.lastUsedAt)} · истекает {formatDate(session.expiresAt)}</span></div>
              <div className="session-card__actions"><Button disabled={busy} onClick={() => toggleTrust(session)} size="sm" variant="quiet">{session.trusted ? 'Убрать доверие' : 'Доверять'}</Button><Button disabled={busy} onClick={() => setRevokeTarget(session)} size="sm" variant="danger">Завершить</Button></div>
            </article>)}
            {!loading && sessions.length === 0 && <p className="security-empty">Активных сессий не найдено.</p>}
          </div>}

          {activeTab === 'recovery' && flow !== 'recovery-regenerate' && <div className="security-stack">
            <div className="security-section-heading"><div><h3>Резервные коды</h3><p>Каждый код работает один раз. На сервере хранятся только их хеши.</p></div>{user.twoFactorEnabled && <Button onClick={() => { setCode(''); setFlow('recovery-regenerate'); }} variant="secondary">Создать новый набор</Button>}</div>
            {!user.twoFactorEnabled && <aside className="security-notice"><strong>Сначала включите 2FA</strong><span>Резервные коды создаются вместе с приложением-аутентификатором.</span></aside>}
            {recoveryCodes.length > 0 && <><div className="recovery-grid">{recoveryCodes.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}</div><div className="recovery-actions"><Button icon="copy" onClick={copyCodes} variant="secondary">Копировать все</Button><span>Сохраните коды сейчас — повторно этот набор не показывается.</span></div></>}
            {user.twoFactorEnabled && recoveryCodes.length === 0 && <p className="security-empty">Действующие коды скрыты. Если они потеряны, создайте новый набор — старый будет отозван.</p>}
          </div>}

          {activeTab === 'recovery' && flow === 'recovery-regenerate' && <form className="security-form" onSubmit={regenerateCodes}>
            <h3>Новый набор recovery-кодов</h3><p>Подтвердите действие кодом из приложения-аутентификатора.</p>
            <Input autoComplete="one-time-code" inputMode="numeric" label="Код из приложения" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <div className="security-form__actions"><Button onClick={() => setFlow('overview')} type="button" variant="quiet">Назад</Button><Button disabled={code.length !== 6} loading={busy}>Обновить коды</Button></div>
          </form>}

          {activeTab === 'activity' && <div className="security-stack">
            <div className="security-section-heading"><div><h3>События безопасности</h3><p>Последние 50 действий, связанных с доступом к аккаунту.</p></div><Button disabled={loading} icon="refresh" onClick={() => void loadSecurityData()} size="sm" variant="quiet">Обновить</Button></div>
            <div className="security-timeline">{events.map((securityEvent) => { const copy = eventCopy[securityEvent.type]; return <article key={securityEvent.id}><span className={`security-timeline__dot security-timeline__dot--${copy.tone}`} /><div><div><strong>{copy.title}</strong><Badge tone={copy.tone}>{formatDate(securityEvent.createdAt)}</Badge></div><p>{copy.description}{securityEvent.deviceName ? ` · ${securityEvent.deviceName}` : ''}</p></div></article>; })}</div>
            {!loading && events.length === 0 && <p className="security-empty">Событий пока нет.</p>}
          </div>}

          {error && <div className="security-error" role="alert">{error}</div>}
        </section>
      </div>
  );

  return <>
    {presentation === 'modal' ? <Modal description="Пароль, 2FA, активные устройства и события аккаунта" onClose={onClose} open={open} size="xl" title="Безопасность аккаунта">{center}</Modal> : open ? center : null}
    <ConfirmDialog confirmLabel={revokeTarget?.current ? 'Выйти' : 'Завершить'} danger description={revokeTarget?.current ? 'Это текущая сессия. Приложение вернётся на экран входа.' : `Устройство «${revokeTarget?.deviceName ?? ''}» потеряет доступ и должно будет войти снова.`} loading={busy} onClose={() => setRevokeTarget(null)} onConfirm={confirmRevoke} open={revokeTarget !== null} title="Завершить сессию?" />
    <ConfirmDialog confirmLabel="Завершить остальные" danger description="Все устройства, кроме текущего, потеряют доступ и должны будут войти снова." loading={busy} onClose={() => setRevokeOthersOpen(false)} onConfirm={confirmRevokeOthers} open={revokeOthersOpen} title="Завершить остальные сессии?" />
  </>;
}
