import { useCallback, useEffect, useMemo, useState } from "react";

import { serverPermissions, type CreatedServerInvite, type ServerAppearanceSettings, type ServerAuditLogEntry, type ServerBanSettings, type ServerChannelCategory, type ServerChannelSettings, type ServerDetail, type ServerInviteSettings, type ServerModerationSettings, type ServerOverviewSettings, type ServerPermission, type ServerSettingsMember } from "@vatrushka/shared";

import { apiClient } from "../../../api";
import { Button, Checkbox, FilePicker, Input, Select } from "../../../ui";
import type { ServerSettingsSection } from "../../../app/routes/route-paths";
import { ChannelPermissionEditor } from "../components/ChannelPermissionEditor";
import { SettingsPageState } from "../components/SettingsPageState";
import "./server-settings-pages.css";

interface Props {
  currentUserId?: string;
  section: ServerSettingsSection;
  server: ServerDetail;
  onChanged(): Promise<void>;
  onDeleted(): void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить запрос";
}

function Page({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="vui-server-settings-page">
      <header className="vui-server-settings-page__heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Feedback({ error, success }: { error: string | null; success?: string | null }): React.JSX.Element | null {
  if (error)
    return (
      <div className="vui-server-settings-feedback" data-tone="danger">
        {error}
      </div>
    );
  if (success)
    return (
      <div className="vui-server-settings-feedback" data-tone="success">
        {success}
      </div>
    );
  return null;
}

function Overview({ server, onChanged }: Pick<Props, "server" | "onChanged">): React.JSX.Element {
  const [value, setValue] = useState<ServerOverviewSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError(null);
    void apiClient
      .getServerOverviewSettings(server.id)
      .then(setValue)
      .catch((caught) => setError(message(caught)));
  }, [server.id]);
  useEffect(load, [load]);
  if (!value) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  const textChannels = server.channels.filter((channel) => channel.type === "text").map((channel) => ({ value: channel.id, label: `# ${channel.name}` }));
  const save = (): void => {
    setBusy(true);
    setError(null);
    void apiClient
      .updateServerOverviewSettings(server.id, {
        name: value.name,
        description: value.description,
        language: value.language,
        timezone: value.timezone,
        systemChannelId: value.systemChannelId,
        welcomeChannelId: value.welcomeChannelId,
        defaultNotificationLevel: value.defaultNotificationLevel,
        defaultVoiceInactivitySeconds: value.defaultVoiceInactivitySeconds,
        version: value.version,
      })
      .then(async (next) => {
        setValue(next);
        await onChanged();
      })
      .catch((caught) => setError(message(caught)))
      .finally(() => setBusy(false));
  };
  return (
    <Page eyebrow="Основное" title="Обзор сервера" description="Название, системные каналы и поведение по умолчанию.">
      <div className="vui-server-settings-grid">
        <article className="vui-server-settings-card">
          <Input label="Название" maxLength={60} value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
          <label className="vui-server-settings-field">
            <span>Описание</span>
            <textarea maxLength={1000} value={value.description ?? ""} onChange={(event) => setValue({ ...value, description: event.target.value || null })} />
          </label>
          <Select label="Системный канал" options={[{ value: "", label: "Не выбран" }, ...textChannels]} value={value.systemChannelId ?? ""} onValueChange={(next) => setValue({ ...value, systemChannelId: next || null })} />
          <Select label="Канал приветствий" options={[{ value: "", label: "Не выбран" }, ...textChannels]} value={value.welcomeChannelId ?? ""} onValueChange={(next) => setValue({ ...value, welcomeChannelId: next || null })} />
        </article>
        <article className="vui-server-settings-card">
          <Select
            label="Уведомления по умолчанию"
            options={[
              { value: "all", label: "Все сообщения" },
              { value: "mentions", label: "Только упоминания" },
              { value: "none", label: "Выключены" },
            ]}
            value={value.defaultNotificationLevel}
            onValueChange={(next) =>
              setValue({
                ...value,
                defaultNotificationLevel: next as ServerOverviewSettings["defaultNotificationLevel"],
              })
            }
          />
          <Input
            label="Отключать неактивных из голосовых каналов, секунд"
            min={0}
            max={86400}
            type="number"
            value={value.defaultVoiceInactivitySeconds}
            onChange={(event) =>
              setValue({
                ...value,
                defaultVoiceInactivitySeconds: Number(event.target.value),
              })
            }
          />
          <div className="vui-server-settings-readonly">
            <span>Владелец</span>
            <strong>{value.ownerDisplayName}</strong>
            <small>Передача владения находится в опасной зоне.</small>
          </div>
          <Feedback error={error} />
          <Button disabled={busy || value.name.trim().length < 2} loading={busy} onClick={save}>
            Сохранить
          </Button>
        </article>
      </div>
    </Page>
  );
}

