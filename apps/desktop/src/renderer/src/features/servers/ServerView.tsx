import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';

import {
  serverPermissions,
  type PublicUser,
  type ServerDetail,
  type ServerPermission,
  type ServerSummary,
  type TextMessage,
} from '@vatrushka/shared';

import {
  AppShell,
  Badge,
  Button,
  Checkbox,
  Icon,
  IconButton,
  Input,
  MessageComposer,
  MessageList,
  MemberPanel,
  Modal,
  SegmentedControl,
  Select,
  ServerContext,
  ServerTopBar,
  UserProfileDock,
  WorkspaceLibrary,
  type ChannelNavigationItem,
  type MemberNavigationItem,
  type MessageViewModel,
  type WorkspaceNavigationItem,
} from '../../ui';
import './server-view.css';

export interface ServerViewProps {
  user: PublicUser;
  server: ServerDetail;
  servers: ServerSummary[];
  activeChannelId: string | null;
  messages: TextMessage[];
  messageDraft: string;
  serverName: string;
  serverInvite: string;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onSwitchServer(serverId: string): void;
  onChannel(channelId: string): void;
  onMessageDraft(value: string): void;
  onSendMessage(replyToMessageId?: string, files?: File[]): void;
  onUpdateMessage(messageId: string, content: string): void;
  onMessageReaction(messageId: string, emoji: string): void;
  onDeleteMessage(messageId: string): void;
  onDeleteAttachment(attachmentId: string): void;
  onDownloadAttachment(attachmentId: string, fileName: string): void;
  onConnectVoice(channelId: string): void;
  onCopyInvite(): void;
  onCreateChannel(name: string, type: 'text' | 'voice'): void;
  onDeleteChannel(channelId: string): void;
  onCreateRole(name: string, color: string, permissions: ServerPermission[]): void;
  onAssignRoles(userId: string, roleIds: string[]): void;
  onKickMember(userId: string): void;
  onServerName(value: string): void;
  onServerInvite(value: string): void;
  onCreateServer(): void;
  onJoinServer(): void;
  onSecurity(): void;
  onLogout(): void;
}

const permissionLabels: Record<ServerPermission, string> = {
  VIEW_SERVER: 'Видеть сервер',
  MANAGE_SERVER: 'Управлять сервером',
  MANAGE_CHANNELS: 'Управлять каналами',
  MANAGE_ROLES: 'Управлять ролями',
  CREATE_INVITES: 'Создавать приглашения',
  KICK_MEMBERS: 'Исключать участников',
  VIEW_CHANNEL: 'Видеть каналы',
  SEND_MESSAGES: 'Отправлять сообщения',
  MANAGE_MESSAGES: 'Управлять сообщениями',
  CONNECT_VOICE: 'Подключаться к голосу',
  SPEAK: 'Говорить',
  STREAM: 'Демонстрировать экран',
  MUTE_MEMBERS: 'Отключать участников в голосе',
};

