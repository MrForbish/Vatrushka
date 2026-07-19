import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import {
  displayNameSchema,
  usernameSchema,
  type PublicUser,
  type UserProfileSettings,
} from "@vatrushka/shared";

import { ClientError } from "../../../api";
import { Avatar, Badge, Button, FilePicker, Input } from "../../../ui";
import { SettingsPageState } from "../components/SettingsPageState";
import { SettingsSaveBar } from "../components/SettingsSaveBar";
import type { SettingsSaveState } from "../model/settings.types";
import "./user-settings-pages.css";

export interface UserProfileSettingsPageProps {
  user: PublicUser;
  onDirtyChange(dirty: boolean): void;
  onLoad(): Promise<UserProfileSettings>;
  onSave(
    input: Pick<UserProfileSettings, "displayName" | "username" | "bio">,
  ): Promise<UserProfileSettings>;
  onAvatar(file: File): Promise<UserProfileSettings>;
  onResetAvatar(): Promise<UserProfileSettings>;
  onCover?(file: File): Promise<UserProfileSettings>;
  onResetCover?(): Promise<UserProfileSettings>;
  onUserChange(user: PublicUser): void;
}

function errorMessage(caught: unknown): string {
  if (
    caught instanceof ClientError &&
    typeof caught.details === "object" &&
    caught.details !== null &&
    "message" in caught.details &&
    typeof caught.details.message === "string"
  )
    return caught.details.message;
  return caught instanceof Error
    ? caught.message
    : "Не удалось сохранить профиль";
}

