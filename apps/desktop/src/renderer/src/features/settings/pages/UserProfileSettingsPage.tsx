import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  displayNameSchema,
  usernameSchema,
  type PublicUser,
  type UserProfileSettings,
} from "@vatrushka/shared";

import { ClientError } from "../../../api";
import { Avatar, Badge, Icon, IconButton, Input, StableImage, Tooltip } from "../../../ui";
import { AvatarCropDialog } from "../components/AvatarCropDialog";
import { SettingsPageState } from "../components/SettingsPageState";
import { SettingsSaveBar } from "../components/SettingsSaveBar";
import type { SettingsSaveState } from "../model/settings.types";
import "./user-settings-pages.css";

const maxImageSize = 12 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface UserProfileSettingsPageProps {
  embedded?: boolean;
  user: PublicUser;
  onDirtyChange(dirty: boolean): void;
  onLoad(): Promise<UserProfileSettings>;
  onSave(input: Pick<UserProfileSettings, "displayName" | "username" | "bio">): Promise<UserProfileSettings>;
  onAvatar(file: File): Promise<UserProfileSettings>;
  onResetAvatar(): Promise<UserProfileSettings>;
  onCover?(file: File): Promise<UserProfileSettings>;
  onResetCover?(): Promise<UserProfileSettings>;
  onProfileMediaChange?(profile: UserProfileSettings): void;
  onUserChange(user: PublicUser): void;
}

function errorMessage(caught: unknown): string {
  if (caught instanceof ClientError && typeof caught.details === "object" && caught.details !== null && "message" in caught.details && typeof caught.details.message === "string") return caught.details.message;
  return caught instanceof Error ? caught.message : "Не удалось сохранить профиль";
}

function validateImage(file: File): string | null {
  if (!acceptedImageTypes.has(file.type)) return "Поддерживаются изображения PNG, JPEG и WebP.";
  if (file.size > maxImageSize) return "Размер изображения не должен превышать 12 МБ.";
  return null;
}

