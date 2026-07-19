import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  EffectivePresenceStatus,
  PresencePreference,
} from "@vatrushka/shared";

import { Avatar, Badge, Icon, IconButton, StatusDot } from "../primitives";
import type { IconName } from "../primitives";
import "./navigation.css";

export interface WorkspaceNavigationItem {
  id: string;
  name: string;
  memberCount: number;
  statusLabel?: string;
  unread?: boolean;
  mentionCount?: number;
  activeVoice?: boolean;
  iconUrl?: string | null;
  accentColor?: string | null;
}

interface WorkspaceCardProps {
  workspace: WorkspaceNavigationItem;
  active?: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export function WorkspaceCard({
  active = false,
  disabled = false,
  onSelect,
  workspace,
}: WorkspaceCardProps): React.JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => setIconFailed(false), [workspace.iconUrl]);
  const initials = workspace.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <button
      aria-current={active ? "page" : undefined}
      className="vui-workspace-card"
      data-active={active || undefined}
      disabled={disabled}
      onClick={() => onSelect(workspace.id)}
      type="button"
    >
      <span
        aria-hidden="true"
        className="vui-workspace-card__mark"
        style={
          {
            "--workspace-accent": workspace.accentColor ?? undefined,
          } as React.CSSProperties
        }
      >
        {workspace.iconUrl && !iconFailed ? (
          <img
            alt=""
            onError={() => setIconFailed(true)}
            src={workspace.iconUrl}
          />
        ) : (
          initials
        )}
      </span>
      <span className="vui-workspace-card__copy">
        <strong>{workspace.name}</strong>
        <small>
          {workspace.statusLabel ?? `${workspace.memberCount} участников`}
        </small>
      </span>
      <span className="vui-workspace-card__signals">
        {workspace.activeVoice === true ? (
          <Icon name="voice" size={14} />
        ) : null}
        {workspace.mentionCount === undefined ||
        workspace.mentionCount === 0 ? null : (
          <Badge tone="danger">
            {workspace.mentionCount > 99 ? "99+" : workspace.mentionCount}
          </Badge>
        )}
        {workspace.unread === true ? (
          <span
            aria-label="Есть непрочитанные сообщения"
            className="vui-workspace-card__unread"
            role="img"
          />
        ) : null}
      </span>
    </button>
  );
}

export interface WorkspaceLibraryProps {
  workspaces: WorkspaceNavigationItem[];
  activeWorkspaceId?: string;
  directActive?: boolean;
  directUnreadCount?: number;
  onSelect: (id: string) => void;
  onHome: () => void;
  onDirectMessages?: () => void;
  onCreate: () => void;
}

export function WorkspaceLibrary({
  activeWorkspaceId,
  directActive = false,
  directUnreadCount = 0,
  onCreate,
  onDirectMessages,
  onHome,
  onSelect,
  workspaces,
}: WorkspaceLibraryProps): React.JSX.Element {
  return (
    <aside aria-label="Библиотека серверов" className="vui-workspace-library">
      <div className="vui-workspace-library__brand">
        <span aria-hidden="true">В</span>
        <strong>Ватрушка</strong>
      </div>
      <button
        className="vui-workspace-library__home"
        onClick={onHome}
        type="button"
      >
        <Icon name="home" size={18} />
        <span>Главная</span>
      </button>
      {onDirectMessages === undefined ? null : (
        <button
          aria-current={directActive ? "page" : undefined}
          className="vui-workspace-library__home"
          data-active={directActive || undefined}
          onClick={onDirectMessages}
          type="button"
        >
          <Icon name="message" size={18} />
          <span>Личные сообщения</span>
          {directUnreadCount === 0 ? null : (
            <Badge tone="danger">
              {directUnreadCount > 99 ? "99+" : directUnreadCount}
            </Badge>
          )}
        </button>
      )}
      <div className="vui-workspace-library__heading">
        <span>Серверы</span>
        <Badge>{workspaces.length}</Badge>
      </div>
      <nav aria-label="Список серверов" className="vui-workspace-library__list">
        {workspaces.map((workspace) => (
          <WorkspaceCard
            active={workspace.id === activeWorkspaceId}
            key={workspace.id}
            onSelect={onSelect}
            workspace={workspace}
          />
        ))}
      </nav>
      <div className="vui-workspace-library__actions">
        <button onClick={onCreate} type="button">
          <Icon name="plus" size={17} />
          <span>Создать сервер</span>
        </button>
      </div>
    </aside>
  );
}

