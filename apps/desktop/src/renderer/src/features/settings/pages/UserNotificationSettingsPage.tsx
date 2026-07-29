import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import type { NotificationPreviewMode, UserNotificationPreferences } from '@vatrushka/shared';

import { Input, Select, Switch } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import type { SettingsSaveState } from '../model/settings.types';
import './user-settings-pages.css';

type EditablePreferences = Omit<UserNotificationPreferences, 'updatedAt'>;

export interface UserNotificationSettingsPageProps {
  embedded?: boolean;
  dndActive: boolean;
  onDirtyChange(dirty: boolean): void;
  onLoad(): Promise<UserNotificationPreferences>;
  onPreviewSound(): void;
  onSave(input: EditablePreferences): Promise<UserNotificationPreferences>;
}

function editable(value: UserNotificationPreferences): EditablePreferences {
  return { desktopEnabled: value.desktopEnabled, soundEnabled: value.soundEnabled, previewMode: value.previewMode, directMessagesEnabled: value.directMessagesEnabled, mentionsEnabled: value.mentionsEnabled, quietHoursStart: value.quietHoursStart, quietHoursEnd: value.quietHoursEnd };
}

export function UserNotificationSettingsPage({ dndActive, embedded = false, onDirtyChange, onLoad, onPreviewSound, onSave }: UserNotificationSettingsPageProps): React.JSX.Element {
  const [saved, setSaved] = useState<UserNotificationPreferences | null>(null);
  const [form, setForm] = useState<EditablePreferences>({ desktopEnabled: true, soundEnabled: true, previewMode: 'full', directMessagesEnabled: true, mentionsEnabled: true, quietHoursStart: null, quietHoursEnd: null });
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SettingsSaveState>('idle');
  const dirty = saved !== null && JSON.stringify(form) !== JSON.stringify(editable(saved));
  const apply = (next: UserNotificationPreferences): void => { setSaved(next); setForm(editable(next)); setQuietEnabled(next.quietHoursStart !== null); };
  const load = useCallback((): void => { setLoading(true); setError(null); void onLoad().then(apply).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки уведомлений')).finally(() => setLoading(false)); }, [onLoad]);
  useEffect(load, [load]);
  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  if (loading && saved === null) return <SettingsPageState kind="loading" />;
  if (error !== null && saved === null) return <SettingsPageState description={error} kind="error" onAction={load} />;
  const update = <K extends keyof EditablePreferences>(key: K, value: EditablePreferences[K]): void => setForm((current) => ({ ...current, [key]: value }));
  const toggleQuiet = (enabled: boolean): void => {
    setQuietEnabled(enabled);
    setForm((current) => enabled
      ? { ...current, quietHoursStart: current.quietHoursStart ?? '22:00', quietHoursEnd: current.quietHoursEnd ?? '08:00' }
      : { ...current, quietHoursStart: null, quietHoursEnd: null });
  };
  const reset = (): void => { if (saved) apply(saved); setSaveState('idle'); };
  const save = (): void => { setSaveState('saving'); void onSave(form).then((next) => { apply(next); setSaveState('saved'); window.setTimeout(() => setSaveState('idle'), 1_800); }).catch(() => setSaveState('error')); };
  return <section {...(!embedded ? { "aria-labelledby": "user-notification-settings-title" } : {})} className="vui-user-settings-page">
    {!embedded ? <header className="vui-user-settings-page__heading"><div><span>Сигналы и центр уведомлений</span><h1 id="user-notification-settings-title">Уведомления</h1><p>Эти настройки синхронизируются между устройствами. «Не беспокоить» временно перекрывает их, не изменяя выбранные значения.</p></div></header> : null}
    {dndActive ? <aside className="vui-user-settings-note vui-user-settings-note--dnd"><strong>Статус «Не беспокоить» активен.</strong> Все звуки и системные уведомления временно отключены. События продолжают появляться в приложении и центре уведомлений.</aside> : null}
    <div className="vui-user-profile-settings__grid">
      <article className="vui-user-settings-card"><header><div><h2>Способ доставки</h2><p>Центр уведомлений и счётчики непрочитанных работают всегда.</p></div></header><Switch checked={form.desktopEnabled} description="Показывать системное уведомление, когда окно скрыто или не в фокусе." label="Системные уведомления" onCheckedChange={(value) => update('desktopEnabled', value)} /><Switch checked={form.soundEnabled} description="Один управляемый звуковой сигнал Ватрушки для разрешённых событий." label="Звуки уведомлений" onCheckedChange={(value) => update('soundEnabled', value)} /><button className="vui-user-settings-test" disabled={!form.soundEnabled || dndActive} onClick={onPreviewSound} type="button">Проверить звук</button></article>
      <article className="vui-user-settings-card"><header><div><h2>Какие события важны</h2><p>Настройки серверов и каналов могут дополнительно сузить доставку.</p></div></header><Switch checked={form.directMessagesEnabled} label="Личные сообщения" onCheckedChange={(value) => update('directMessagesEnabled', value)} /><Switch checked={form.mentionsEnabled} label="Упоминания и ответы" onCheckedChange={(value) => update('mentionsEnabled', value)} /><Select label="Текст системного уведомления" onValueChange={(value) => update('previewMode', value as NotificationPreviewMode)} options={[{ value: 'full', label: 'Имя и текст сообщения' }, { value: 'sender_only', label: 'Только отправитель' }, { value: 'hidden', label: 'Нейтральное уведомление' }]} value={form.previewMode} /></article>
      <article className="vui-user-settings-card"><header><div><h2>Тихие часы</h2><p>В выбранный интервал внешние звуки и системные уведомления отключаются, а центр уведомлений продолжает обновляться. Интервал считается по локальному времени текущего устройства.</p></div></header><Switch checked={quietEnabled} label="Включить тихие часы" onCheckedChange={toggleQuiet} />{quietEnabled ? <div className="vui-user-settings-time-grid"><Input label="Начало" onChange={(event) => update('quietHoursStart', event.target.value)} type="time" value={form.quietHoursStart ?? '22:00'} /><Input label="Окончание" onChange={(event) => update('quietHoursEnd', event.target.value)} type="time" value={form.quietHoursEnd ?? '08:00'} /></div> : null}</article>
    </div>
    <SettingsSaveBar onCancel={reset} onSave={save} state={saveState === 'idle' && dirty ? 'dirty' : saveState} />
  </section>;
}