export function UserProfileSettingsPage({ embedded = false, onAvatar, onCover, onDirtyChange, onLoad, onResetAvatar, onResetCover, onProfileMediaChange, onSave, onUserChange, user }: UserProfileSettingsPageProps): React.JSX.Element {
  const [saved, setSaved] = useState<UserProfileSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarCandidate, setAvatarCandidate] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SettingsSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const apply = (profile: UserProfileSettings): void => {
    setSaved(profile);
    setDisplayName(profile.displayName);
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
  };
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void onLoad().then(apply).catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false));
  }, [onLoad]);
  useEffect(load, [load]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const dirty = saved !== null && (displayName !== saved.displayName || (username || null) !== saved.username || (bio || null) !== saved.bio);
  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  if (loading && !saved) return <SettingsPageState kind="loading" />;
  if (!saved) return <SettingsPageState {...(error ? { description: error } : {})} kind="error" onAction={load} />;

  const previewName = displayName.trim() || user.email.split("@")[0] || user.email;
  const reset = (): void => { apply(saved); setError(null); setSaveState("idle"); };
  const save = (): void => {
    const nameResult = displayNameSchema.safeParse(displayName);
    const usernameResult = username ? usernameSchema.safeParse(username) : null;
    if (!nameResult.success) { setError(nameResult.error.issues[0]?.message ?? "Проверьте имя"); setSaveState("error"); return; }
    if (usernameResult && !usernameResult.success) { setError(usernameResult.error.issues[0]?.message ?? "Проверьте имя пользователя"); setSaveState("error"); return; }
    setSaveState("saving"); setError(null);
    void onSave({ displayName: nameResult.data, username: usernameResult?.data ?? null, bio: bio.trim() || null })
      .then((next) => { apply(next); onUserChange({ ...user, displayName: next.displayName, avatarUrl: next.avatarUrl }); onProfileMediaChange?.(next); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1_800); })
      .catch((caught) => { setError(errorMessage(caught)); setSaveState("error"); });
  };
  const runMediaAction = (action: () => Promise<UserProfileSettings>, clearPreview: () => void): void => {
    setLoading(true); setError(null);
    void action().then((next) => { apply(next); onUserChange({ ...user, avatarUrl: next.avatarUrl }); onProfileMediaChange?.(next); clearPreview(); })
      .catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false));
  };
  const selectAvatar = (file: File): void => {
    const validationError = validateImage(file);
    if (validationError) { setError(validationError); return; }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setError(null); setAvatarPreview(URL.createObjectURL(file)); setAvatarCandidate(file);
  };
  const selectCover = (file: File): void => {
    const validationError = validateImage(file);
    if (validationError) { setError(validationError); return; }
    if (!onCover) return;
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setError(null); setCoverPreview(URL.createObjectURL(file));
    runMediaAction(() => onCover(file), () => setCoverPreview(null));
  };

  const coverSrc = coverPreview ?? saved.coverUrl ?? undefined;
  const avatarSrc = avatarPreview ?? saved.avatarUrl ?? undefined;

  return (
    <section className="vui-user-settings-page" {...(!embedded ? { "aria-labelledby": "user-profile-settings-title" } : {})}>
      {!embedded ? <header className="vui-user-settings-page__heading">
        <div><span>Профиль</span><h1 id="user-profile-settings-title">Мой профиль</h1><p>Имя, уникальное имя пользователя, bio и изображения профиля синхронизируются между вашими устройствами.</p></div>
        <Badge tone={saveState === "saved" ? "success" : "neutral"}>{saveState === "saved" ? "Синхронизировано" : dirty ? "Есть изменения" : "Актуально"}</Badge>
      </header> : null}
      <article className="vui-user-settings-card vui-user-profile-settings__form" aria-busy={loading}>
        <div className="vui-user-profile-media">
          <input accept="image/png,image/jpeg,image/webp" aria-label="Изменить обложку: файл" className="vui-user-profile-media__input" disabled={loading || !onCover} onChange={(event) => { const file = event.target.files?.[0]; if (file) selectCover(file); event.target.value = ""; }} ref={coverInputRef} type="file" />
          <input accept="image/png,image/jpeg,image/webp" aria-label="Изменить аватар: файл" className="vui-user-profile-media__input" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) selectAvatar(file); event.target.value = ""; }} ref={avatarInputRef} type="file" />
          <div className="vui-user-profile-media__cover-frame">
            <button aria-label="Изменить обложку" className="vui-user-profile-media__cover" disabled={loading || !onCover} onClick={() => coverInputRef.current?.click()} type="button">
              {coverSrc ? <StableImage alt="" className="vui-user-profile-media__cover-image" src={coverSrc} /> : <span className="vui-user-profile-media__cover-placeholder" aria-hidden="true" />}
              <span className="vui-user-profile-media__overlay"><Icon name="camera" size={22} /><strong>{loading ? "Загрузка…" : "Изменить обложку"}</strong></span>
            </button>
            {saved.coverUrl && onResetCover ? <Tooltip content="Удалить обложку"><IconButton className="vui-user-profile-media__remove vui-user-profile-media__remove--cover" disabled={loading} icon="close" label="Удалить обложку" onClick={() => runMediaAction(onResetCover, () => setCoverPreview(null))} size="sm" type="button" /></Tooltip> : null}
          </div>
          <div className="vui-user-profile-media__avatar-frame">
            <button aria-label="Изменить аватар" className="vui-user-profile-media__avatar" disabled={loading} onClick={() => avatarInputRef.current?.click()} type="button">
              <Avatar name={previewName} size="lg" src={avatarSrc} status="online" />
              <span className="vui-user-profile-media__avatar-overlay"><Icon name="camera" size={18} /><span>Изменить аватар</span></span>
            </button>
            {saved.avatarUrl ? <Tooltip content="Удалить аватар"><IconButton className="vui-user-profile-media__remove vui-user-profile-media__remove--avatar" disabled={loading} icon="close" label="Удалить аватар" onClick={() => runMediaAction(onResetAvatar, () => setAvatarPreview(null))} size="sm" type="button" /></Tooltip> : null}
          </div>
        </div>
        <div className="vui-user-profile-settings__fields">
          <Input label="Отображаемое имя" maxLength={30} minLength={2} onChange={(event) => { setDisplayName(event.target.value); setError(null); }} value={displayName} />
          <Input hint="Имя пользователя уникально и меняется не чаще одного раза в 7 дней." label="Имя пользователя" maxLength={32} onChange={(event) => { setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/gu, "")); setError(null); }} value={username} />
          <label className="vui-user-settings-bio"><span>О себе</span><textarea maxLength={280} onChange={(event) => setBio(event.target.value)} value={bio} /><small>{bio.length}/280</small></label>
          {error ? <div className="vui-user-settings-note vui-user-settings-note--error" role="alert">{error}</div> : null}
          <div className="vui-user-settings-readonly"><span>Email</span><strong>{saved.email}</strong><small>Смена email находится в разделе «Аккаунт».</small></div>
        </div>
      </article>
      <SettingsSaveBar onCancel={reset} onSave={save} state={saveState === "idle" && dirty ? "dirty" : saveState} />
      <AvatarCropDialog file={avatarCandidate} onCancel={() => { setAvatarCandidate(null); setAvatarPreview(null); }} onConfirm={(file) => { setAvatarCandidate(null); runMediaAction(() => onAvatar(file), () => setAvatarPreview(null)); }} />
    </section>
  );
}