function Appearance({ server, onChanged }: Pick<Props, "server" | "onChanged">): React.JSX.Element {
  const [value, setValue] = useState<ServerAppearanceSettings | null>(null);
  const [objects, setObjects] = useState<{
    iconObjectKey?: string | null;
    bannerObjectKey?: string | null;
  }>({});
  const [fileNames, setFileNames] = useState<{
    icon: string | undefined;
    banner: string | undefined;
  }>({ icon: undefined, banner: undefined });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void apiClient
      .getServerAppearanceSettings(server.id)
      .then(setValue)
      .catch((caught) => setError(message(caught)));
  }, [server.id]);
  useEffect(load, [load]);
  if (!value) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  const upload = (kind: "icon" | "banner", file: File): void => {
    setBusy(true);
    setError(null);
    void apiClient
      .uploadServerAppearance(server.id, kind, file)
      .then((objectKey) => {
        setObjects((current) => ({
          ...current,
          [kind === "icon" ? "iconObjectKey" : "bannerObjectKey"]: objectKey,
        }));
        setFileNames((current) => ({ ...current, [kind]: file.name }));
      })
      .catch((caught) => setError(message(caught)))
      .finally(() => setBusy(false));
  };
  const save = (): void => {
    setBusy(true);
    void apiClient
      .updateServerAppearanceSettings(server.id, {
        ...objects,
        accentColor: value.accentColor,
        version: value.version,
      })
      .then(async (next) => {
        setValue(next);
        setObjects({});
        setFileNames({ icon: undefined, banner: undefined });
        await onChanged();
      })
      .catch((caught) => setError(message(caught)))
      .finally(() => setBusy(false));
  };
  return (
    <Page eyebrow="Брендинг" title="Оформление" description="Приватные изображения хранятся в S3 и выдаются через временные ссылки.">
      <div className="vui-server-settings-grid">
        <article className="vui-server-settings-card">
          <div className="vui-server-appearance-preview" style={{ backgroundColor: value.accentColor ?? "#635bff" }}>
            {value.bannerUrl ? <img alt="Обложка сервера" src={value.bannerUrl} /> : null}
            <div>
              {value.iconUrl ? <img alt="Иконка сервера" src={value.iconUrl} /> : server.name.slice(0, 2).toUpperCase()}
              <strong>{server.name}</strong>
            </div>
          </div>
          <Input label="Акцент" type="color" value={value.accentColor ?? "#635bff"} onChange={(event) => setValue({ ...value, accentColor: event.target.value })} />
        </article>
        <article className="vui-server-settings-card">
          <FilePicker accept="image/png,image/jpeg,image/webp" disabled={busy} label="Иконка (PNG, JPEG, WebP до 5 МБ)" onFile={(file) => upload("icon", file)} selectedName={fileNames.icon} />
          <FilePicker accept="image/png,image/jpeg,image/webp" disabled={busy} label="Обложка (до 12 МБ)" onFile={(file) => upload("banner", file)} selectedName={fileNames.banner} />
          <div className="vui-server-settings-row">
            <Button
              variant="secondary"
              onClick={() => {
                setObjects((current) => ({ ...current, iconObjectKey: null }));
                setFileNames((current) => ({ ...current, icon: undefined }));
              }}
            >
              Сбросить иконку
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setObjects((current) => ({
                  ...current,
                  bannerObjectKey: null,
                }));
                setFileNames((current) => ({ ...current, banner: undefined }));
              }}
            >
              Сбросить обложку
            </Button>
          </div>
          <Feedback error={error} success={Object.keys(objects).length ? "Файл загружен. Сохраните изменения." : null} />
          <Button loading={busy} onClick={save}>
            Применить
          </Button>
        </article>
      </div>
    </Page>
  );
}