export interface ChannelNavigationItem {
  id: string;
  name: string;
  type: "text" | "voice";
  unread?: boolean;
  unreadCount?: number;
  mentionCount?: number;
  participantCount?: number;
  participants?:
    | Array<{
        identity: string;
        userId: string;
        name: string;
        founder?: boolean;
        avatarUrl?: string | null;
        canDrag?: boolean;
        pending?: boolean;
        muted?: boolean;
        deafened?: boolean;
        speaking?: boolean;
        screenSharing?: boolean;
      }>
    | undefined;
}

interface ChannelRowProps {
  channel: ChannelNavigationItem;
  active?: boolean;
  canDelete?: boolean;
  onSelect: (id: string) => void;
  onConnectVoice?: ((id: string) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onRename?: ((channel: ChannelNavigationItem) => void) | undefined;
  onMoveMember?: ((channelId: string, userId: string) => void) | undefined;
}

export function ChannelRow({
  active = false,
  canDelete = false,
  channel,
  onConnectVoice,
  onDelete,
  onMoveMember,
  onRename,
  onSelect,
}: ChannelRowProps): React.JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasMenu =
    canDelete && (onRename !== undefined || onDelete !== undefined);
  const openMenu = (x: number, y: number): void =>
    setMenu({
      x: Math.max(12, Math.min(x, window.innerWidth - 220)),
      y: Math.max(12, Math.min(y, window.innerHeight - 118)),
    });
  useEffect(() => {
    if (menu === null) return undefined;
    const close = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);
  return (
    <div
      className="vui-channel-row"
      data-active={active || undefined}
      onContextMenu={
        hasMenu
          ? (event) => {
              if (
                (event.target as Element).closest(
                  ".vui-channel-row__participants",
                )
              )
                return;
              event.preventDefault();
              openMenu(event.clientX, event.clientY);
            }
          : undefined
      }
      onDragOver={
        channel.type === "voice" && onMoveMember !== undefined
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              event.currentTarget.dataset.dropTarget = "true";
            }
          : undefined
      }
      onDragLeave={(event) => {
        delete event.currentTarget.dataset.dropTarget;
      }}
      onDrop={
        channel.type === "voice" && onMoveMember !== undefined
          ? (event) => {
              event.preventDefault();
              delete event.currentTarget.dataset.dropTarget;
              const userId = event.dataTransfer.getData(
                "application/x-vatrushka-user",
              );
              if (userId) onMoveMember(channel.id, userId);
            }
          : undefined
      }
    >
      <button
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(channel.id)}
        onDoubleClick={
          channel.type === "voice" && onConnectVoice !== undefined
            ? () => onConnectVoice(channel.id)
            : undefined
        }
        title={
          channel.type === "voice" && onConnectVoice !== undefined
            ? "Двойной щелчок — подключиться"
            : undefined
        }
        type="button"
      >
        <Icon name={channel.type === "text" ? "hash" : "voice"} size={17} />
        <span>{channel.name}</span>
        {channel.participantCount === undefined ||
        channel.participantCount === 0 ? null : (
          <small>{channel.participantCount}</small>
        )}
        {channel.mentionCount === undefined ||
        channel.mentionCount === 0 ? null : (
          <Badge tone="danger">{channel.mentionCount}</Badge>
        )}
        {channel.mentionCount !== undefined ||
        channel.unreadCount === undefined ||
        channel.unreadCount === 0 ? null : (
          <Badge tone="primary">
            {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
          </Badge>
        )}
        {channel.unread === true ? (
          <span
            aria-label="Есть непрочитанные сообщения"
            className="vui-channel-row__unread"
            role="img"
          />
        ) : null}
      </button>
      {hasMenu ? (
        <button
          aria-label={`Действия с каналом ${channel.name}`}
          className="vui-channel-row__menu-trigger"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.right, rect.bottom);
          }}
          type="button"
        >
          •••
        </button>
      ) : null}
      {channel.type !== "voice" ||
      channel.participants === undefined ||
      channel.participants.length === 0 ? null : (
        <div className="vui-channel-row__participants">
          {channel.participants.map((participant) => (
            <div
              aria-busy={participant.pending || undefined}
              data-pending={participant.pending || undefined}
              data-speaking={participant.speaking || undefined}
              draggable={participant.canDrag === true}
              key={participant.userId}
              onDragStart={
                participant.canDrag === true
                  ? (event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-vatrushka-user",
                        participant.userId,
                      );
                    }
                  : undefined
              }
            >
              <Avatar
                name={participant.name}
                size="sm"
                {...(participant.avatarUrl
                  ? { src: participant.avatarUrl }
                  : {})}
              />
              <span>{participant.name}</span>
              <span className="vui-channel-row__participant-signals">
                {participant.pending ? <small>Перемещение…</small> : null}
                {participant.screenSharing ? (
                  <span aria-label="Демонстрирует экран" role="img" title="Демонстрирует экран">
                    <Icon name="screen" size={13} />
                  </span>
                ) : null}
                {participant.deafened ? (
                  <span aria-label="Входящий звук отключён" role="img" title="Входящий звук отключён">
                    <Icon name="volumeOff" size={13} />
                  </span>
                ) : participant.muted ? (
                  <span aria-label="Микрофон выключен" role="img" title="Микрофон выключен">
                    <Icon name="micOff" size={13} />
                  </span>
                ) : null}
                {participant.founder ? (
                  <Badge tone="founder">CEO Founder</Badge>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
      {menu && hasMenu
        ? createPortal(
            <div
              aria-label={`Действия с каналом ${channel.name}`}
              className="vui-channel-context-menu"
              ref={menuRef}
              role="menu"
              style={{ left: menu.x, top: menu.y }}
            >
              <strong>
                {channel.type === "text" ? "#" : "◉"} {channel.name}
              </strong>
              {onRename === undefined ? null : (
                <button
                  onClick={() => {
                    setMenu(null);
                    onRename(channel);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="edit" size={16} />
                  Переименовать
                </button>
              )}
              {onDelete === undefined ? null : (
                <button
                  className="vui-channel-context-menu__danger"
                  onClick={() => {
                    setMenu(null);
                    onDelete(channel.id);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="close" size={16} />
                  Удалить канал
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

interface ChannelCategoryProps {
  title: string;
  channels: ChannelNavigationItem[];
  activeChannelId?: string | undefined;
  canManage?: boolean;
  onSelect: (id: string) => void;
  onConnectVoice?: ((id: string) => void) | undefined;
  onCreate?: ((type: ChannelNavigationItem["type"]) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onRename?: ((channel: ChannelNavigationItem) => void) | undefined;
  onMoveMember?: ((channelId: string, userId: string) => void) | undefined;
  type: ChannelNavigationItem["type"];
}

export function ChannelCategory({
  activeChannelId,
  canManage = false,
  channels,
  onConnectVoice,
  onCreate,
  onDelete,
  onMoveMember,
  onRename,
  onSelect,
  title,
  type,
}: ChannelCategoryProps): React.JSX.Element {
  return (
    <section className="vui-channel-category">
      <header>
        <span>{title}</span>
        {canManage && onCreate !== undefined ? (
          <IconButton
            icon="plus"
            label={`Создать ${type === "text" ? "текстовый" : "голосовой"} канал`}
            onClick={() => onCreate(type)}
            size="sm"
            type="button"
          />
        ) : null}
      </header>
      <div>
        {channels.map((channel) => (
          <ChannelRow
            active={channel.id === activeChannelId}
            canDelete={canManage}
            channel={channel}
            key={channel.id}
            onConnectVoice={onConnectVoice}
            onDelete={onDelete}
            onMoveMember={onMoveMember}
            onRename={onRename}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

export interface UserProfileDockProps {
  name: string;
  email: string;
  founder?: boolean;
  status?: EffectivePresenceStatus;
  avatarUrl?: string | null;
  onStatus?: (status: PresencePreference) => void | Promise<void>;
  onSecurity: () => void;
  onLogout: () => void;
  audioControls?: UserProfileDockAudioControls;
}

export interface UserProfileDockAudioControls {
  connected: boolean;
  microphoneMuted: boolean;
  deafened: boolean;
  busy?: boolean;
  onMicrophoneToggle: () => void;
  onDeafenToggle: () => void;
}

const profileStatusLabels: Record<EffectivePresenceStatus, string> = {
  online: "В сети",
  idle: "Неактивен",
  dnd: "Не беспокоить",
  offline: "Невидимый",
};
const profileStatusOptions: Array<{
  preference: PresencePreference;
  status: EffectivePresenceStatus;
  label: string;
}> = [
  { preference: "online", status: "online", label: "В сети" },
  { preference: "idle", status: "idle", label: "Неактивен" },
  { preference: "do_not_disturb", status: "dnd", label: "Не беспокоить" },
  { preference: "invisible", status: "offline", label: "Невидимый" },
];

export function UserProfileDock({
  audioControls,
  avatarUrl,
  email,
  founder = false,
  name,
  onLogout,
  onSecurity,
  onStatus,
  status = "online",
}: UserProfileDockProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div
      className="vui-profile-dock"
      data-audio={audioControls ? "true" : undefined}
      data-founder={founder || undefined}
    >
      <div className="vui-profile-dock__presence" ref={menuRef}>
        <button
          aria-expanded={open}
          aria-label="Изменить статус"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <Avatar
            name={name}
            size="md"
            {...(avatarUrl ? { src: avatarUrl } : {})}
            status={status}
          />
        </button>
        {open && onStatus ? (
          <div className="vui-profile-dock__status-menu" role="menu">
            {profileStatusOptions.map((option) => (
              <button
                key={option.preference}
                onClick={() => {
                  void onStatus(option.preference);
                  setOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                <StatusDot label={option.label} status={option.status} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="vui-profile-dock__copy">
        <strong title={name}>{name}</strong>
        <small>
          {founder
            ? `CEO Founder · ${profileStatusLabels[status]}`
            : `${email} · ${profileStatusLabels[status]}`}
        </small>
      </span>
      {audioControls ? (
        <span
          aria-label="Управление голосовой связью"
          className="vui-profile-dock__audio"
          role="group"
        >
          <IconButton
            active={audioControls.microphoneMuted}
            aria-pressed={audioControls.microphoneMuted}
            disabled={
              !audioControls.connected ||
              audioControls.busy === true ||
              audioControls.deafened
            }
            icon={audioControls.microphoneMuted ? "micOff" : "mic"}
            label={
              !audioControls.connected
                ? "Подключитесь к голосовому каналу, чтобы управлять микрофоном"
                : audioControls.deafened
                  ? "Входящий звук отключён — микрофон тоже выключен"
                  : audioControls.microphoneMuted
                    ? "Включить микрофон"
                    : "Выключить микрофон"
            }
            onClick={audioControls.onMicrophoneToggle}
            size="sm"
            type="button"
          />
          <IconButton
            active={audioControls.deafened}
            aria-pressed={audioControls.deafened}
            disabled={!audioControls.connected || audioControls.busy === true}
            icon={audioControls.deafened ? "volumeOff" : "volume"}
            label={
              !audioControls.connected
                ? "Подключитесь к голосовому каналу, чтобы управлять входящим звуком"
                : audioControls.deafened
                  ? "Включить входящий звук"
                  : "Отключить входящий звук и микрофон"
            }
            onClick={audioControls.onDeafenToggle}
            size="sm"
            type="button"
          />
        </span>
      ) : null}
      <IconButton
        className="vui-profile-dock__settings"
        icon="settings"
        label="Безопасность и настройки"
        onClick={onSecurity}
        size="sm"
        type="button"
      />
      <IconButton
        className="vui-profile-dock__logout"
        icon="logout"
        label="Выйти из аккаунта"
        onClick={onLogout}
        size="sm"
        type="button"
      />
    </div>
  );
}

export interface ServerContextProps {
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  privacyLabel?: string;
  activeChannelId?: string | undefined;
  textChannels: ChannelNavigationItem[];
  voiceChannels: ChannelNavigationItem[];
  canManageChannels?: boolean;
  canManageRoles?: boolean;
  connectionLabel?: string;
  connectionPanel?: ReactNode;
  profile: ReactNode;
  onChannel: (id: string) => void;
  onConnectVoice?: ((id: string) => void) | undefined;
  onCreateChannel?: ((type: ChannelNavigationItem["type"]) => void) | undefined;
  onDeleteChannel?: ((id: string) => void) | undefined;
  onRenameChannel?: ((channel: ChannelNavigationItem) => void) | undefined;
  onCopyInvite: () => void;
  onManageRoles: () => void;
  onMoveMember?: ((channelId: string, userId: string) => void) | undefined;
}

export function ServerContext({
  activeChannelId,
  canManageChannels = false,
  canManageRoles = false,
  connectionLabel = "Голосовой канал не подключён",
  connectionPanel,
  description,
  iconUrl,
  bannerUrl,
  accentColor,
  name,
  onChannel,
  onConnectVoice,
  onCopyInvite,
  onCreateChannel,
  onDeleteChannel,
  onManageRoles,
  onMoveMember,
  onRenameChannel,
  privacyLabel = "Приватный сервер",
  profile,
  textChannels,
  voiceChannels,
}: ServerContextProps): React.JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  useEffect(() => {
    setIconFailed(false);
    setBannerFailed(false);
  }, [iconUrl, bannerUrl]);
  return (
    <aside
      aria-label="Навигация сервера"
      className="vui-server-context"
      style={
        { "--server-accent": accentColor ?? undefined } as React.CSSProperties
      }
    >
      <header className="vui-server-context__header">
        {bannerUrl && !bannerFailed ? (
          <img
            aria-hidden="true"
            className="vui-server-context__banner"
            onError={() => setBannerFailed(true)}
            src={bannerUrl}
          />
        ) : null}
        <div>
          <span aria-hidden="true" className="vui-server-context__cover">
            {iconUrl && !iconFailed ? (
              <img alt="" onError={() => setIconFailed(true)} src={iconUrl} />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </span>
          <span>
            <strong title={name}>{name}</strong>
            <small>
              <Icon name="lock" size={12} />
              {privacyLabel}
            </small>
          </span>
        </div>
        <span className="vui-server-context__tools">
          <IconButton
            icon="invite"
            label="Пригласить на сервер"
            onClick={onCopyInvite}
            size="sm"
            type="button"
          />
          {canManageRoles ? (
            <IconButton
              icon="settings"
              label="Роли и права"
              onClick={onManageRoles}
              size="sm"
              type="button"
            />
          ) : null}
        </span>
      </header>
      <div
        className="vui-server-context__about"
        data-empty={!description?.trim() || undefined}
        title={description?.trim() || "Описание сервера не задано"}
      >
        <Icon name="info" size={14} />
        <p>{description?.trim() || "Описание сервера не задано"}</p>
      </div>
      <div className="vui-server-context__scroll">
        <ChannelCategory
          activeChannelId={activeChannelId}
          canManage={canManageChannels}
          channels={textChannels}
          onCreate={onCreateChannel}
          onDelete={onDeleteChannel}
          onRename={onRenameChannel}
          onSelect={onChannel}
          title="Текстовые каналы"
          type="text"
        />
        <ChannelCategory
          activeChannelId={activeChannelId}
          canManage={canManageChannels}
          channels={voiceChannels}
          onConnectVoice={onConnectVoice}
          onCreate={onCreateChannel}
          onDelete={onDeleteChannel}
          onMoveMember={onMoveMember}
          onRename={onRenameChannel}
          onSelect={onChannel}
          title="Голосовые каналы"
          type="voice"
        />
      </div>
      {connectionPanel ?? (
        <div className="vui-server-context__connection">
          <StatusDot label="Статус голосового подключения" status="offline" />
          <span>{connectionLabel}</span>
        </div>
      )}
      {profile}
    </aside>
  );
}

export interface ServerTopBarProps {
  channelName: string;
  channelType: "text" | "voice";
  description?: string;
  memberCount: number;
  actions?: ReactNode;
}

export function ServerTopBar({
  actions,
  channelName,
  channelType,
  description,
  memberCount,
}: ServerTopBarProps): React.JSX.Element {
  return (
    <div className="vui-server-topbar">
      <Icon name={channelType === "text" ? "hash" : "voice"} size={19} />
      <span className="vui-server-topbar__title">
        <strong>{channelName}</strong>
        {description === undefined ? null : <small>{description}</small>}
      </span>
      <span className="vui-server-topbar__members">
        <Icon name="users" size={17} />
        {memberCount}
      </span>
      {actions}
    </div>
  );
}

export interface MemberNavigationItem {
  id: string;
  name: string;
  roleLabel?: string;
  founder?: boolean;
  status?: "online" | "idle" | "dnd" | "offline" | "streaming";
  actions?: ReactNode;
  draggable?: boolean;
  avatarUrl?: string | null;
}

export interface MemberPanelProps {
  members: MemberNavigationItem[];
}

function MemberRow({ member }: { member: MemberNavigationItem }): React.JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openMenu = (x: number, y: number): void =>
    setMenu({
      x: Math.max(12, Math.min(x, window.innerWidth - 230)),
      y: Math.max(12, Math.min(y, window.innerHeight - 120)),
    });
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  return (
    <div
      className="vui-member-row"
      data-founder={member.founder || undefined}
      draggable={member.draggable === true}
      onContextMenu={
        member.actions
          ? (event) => {
              event.preventDefault();
              openMenu(event.clientX, event.clientY);
            }
          : undefined
      }
      onDragStart={
        member.draggable === true
          ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/x-vatrushka-user",
                member.id,
              );
            }
          : undefined
      }
      title={
        member.draggable === true
          ? "Перетащите участника в голосовой канал"
          : undefined
      }
    >
      <Avatar
        name={member.name}
        size="sm"
        {...(member.avatarUrl ? { src: member.avatarUrl } : {})}
        {...(member.status === undefined ? {} : { status: member.status })}
      />
      <span>
        <strong title={member.name}>{member.name}</strong>
        <small
          title={
            member.roleLabel ??
            (member.founder ? "Владелец сервера" : "Участник")
          }
        >
          {member.roleLabel ??
            (member.founder ? "Владелец сервера" : "Участник")}
        </small>
      </span>
      {member.founder ? <Badge tone="founder">CEO Founder</Badge> : null}
      {member.actions ? (
        <button
          aria-label={`Действия с участником ${member.name}`}
          className="vui-member-row__menu-trigger"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.right, rect.bottom);
          }}
          type="button"
        >
          •••
        </button>
      ) : null}
      {menu && member.actions
        ? createPortal(
            <div
              aria-label={`Действия с участником ${member.name}`}
              className="vui-member-context-menu"
              ref={menuRef}
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              onClick={() => setMenu(null)}
            >
              <strong>{member.name}</strong>
              {member.actions}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MemberPanel({ members }: MemberPanelProps): React.JSX.Element {
  const online = members.filter(
    (member) => member.status !== undefined && member.status !== "offline",
  ).length;
  return (
    <aside aria-label="Участники сервера" className="vui-member-panel">
      <header>
        <span>Участники</span>
        <Badge>{members.length}</Badge>
      </header>
      <div className="vui-member-panel__summary">
        <StatusDot label="В сети" status="online" />
        {online} в сети
      </div>
      <div className="vui-member-panel__list">
        {members.map((member) => <MemberRow key={member.id} member={member} />)}
      </div>
    </aside>
  );
}

export interface NavAction {
  icon: IconName;
  label: string;
  onClick: () => void;
}
