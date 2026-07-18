import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import type { BlockedUserSettings, DirectMessagePrivacy, PresenceVisibility, UserPrivacySettings } from '@vatrushka/shared';

import { Button, Select, Switch } from '../../../ui';
import { SettingsPageState } from '../components/SettingsPageState';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import type { SettingsSaveState } from '../model/settings.types';
import './user-settings-pages.css';

export interface UserPrivacySettingsPageProps {
  onDirtyChange(dirty: boolean): void;
  onLoad(): Promise<UserPrivacySettings>;
  onSave(input: Pick<UserPrivacySettings, 'directMessages' | 'presenceVisibility' | 'activityVisible'>): Promise<UserPrivacySettings>;
  onLoadBlocked(): Promise<BlockedUserSettings[]>;
  onUnblock(userId: string): Promise<void>;
}

export function UserPrivacySettingsPage({ onDirtyChange, onLoad, onLoadBlocked, onSave, onUnblock }: UserPrivacySettingsPageProps): React.JSX.Element {
  const [saved, setSaved] = useState<UserPrivacySettings | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessagePrivacy>('shared_servers');
  const [presenceVisibility, setPresenceVisibility] = useState<PresenceVisibility>('shared_servers');
  const [activityVisible, setActivityVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SettingsSaveState>('idle');
  const [blocked, setBlocked] = useState<BlockedUserSettings[]>([]);
  const dirty = saved !== null && (directMessages !== saved.directMessages || presenceVisibility !== saved.presenceVisibility || activityVisible !== saved.activityVisible);
  const apply = (next: UserPrivacySettings): void => { setSaved(next); setDirectMessages(next.directMessages); setPresenceVisibility(next.presenceVisibility); setActivityVisible(next.activityVisible); };
  const load = useCallback((): void => { setLoading(true); setError(null); void onLoad().then(apply).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки')).finally(() => setLoading(false)); }, [onLoad]);

  useEffect(load, [load]);
  useEffect(() => { void onLoadBlocked().then(setBlocked).catch(() => undefined); }, [onLoadBlocked]);
  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  if (loading && saved === null) return <SettingsPageState kind="loading" />;
  if (error !== null && saved === null) return <SettingsPageState description={error} kind="error" onAction={load} />;
  const reset = (): void => { if (saved) apply(saved); setSaveState('idle'); };
  const save = (): void => { setSaveState('saving'); void onSave({ directMessages, presenceVisibility, activityVisible }).then((next) => { apply(next); setSaveState('saved'); window.setTimeout(() => setSaveState('idle'), 1_800); }).catch(() => setSaveState('error')); };
  return (
    <section className="vui-user-settings-page" aria-labelledby="user-privacy-settings-title">
      <header className="vui-user-settings-page__heading"><div><span>Приватность</span><h1 id="user-privacy-settings-title">Конфиденциальность</h1><p>Правила применяются сервером, а не только скрывают элементы на этом компьютере.</p></div></header>
      <div className="vui-user-profile-settings__grid">
        <article className="vui-user-settings-card"><header><div><h2>Личные сообщения</h2><p>Ограничение проверяется при создании диалога и отправке новых сообщений.</p></div></header><Select label="Кто может писать вам" onValueChange={(value) => setDirectMessages(value as DirectMessagePrivacy)} options={[{ value: 'shared_servers', label: 'Участники общих серверов' }, { value: 'nobody', label: 'Никто' }]} value={directMessages} /></article>
        <article className="vui-user-settings-card"><header><div><h2>Присутствие</h2><p>Невидимый статус никогда не раскрывается другим участникам.</p></div></header><Select label="Кто видит ваш online-статус" onValueChange={(value) => setPresenceVisibility(value as PresenceVisibility)} options={[{ value: 'shared_servers', label: 'Участники общих серверов' }, { value: 'nobody', label: 'Никто' }]} value={presenceVisibility} /><Switch checked={activityVisible} description="Разрешить показывать недавнюю активность в поддерживаемых профилях." label="Показывать активность" onCheckedChange={setActivityVisible} /></article>
      </div>
      <article className="vui-user-settings-card"><header><div><h2>Заблокированные пользователи</h2><p>Блокировка запрещает личные сообщения в обе стороны.</p></div></header>{blocked.length === 0 ? <aside className="vui-user-settings-note">Список пуст.</aside> : <div className="vui-user-blocked-list">{blocked.map((item) => <div key={item.userId}><span><strong>{item.displayName}</strong><small>{item.username ? `@${item.username}` : `с ${new Date(item.blockedAt).toLocaleDateString('ru-RU')}`}</small></span><Button size="sm" variant="secondary" onClick={() => void onUnblock(item.userId).then(() => setBlocked((current) => current.filter((candidate) => candidate.userId !== item.userId)))}>Разблокировать</Button></div>)}</div>}</article>
      <aside className="vui-user-settings-note">Экспорт и удаление персональных данных доступны в разделе «Аккаунт».</aside>
      <SettingsSaveBar onCancel={reset} onSave={save} state={saveState === 'idle' && dirty ? 'dirty' : saveState} />
    </section>
  );
}