function Members({ server, currentUserId = server.ownerUserId, onChanged }: Pick<Props, "currentUserId" | "server" | "onChanged">): React.JSX.Element {
  const [items, setItems] = useState<ServerSettingsMember[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canManageRoles = server.permissions.includes("MANAGE_ROLES");
  const canKickMembers = server.permissions.includes("KICK_MEMBERS");
  const canBanMembers = server.permissions.includes("BAN_MEMBERS");
  const load = useCallback(() => {
    void apiClient
      .listServerSettingsMembers(server.id, search)
      .then(setItems)
      .catch((caught) => setError(message(caught)));
  }, [search, server.id]);
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  const mutate = (action: () => Promise<unknown>): void => {
    setError(null);
    void action()
      .then(async () => {
        load();
        await onChanged();
      })
      .catch((caught) => setError(message(caught)));
  };
  if (!items) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  return (
    <Page eyebrow="Команда" title="Участники" description="Роли, личные псевдонимы и модерирование участников сервера.">
      <Input label="Поиск" placeholder="Имя или username" value={search} onChange={(event) => setSearch(event.target.value)} />
      <Feedback error={error} />
      <div className="vui-server-settings-list">
        {items.map((member) => {
          const isCurrentUser = member.userId === currentUserId;
          const visibleName = member.privateAlias ?? member.serverDisplayName ?? member.displayName;
          const savedAlias = isCurrentUser ? member.serverDisplayName : member.privateAlias;
          return (
            <article className="vui-server-member-row" key={member.userId}>
              <div className="vui-server-member-row__identity">
                <strong>{visibleName}</strong>
                <small>
                  {member.username ? `@${member.username}` : member.displayName} · с {new Date(member.joinedAt).toLocaleDateString("ru-RU")}
                </small>
              </div>
              <Input
                aria-label={isCurrentUser ? "Моё имя на этом сервере" : `Личный псевдоним для ${member.displayName}`}
                defaultValue={savedAlias ?? ""}
                hint={isCurrentUser ? "Это имя увидят все участники сервера." : "Этот псевдоним виден только вам."}
                label={isCurrentUser ? "Имя на этом сервере" : "Мой псевдоним"}
                placeholder={member.displayName}
                onBlur={(event) => {
                  const next = event.target.value.trim() || null;
                  if (next === savedAlias) return;
                  mutate(() => (isCurrentUser ? apiClient.updateOwnServerDisplayName(server.id, next) : apiClient.updatePrivateServerMemberAlias(server.id, member.userId, next)));
                }}
              />
              {canManageRoles ? <div className="vui-server-member-roles">
                {server.roles
                  .filter((role) => role.kind === "CUSTOM")
                  .map((role) => (
                    <Checkbox checked={member.roleIds.includes(role.id)} key={role.id} label={role.name} onChange={(event) => mutate(() => apiClient.assignServerMemberRoles(server.id, member.userId, event.target.checked ? [...member.roleIds, role.id] : member.roleIds.filter((id) => id !== role.id)))} />
                  ))}
              </div> : null}
              <div className="vui-server-settings-actions">
                {member.userId !== server.ownerUserId && !isCurrentUser ? (
                  <>
                    {canKickMembers ? <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Исключить ${visibleName}?`)) mutate(() => apiClient.kickServerMember(server.id, member.userId));
                      }}
                    >
                      Исключить
                    </Button> : null}
                    {canBanMembers ? <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        const reason = window.prompt("Причина блокировки");
                        if (reason?.trim()) mutate(() => apiClient.banServerMember(server.id, member.userId, reason.trim()));
                      }}
                    >
                      Заблокировать
                    </Button> : null}
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

const permissionLabels: Partial<Record<ServerPermission, string>> = {
  VIEW_SERVER: "Просмотр сервера",
  VIEW_CHANNEL: "Просмотр каналов",
  SEND_MESSAGES: "Отправка сообщений",
  CONNECT_VOICE: "Подключение к voice",
  SPEAK: "Говорить",
  STREAM_SCREEN: "Демонстрация экрана",
  MANAGE_CHANNELS: "Управление каналами",
  MANAGE_ROLES: "Управление ролями",
  KICK_MEMBERS: "Исключать участников",
  BAN_MEMBERS: "Блокировать участников",
  ADMINISTRATOR: "Администратор",
};

function Roles({ server, onChanged }: Pick<Props, "server" | "onChanged">): React.JSX.Element {
  const editable = server.roles.filter((role) => role.kind !== "OWNER").sort((left, right) => right.position - left.position);
  const [selectedId, setSelectedId] = useState(editable[0]?.id ?? "new");
  const selected = server.roles.find((role) => role.id === selectedId) ?? null;
  const [name, setName] = useState(selected?.name ?? "Новая роль");
  const [color, setColor] = useState(selected?.color ?? "#635bff");
  const [permissions, setPermissions] = useState<ServerPermission[]>(selected?.permissions ?? ["VIEW_SERVER", "VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT_VOICE", "SPEAK"]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setColor(selected.color);
    setPermissions(selected.permissions);
  }, [selected]);
  const run = (action: () => Promise<unknown>): void => {
    void action()
      .then(onChanged)
      .catch((caught) => setError(message(caught)));
  };
  return (
    <Page eyebrow="Доступ" title="Роли и права" description="Иерархия ролей и серверные разрешения.">
      <div className="vui-server-role-layout">
        <aside className="vui-server-settings-card">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedId("new");
              setName("Новая роль");
              setColor("#635bff");
              setPermissions(["VIEW_SERVER", "VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT_VOICE", "SPEAK"]);
            }}
          >
            + Новая роль
          </Button>
          {editable.map((role) => (
            <button className="vui-server-role-item" data-active={role.id === selectedId || undefined} key={role.id} onClick={() => setSelectedId(role.id)} type="button">
              <i style={{ background: role.color }} />
              {role.name}
            </button>
          ))}
        </aside>
        <article className="vui-server-settings-card">
          <div className="vui-server-settings-row">
            <Input disabled={selected?.kind === "EVERYONE"} label="Название" value={name} onChange={(event) => setName(event.target.value)} />
            <Input label="Цвет" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </div>
          <div className="vui-server-permission-grid">
            {serverPermissions.map((permission) => (
              <Checkbox
                checked={permissions.includes(permission)}
                description={permission}
                key={permission}
                label={permissionLabels[permission] ?? permission.replaceAll("_", " ").toLowerCase()}
                onChange={(event) => {
                  if (permission === "ADMINISTRATOR" && event.target.checked && !window.confirm("Право администратора даёт полный доступ и обходит ограничения каналов. Продолжить?")) return;
                  setPermissions((current) => (event.target.checked ? [...current, permission] : current.filter((item) => item !== permission)));
                }}
              />
            ))}
          </div>
          <Feedback error={error} />
          <div className="vui-server-settings-actions">
            <Button
              onClick={() =>
                run(() =>
                  selected
                    ? apiClient.updateServerRole(server.id, selected.id, {
                        ...(selected.kind === "EVERYONE" ? {} : { name, color }),
                        permissions,
                      })
                    : apiClient.createServerRole(server.id, name, color, permissions),
                )
              }
            >
              Сохранить роль
            </Button>
            {selected && selected.kind === "CUSTOM" ? (
              <>
                <Button variant="secondary" onClick={() => run(() => apiClient.reorderServerRole(server.id, selected.id, selected.position + 1))}>
                  Выше
                </Button>
                <Button variant="secondary" onClick={() => run(() => apiClient.reorderServerRole(server.id, selected.id, Math.max(1, selected.position - 1)))}>
                  Ниже
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Удалить роль «${selected.name}»?`)) run(() => apiClient.deleteServerRole(server.id, selected.id));
                  }}
                >
                  Удалить
                </Button>
              </>
            ) : null}
          </div>
        </article>
      </div>
    </Page>
  );
}

function Channels({ server, onChanged }: Pick<Props, "server" | "onChanged">): React.JSX.Element {
  const [data, setData] = useState<{
    categories: ServerChannelCategory[];
    channels: ServerChannelSettings[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void apiClient
      .getServerChannelSettings(server.id)
      .then(setData)
      .catch((caught) => setError(message(caught)));
  }, [server.id]);
  useEffect(load, [load]);
  const run = (action: () => Promise<unknown>): void => {
    void action()
      .then(async () => {
        load();
        await onChanged();
      })
      .catch((caught) => setError(message(caught)));
  };
  if (!data) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  return (
    <Page eyebrow="Структура" title="Каналы и категории" description="Создание, группировка, ограничения и архивирование каналов.">
      <Feedback error={error} />
      <article className="vui-server-settings-card">
        <div className="vui-server-settings-actions">
          <Button
            onClick={() => {
              const name = window.prompt("Название категории");
              if (name?.trim()) run(() => apiClient.createServerCategory(server.id, name.trim()));
            }}
          >
            Создать категорию
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const name = window.prompt("Название текстового канала");
              if (name?.trim()) run(() => apiClient.createServerChannel(server.id, name.trim(), "text"));
            }}
          >
            + Текстовый
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const name = window.prompt("Название голосового канала");
              if (name?.trim()) run(() => apiClient.createServerChannel(server.id, name.trim(), "voice"));
            }}
          >
            + Голосовой
          </Button>
        </div>
        <div className="vui-server-category-list">
          {data.categories.map((category) => (
            <div key={category.id}>
              <Input
                defaultValue={category.name}
                onBlur={(event) => {
                  if (event.target.value.trim() !== category.name)
                    run(() =>
                      apiClient.updateServerCategory(server.id, category.id, {
                        name: event.target.value.trim(),
                      }),
                    );
                }}
              />
              <Button size="sm" variant="danger" onClick={() => run(() => apiClient.deleteServerCategory(server.id, category.id))}>
                Удалить
              </Button>
            </div>
          ))}
        </div>
      </article>
      <div className="vui-server-settings-list">
        {data.channels.map((channel) => (
          <article className="vui-server-channel-row" key={channel.id}>
            <div>
              <strong>
                {channel.type === "text" ? "#" : "◉"} {channel.name}
              </strong>
              <small>{channel.archivedAt ? "Архивирован" : `Позиция ${channel.position}`}</small>
            </div>
            <Input
              aria-label="Название канала"
              defaultValue={channel.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name !== channel.name) run(() => apiClient.updateServerChannelSettings(server.id, channel.id, { name, version: channel.version }));
              }}
            />
            <Select
              label="Категория"
              options={[
                { value: "", label: "Без категории" },
                ...data.categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              value={channel.categoryId ?? ""}
              onValueChange={(categoryId) =>
                run(() =>
                  apiClient.updateServerChannelSettings(server.id, channel.id, {
                    categoryId: categoryId || null,
                    version: channel.version,
                  }),
                )
              }
            />
            {channel.type === "text" ? (
              <Input
                label="Задержка между сообщениями, секунд"
                min={0}
                max={21600}
                type="number"
                defaultValue={channel.slowModeSeconds}
                onBlur={(event) =>
                  run(() =>
                    apiClient.updateServerChannelSettings(server.id, channel.id, {
                      slowModeSeconds: Number(event.target.value),
                      version: channel.version,
                    }),
                  )
                }
              />
            ) : (
              <>
                <Input
                  label="Макс. участников"
                  min={1}
                  max={1000}
                  type="number"
                  defaultValue={channel.maxParticipants ?? ""}
                  onBlur={(event) =>
                    run(() =>
                      apiClient.updateServerChannelSettings(server.id, channel.id, {
                        maxParticipants: event.target.value ? Number(event.target.value) : null,
                        version: channel.version,
                      }),
                    )
                  }
                />
                <Input
                  label="Битрейт"
                  min={16000}
                  max={510000}
                  type="number"
                  defaultValue={channel.bitrate ?? ""}
                  onBlur={(event) =>
                    run(() =>
                      apiClient.updateServerChannelSettings(server.id, channel.id, {
                        bitrate: event.target.value ? Number(event.target.value) : null,
                        version: channel.version,
                      }),
                    )
                  }
                />
              </>
            )}
            <Button
              size="sm"
              variant={channel.archivedAt ? "secondary" : "danger"}
              onClick={() =>
                run(() =>
                  apiClient.updateServerChannelSettings(server.id, channel.id, {
                    archived: !channel.archivedAt,
                    version: channel.version,
                  }),
                )
              }
            >
              {channel.archivedAt ? "Восстановить" : "В архив"}
            </Button>
          </article>
        ))}
      </div>
      {server.permissions.includes("MANAGE_ROLES") ? (
        <ChannelPermissionEditor
          server={server}
          onSave={async (channelId, targetType, targetId, allow, deny) => {
            await apiClient.setChannelPermissionOverwrite(channelId, targetType, targetId, allow, deny);
            await onChanged();
          }}
        />
      ) : null}
    </Page>
  );
}

