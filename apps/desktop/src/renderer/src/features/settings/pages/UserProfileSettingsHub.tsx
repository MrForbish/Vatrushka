import { useCallback, useEffect, useRef } from "react";

import type {
  PublicUser,
  UserNotificationPreferences,
  UserPresence,
  UserProfileSettings,
} from "@vatrushka/shared";

import { UserNotificationSettingsPage } from "./UserNotificationSettingsPage";
import { UserPresenceSettingsPage } from "./UserPresenceSettingsPage";
import { UserProfileSettingsPage } from "./UserProfileSettingsPage";
import "./user-settings-pages.css";

export interface UserProfileSettingsHubProps {
  user: PublicUser;
  presence: UserPresence | null;
  presenceEnabled: boolean;
  onDirtyChange(dirty: boolean): void;
  onLoadProfile(): Promise<UserProfileSettings>;
  onSaveProfile(
    input: Pick<UserProfileSettings, "displayName" | "username" | "bio">,
  ): Promise<UserProfileSettings>;
  onAvatar(file: File): Promise<UserProfileSettings>;
  onResetAvatar(): Promise<UserProfileSettings>;
  onCover(file: File): Promise<UserProfileSettings>;
  onResetCover(): Promise<UserProfileSettings>;
  onProfileMediaChange(profile: UserProfileSettings): void;
  onUserChange(user: PublicUser): void;
  onLoadPresence(): Promise<UserPresence>;
  onUpdatePresence(input: {
    preference: UserPresence["preference"];
    customText: string | null;
    customTextExpiresAt: string | null;
  }): Promise<UserPresence>;
  onPresenceChange(presence: UserPresence): void;
  onLoadNotificationPreferences(): Promise<UserNotificationPreferences>;
  onUpdateNotificationPreferences(
    input: Omit<UserNotificationPreferences, "updatedAt">,
  ): Promise<UserNotificationPreferences>;
  onPreviewNotificationSound(): void;
}

type Column = "profile" | "presence" | "notifications";

export function UserProfileSettingsHub({
  onAvatar,
  onCover,
  onDirtyChange,
  onLoadNotificationPreferences,
  onLoadPresence,
  onLoadProfile,
  onPreviewNotificationSound,
  onProfileMediaChange,
  onPresenceChange,
  onResetAvatar,
  onResetCover,
  onSaveProfile,
  onUpdateNotificationPreferences,
  onUpdatePresence,
  onUserChange,
  presence,
  presenceEnabled,
  user,
}: UserProfileSettingsHubProps): React.JSX.Element {
  const dirtyRef = useRef<Record<Column, boolean>>({
    profile: false,
    presence: false,
    notifications: false,
  });
  const reportDirty = useCallback(
    (column: Column, dirty: boolean): void => {
      dirtyRef.current[column] = dirty;
      onDirtyChange(Object.values(dirtyRef.current).some(Boolean));
    },
    [onDirtyChange],
  );
  const reportProfileDirty = useCallback(
    (dirty: boolean) => reportDirty("profile", dirty),
    [reportDirty],
  );
  const reportPresenceDirty = useCallback(
    (dirty: boolean) => reportDirty("presence", dirty),
    [reportDirty],
  );
  const reportNotificationsDirty = useCallback(
    (dirty: boolean) => reportDirty("notifications", dirty),
    [reportDirty],
  );

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  return (
    <section
      aria-labelledby="user-profile-settings-hub-title"
      className="vui-profile-settings-hub"
    >
      <header className="vui-profile-settings-hub__heading">
        <span>Профиль</span>
        <h1 id="user-profile-settings-hub-title">Мой профиль</h1>
        <p>Управляйте профилем, статусом и настройками уведомлений.</p>
      </header>
      <div className="vui-profile-settings-hub__columns">
        <div className="vui-profile-settings-hub__group">
          <header>
            <h2 id="profile-column-title">Данные профиля</h2>
            <p>Основная информация профиля</p>
          </header>
          <section aria-labelledby="profile-column-title" className="vui-profile-settings-hub__column">
          <UserProfileSettingsPage
            embedded
            onAvatar={onAvatar}
            onCover={onCover}
            onDirtyChange={reportProfileDirty}
            onLoad={onLoadProfile}
            onProfileMediaChange={onProfileMediaChange}
            onResetAvatar={onResetAvatar}
            onResetCover={onResetCover}
            onSave={onSaveProfile}
            onUserChange={onUserChange}
            user={user}
          />
          </section>
        </div>
        <div className="vui-profile-settings-hub__group">
          <header>
            <h2 id="presence-column-title">Статус и активность</h2>
            <p>Управление присутствием и пользовательским статусом</p>
          </header>
          <section aria-labelledby="presence-column-title" className="vui-profile-settings-hub__column">
          {presenceEnabled ? (
            <UserPresenceSettingsPage
              embedded
              onDirtyChange={reportPresenceDirty}
              onLoad={onLoadPresence}
              onPresenceChange={onPresenceChange}
              onSave={onUpdatePresence}
              presence={presence}
            />
          ) : (
            <article className="vui-user-settings-card">
              <p>Настройки статуса временно недоступны.</p>
            </article>
          )}
          </section>
        </div>
        <div className="vui-profile-settings-hub__group">
          <header>
            <h2 id="notifications-column-title">Уведомления</h2>
            <p>Звуки, события и тихие часы</p>
          </header>
          <section aria-labelledby="notifications-column-title" className="vui-profile-settings-hub__column">
          <UserNotificationSettingsPage
            dndActive={presence?.preference === "do_not_disturb"}
            embedded
            onDirtyChange={reportNotificationsDirty}
            onLoad={onLoadNotificationPreferences}
            onPreviewSound={onPreviewNotificationSound}
            onSave={onUpdateNotificationPreferences}
          />
          </section>
        </div>
      </div>
    </section>
  );
}
