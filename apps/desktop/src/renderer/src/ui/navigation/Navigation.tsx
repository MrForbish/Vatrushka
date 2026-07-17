import type { ReactNode } from 'react';

import { Avatar, Badge, Icon, IconButton, SearchInput, StatusDot } from '../primitives';
import type { IconName } from '../primitives';
import './navigation.css';

export interface WorkspaceNavigationItem {
  id: string;
  name: string;
  memberCount: number;
  statusLabel?: string;
  unread?: boolean;
  mentionCount?: number;
  activeVoice?: boolean;
}

interface WorkspaceCardProps {
  workspace: WorkspaceNavigationItem;
  active?: boolean;
  onSelect: (id: string) => void;
}

export function WorkspaceCard({ active = false, onSelect, workspace }: WorkspaceCardProps): React.JSX.Element {
  const initials = workspace.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className="vui-workspace-card"
      data-active={active || undefined}
      onClick={() => onSelect(workspace.id)}
      type="button"
    >
      <span aria-hidden="true" className="vui-workspace-card__mark">{initials}</span>
      <span className="vui-workspace-card__copy">
        <strong>{workspace.name}</strong>
        <small>{workspace.statusLabel ?? `${workspace.memberCount} участников`}</small>
      </span>
      <span className="vui-workspace-card__signals">
        {workspace.activeVoice === true ? <Icon name="voice" size={14} /> : null}
        {workspace.mentionCount === undefined || workspace.mentionCount === 0 ? null : <Badge tone="danger">{workspace.mentionCount > 99 ? '99+' : workspace.mentionCount}</Badge>}
        {workspace.unread === true ? <span aria-label="Есть непрочитанные сообщения" className="vui-workspace-card__unread" role="img" /> : null}
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

export function WorkspaceLibrary({ activeWorkspaceId, directActive = false, directUnreadCount = 0, onCreate, onDirectMessages, onHome, onSelect, workspaces }: WorkspaceLibraryProps): React.JSX.Element {
  return (
    <aside aria-label="Библиотека серверов" className="vui-workspace-library">
      <div className="vui-workspace-library__brand"><span aria-hidden="true">В</span><strong>Ватрушка</strong></div>
      <button className="vui-workspace-library__home" onClick={onHome} type="button"><Icon name="home" size={18} /><span>Главная</span></button>
      {onDirectMessages === undefined ? null : <button aria-current={directActive ? 'page' : undefined} className="vui-workspace-library__home" data-active={directActive || undefined} onClick={onDirectMessages} type="button"><Icon name="message" size={18} /><span>Личные сообщения</span>{directUnreadCount === 0 ? null : <Badge tone="danger">{directUnreadCount > 99 ? '99+' : directUnreadCount}</Badge>}</button>}
      <div className="vui-workspace-library__heading"><span>Серверы</span><Badge>{workspaces.length}</Badge></div>
      <nav aria-label="Список серверов" className="vui-workspace-library__list">
        {workspaces.map((workspace) => <WorkspaceCard active={workspace.id === activeWorkspaceId} key={workspace.id} onSelect={onSelect} workspace={workspace} />)}
      </nav>
      <div className="vui-workspace-library__actions">
        <button onClick={onCreate} type="button"><Icon name="plus" size={17} /><span>Создать сервер</span></button>
      </div>
    </aside>
  );
}

export interface ChannelNavigationItem {
  id: string;
  name: string;
  type: 'text' | 'voice';
  unread?: boolean;
  unreadCount?: number;
  mentionCount?: number;
  participantCount?: number;
}

interface ChannelRowProps {
  channel: ChannelNavigationItem;
  active?: boolean;
  canDelete?: boolean;
  onSelect: (id: string) => void;
  onConnectVoice?: ((id: string) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
}

export function ChannelRow({ active = false, canDelete = false, channel, onConnectVoice, onDelete, onSelect }: ChannelRowProps): React.JSX.Element {
  return (
    <div className="vui-channel-row" data-active={active || undefined}>
      <button aria-current={active ? 'page' : undefined} onClick={() => onSelect(channel.id)} onDoubleClick={channel.type === 'voice' && onConnectVoice !== undefined ? () => onConnectVoice(channel.id) : undefined} title={channel.type === 'voice' && onConnectVoice !== undefined ? 'Двойной щелчок — подключиться' : undefined} type="button">
        <Icon name={channel.type === 'text' ? 'hash' : 'voice'} size={17} />
        <span>{channel.name}</span>
        {channel.participantCount === undefined || channel.participantCount === 0 ? null : <small>{channel.participantCount}</small>}
        {channel.mentionCount === undefined || channel.mentionCount === 0 ? null : <Badge tone="danger">{channel.mentionCount}</Badge>}
        {channel.mentionCount !== undefined || channel.unreadCount === undefined || channel.unreadCount === 0 ? null : <Badge tone="primary">{channel.unreadCount > 99 ? '99+' : channel.unreadCount}</Badge>}
        {channel.unread === true ? <span aria-label="Есть непрочитанные сообщения" className="vui-channel-row__unread" role="img" /> : null}
      </button>
      {canDelete && onDelete !== undefined ? <IconButton className="vui-channel-row__delete" icon="close" label={`Удалить канал ${channel.name}`} onClick={() => onDelete(channel.id)} size="sm" type="button" /> : null}
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
  onCreate?: ((type: ChannelNavigationItem['type']) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  type: ChannelNavigationItem['type'];
}

export function ChannelCategory({ activeChannelId, canManage = false, channels, onConnectVoice, onCreate, onDelete, onSelect, title, type }: ChannelCategoryProps): React.JSX.Element {
  return (
    <section className="vui-channel-category">
      <header><span>{title}</span>{canManage && onCreate !== undefined ? <IconButton icon="plus" label={`Создать ${type === 'text' ? 'текстовый' : 'голосовой'} канал`} onClick={() => onCreate(type)} size="sm" type="button" /> : null}</header>
      <div>{channels.map((channel) => <ChannelRow active={channel.id === activeChannelId} canDelete={canManage} channel={channel} key={channel.id} onConnectVoice={onConnectVoice} onDelete={onDelete} onSelect={onSelect} />)}</div>
    </section>
  );
}

export interface UserProfileDockProps {
  name: string;
  email: string;
  founder?: boolean;
  onSecurity: () => void;
  onLogout: () => void;
}

export function UserProfileDock({ email, founder = false, name, onLogout, onSecurity }: UserProfileDockProps): React.JSX.Element {
  return (
    <div className="vui-profile-dock" data-founder={founder || undefined}>
      <Avatar name={name} size="md" status="online" />
      <span className="vui-profile-dock__copy"><strong>{name}</strong><small>{founder ? 'Основатель · online' : email}</small></span>
      <IconButton icon="settings" label="Безопасность и настройки" onClick={onSecurity} size="sm" type="button" />
      <IconButton icon="logout" label="Выйти из аккаунта" onClick={onLogout} size="sm" type="button" />
    </div>
  );
}

export interface ServerContextProps {
  name: string;
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
  onCreateChannel?: ((type: ChannelNavigationItem['type']) => void) | undefined;
  onDeleteChannel?: ((id: string) => void) | undefined;
  onCopyInvite: () => void;
  onManageRoles: () => void;
}

export function ServerContext({ activeChannelId, canManageChannels = false, canManageRoles = false, connectionLabel = 'Голосовой канал не подключён', connectionPanel, name, onChannel, onConnectVoice, onCopyInvite, onCreateChannel, onDeleteChannel, onManageRoles, privacyLabel = 'Приватный сервер', profile, textChannels, voiceChannels }: ServerContextProps): React.JSX.Element {
  return (
    <aside aria-label="Навигация сервера" className="vui-server-context">
      <header className="vui-server-context__header">
        <div><span aria-hidden="true" className="vui-server-context__cover">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small><Icon name="lock" size={12} />{privacyLabel}</small></span></div>
        <span className="vui-server-context__tools"><IconButton icon="invite" label="Пригласить на сервер" onClick={onCopyInvite} size="sm" type="button" />{canManageRoles ? <IconButton icon="settings" label="Роли и права" onClick={onManageRoles} size="sm" type="button" /> : null}</span>
      </header>
      <div className="vui-server-context__scroll">
        <ChannelCategory activeChannelId={activeChannelId} canManage={canManageChannels} channels={textChannels} onCreate={onCreateChannel} onDelete={onDeleteChannel} onSelect={onChannel} title="Текстовые каналы" type="text" />
        <ChannelCategory activeChannelId={activeChannelId} canManage={canManageChannels} channels={voiceChannels} onConnectVoice={onConnectVoice} onCreate={onCreateChannel} onDelete={onDeleteChannel} onSelect={onChannel} title="Голосовые каналы" type="voice" />
      </div>
      {connectionPanel ?? <div className="vui-server-context__connection"><StatusDot label="Статус голосового подключения" status="offline" /><span>{connectionLabel}</span></div>}
      {profile}
    </aside>
  );
}

export interface ServerTopBarProps {
  channelName: string;
  channelType: 'text' | 'voice';
  description?: string;
  memberCount: number;
  onSearch?: (value: string) => void;
  actions?: ReactNode;
}

export function ServerTopBar({ actions, channelName, channelType, description, memberCount, onSearch }: ServerTopBarProps): React.JSX.Element {
  return (
    <div className="vui-server-topbar">
      <Icon name={channelType === 'text' ? 'hash' : 'voice'} size={19} />
      <span className="vui-server-topbar__title"><strong>{channelName}</strong>{description === undefined ? null : <small>{description}</small>}</span>
      <div className="vui-server-topbar__search"><SearchInput aria-label="Поиск на сервере" {...(onSearch === undefined ? {} : { onValueChange: onSearch })} placeholder="Поиск" size="sm" /></div>
      <span className="vui-server-topbar__members"><Icon name="users" size={17} />{memberCount}</span>
      {actions}
    </div>
  );
}

export interface MemberNavigationItem {
  id: string;
  name: string;
  roleLabel?: string;
  founder?: boolean;
  status?: 'online' | 'idle' | 'dnd' | 'offline' | 'streaming';
  actions?: ReactNode;
}

export interface MemberPanelProps {
  members: MemberNavigationItem[];
}

export function MemberPanel({ members }: MemberPanelProps): React.JSX.Element {
  const online = members.filter((member) => member.status !== undefined && member.status !== 'offline').length;
  return (
    <aside aria-label="Участники сервера" className="vui-member-panel">
      <header><span>Участники</span><Badge>{members.length}</Badge></header>
      <div className="vui-member-panel__summary"><StatusDot label="В сети" status="online" />{online} в сети</div>
      <div className="vui-member-panel__list">
        {members.map((member) => (
          <div className="vui-member-row" data-founder={member.founder || undefined} key={member.id}>
            <Avatar name={member.name} size="sm" {...(member.status === undefined ? {} : { status: member.status })} />
            <span><strong>{member.name}</strong><small>{member.roleLabel ?? (member.founder ? 'Основатель сервера' : 'Участник')}</small></span>
            {member.founder ? <Badge tone="founder">DEV</Badge> : member.actions}
          </div>
        ))}
      </div>
    </aside>
  );
}

export interface NavAction {
  icon: IconName;
  label: string;
  onClick: () => void;
}