function Invites({ server }: Pick<Props, "server">): React.JSX.Element {
  const [items, setItems] = useState<ServerInviteSettings[] | null>(null);
  const [created, setCreated] = useState<CreatedServerInvite | null>(null);
  const [expires, setExpires] = useState("604800");
  const [maxUses, setMaxUses] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void apiClient
      .listServerInvites(server.id)
      .then(setItems)
      .catch((caught) => setError(message(caught)));
  }, [server.id]);
  useEffect(load, [load]);
  if (!items) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  const create = (): void => {
    setCreated(null);
    void apiClient
      .createServerInvite(server.id, {
        destinationChannelId: destination || null,
        expiresInSeconds: expires ? Number(expires) : null,
        maxUses: maxUses ? Number(maxUses) : null,
      })
      .then((invite) => {
        setCreated(invite);
        load();
      })
      .catch((caught) => setError(message(caught)));
  };
  return (
    <Page eyebrow="Доступ" title="Приглашения" description="Только короткие ссылки. Ручных кодов и поля ввода кода в приложении нет.">
      <div className="vui-server-settings-grid">
        <article className="vui-server-settings-card">
          <Select
            label="Канал назначения"
            options={[
              { value: "", label: "По умолчанию" },
              ...server.channels.map((channel) => ({
                value: channel.id,
                label: channel.name,
              })),
            ]}
            value={destination}
            onValueChange={setDestination}
          />
          <Select
            label="Срок"
            options={[
              { value: "3600", label: "1 час" },
              { value: "86400", label: "1 день" },
              { value: "604800", label: "7 дней" },
              { value: "", label: "Без срока" },
            ]}
            value={expires}
            onValueChange={setExpires}
          />
          <Input label="Максимум использований" min={1} max={10000} placeholder="Без ограничения" type="number" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          <Button onClick={create}>Создать ссылку</Button>
          {created ? (
            <div className="vui-server-invite-created">
              <strong>Скопируйте сейчас</strong>
              <code>{created.inviteUrl}</code>
              <Button size="sm" variant="secondary" onClick={() => window.desktop.copyToClipboard(created.inviteUrl)}>
                Копировать
              </Button>
            </div>
          ) : null}
          <Feedback error={error} />
        </article>
        <div className="vui-server-settings-list">
          {items.map((invite) => (
            <article className="vui-server-invite-row" key={invite.id}>
              <div>
                <strong>{invite.tokenPreview}</strong>
                <small>
                  {invite.createdByDisplayName} · {invite.useCount}
                  {invite.maxUses ? `/${invite.maxUses}` : ""} использований
                </small>
                <small>{invite.revokedAt ? "Отозвано" : invite.expiresAt ? `До ${new Date(invite.expiresAt).toLocaleString("ru-RU")}` : "Без срока"}</small>
              </div>
              {!invite.revokedAt ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    void apiClient
                      .revokeServerInvite(server.id, invite.id)
                      .then(load)
                      .catch((caught) => setError(message(caught)))
                  }
                >
                  Отозвать
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </Page>
  );
}

function Moderation({ server }: Pick<Props, "server">): React.JSX.Element {
  const [value, setValue] = useState<ServerModerationSettings | null>(null);
  const [bans, setBans] = useState<ServerBanSettings[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void Promise.all([apiClient.getServerModerationSettings(server.id), apiClient.listServerBans(server.id)])
      .then(([next, nextBans]) => {
        setValue(next);
        setBans(nextBans);
      })
      .catch((caught) => setError(message(caught)));
  }, [server.id]);
  useEffect(load, [load]);
  if (!value) return error ? <SettingsPageState description={error} kind="error" onAction={load} /> : <SettingsPageState kind="loading" />;
  return (
    <Page eyebrow="Безопасность" title="Модерация" description="Проверка новых участников, лимиты сообщений, правила и список блокировок.">
      <div className="vui-server-settings-grid">
        <article className="vui-server-settings-card">
          <Select
            label="Уровень проверки"
            options={[
              { value: "none", label: "Нет" },
              { value: "email_verified", label: "Подтверждённый email" },
              { value: "account_age", label: "Возраст аккаунта" },
            ]}
            value={value.verificationLevel}
            onValueChange={(next) =>
              setValue({
                ...value,
                verificationLevel: next as ServerModerationSettings["verificationLevel"],
              })
            }
          />
          <div className="vui-server-settings-row">
            <Input
              label="Ограничение новичков, минут"
              min={0}
              max={43200}
              type="number"
              value={value.newMemberRestrictionMinutes}
              onChange={(event) =>
                setValue({
                  ...value,
                  newMemberRestrictionMinutes: Number(event.target.value),
                })
              }
            />
            <Input
              label="Сообщений в минуту"
              min={1}
              max={600}
              type="number"
              value={value.messageRateLimitPerMinute}
              onChange={(event) =>
                setValue({
                  ...value,
                  messageRateLimitPerMinute: Number(event.target.value),
                })
              }
            />
          </div>
          <Input
            label="Упоминаний в сообщении"
            min={0}
            max={100}
            type="number"
            value={value.mentionLimitPerMessage}
            onChange={(event) =>
              setValue({
                ...value,
                mentionLimitPerMessage: Number(event.target.value),
              })
            }
          />
          <label className="vui-server-settings-field">
            <span>Правила</span>
            <textarea maxLength={10000} value={value.rules ?? ""} onChange={(event) => setValue({ ...value, rules: event.target.value || null })} />
          </label>
          <Feedback error={error} />
          <Button
            onClick={() =>
              void apiClient
                .updateServerModerationSettings(server.id, value)
                .then(setValue)
                .catch((caught) => setError(message(caught)))
            }
          >
            Сохранить
          </Button>
        </article>
        <article className="vui-server-settings-card">
          <h2>Заблокированные</h2>
          {bans.length === 0 ? (
            <p className="vui-server-settings-empty">Нет активных блокировок.</p>
          ) : (
            bans.map((ban) => (
              <div className="vui-server-ban-row" key={ban.userId}>
                <div>
                  <strong>{ban.displayName}</strong>
                  <small>{ban.reason}</small>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void apiClient
                      .unbanServerMember(server.id, ban.userId)
                      .then(load)
                      .catch((caught) => setError(message(caught)))
                  }
                >
                  Разблокировать
                </Button>
              </div>
            ))
          )}
        </article>
      </div>
    </Page>
  );
}

