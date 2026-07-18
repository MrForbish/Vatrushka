import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import type { PresencePreference, UserPresence } from '@vatrushka/shared';

import { Badge, Input, Select, StatusDot } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import type { SettingsSaveState } from '../model/settings.types';
import './user-settings-pages.css';

const presenceOptions: Array<{ value: PresencePreference; label: string; status: 'online' | 'idle' | 'dnd' | 'offline'; description: string }> = [
  { value: 'online', label: 'В сети', status: 'online', description: 'Готовы получать сообщения и уведомления.' },
  { value: 'idle', label: 'Неактивен', status: 'idle', description: 'Показывает, что вы отошли.' },
  { value: 'do_not_disturb', label: 'Не беспокоить', status: 'dnd', description: 'Отключает все звуки и внешние уведомления.' },
  { value: 'invisible', label: 'Невидимый', status: 'offline', description: 'Для других вы будете отображаться не в сети.' },
];

export interface UserPresenceSettingsPageProps {
  presence: UserPresence | null;
  onDirtyChange(dirty: boolean): void;
  onLoad(): Promise<UserPresence>;
  onSave(input: { preference: PresencePreference; customText: string | null; customTextExpiresAt: string | null }): Promise<UserPresence>;
  onPresenceChange(presence: UserPresence): void;
}

function expiry(option: string): string | null {
  const now = new Date();
  if (option === 'hour') return new Date(now.getTime() + 60 * 60 * 1_000).toISOString();
  if (option === 'four-hours') return new Date(now.getTime() + 4 * 60 * 60 * 1_000).toISOString();
  if (option === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return null;
}

function expiryOption(expiresAt: string | null): string {
  if (expiresAt === null) return 'never';
  const remaining = new Date(expiresAt).getTime() - Date.now();
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  if (Math.abs(new Date(expiresAt).getTime() - nextMidnight.getTime()) < 60_000) return 'today';
  if (remaining <= 65 * 60 * 1_000) return 'hour';
  return 'four-hours';
}

function presenceTone(preference: PresencePreference): 'success' | 'warning' | 'danger' | 'neutral' {
  if (preference === 'online') return 'success';
  if (preference === 'idle') return 'warning';
  if (preference === 'do_not_disturb') return 'danger';
  return 'neutral';
}

export function UserPresenceSettingsPage({ onDirtyChange, onLoad, onPresenceChange, onSave, presence }: UserPresenceSettingsPageProps): React.JSX.Element {
  const [preference, setPreference] = useState<PresencePreference>(presence?.preference ?? 'online');
  const [customText, setCustomText] = useState(presence?.customText ?? '');
  const [clearAfter, setClearAfter] = useState(() => expiryOption(presence?.customTextExpiresAt ?? null));
  const [savedClearAfter, setSavedClearAfter] = useState(() => expiryOption(presence?.customTextExpiresAt ?? null));
  const [loading, setLoading] = useState(presence === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SettingsSaveState>('idle');
  const dirty = presence !== null && (preference !== presence.preference || customText !== (presence.customText ?? '') || clearAfter !== savedClearAfter);
  const applyPresence = useCallback((next: UserPresence): void => {
    onPresenceChange(next);
    setPreference(next.preference);
    setCustomText(next.customText ?? '');
    const nextClearAfter = expiryOption(next.customTextExpiresAt);
    setClearAfter(nextClearAfter);
    setSavedClearAfter(nextClearAfter);
  }, [onPresenceChange]);
  const load = useCallback((): void => {
    setLoading(true);
    setLoadError(null);
    void onLoad().then(applyPresence).catch((caught: unknown) => setLoadError(caught instanceof Error ? caught.message : 'Не удалось загрузить статус')).finally(() => setLoading(false));
  }, [applyPresence, onLoad]);

  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void onLoad().then((next) => {
      if (!active) return;
      applyPresence(next);
      setLoadError(null);
    }).catch((caught: unknown) => { if (active) setLoadError(caught instanceof Error ? caught.message : 'Не удалось загрузить статус'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyPresence, onLoad]);

  const reset = (): void => {
    if (!presence) return;
    setPreference(presence.preference);
    setCustomText(presence.customText ?? '');
    const nextClearAfter = expiryOption(presence.customTextExpiresAt);
    setClearAfter(nextClearAfter);
    setSavedClearAfter(nextClearAfter);
    setSaveState('idle');
  };
  const save = (): void => {
    setSaveState('saving');
    void onSave({ preference, customText: customText.trim() || null, customTextExpiresAt: customText.trim() ? expiry(clearAfter) : null }).then((next) => {
      applyPresence(next);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1_800);
    }).catch(() => setSaveState('error'));
  };

  if (loading && presence === null) return <SettingsPageState kind="loading" />;
  if (loadError !== null && presence === null) return <SettingsPageState description={loadError} kind="error" onAction={load} />;
  return (
    <section className="vui-user-settings-page" aria-labelledby="user-presence-settings-title">
      <header className="vui-user-settings-page__heading"><div><span>Присутствие</span><h1 id="user-presence-settings-title">Статус и активность</h1><p>Статус синхронизируется через сервер и применяется на всех ваших устройствах.</p></div><Badge tone={presenceTone(preference)}>{presenceOptions.find((option) => option.value === preference)?.label}</Badge></header>
      <article className="vui-user-settings-card"><header><div><h2>Кто видит вас сейчас</h2><p>Выбранный вами статус не изменится автоматически, когда вы отходите от компьютера.</p></div></header><div className="vui-presence-options" role="radiogroup" aria-label="Статус присутствия">{presenceOptions.map((option) => <button aria-checked={preference === option.value} key={option.value} onClick={() => { setPreference(option.value); setSaveState('dirty'); }} role="radio" type="button"><StatusDot label={option.label} status={option.status} /><span><strong>{option.label}</strong><small>{option.description}</small></span></button>)}</div></article>
      <article className="vui-user-settings-card"><header><div><h2>Пользовательский статус</h2><p>Короткая подпись рядом с вашим профилем.</p></div></header><Input label="Текст статуса" maxLength={128} onChange={(event) => { setCustomText(event.target.value); setSaveState('dirty'); }} placeholder="Например: работаю над релизом" value={customText} /><Select disabled={customText.trim().length === 0} label="Очистить статус" onValueChange={(value) => { setClearAfter(value); setSaveState('dirty'); }} options={[{ value: 'hour', label: 'Через 1 час' }, { value: 'four-hours', label: 'Через 4 часа' }, { value: 'today', label: 'Сегодня' }, { value: 'never', label: 'Не очищать' }]} value={clearAfter} /></article>
      {preference === 'do_not_disturb' ? <aside className="vui-user-settings-note vui-user-settings-note--dnd"><strong>Режим «Не беспокоить» активен.</strong> Все звуки и внешние уведомления отключены, но сообщения и unread-счётчики сохраняются.</aside> : null}
      <SettingsSaveBar onCancel={reset} onSave={save} state={saveState === 'idle' && dirty ? 'dirty' : saveState} />
    </section>
  );
}
