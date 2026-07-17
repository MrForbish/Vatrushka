import { useEffect, useState } from 'react';

import { displayNameSchema, type PublicUser } from '@vatrushka/shared';

import { Avatar, Badge, Input } from '../../../ui';
import { SettingsSaveBar } from '../components/SettingsSaveBar';
import type { SettingsSaveState } from '../model/settings.types';
import './user-settings-pages.css';

export interface UserProfileSettingsPageProps {
  user: PublicUser;
  onDirtyChange(dirty: boolean): void;
  onSave(displayName: string): Promise<PublicUser>;
  onUserChange(user: PublicUser): void;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Не удалось сохранить профиль';
}

export function UserProfileSettingsPage({ onDirtyChange, onSave, onUserChange, user }: UserProfileSettingsPageProps): React.JSX.Element {
  const savedName = user.displayName ?? '';
  const [displayName, setDisplayName] = useState(savedName);
  const [saveState, setSaveState] = useState<SettingsSaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const dirty = displayName !== savedName;
  const effectiveSaveState = !dirty && saveState === 'dirty' ? 'idle' : saveState === 'idle' && dirty ? 'dirty' : saveState;
  const previewName = displayName.trim().length > 0 ? displayName.trim() : user.email.split('@')[0] ?? user.email;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const reset = (): void => {
    setDisplayName(savedName);
    setError(null);
    setSaveState('idle');
  };

  const save = (): void => {
    const result = displayNameSchema.safeParse(displayName);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Проверьте отображаемое имя');
      setSaveState('error');
      return;
    }
    setError(null);
    setSaveState('saving');
    void onSave(result.data).then((updatedUser) => {
      setDisplayName(updatedUser.displayName ?? '');
      onUserChange(updatedUser);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1_800);
    }).catch((caught) => {
      setError(errorMessage(caught));
      setSaveState('error');
    });
  };

  return (
    <section className="vui-user-settings-page" aria-labelledby="user-profile-settings-title">
      <header className="vui-user-settings-page__heading">
        <div><span>Профиль</span><h1 id="user-profile-settings-title">Мой профиль</h1><p>Изменения отображаемого имени видны во всех серверах и сообщениях.</p></div>
        <Badge tone={saveState === 'saved' ? 'success' : 'neutral'}>{saveState === 'saved' ? 'Синхронизировано' : dirty ? 'Есть изменения' : 'Актуально'}</Badge>
      </header>
      <div className="vui-user-profile-settings__grid">
        <article className="vui-user-settings-card">
          <header><div><h2>Основная информация</h2><p>Сейчас сервер поддерживает изменение отображаемого имени.</p></div></header>
          <Input {...(error === null ? {} : { error })} label="Отображаемое имя" maxLength={30} minLength={2} onChange={(event) => { setDisplayName(event.target.value); setError(null); setSaveState('dirty'); }} value={displayName} />
          <div className="vui-user-settings-readonly"><span>Email</span><strong>{user.email}</strong><small>Email и параметры входа изменяются в разделе безопасности.</small></div>
        </article>
        <article className="vui-user-settings-card vui-user-profile-preview">
          <header><div><h2>Предпросмотр профиля</h2><p>Так вас видят другие участники.</p></div></header>
          <div className="vui-user-profile-preview__banner" />
          <Avatar name={previewName} size="lg" status="online" />
          <strong>{previewName}</strong>
          <small>{user.email}</small>
          {user.platformRole === 'owner' ? <Badge tone="founder">Основатель · разработчик</Badge> : null}
        </article>
      </div>
      <aside className="vui-user-settings-note">Аватар, уникальный username и bio появятся только после добавления соответствующих backend-контрактов — неработающих полей на странице нет.</aside>
      <SettingsSaveBar onCancel={reset} onSave={save} state={effectiveSaveState} />
    </section>
  );
}