export function UserProfileSettingsPage({
  onAvatar,
  onCover,
  onDirtyChange,
  onLoad,
  onResetAvatar,
  onResetCover,
  onSave,
  onUserChange,
  user,
}: UserProfileSettingsPageProps): React.JSX.Element {
  const [saved, setSaved] = useState<UserProfileSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SettingsSaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const apply = (profile: UserProfileSettings): void => {
    setSaved(profile);
    setDisplayName(profile.displayName);
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
  };
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void onLoad()
      .then(apply)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, [onLoad]);
  useEffect(load, [load]);

  const dirty =
    saved !== null &&
    (displayName !== saved.displayName ||
      (username || null) !== saved.username ||
      (bio || null) !== saved.bio);
  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  if (loading && !saved) return <SettingsPageState kind="loading" />;
  if (!saved)
    return (
      <SettingsPageState
        {...(error ? { description: error } : {})}
        kind="error"
        onAction={load}
      />
    );

  const reset = (): void => {
    apply(saved);
    setError(null);
    setSaveState("idle");
  };
  const save = (): void => {
    const nameResult = displayNameSchema.safeParse(displayName);
    const usernameResult = username ? usernameSchema.safeParse(username) : null;
    if (!nameResult.success) {
      setError(nameResult.error.issues[0]?.message ?? "Проверьте имя");
      setSaveState("error");
      return;
    }
    if (usernameResult && !usernameResult.success) {
      setError(usernameResult.error.issues[0]?.message ?? "Проверьте username");
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    setError(null);
    void onSave({
      displayName: nameResult.data,
      username: usernameResult?.data ?? null,
      bio: bio.trim() || null,
    })
      .then((next) => {
        apply(next);
        onUserChange({
          ...user,
          displayName: next.displayName,
          avatarUrl: next.avatarUrl,
        });
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1_800);
      })
      .catch((caught) => {
        setError(errorMessage(caught));
        setSaveState("error");
      });
  };
  const avatarAction = (action: () => Promise<UserProfileSettings>): void => {
    setLoading(true);
    setError(null);
    void action()
      .then((next) => {
        apply(next);
        onUserChange({ ...user, avatarUrl: next.avatarUrl });
        setAvatarFileName(null);
        setCoverFileName(null);
      })
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  };
  const previewName =
    displayName.trim() || user.email.split("@")[0] || user.email;

  return (
    <section
      className="vui-user-settings-page"
      aria-labelledby="user-profile-settings-title"
    >
      <header className="vui-user-settings-page__heading">
        <div>
          <span>Профиль</span>
          <h1 id="user-profile-settings-title">Мой профиль</h1>
          <p>
            Имя, уникальный username, bio и аватар синхронизируются между всеми
            устройствами.
          </p>
        </div>
        <Badge tone={saveState === "saved" ? "success" : "neutral"}>
          {saveState === "saved"
            ? "Синхронизировано"
            : dirty
              ? "Есть изменения"
              : "Актуально"}
        </Badge>
      </header>
      <div className="vui-user-profile-settings__grid">
        <article className="vui-user-settings-card">
          <header>
            <div>
              <h2>Основная информация</h2>
              <p>Username уникален и меняется не чаще одного раза в 7 дней.</p>
            </div>
          </header>
          <div className="vui-user-profile-avatar-editor">
            {saved.avatarUrl ? (
              <img alt="Текущий аватар" src={saved.avatarUrl} />
            ) : (
              <Avatar name={previewName} size="lg" status="online" />
            )}
            <FilePicker
              accept="image/png,image/jpeg,image/webp"
              disabled={loading}
              label="Загрузить аватар"
              onFile={(file) => {
                setAvatarFileName(file.name);
                avatarAction(() => onAvatar(file));
              }}
              selectedName={avatarFileName}
            />
            {saved.avatarUrl ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => avatarAction(onResetAvatar)}
              >
                Удалить
              </Button>
            ) : null}
          </div>
          {onCover ? (
            <div className="vui-user-profile-cover-editor">
              <FilePicker
                accept="image/png,image/jpeg,image/webp"
                disabled={loading}
                label="Обложка профиля (до 12 МБ)"
                onFile={(file) => {
                  setCoverFileName(file.name);
                  avatarAction(() => onCover(file));
                }}
                selectedName={coverFileName}
              />
              {saved.coverUrl && onResetCover ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => avatarAction(onResetCover)}
                >
                  Удалить обложку
                </Button>
              ) : null}
            </div>
          ) : null}
          <Input
            label="Отображаемое имя"
            maxLength={30}
            minLength={2}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
          />
          <Input
            hint={
              saved.usernameChangedAt
                ? `Последняя смена: ${new Date(saved.usernameChangedAt).toLocaleDateString("ru-RU")}`
                : "Латиница, цифры и подчёркивание"
            }
            label="Username"
            maxLength={32}
            value={username}
            onChange={(event) => {
              setUsername(
                event.target.value.toLowerCase().replace(/[^a-z0-9_]/gu, ""),
              );
              setError(null);
            }}
          />
          <label className="vui-user-settings-bio">
            <span>Короткое bio</span>
            <textarea
              maxLength={280}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
            <small>{bio.length}/280</small>
          </label>
          {error ? (
            <div className="vui-user-settings-note vui-user-settings-note--error">
              {error}
            </div>
          ) : null}
          <div className="vui-user-settings-readonly">
            <span>Email</span>
            <strong>{saved.email}</strong>
            <small>Смена email находится в разделе «Аккаунт».</small>
          </div>
        </article>
        <article className="vui-user-settings-card vui-user-profile-preview">
          <header>
            <div>
              <h2>Предпросмотр профиля</h2>
              <p>Так вас видят другие участники.</p>
            </div>
          </header>
          <div className="vui-user-profile-preview__banner">
            {saved.coverUrl ? (
              <img alt="Обложка профиля" src={saved.coverUrl} />
            ) : null}
          </div>
          {saved.avatarUrl ? (
            <img
              className="vui-user-profile-preview__avatar"
              alt="Аватар"
              src={saved.avatarUrl}
            />
          ) : (
            <Avatar name={previewName} size="lg" status="online" />
          )}
          <strong>{previewName}</strong>
          <small>{username ? `@${username}` : saved.email}</small>
          {bio ? <p>{bio}</p> : null}
          {user.platformRole === "owner" ? (
            <Badge tone="founder">CEO Founder</Badge>
          ) : null}
        </article>
      </div>
      <SettingsSaveBar
        onCancel={reset}
        onSave={save}
        state={saveState === "idle" && dirty ? "dirty" : saveState}
      />
    </section>
  );
}