const allowedAttachmentTypes = new Set(['application/pdf', 'application/zip', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']);
const maxAttachmentBytes = 8 * 1024 * 1024;

function displayName(user: PublicUser): string {
  return user.displayName ?? user.email.split('@')[0] ?? 'Пользователь';
}

export function ServerView(props: ServerViewProps): React.JSX.Element {
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice'>('text');
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#a86b4b');
  const [rolePermissions, setRolePermissions] = useState<ServerPermission[]>(['VIEW_SERVER', 'VIEW_CHANNEL']);
  const [memberId, setMemberId] = useState('');
  const [memberRoles, setMemberRoles] = useState<string[]>([]);
  const [serverAction, setServerAction] = useState<'create' | 'join' | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageViewModel | null>(null);
  const [replyingMessage, setReplyingMessage] = useState<MessageViewModel | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ id: string; file: File }>>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    setEditingMessage(null);
    setReplyingMessage(null);
    setPendingAttachments([]);
    setAttachmentError(null);
  }, [props.activeChannelId, props.server.id]);

  const addAttachments = (files: File[]): void => {
    const accepted = files.filter((file) => allowedAttachmentTypes.has(file.type) && file.size > 0 && file.size <= maxAttachmentBytes);
    setAttachmentError(accepted.length === files.length ? null : 'Поддерживаются изображения, PDF, TXT и ZIP размером до 8 МБ.');
    setPendingAttachments((current) => [...current, ...accepted.map((file) => ({ id: crypto.randomUUID(), file }))].slice(0, 4));
    if (pendingAttachments.length + accepted.length > 4) setAttachmentError('К одному сообщению можно прикрепить не больше четырёх файлов.');
  };

  const activeChannel = props.server.channels.find((channel) => channel.id === props.activeChannelId) ?? props.server.channels[0] ?? null;
  const canManageChannels = props.server.permissions.includes('MANAGE_CHANNELS');
  const canManageRoles = props.server.permissions.includes('MANAGE_ROLES');
  const canManageMessages = props.server.permissions.includes('MANAGE_MESSAGES');
  const canKickMembers = props.server.permissions.includes('KICK_MEMBERS');
  const assignableRoles = props.server.roles.filter((role) => !role.isDefault && role.name !== 'Владелец');

  const channels: ChannelNavigationItem[] = props.server.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    unread: channel.unreadCount > 0,
    unreadCount: channel.unreadCount,
  }));
  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    activeVoice: false,
  }));
  const members: MemberNavigationItem[] = props.server.members.map((member) => {
    const roleLabel = member.userId === props.server.ownerUserId
      ? 'Владелец сервера'
      : member.roles.filter((role) => !role.isDefault).map((role) => role.name).join(' · ') || 'Участник';
    const kickAction = canKickMembers && member.userId !== props.user.id && member.userId !== props.server.ownerUserId
      ? <IconButton icon="close" label={`Исключить ${member.displayName}`} onClick={() => props.onKickMember(member.userId)} size="sm" type="button" />
      : undefined;
    return {
      id: member.userId,
      name: member.displayName,
      roleLabel,
      founder: member.platformRole === 'owner',
      ...(member.userId === props.user.id ? { status: 'online' as const } : {}),
      ...(kickAction === undefined ? {} : { actions: kickAction }),
    };
  });

  const openChannelForm = (type: 'text' | 'voice'): void => {
    setChannelType(type);
    setChannelName('');
    setChannelFormOpen(true);
  };
  const selectMember = (userId: string): void => {
    setMemberId(userId);
    const member = props.server.members.find((candidate) => candidate.userId === userId);
    setMemberRoles(member?.roles.filter((role) => assignableRoles.some((candidate) => candidate.id === role.id)).map((role) => role.id) ?? []);
  };
  const submitChannel = (event: FormEvent): void => {
    event.preventDefault();
    props.onCreateChannel(channelName, channelType);
    setChannelName('');
    setChannelFormOpen(false);
  };
  const submitServerAction = (event: FormEvent): void => {
    event.preventDefault();
    if (serverAction === 'create') props.onCreateServer();
    if (serverAction === 'join') props.onJoinServer();
    setServerAction(null);
  };

  const workspaceLibrary = (
    <WorkspaceLibrary
      activeWorkspaceId={props.server.id}
      onCreate={() => setServerAction('create')}
      onHome={props.onBack}
      onJoin={() => setServerAction('join')}
      onSelect={props.onSwitchServer}
      workspaces={workspaces}
    />
  );
  const serverContext = (
    <ServerContext
      activeChannelId={activeChannel?.id}
      canManageChannels={canManageChannels}
      canManageRoles={canManageRoles}
      name={props.server.name}
      onChannel={props.onChannel}
      onCopyInvite={props.onCopyInvite}
      onCreateChannel={openChannelForm}
      onDeleteChannel={props.onDeleteChannel}
      onManageRoles={() => setRolesOpen(true)}
      profile={<UserProfileDock email={props.user.email} founder={props.user.platformRole === 'owner'} name={displayName(props.user)} onLogout={props.onLogout} onSecurity={props.onSecurity} />}
      textChannels={channels.filter((channel) => channel.type === 'text')}
      voiceChannels={channels.filter((channel) => channel.type === 'voice')}
    />
  );

  return (
    <>
      <AppShell
        members={<MemberPanel members={members} />}
        serverContext={serverContext}
        topBar={activeChannel === null
          ? <ServerTopBar channelName="Обзор" channelType="text" memberCount={props.server.memberCount} />
          : <ServerTopBar channelName={activeChannel.name} channelType={activeChannel.type} description={activeChannel.type === 'text' ? 'История сохраняется' : 'Голосовая сессия'} memberCount={props.server.memberCount} />}
        workspaceLibrary={workspaceLibrary}
      >
        <ServerStage {...props} activeChannel={activeChannel} attachmentError={attachmentError} canManageChannels={canManageChannels} canManageMessages={canManageMessages} editingMessage={editingMessage} pendingAttachments={pendingAttachments} replyingMessage={replyingMessage} onAddAttachments={addAttachments} onCancelContext={() => { setEditingMessage(null); setReplyingMessage(null); props.onMessageDraft(''); }} onEdit={(message) => { setReplyingMessage(null); setEditingMessage(message); setPendingAttachments([]); setAttachmentError(null); props.onMessageDraft(message.content); }} onOpenChannel={() => openChannelForm('text')} onRemoveAttachment={(id) => { setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id)); setAttachmentError(null); }} onReply={(message) => { setEditingMessage(null); setReplyingMessage(message); }} onSentAttachments={() => { setPendingAttachments([]); setAttachmentError(null); }} />
      </AppShell>

      <Modal onClose={() => setChannelFormOpen(false)} open={channelFormOpen} title="Новый канал">
        <form className="vui-server-form" onSubmit={submitChannel}>
          <SegmentedControl label="Тип канала" onChange={setChannelType} options={[{ value: 'text', label: 'Текстовый' }, { value: 'voice', label: 'Голосовой' }]} value={channelType} />
          <Input autoFocus label="Название" maxLength={50} minLength={1} onChange={(event) => setChannelName(event.target.value)} placeholder={channelType === 'text' ? 'новости' : 'Переговорная'} value={channelName} />
          <div className="vui-server-form__actions"><Button onClick={() => setChannelFormOpen(false)} type="button" variant="quiet">Отмена</Button><Button disabled={channelName.trim().length === 0} loading={props.busy} type="submit">Создать канал</Button></div>
        </form>
      </Modal>

      <Modal onClose={() => setServerAction(null)} open={serverAction !== null} title={serverAction === 'create' ? 'Новый сервер' : 'Войти на сервер'}>
        <form className="vui-server-form" onSubmit={submitServerAction}>
          {serverAction === 'create'
            ? <Input autoFocus label="Название сервера" maxLength={60} onChange={(event) => props.onServerName(event.target.value)} placeholder="Моя команда" value={props.serverName} />
            : <Input autoFocus label="Код приглашения" maxLength={12} onChange={(event) => props.onServerInvite(event.target.value.toUpperCase())} placeholder="ABCD2345" value={props.serverInvite} />}
          <div className="vui-server-form__actions"><Button onClick={() => setServerAction(null)} type="button" variant="quiet">Отмена</Button><Button disabled={(serverAction === 'create' ? props.serverName : props.serverInvite).trim().length === 0} loading={props.busy} type="submit">{serverAction === 'create' ? 'Создать' : 'Войти'}</Button></div>
        </form>
      </Modal>

      <Modal onClose={() => setRolesOpen(false)} open={rolesOpen} size="lg" title="Роли и права">
        <div className="vui-role-editor">
          <section>
            <h3>Роли сервера</h3>
            <div className="vui-role-list">
              {props.server.roles.map((role) => <div key={role.id}><i style={{ '--role-color': role.color } as CSSProperties} /><span><strong>{role.name}</strong><small>{role.permissions.length} прав</small></span>{role.isDefault ? <Badge>Базовая</Badge> : null}</div>)}
            </div>
            <form className="vui-server-form" onSubmit={(event) => { event.preventDefault(); props.onCreateRole(roleName, roleColor, rolePermissions); setRoleName(''); }}>
              <h3>Новая роль</h3>
              <div className="vui-role-name"><Input label="Название" maxLength={40} onChange={(event) => setRoleName(event.target.value)} value={roleName} /><label><span>Цвет</span><input aria-label="Цвет роли" onChange={(event) => setRoleColor(event.target.value)} type="color" value={roleColor} /></label></div>
              <div className="vui-permission-grid">{serverPermissions.map((permission) => <Checkbox checked={rolePermissions.includes(permission)} key={permission} label={permissionLabels[permission]} onChange={(event) => setRolePermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />)}</div>
              <Button disabled={roleName.trim().length === 0} loading={props.busy} type="submit" variant="secondary">Создать роль</Button>
            </form>
          </section>
          <section>
            <h3>Назначить участнику</h3>
            <Select label="Участник" onChange={(event) => selectMember(event.target.value)} options={[{ value: '', label: 'Выберите участника' }, ...props.server.members.filter((member) => member.userId !== props.server.ownerUserId).map((member) => ({ value: member.userId, label: member.displayName }))]} value={memberId} />
            {memberId === '' ? null : <div className="vui-role-assignment">{assignableRoles.length === 0 ? <p>Сначала создайте назначаемую роль.</p> : assignableRoles.map((role) => <Checkbox checked={memberRoles.includes(role.id)} key={role.id} label={role.name} onChange={(event) => setMemberRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} />)}<Button loading={props.busy} onClick={() => props.onAssignRoles(memberId, memberRoles)} type="button">Сохранить роли</Button></div>}
          </section>
        </div>
        {props.error === null ? null : <div className="vui-server-error" role="alert">{props.error}</div>}
      </Modal>
    </>
  );
}