const auditActionLabels: Record<string, string> = {
  ALL_INVITES_REVOKED: "Все приглашения отозваны",
  CHANNEL_CATEGORY_CREATED: "Категория создана",
  CHANNEL_CATEGORY_DELETED: "Категория удалена",
  CHANNEL_CATEGORY_UPDATED: "Категория изменена",
  CHANNEL_CREATED: "Канал создан",
  CHANNEL_DELETED: "Канал удалён",
  CHANNEL_OVERWRITE_UPDATED: "Права канала изменены",
  CHANNEL_SETTINGS_UPDATED: "Настройки канала изменены",
  INVITE_CREATED: "Приглашение создано",
  INVITE_REVOKED: "Приглашение отозвано",
  MEMBER_BANNED: "Участник заблокирован",
  MEMBER_KICKED: "Участник исключён",
  MEMBER_ROLES_UPDATED: "Роли участника изменены",
  MEMBER_UNBANNED: "Участник разблокирован",
  MEMBER_UPDATED: "Участник изменён",
  MEMBER_VOICE_MOVED: "Участник перемещён в голосовой канал",
  MODERATION_SETTINGS_UPDATED: "Настройки модерации изменены",
  OWNERSHIP_TRANSFERRED: "Владение сервером передано",
  ROLE_CREATED: "Роль создана",
  ROLE_DELETED: "Роль удалена",
  ROLE_REORDERED: "Порядок ролей изменён",
  ROLE_UPDATED: "Роль изменена",
  SERVER_APPEARANCE_UPDATED: "Оформление сервера изменено",
  SERVER_ARCHIVED: "Сервер архивирован",
  SERVER_OVERVIEW_UPDATED: "Обзор сервера изменён",
  SERVER_RESTORED: "Сервер восстановлен",
};
const auditTargetLabels: Record<string, string> = {
  CATEGORY: "Категория",
  CHANNEL: "Канал",
  CHANNEL_OVERWRITE: "Права канала",
  INVITE: "Приглашение",
  MEMBER: "Участник",
  ROLE: "Роль",
  SERVER: "Сервер",
};

