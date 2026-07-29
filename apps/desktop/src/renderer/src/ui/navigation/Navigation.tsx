import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  EffectivePresenceStatus,
  PresencePreference,
} from "@vatrushka/shared";

import brandMarkUrl from "../../assets/vatrushka-logo.png";
import {
  Avatar,
  Badge,
  CommunityLogo,
  Icon,
  IconButton,
  StableImage,
  StatusDot,
  Tooltip,
} from "../primitives";
import type { IconName } from "../primitives";
import "./navigation.css";

const voiceMemberDragMime = "application/x-vatrushka-voice-member";

export function BrandLockup(): React.JSX.Element {
  return (
    <div className="vui-brand-lockup" aria-label="Vatrushka">
      <img alt="" aria-hidden="true" src={brandMarkUrl} />
      <strong>Ватрушка</strong>
    </div>
  );
}

export interface WorkspaceNavigationItem {
  id: string;
  name: string;
  memberCount: number;
  statusLabel?: string;
  unread?: boolean;
  mentionCount?: number;
  activeVoice?: boolean;
  iconUrl?: string | null;
  bannerUrl?: string | null;
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
  return (
    <button
      aria-current={active ? "page" : undefined}
      className="vui-workspace-card"
      data-active={active || undefined}
      disabled={disabled}
      onClick={() => onSelect(workspace.id)}
      type="button"
    >
      {workspace.bannerUrl === undefined || workspace.bannerUrl === null ? null : <StableImage alt="" aria-hidden="true" className="vui-workspace-card__cover" fallback={null} src={workspace.bannerUrl} />}
      <CommunityLogo
        accentColor={workspace.accentColor}
        bannerSrc={workspace.bannerUrl}
        className="vui-workspace-card__logo"
        name={workspace.name}
        src={workspace.iconUrl}
      />
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
  disabled?: boolean;
  homeActive?: boolean;
  onSelect: (id: string) => void;
  onHome: () => void;
  onDirectMessages?: () => void;
  onCreate: () => void;
  profile?: ReactNode;
}

export type GlobalSidebarSection = "home" | "messages" | "server";

export interface GlobalSidebarProps {
  activeSection: GlobalSidebarSection;
  disabled?: boolean;
  activeServerId?: string;
  onDirectMessages: () => void;
  onHome: () => void;
  onServerSelect?: (serverId: string) => void;
  profile?: ReactNode;
  servers?: WorkspaceNavigationItem[];
}

/**
 * The persistent product navigation from the UI Kit.  Server and channel
 * navigation deliberately live in the adjacent context column, not here.
 */
export function GlobalSidebar({
  activeSection,
  activeServerId,
  disabled = false,
  onDirectMessages,
  onHome,
  onServerSelect,
  profile,
  servers = [],
}: GlobalSidebarProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window.localStorage?.getItem === "function" && window.localStorage.getItem("vatrushka.global-sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = (): void => {
    setCollapsed((current) => {
      const next = !current;
      try {
        if (typeof window.localStorage?.setItem === "function") window.localStorage.setItem("vatrushka.global-sidebar.collapsed", String(next));
      } catch {
        // Persistence is optional; the control still works for this session.
      }
      return next;
    });
  };
  return (
    <aside aria-label="Основная навигация" className="vui-global-sidebar" data-collapsed={collapsed || undefined}>
      <div className="vui-global-sidebar__brand"><BrandLockup /><IconButton icon={collapsed ? "panelRight" : "panelLeft"} label={collapsed ? "Развернуть навигацию" : "Свернуть навигацию"} onClick={toggleCollapsed} size="sm" type="button" /></div>
      <nav aria-label="Разделы приложения" className="vui-global-sidebar__nav">
        <button aria-current={activeSection === "home" ? "page" : undefined} data-active={activeSection === "home" || undefined} disabled={disabled} onClick={onHome} type="button">
          <Icon name="home" size={18} /><span>Главная</span>
        </button>
        <button aria-describedby="vui-global-sidebar-friends-hint" disabled type="button">
          <Icon name="users" size={18} /><span>Друзья</span>
        </button>
        <button aria-current={activeSection === "messages" ? "page" : undefined} data-active={activeSection === "messages" || undefined} disabled={disabled} onClick={onDirectMessages} type="button">
          <Icon name="message" size={18} /><span>Сообщения</span>
        </button>
      </nav>
      <span className="vui-sr-only" id="vui-global-sidebar-friends-hint">Раздел друзей появится в следующем обновлении.</span>
      {servers.length === 0 ? null : (
        <nav aria-label="Ваши серверы" className="vui-global-sidebar__servers">
          {servers.map((server) => (
            <WorkspaceCard
              active={server.id === activeServerId}
              disabled={disabled}
              key={server.id}
              onSelect={onServerSelect ?? (() => undefined)}
              workspace={server}
            />
          ))}
        </nav>
      )}
      {profile === undefined ? null : <div className="vui-global-sidebar__profile">{profile}</div>}
    </aside>
  );
}

export function WorkspaceLibrary({
  activeWorkspaceId,
  directActive = false,
  directUnreadCount = 0,
  disabled = false,
  homeActive = false,
  onCreate,
  onDirectMessages,
  onHome,
  onSelect,
  profile,
  workspaces,
}: WorkspaceLibraryProps): React.JSX.Element {
  return (
    <aside aria-label="Библиотека серверов" className="vui-workspace-library">
      <div className="vui-workspace-library__brand">
        <BrandLockup />
      </div>
      <button
        aria-current={homeActive ? "page" : undefined}
        className="vui-workspace-library__home"
        data-active={homeActive || undefined}
        disabled={disabled}
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
            disabled={disabled}
            key={workspace.id}
            onSelect={onSelect}
            workspace={workspace}
          />
        ))}
      </nav>
      <div className="vui-workspace-library__actions">
        <button disabled={disabled} onClick={onCreate} type="button">
          <Icon name="plus" size={17} />
          <span>Создать сервер</span>
        </button>
      </div>
      {profile === undefined ? null : <div className="vui-workspace-library__profile">{profile}</div>}
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
              if (!event.dataTransfer.types.includes(voiceMemberDragMime))
                return;
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
              if (!event.dataTransfer.types.includes(voiceMemberDragMime))
                return;
              event.preventDefault();
              delete event.currentTarget.dataset.dropTarget;
              const userId = event.dataTransfer.getData(
                voiceMemberDragMime,
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
                        voiceMemberDragMime,
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
  coverUrl?: string | null | undefined;
  onStatus?: (status: PresencePreference) => void | Promise<void>;
  onSecurity: () => void;
  onLogout: () => void;
  voiceConnection?: ReactNode | undefined;
  enableTilt?: boolean | undefined;
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
  avatarUrl,
  coverUrl,
  email,
  founder = false,
  name,
  onLogout,
  onSecurity,
  onStatus,
  status = "online",
  voiceConnection,
  enableTilt = false,
}: UserProfileDockProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const profileStackRef = useRef<HTMLDivElement>(null);
  const tiltFrameRef = useRef<number | null>(null);
  const pendingTiltRef = useRef<{ x: number; y: number } | null>(null);
  const statusButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeStatusMenu = (): void => {
    setOpen(false);
    setStatusMenuPosition(null);
    requestAnimationFrame(() => statusButtonRef.current?.focus());
  };
  const toggleStatusMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (open) {
      closeStatusMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setStatusMenuPosition({
      top: Math.max(8, rect.top - 156),
      left: Math.max(
        8,
        Math.min(window.innerWidth - 172, rect.left + rect.width / 2 - 82),
      ),
    });
    setOpen(true);
  };
  const applyTilt = (x: number, y: number): void => {
    const stack = profileStackRef.current;
    if (stack === null) return;
    stack.style.transition = "none";
    stack.style.transform = `perspective(520px) rotateX(${x}deg) rotateY(${y}deg)`;
  };
  const scheduleTilt = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    pendingTiltRef.current = {
      x: ((event.clientY - rect.top) / rect.height - 0.5) * -12,
      y: ((event.clientX - rect.left) / rect.width - 0.5) * 18,
    };
    if (tiltFrameRef.current !== null) return;
    tiltFrameRef.current = window.requestAnimationFrame(() => {
      tiltFrameRef.current = null;
      const next = pendingTiltRef.current;
      if (next !== null) applyTilt(next.x, next.y);
    });
  };
  const resetTilt = (): void => {
    if (tiltFrameRef.current !== null) window.cancelAnimationFrame(tiltFrameRef.current);
    tiltFrameRef.current = null;
    pendingTiltRef.current = null;
    const stack = profileStackRef.current;
    if (stack === null) return;
    stack.style.transition = "transform 140ms var(--easing-standard)";
    stack.style.transform = "perspective(520px) rotateX(0deg) rotateY(0deg)";
  };
  useEffect(
    () => () => {
      if (tiltFrameRef.current !== null) window.cancelAnimationFrame(tiltFrameRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent): void => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !statusButtonRef.current?.contains(event.target as Node)
      )
        closeStatusMenu();
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeStatusMenu();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  return (
    <div
      className="vui-profile-stack"
      data-tilt-enabled={enableTilt || undefined}
      onPointerLeave={enableTilt ? resetTilt : undefined}
      onPointerMove={enableTilt ? scheduleTilt : undefined}
      ref={profileStackRef}
    >
      {voiceConnection}
      <section
        className="vui-profile-dock"
        data-founder={founder || undefined}
        data-invisible={status === "offline" || undefined}
      >
      <StableImage
        alt=""
        aria-hidden="true"
        className="vui-profile-dock__cover"
        fallback={<span className="vui-profile-dock__cover vui-profile-dock__cover-fallback" />}
        src={coverUrl}
      />
      <div className="vui-profile-dock__presence">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Изменить статус"
          onClick={toggleStatusMenu}
          ref={statusButtonRef}
          type="button"
        >
          <Avatar
            name={name}
            size="md"
            {...(avatarUrl ? { src: avatarUrl } : {})}
            status={status}
          />
        </button>
      </div>
      {open && onStatus && statusMenuPosition
        ? createPortal(
          <div
            aria-label="Статус активности"
            className="vui-profile-dock__status-menu"
            ref={menuRef}
            role="menu"
            style={statusMenuPosition}
          >
            {profileStatusOptions.map((option) => (
              <button
                key={option.preference}
                onClick={() => {
                  void onStatus(option.preference);
                  closeStatusMenu();
                }}
                role="menuitem"
                type="button"
              >
                <StatusDot label={option.label} status={option.status} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
        : null}
      <span className="vui-profile-dock__copy">
        <strong title={name}>{name}</strong>
        <small>
          {founder
            ? `CEO Founder · ${profileStatusLabels[status]}`
            : `${email} · ${profileStatusLabels[status]}`}
        </small>
      </span>
      <span className="vui-profile-dock__top-actions">
        <IconButton
          className="vui-profile-dock__logout"
          icon="logout"
          label="Выйти из аккаунта"
          onClick={onLogout}
          size="sm"
          type="button"
        />
        <IconButton
          className="vui-profile-dock__settings"
          icon="settings"
          label="Настройки пользователя"
          onClick={onSecurity}
          size="sm"
          type="button"
        />
      </span>
      </section>
    </div>
  );
}

export interface VoiceProfileConnectionProps {
  channelName: string;
  participantCount: number;
  state: "connected" | "connecting" | "reconnecting";
  microphoneMuted: boolean;
  deafened: boolean;
  onMicrophoneToggle: () => void;
  onDeafenToggle: () => void;
  onOpen: () => void;
  onLeave: () => void;
}

/**
 * A compact, transport-agnostic connection controller.  It lives in the
 * persistent global profile card, while device selection remains in the full
 * voice dock and audio settings.
 */
export function VoiceProfileConnection({
  channelName,
  deafened,
  microphoneMuted,
  onDeafenToggle,
  onLeave,
  onMicrophoneToggle,
  onOpen,
  participantCount,
  state,
}: VoiceProfileConnectionProps): React.JSX.Element {
  const controlsDisabled = state !== "connected";
  const stateLabel =
    state === "connected"
      ? "В голосовом канале"
      : state === "reconnecting"
        ? "Переподключаемся…"
        : "Подключаемся…";
  const microphoneLabel = microphoneMuted
    ? "Включить микрофон"
    : "Выключить микрофон";
  const soundLabel = deafened ? "Включить звук" : "Выключить звук";
  return (
    <section className="vui-profile-voice" data-state={state}>
      <button
        aria-label="Вернуться в голосовой канал"
        className="vui-profile-voice__summary"
        onClick={onOpen}
        type="button"
      >
        <span aria-hidden="true" className="vui-profile-voice__status" />
        <span>
          <strong>{stateLabel}</strong>
          <small>
            {channelName} · {participantCount} {participantCount === 1 ? "участник" : "участника"}
          </small>
        </span>
      </button>
      <div aria-label="Управление голосовым каналом" className="vui-profile-voice__actions">
        <Tooltip content={microphoneLabel}>
          <IconButton active={microphoneMuted} className="vui-profile-voice__action" disabled={controlsDisabled} icon={microphoneMuted ? "micOff" : "mic"} label={microphoneLabel} onClick={onMicrophoneToggle} size="sm" type="button" />
        </Tooltip>
        <Tooltip content={soundLabel}>
          <IconButton active={deafened} className="vui-profile-voice__action" disabled={controlsDisabled} icon={deafened ? "volumeOff" : "volume"} label={soundLabel} onClick={onDeafenToggle} size="sm" type="button" />
        </Tooltip>
        <Tooltip content="Вернуться в голосовой канал">
          <IconButton className="vui-profile-voice__action" icon="arrowRight" label="Вернуться в голосовой канал" onClick={onOpen} size="sm" type="button" />
        </Tooltip>
        <Tooltip content="Покинуть голосовой канал">
          <IconButton className="vui-profile-voice__action vui-profile-voice__leave" icon="phone" label="Покинуть голосовой канал" onClick={onLeave} size="sm" type="button" />
        </Tooltip>
      </div>
    </section>
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
  textChannels,
  voiceChannels,
}: ServerContextProps): React.JSX.Element {
  const isOfficial = name.trim().toLocaleLowerCase("ru-RU") === "ватрушка";
  return (
    <aside
      aria-label="Навигация сервера"
      className="vui-server-context"
      style={
        { "--server-accent": accentColor ?? undefined } as React.CSSProperties
      }
    >
      <header className="vui-server-context__header">
        <StableImage
          aria-hidden="true"
          className="vui-server-context__banner"
          src={bannerUrl}
        />
        <span aria-hidden="true" className="vui-server-context__cover">
          <StableImage
            alt=""
            fallback={name.slice(0, 1).toUpperCase()}
            src={iconUrl}
          />
        </span>
        <div className="vui-server-context__identity">
          <span className="vui-server-context__title">
            <strong title={name}>{name}</strong>
            <Icon aria-label={privacyLabel} name="lock" size={18} />
          </span>
          {isOfficial ? <small className="vui-server-context__official"><Icon name="check" size={13} />Официальный сервер</small> : null}
          <p title={description?.trim() || "Описание сервера не задано"}>{description?.trim() || "Описание сервера не задано"}</p>
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
    </aside>
  );
}

export interface ServerTopBarProps {
  channelName: string;
  channelType: "text" | "voice";
  description?: string;
  memberCount: number;
  actions?: ReactNode;
  connectionStatus?: ReactNode;
  showMemberCount?: boolean;
}

export function ServerTopBar({
  actions,
  channelName,
  channelType,
  connectionStatus,
  description,
  memberCount,
  showMemberCount = true,
}: ServerTopBarProps): React.JSX.Element {
  return (
    <div className="vui-server-topbar">
      <Icon name={channelType === "text" ? "hash" : "voice"} size={19} />
      <span className="vui-server-topbar__title">
        <strong>{channelName}</strong>
        {description === undefined ? null : <small>{description}</small>}
      </span>
      {showMemberCount ? (
        <span className="vui-server-topbar__members">
          <Icon name="users" size={17} />
          {memberCount}
        </span>
      ) : null}
      {connectionStatus}
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
      onContextMenu={
        member.actions
          ? (event) => {
              event.preventDefault();
              openMenu(event.clientX, event.clientY);
            }
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