interface ServerStageProps extends ServerViewProps {
  activeChannel: ServerDetail['channels'][number] | null;
  attachmentError: string | null;
  canManageChannels: boolean;
  canManageMessages: boolean;
  editingMessage: MessageViewModel | null;
  pendingAttachments: Array<{ id: string; file: File }>;
  replyingMessage: MessageViewModel | null;
  onAddAttachments(files: File[]): void;
  onCancelContext(): void;
  onEdit(message: MessageViewModel): void;
  onOpenChannel(): void;
  onRemoveAttachment(id: string): void;
  onReply(message: MessageViewModel): void;
  onSentAttachments(): void;
}

function ServerStage({ activeChannel, attachmentError, canManageChannels, canManageMessages, editingMessage, onAddAttachments, onCancelContext, onEdit, onOpenChannel, onRemoveAttachment, onReply, onSentAttachments, pendingAttachments, replyingMessage, ...props }: ServerStageProps): ReactNode {
  if (activeChannel === null) {
    return <div className="vui-voice-lobby"><Icon name="message" size={40} /><h1>На сервере пока нет каналов</h1>{canManageChannels ? <Button onClick={onOpenChannel}>Создать канал</Button> : null}</div>;
  }
  if (activeChannel.type === 'voice') {
    return <div className="vui-voice-lobby"><span className="vui-voice-lobby__orb"><Icon name="voice" size={34} /></span><Badge tone="primary">Голосовой канал</Badge><h1>{activeChannel.name}</h1><p>Подключитесь к разговору. Внутри доступны выбранные аудиоустройства, демонстрация экрана и системный звук.</p><Button disabled={!props.server.permissions.includes('CONNECT_VOICE')} icon="headphones" loading={props.busy} onClick={() => props.onConnectVoice(activeChannel.id)}>Подключиться</Button></div>;
  }
  const messageModels: MessageViewModel[] = props.messages.map((message) => ({
    id: message.id,
    authorId: message.authorUserId,
    authorName: message.authorDisplayName,
    content: message.content,
    createdAt: message.createdAt,
    edited: message.editedAt !== null,
    own: message.authorUserId === props.user.id,
    canEdit: message.authorUserId === props.user.id,
    canDelete: message.authorUserId === props.user.id || canManageMessages,
    attachments: message.attachments.map((attachment) => ({ ...attachment, canDelete: message.authorUserId === props.user.id || canManageMessages })),
    ...(message.replyTo === null ? {} : { replyPreview: { authorName: message.replyTo.authorDisplayName, content: message.replyTo.content } }),
    reactions: message.reactions,
    ...(message.authorPlatformRole === 'owner' ? { authorBadge: 'founder' as const } : message.authorPlatformRole === 'admin' ? { authorBadge: 'admin' as const } : {}),
  }));
  const submitMessage = (): void => {
    if (editingMessage === null) {
      props.onSendMessage(replyingMessage?.id, pendingAttachments.map((attachment) => attachment.file));
      onSentAttachments();
      onCancelContext();
    }
    else {
      props.onUpdateMessage(editingMessage.id, props.messageDraft);
      onCancelContext();
    }
  };
  return (
    <section className="vui-message-stage">
      <MessageList channelName={activeChannel.name} messages={messageModels} onDelete={props.onDeleteMessage} onDeleteAttachment={props.onDeleteAttachment} onDownloadAttachment={props.onDownloadAttachment} onEdit={onEdit} onReaction={props.onMessageReaction} onReply={onReply} />
      <MessageComposer attachments={pendingAttachments.map(({ id, file }) => ({ id, name: file.name, size: file.size, mimeType: file.type }))} busy={props.busy} canSend={props.server.permissions.includes('SEND_MESSAGES')} channelName={activeChannel.name} {...(editingMessage !== null ? { context: { mode: 'edit' as const, label: editingMessage.content }, onCancelContext } : replyingMessage !== null ? { context: { mode: 'reply' as const, label: `${replyingMessage.authorName}: ${replyingMessage.content}` }, onCancelContext } : {})} {...(editingMessage === null ? { onFilesSelected: onAddAttachments } : {})} onChange={props.onMessageDraft} onRemoveAttachment={onRemoveAttachment} onSubmit={submitMessage} value={props.messageDraft} />
      {attachmentError === null ? null : <div className="vui-server-error vui-server-error--attachment" role="alert">{attachmentError}</div>}
      {props.error === null ? null : <div className="vui-server-error vui-server-error--floating" role="alert">{props.error}</div>}
    </section>
  );
}