function Audit({ server }: Pick<Props, "server">): React.JSX.Element {
  const [entries, setEntries] = useState<ServerAuditLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    (append = false) => {
      void apiClient
        .listServerSettingsAudit(server.id, {
          ...(append && cursor ? { before: cursor } : {}),
          ...(action ? { action } : {}),
        })
        .then((page) => {
          setEntries((current) => (append ? [...(current ?? []), ...page.entries] : page.entries));
          setCursor(page.nextCursor);
        })
        .catch((caught) => setError(message(caught)));
    },
    [action, cursor, server.id],
  );
  useEffect(() => {
    load(false);
  }, [action, server.id]);
  if (!entries) return error ? <SettingsPageState description={error} kind="error" onAction={() => load(false)} /> : <SettingsPageState kind="loading" />;
  return (
    <Page eyebrow="История" title="Журнал аудита" description="Фильтруемый журнал административных действий.">
      <Select
        label="Действие"
        options={[
          { value: "", label: "Все действия" },
          ...Object.entries(auditActionLabels).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        value={action}
        onValueChange={setAction}
      />
      <Feedback error={error} />
      <div className="vui-server-settings-list">
        {entries.map((entry) => (
          <article className="vui-server-audit-row" key={entry.id}>
            <div>
              <strong>{auditActionLabels[entry.action] ?? "Административное действие"}</strong>
              <small>
                {entry.actorDisplayName} · {new Date(entry.createdAt).toLocaleString("ru-RU")}
              </small>
            </div>
            <span>
              {auditTargetLabels[entry.targetType] ?? "Объект"}
              {entry.targetId ? ` · ${entry.targetId}` : ""}
            </span>
          </article>
        ))}
      </div>
      {cursor ? (
        <Button variant="secondary" onClick={() => load(true)}>
          Показать ещё
        </Button>
      ) : null}
    </Page>
  );
}

function Danger({ server, onChanged, onDeleted }: Pick<Props, "server" | "onChanged" | "onDeleted">): React.JSX.Element {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [targetOwner, setTargetOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reauth = { password, totpCode: totpCode || null };
  const run = (action: () => Promise<unknown>, after?: () => void): void => {
    setError(null);
    void action()
      .then(async () => {
        setPassword("");
        setTotpCode("");
        if (after) after();
        else await onChanged();
      })
      .catch((caught) => setError(message(caught)));
  };
  return (
    <Page eyebrow="Необратимые действия" title="Опасная зона" description="Каждое действие требует повторного ввода пароля и TOTP, если 2FA включена.">
      <article className="vui-server-settings-card vui-server-settings-card--danger">
        <div className="vui-server-settings-row">
          <Input autoComplete="current-password" label="Пароль" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Input autoComplete="one-time-code" label="Код 2FA" inputMode="numeric" maxLength={6} placeholder="Если включена" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} />
        </div>
        <Feedback error={error} />
        <div className="vui-server-danger-action">
          <div>
            <strong>Отозвать все приглашения</strong>
            <small>Все активные короткие ссылки перестанут работать.</small>
          </div>
          <Button variant="danger" onClick={() => run(() => apiClient.revokeAllServerInvites(server.id, reauth))}>
            Отозвать
          </Button>
        </div>
        <div className="vui-server-danger-action">
          <div>
            <strong>Архивировать сервер</strong>
            <small>Сервер останется в базе, но будет помечен архивным.</small>
          </div>
          <Button variant="danger" onClick={() => run(() => apiClient.archiveServer(server.id, true, reauth))}>
            Архивировать
          </Button>
        </div>
        <div className="vui-server-danger-action">
          <div>
            <strong>Передать владение</strong>
            <small>Выберите участника. Действие меняет владельца немедленно.</small>
          </div>
          <Select
            options={[
              { value: "", label: "Выберите участника" },
              ...server.members
                .filter((member) => member.userId !== server.ownerUserId)
                .map((member) => ({
                  value: member.userId,
                  label: member.displayName,
                })),
            ]}
            value={targetOwner}
            onValueChange={setTargetOwner}
          />
          <Button disabled={!targetOwner} variant="danger" onClick={() => run(() => apiClient.transferServerOwnership(server.id, targetOwner, reauth))}>
            Передать
          </Button>
        </div>
        <div className="vui-server-danger-action">
          <div>
            <strong>Удалить сервер навсегда</strong>
            <small>Введите точное название: {server.name}</small>
          </div>
          <Input aria-label="Подтверждение названия сервера" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          <Button disabled={confirmation !== server.name} variant="danger" onClick={() => run(() => apiClient.deleteServerPermanently(server.id, confirmation, reauth), onDeleted)}>
            Удалить
          </Button>
        </div>
      </article>
    </Page>
  );
}

export function ServerSettingsPage(props: Props): React.JSX.Element {
  const content = useMemo(() => {
    if (props.section === "overview") return <Overview server={props.server} onChanged={props.onChanged} />;
    if (props.section === "appearance") return <Appearance server={props.server} onChanged={props.onChanged} />;
    if (props.section === "members") return <Members currentUserId={props.currentUserId ?? props.server.ownerUserId} server={props.server} onChanged={props.onChanged} />;
    if (props.section === "roles") return <Roles server={props.server} onChanged={props.onChanged} />;
    if (props.section === "channels") return <Channels server={props.server} onChanged={props.onChanged} />;
    if (props.section === "invites") return <Invites server={props.server} />;
    if (props.section === "moderation") return <Moderation server={props.server} />;
    if (props.section === "audit-log") return <Audit server={props.server} />;
    return <Danger server={props.server} onChanged={props.onChanged} onDeleted={props.onDeleted} />;
  }, [props.currentUserId, props.section, props.server, props.onChanged, props.onDeleted]);
  return content;
}
