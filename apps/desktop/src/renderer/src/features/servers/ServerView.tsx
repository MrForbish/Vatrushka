import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import {
  materializeConversationMentionLabels,
  type ConversationMentionDraft,
  type PresencePreference,
  type UserPresence,
  type PublicUser,
  type ServerDetail,
  type ServerSummary,
  type TextMessage,
} from "@vatrushka/shared";

import { apiClient } from "../../api";

import {
  AppShell,
  Badge,
  Button,
  Icon,
  IconButton,
  Input,
  MessageComposer,
  MessageList,
  MemberPanel,
  Modal,
  SegmentedControl,
  ServerContext,
  ServerTopBar,
  UserProfileDock,
  WorkspaceLibrary,
  type ChannelNavigationItem,
  type MemberNavigationItem,
  type MessageViewModel,
  type WorkspaceNavigationItem,
} from "../../ui";
import { NotificationSettingsDialog } from "../notifications/NotificationSettingsDialog";
import "./server-view.css";

export interface ServerViewProps {
  user: PublicUser;
  server: ServerDetail;
  servers: ServerSummary[];
  activeChannelId: string | null;
  messages: TextMessage[];
  messageDraft: string;
  serverName: string;
  busy: boolean;
  error: string | null;
  directUnreadCount?: number;
  connectedVoiceChannelId?: string | undefined;
  connectedVoiceServerId?: string | undefined;
  voiceStage?: ReactNode | undefined;
  voiceConnectionPanel?: ReactNode | undefined;
  typingText?: string | undefined;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  firstUnreadMessageId?: string | null;
  targetMessageId?: string | null;
  onBack(): void;
  onDirectMessages?(): void;
  onSwitchServer(serverId: string): void;
  onChannel(channelId: string): void;
  onMessageDraft(value: string): void;
  onSendMessage(
    replyToMessageId?: string,
    files?: File[],
    mentions?: ConversationMentionDraft[],
  ): void;
  onUpdateMessage(
    messageId: string,
    content: string,
    mentions?: ConversationMentionDraft[],
  ): void;
  onMessageReaction(messageId: string, emoji: string): void;
  onDeleteMessage(messageId: string): void;
  onDeleteAttachment(attachmentId: string): void;
  onDownloadAttachment(attachmentId: string, fileName: string): void;
  onLoadAttachment?(attachmentId: string): Promise<Blob>;
  onLoadOlderMessages?(): void;
  onRetryMessage?(messageId: string): void;
  onConnectVoice(channelId: string): void;
  onMoveVoiceMember?(channelId: string, userId: string): void;
  pendingVoiceMemberIds?: string[];
  onCopyInvite(): void | Promise<void>;
  onCreateChannel(name: string, type: "text" | "voice"): void;
  onRenameChannel(channelId: string, name: string): void;
  onDeleteChannel(channelId: string): void;
  onKickMember(userId: string): void;
  onServerName(value: string): void;
  onCreateServer(): void;
  onSecurity(): void;
  onServerSettings(): void;
  onLogout(): void;
  onPresenceChange?(presence: UserPresence): void;
}

const allowedAttachmentTypes = new Set([
  "application/pdf",
  "application/zip",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
const maxAttachmentBytes = 8 * 1024 * 1024;

function displayName(user: PublicUser): string {
  return user.displayName ?? user.email.split("@")[0] ?? "Пользователь";
}

export function ServerView(props: ServerViewProps): React.JSX.Element {
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"text" | "voice">("text");
  const [renamingChannel, setRenamingChannel] =
    useState<ChannelNavigationItem | null>(null);
  const [renamedChannelName, setRenamedChannelName] = useState("");
  const [moveMemberId, setMoveMemberId] = useState<string | null>(null);
  const [serverCreateOpen, setServerCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopyState, setInviteCopyState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const [editingMessage, setEditingMessage] = useState<MessageViewModel | null>(
    null,
  );
  const [replyingMessage, setReplyingMessage] =
    useState<MessageViewModel | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; file: File }>
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [draftMentions, setDraftMentions] = useState<
    ConversationMentionDraft[]
  >([]);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    useState(false);
  const ownMember = props.server.members.find(
    (member) => member.userId === props.user.id,
  );
  const [profileStatus, setProfileStatus] = useState(
    ownMember?.presence ?? "offline",
  );

  useEffect(() => {
    setProfileStatus(ownMember?.presence ?? "offline");
  }, [ownMember?.presence]);
  const updateProfileStatus = async (
    preference: PresencePreference,
  ): Promise<void> => {
    const current = await apiClient.getPresence();
    const next = await apiClient.updatePresence({
      preference,
      customText: current.customText,
      customTextExpiresAt: current.customTextExpiresAt,
    });
    setProfileStatus(next.effectiveStatus);
    props.onPresenceChange?.(next);
  };

  useEffect(() => {
    setEditingMessage(null);
    setReplyingMessage(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    setDraftMentions([]);
  }, [props.activeChannelId, props.server.id]);

  const addAttachments = (files: File[]): void => {
    const accepted = files.filter(
      (file) =>
        allowedAttachmentTypes.has(file.type) &&
        file.size > 0 &&
        file.size <= maxAttachmentBytes,
    );
    setAttachmentError(
      accepted.length === files.length
        ? null
        : "Поддерживаются изображения, PDF, TXT и ZIP размером до 8 МБ.",
    );
    setPendingAttachments((current) =>
      [
        ...current,
        ...accepted.map((file) => ({ id: crypto.randomUUID(), file })),
      ].slice(0, 4),
    );
    if (pendingAttachments.length + accepted.length > 4)
      setAttachmentError(
        "К одному сообщению можно прикрепить не больше четырёх файлов.",
      );
  };

  const activeChannel =
    props.server.channels.find(
      (channel) => channel.id === props.activeChannelId,
    ) ??
    props.server.channels[0] ??
    null;
  const canManageChannels =
    props.server.permissions.includes("MANAGE_CHANNELS");
  const canManageRoles = props.server.permissions.includes("MANAGE_ROLES");
  const activeChannelPermissions =
    activeChannel?.permissions ?? props.server.permissions;
  const canManageMessages =
    activeChannelPermissions.includes("MANAGE_MESSAGES");
  const canKickMembers = props.server.permissions.includes("KICK_MEMBERS");
  const canMoveMembers = props.server.permissions.includes("MOVE_MEMBERS");
  const pendingVoiceMemberIds = new Set(props.pendingVoiceMemberIds ?? []);

  const channels: ChannelNavigationItem[] = props.server.channels.map(
    (channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      unread: channel.unreadCount > 0,
      unreadCount: channel.unreadCount,
      ...(channel.mentionCount === undefined
        ? {}
        : { mentionCount: channel.mentionCount }),
      participantCount: channel.voiceParticipants?.length ?? 0,
      participants: channel.voiceParticipants?.map((participant) => ({
        identity: participant.identity,
        userId: participant.userId,
        name: participant.displayName,
        founder: participant.platformRole === "owner",
        avatarUrl: participant.avatarUrl ?? null,
        canDrag:
          props.onMoveVoiceMember !== undefined &&
          !pendingVoiceMemberIds.has(participant.userId) &&
          (participant.userId === props.user.id ||
            (canMoveMembers &&
              participant.userId !== props.server.ownerUserId)),
        pending: pendingVoiceMemberIds.has(participant.userId),
        muted: participant.muted ?? false,
        deafened: participant.deafened ?? false,
        speaking: participant.speaking ?? false,
        screenSharing: participant.screenSharing ?? false,
      })),
    }),
  );
  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    iconUrl: server.iconUrl ?? null,
    accentColor: server.accentColor ?? null,
    activeVoice: server.id === props.connectedVoiceServerId,
  }));
  const connectedMemberIds = new Set(
    props.server.channels.flatMap(
      (channel) =>
        channel.voiceParticipants?.map((participant) => participant.userId) ??
        [],
    ),
  );
  const members: MemberNavigationItem[] = props.server.members.map((member) => {
    const roleLabel =
      member.userId === props.server.ownerUserId
        ? "Владелец сервера"
        : member.roles
            .filter((role) => !role.isDefault)
            .map((role) => role.name)
            .join(" · ") || "Участник";
    const kickAction =
      canKickMembers &&
      member.userId !== props.user.id &&
      member.userId !== props.server.ownerUserId ? (
        <button
          aria-label={`Исключить ${member.displayName}`}
          onClick={() => {
            if (window.confirm(`Исключить ${member.displayName} с сервера?`))
              props.onKickMember(member.userId);
          }}
          type="button"
        >
          <Icon name="close" size={16} />
          Исключить с сервера
        </button>
      ) : undefined;
    const canMoveMember =
      connectedMemberIds.has(member.userId) &&
      props.onMoveVoiceMember !== undefined &&
      !pendingVoiceMemberIds.has(member.userId) &&
      (member.userId === props.user.id ||
        (canMoveMembers && member.userId !== props.server.ownerUserId));
    const moveAction = canMoveMember ? (
      <button
        aria-label={`Переместить ${member.displayName} в другой голосовой канал`}
        onClick={() => setMoveMemberId(member.userId)}
        type="button"
      >
        <Icon name="voice" size={16} />
        Переместить в…
      </button>
    ) : undefined;
    return {
      id: member.userId,
      name: member.displayName,
      roleLabel,
      founder: member.platformRole === "owner",
      avatarUrl: member.avatarUrl ?? null,
      ...(member.presence !== undefined
        ? { status: member.presence }
        : connectedMemberIds.has(member.userId)
          ? { status: "online" as const }
          : {}),
      ...(kickAction === undefined && moveAction === undefined
        ? {}
        : {
            actions: (
              <>
                {moveAction}
                {kickAction}
              </>
            ),
          }),
    };
  });

  const openChannelForm = (type: "text" | "voice"): void => {
    setChannelType(type);
    setChannelName("");
    setChannelFormOpen(true);
  };
  const submitChannel = (event: FormEvent): void => {
    event.preventDefault();
    props.onCreateChannel(channelName, channelType);
    setChannelName("");
    setChannelFormOpen(false);
  };
  const submitChannelRename = (event: FormEvent): void => {
    event.preventDefault();
    if (
      renamingChannel === null ||
      renamedChannelName.trim() === renamingChannel.name
    )
      return;
    props.onRenameChannel(renamingChannel.id, renamedChannelName.trim());
    setRenamingChannel(null);
    setRenamedChannelName("");
  };
  const submitServerCreate = (event: FormEvent): void => {
    event.preventDefault();
    props.onCreateServer();
    setServerCreateOpen(false);
  };
  const closeInvite = (): void => {
    setInviteOpen(false);
    setInviteCopyState("idle");
  };
  const copyInvite = async (): Promise<void> => {
    setInviteCopyState("copying");
    try {
      await props.onCopyInvite();
      setInviteCopyState("copied");
    } catch {
      setInviteCopyState("error");
    }
  };

  const workspaceLibrary = (
    <WorkspaceLibrary
      activeWorkspaceId={props.server.id}
      directUnreadCount={props.directUnreadCount ?? 0}
      onCreate={() => setServerCreateOpen(true)}
      {...(props.onDirectMessages === undefined
        ? {}
        : { onDirectMessages: props.onDirectMessages })}
      onHome={props.onBack}
      onSelect={props.onSwitchServer}
      workspaces={workspaces}
    />
  );
  const serverContext = (
    <ServerContext
      activeChannelId={activeChannel?.id}
      canManageChannels={canManageChannels}
      canManageRoles={canManageRoles}
      connectionPanel={props.voiceConnectionPanel}
      description={props.server.description}
      iconUrl={props.server.iconUrl ?? null}
      bannerUrl={props.server.bannerUrl ?? null}
      accentColor={props.server.accentColor ?? null}
      name={props.server.name}
      privacyLabel={
        props.server.visibility === "public"
          ? "Публичный сервер"
          : "Приватный сервер"
      }
      onChannel={props.onChannel}
      onConnectVoice={(channelId) => {
        if (channelId === props.connectedVoiceChannelId)
          props.onChannel(channelId);
        else props.onConnectVoice(channelId);
      }}
      onCopyInvite={() => {
        setInviteCopyState("idle");
        setInviteOpen(true);
      }}
      onCreateChannel={openChannelForm}
      onDeleteChannel={(channelId) => {
        const channel = props.server.channels.find(
          (candidate) => candidate.id === channelId,
        );
        if (channel && window.confirm(`Удалить канал «${channel.name}»?`))
          props.onDeleteChannel(channelId);
      }}
      onManageRoles={props.onServerSettings}
      onRenameChannel={(channel) => {
        setRenamingChannel(channel);
        setRenamedChannelName(channel.name);
      }}
      {...(canMoveMembers && props.onMoveVoiceMember !== undefined
        ? { onMoveMember: props.onMoveVoiceMember }
        : {})}
      profile={
        <UserProfileDock
          avatarUrl={ownMember?.avatarUrl ?? props.user.avatarUrl ?? null}
          email={props.user.email}
          founder={props.user.platformRole === "owner"}
          name={ownMember?.displayName ?? displayName(props.user)}
          onLogout={props.onLogout}
          onSecurity={props.onSecurity}
          onStatus={updateProfileStatus}
          status={profileStatus}
        />
      }
      textChannels={channels.filter((channel) => channel.type === "text")}
      voiceChannels={channels.filter((channel) => channel.type === "voice")}
    />
  );

  return (
    <>
      <AppShell
        members={<MemberPanel members={members} />}
        serverContext={serverContext}
        topBar={
          activeChannel === null ? (
            <ServerTopBar
              channelName="Обзор"
              channelType="text"
              memberCount={props.server.memberCount}
            />
          ) : (
            <ServerTopBar
              actions={
                activeChannel.type === "text" ? (
                  <IconButton
                    icon="bell"
                    label="Настроить уведомления канала"
                    onClick={() => setNotificationSettingsOpen(true)}
                    size="sm"
                    type="button"
                  />
                ) : undefined
              }
              channelName={activeChannel.name}
              channelType={activeChannel.type}
              description={
                activeChannel.type === "text"
                  ? "История сохраняется"
                  : activeChannel.id === props.connectedVoiceChannelId
                    ? "Вы подключены · навигация остаётся доступной"
                    : "Голосовая сессия"
              }
              memberCount={props.server.memberCount}
            />
          )
        }
        workspaceLibrary={workspaceLibrary}
      >
        <ServerStage
          {...props}
          activeChannel={activeChannel}
          attachmentError={attachmentError}
          canManageChannels={canManageChannels}
          canManageMessages={canManageMessages}
          draftMentions={draftMentions}
          editingMessage={editingMessage}
          pendingAttachments={pendingAttachments}
          replyingMessage={replyingMessage}
          onAddAttachments={addAttachments}
          onCancelContext={() => {
            setEditingMessage(null);
            setReplyingMessage(null);
            setDraftMentions([]);
            props.onMessageDraft("");
          }}
          onEdit={(message) => {
            const draft = materializeConversationMentionLabels(
              message.content,
              (message.mentions ?? []).map((mention) => ({
                type: mention.key.startsWith("role:")
                  ? ("role" as const)
                  : mention.key === "everyone"
                    ? ("everyone" as const)
                    : ("user" as const),
                ...(mention.userId ? { userId: mention.userId } : {}),
                ...(mention.key.startsWith("role:")
                  ? { roleId: mention.key.slice(5) }
                  : {}),
                displayName: mention.displayName,
                start: mention.start,
                length: mention.length,
              })),
            );
            setReplyingMessage(null);
            setEditingMessage(message);
            setPendingAttachments([]);
            setAttachmentError(null);
            setDraftMentions(draft.mentions);
            props.onMessageDraft(draft.content);
          }}
          onMentionsChange={setDraftMentions}
          onOpenChannel={() => openChannelForm("text")}
          onRemoveAttachment={(id) => {
            setPendingAttachments((current) =>
              current.filter((attachment) => attachment.id !== id),
            );
            setAttachmentError(null);
          }}
          onReply={(message) => {
            setEditingMessage(null);
            setReplyingMessage(message);
          }}
          onSentAttachments={() => {
            setPendingAttachments([]);
            setAttachmentError(null);
          }}
        />
      </AppShell>

      <Modal
        onClose={() => setChannelFormOpen(false)}
        open={channelFormOpen}
        title="Новый канал"
      >
        <form className="vui-server-form" onSubmit={submitChannel}>
          <SegmentedControl
            label="Тип канала"
            onChange={setChannelType}
            options={[
              { value: "text", label: "Текстовый" },
              { value: "voice", label: "Голосовой" },
            ]}
            value={channelType}
          />
          <Input
            autoFocus
            label="Название"
            maxLength={50}
            minLength={1}
            onChange={(event) => setChannelName(event.target.value)}
            placeholder={channelType === "text" ? "новости" : "Переговорная"}
            value={channelName}
          />
          <div className="vui-server-form__actions">
            <Button
              onClick={() => setChannelFormOpen(false)}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button
              disabled={channelName.trim().length === 0}
              loading={props.busy}
              type="submit"
            >
              Создать канал
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Новое название сразу увидят все участники сервера."
        onClose={() => {
          setRenamingChannel(null);
          setRenamedChannelName("");
        }}
        open={renamingChannel !== null}
        size="sm"
        title="Переименовать канал"
      >
        <form className="vui-server-form" onSubmit={submitChannelRename}>
          <Input
            autoFocus
            label="Название канала"
            maxLength={50}
            minLength={1}
            onChange={(event) => setRenamedChannelName(event.target.value)}
            value={renamedChannelName}
          />
          <div className="vui-server-form__actions">
            <Button
              onClick={() => {
                setRenamingChannel(null);
                setRenamedChannelName("");
              }}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button
              disabled={
                renamedChannelName.trim().length === 0 ||
                renamedChannelName.trim() === renamingChannel?.name
              }
              loading={props.busy}
              type="submit"
            >
              Сохранить
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Выберите голосовой канал. Список обновится после подтверждения медиасервера."
        onClose={() => setMoveMemberId(null)}
        open={moveMemberId !== null}
        size="sm"
        title="Переместить в…"
      >
        <div className="server-view__move-list">
          {props.server.channels
            .filter(
              (channel) =>
                channel.type === "voice" &&
                !channel.voiceParticipants?.some(
                  (participant) => participant.userId === moveMemberId,
                ),
            )
            .map((channel) => (
              <Button
                key={channel.id}
                onClick={() => {
                  if (moveMemberId)
                    props.onMoveVoiceMember?.(channel.id, moveMemberId);
                  setMoveMemberId(null);
                }}
                type="button"
                variant="secondary"
              >
                <Icon name="voice" size={16} />
                {channel.name}
              </Button>
            ))}
        </div>
      </Modal>

      <Modal
        onClose={() => setServerCreateOpen(false)}
        open={serverCreateOpen}
        title="Новый сервер"
      >
        <form className="vui-server-form" onSubmit={submitServerCreate}>
          <Input
            autoFocus
            label="Название сервера"
            maxLength={60}
            onChange={(event) => props.onServerName(event.target.value)}
            placeholder="Моя команда"
            value={props.serverName}
          />
          <div className="vui-server-form__actions">
            <Button
              onClick={() => setServerCreateOpen(false)}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button
              disabled={props.serverName.trim().length === 0}
              loading={props.busy}
              type="submit"
            >
              Создать
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Отправьте ссылку человеку, которого хотите добавить на сервер."
        footer={
          <>
            <Button onClick={closeInvite} type="button" variant="quiet">
              Закрыть
            </Button>
            <Button
              icon="copy"
              loading={inviteCopyState === "copying"}
              onClick={() => void copyInvite()}
              type="button"
            >
              {inviteCopyState === "copied"
                ? "Скопировано"
                : "Скопировать ссылку"}
            </Button>
          </>
        }
        onClose={closeInvite}
        open={inviteOpen}
        size="sm"
        title="Пригласить на сервер"
      >
        <div className="vui-server-invite">
          <span>Короткая ссылка</span>
          <code>{props.server.inviteUrl}</code>
          <p>
            После перехода откроется «Ватрушка» и сервер будет добавлен
            автоматически.
          </p>
          {inviteCopyState === "copied" ? (
            <strong role="status">
              <Icon name="check" size={16} />
              Ссылка скопирована
            </strong>
          ) : inviteCopyState === "error" ? (
            <strong className="vui-server-invite__error" role="alert">
              <Icon name="warning" size={16} />
              Не удалось скопировать ссылку
            </strong>
          ) : null}
        </div>
      </Modal>

      {activeChannel?.type === "text" ? (
        <NotificationSettingsDialog
          conversationId={activeChannel.id}
          onClose={() => setNotificationSettingsOpen(false)}
          open={notificationSettingsOpen}
          serverId={props.server.id}
          title={`#${activeChannel.name}`}
        />
      ) : null}
    </>
  );
}

interface ServerStageProps extends ServerViewProps {
  activeChannel: ServerDetail["channels"][number] | null;
  attachmentError: string | null;
  canManageChannels: boolean;
  canManageMessages: boolean;
  draftMentions: ConversationMentionDraft[];
  editingMessage: MessageViewModel | null;
  pendingAttachments: Array<{ id: string; file: File }>;
  replyingMessage: MessageViewModel | null;
  onAddAttachments(files: File[]): void;
  onCancelContext(): void;
  onEdit(message: MessageViewModel): void;
  onOpenChannel(): void;
  onMentionsChange(mentions: ConversationMentionDraft[]): void;
  onRemoveAttachment(id: string): void;
  onReply(message: MessageViewModel): void;
  onSentAttachments(): void;
}

function ServerStage({
  activeChannel,
  attachmentError,
  canManageChannels,
  canManageMessages,
  draftMentions,
  editingMessage,
  onAddAttachments,
  onCancelContext,
  onEdit,
  onMentionsChange,
  onOpenChannel,
  onRemoveAttachment,
  onReply,
  onSentAttachments,
  pendingAttachments,
  replyingMessage,
  ...props
}: ServerStageProps): ReactNode {
  const [selectedMention, setSelectedMention] = useState<
    NonNullable<MessageViewModel["mentions"]>[number] | null
  >(null);
  if (activeChannel === null) {
    return (
      <div className="vui-voice-lobby">
        <Icon name="message" size={40} />
        <h1>На сервере пока нет каналов</h1>
        {canManageChannels ? (
          <Button onClick={onOpenChannel}>Создать канал</Button>
        ) : null}
      </div>
    );
  }
  if (activeChannel.type === "voice") {
    if (
      activeChannel.id === props.connectedVoiceChannelId &&
      props.voiceStage !== undefined
    )
      return props.voiceStage;
    return (
      <div className="vui-voice-lobby">
        <span className="vui-voice-lobby__orb">
          <Icon name="voice" size={34} />
        </span>
        <Badge tone="primary">Голосовой канал</Badge>
        <h1>{activeChannel.name}</h1>
        <p>
          Подключитесь к разговору. Внутри доступны выбранные аудиоустройства,
          демонстрация экрана и системный звук.
        </p>
        <Button
          disabled={
            !(activeChannel.permissions ?? props.server.permissions).includes(
              "CONNECT_VOICE",
            )
          }
          icon="headphones"
          loading={props.busy}
          onClick={() => props.onConnectVoice(activeChannel.id)}
        >
          Подключиться
        </Button>
      </div>
    );
  }
  const channelPermissions =
    activeChannel.permissions ?? props.server.permissions;
  const canManageOwnMessages = channelPermissions.includes(
    "MANAGE_OWN_MESSAGES",
  );
  const messageModels: MessageViewModel[] = props.messages.map((message) => ({
    id: message.id,
    authorId: message.authorUserId,
    authorName: message.authorDisplayName,
    ...(message.authorAvatarUrl === undefined
      ? {}
      : { authorAvatarUrl: message.authorAvatarUrl }),
    content: message.content,
    mentions: (
      message.conversationMentions ??
      message.mentions?.map((mention) => ({
        type: "user" as const,
        ...mention,
      })) ??
      []
    ).map((mention) => ({
      key:
        mention.type === "user"
          ? `user:${mention.userId ?? ""}`
          : mention.type === "role"
            ? `role:${mention.roleId ?? ""}`
            : "everyone",
      ...(mention.userId ? { userId: mention.userId } : {}),
      ...("roleId" in mention && mention.roleId
        ? { roleId: mention.roleId }
        : {}),
      displayName: mention.displayName,
      start: mention.start,
      length: mention.length,
    })),
    createdAt: message.createdAt,
    edited: message.editedAt !== null,
    deleted: message.deletedAt !== null && message.deletedAt !== undefined,
    own: message.authorUserId === props.user.id,
    canEdit:
      !message.deletedAt &&
      ((message.authorUserId === props.user.id && canManageOwnMessages) ||
        canManageMessages),
    canDelete:
      !message.deletedAt &&
      ((message.authorUserId === props.user.id && canManageOwnMessages) ||
        canManageMessages),
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      canDelete:
        (message.authorUserId === props.user.id && canManageOwnMessages) ||
        canManageMessages,
    })),
    ...(message.replyTo === null
      ? {}
      : {
          replyPreview: {
            authorName: message.replyTo.authorDisplayName,
            content: message.replyTo.content,
          },
        }),
    reactions: message.reactions,
    ...(message.deliveryState === undefined
      ? {}
      : { deliveryState: message.deliveryState }),
    ...(message.authorPlatformRole === "owner"
      ? { authorBadge: "founder" as const }
      : message.authorPlatformRole === "admin"
        ? { authorBadge: "admin" as const }
        : {}),
  }));
  const submitMessage = (): void => {
    if (editingMessage === null) {
      props.onSendMessage(
        replyingMessage?.id,
        pendingAttachments.map((attachment) => attachment.file),
        draftMentions,
      );
      onSentAttachments();
      onCancelContext();
    } else {
      props.onUpdateMessage(
        editingMessage.id,
        props.messageDraft,
        draftMentions,
      );
      onCancelContext();
    }
  };
  return (
    <section className="vui-message-stage">
      <MessageList
        channelName={activeChannel.name}
        firstUnreadMessageId={props.firstUnreadMessageId}
        hasOlder={props.hasOlderMessages}
        loadingOlder={props.loadingOlderMessages}
        messages={messageModels}
        onDelete={props.onDeleteMessage}
        onDeleteAttachment={props.onDeleteAttachment}
        onDownloadAttachment={props.onDownloadAttachment}
        onLoadAttachment={props.onLoadAttachment}
        onLoadOlder={props.onLoadOlderMessages}
        onMention={setSelectedMention}
        onRetry={props.onRetryMessage}
        onEdit={onEdit}
        targetMessageId={props.targetMessageId}
        {...(channelPermissions.includes("ADD_REACTIONS")
          ? { onReaction: props.onMessageReaction }
          : {})}
        {...(channelPermissions.includes("SEND_MESSAGES") ? { onReply } : {})}
      />
      {props.typingText ? (
        <div aria-live="polite" className="vui-message-typing">
          <span />
          <strong>{props.typingText}</strong> печатает…
        </div>
      ) : null}
      <MessageComposer
        attachments={pendingAttachments.map(({ id, file }) => ({
          id,
          name: file.name,
          size: file.size,
          mimeType: file.type,
        }))}
        busy={props.busy}
        canSend={
          editingMessage === null
            ? channelPermissions.includes("SEND_MESSAGES")
            : editingMessage.canEdit === true
        }
        channelName={activeChannel.name}
        mentionCandidates={[
          ...props.server.members.map((member) => ({
            type: "user" as const,
            userId: member.userId,
            displayName: member.displayName,
            detail:
              member.roles
                .filter((role) => !role.isDefault)
                .map((role) => role.name)
                .join(" · ") || "@участник",
          })),
          ...(channelPermissions.includes("MENTION_EVERYONE")
            ? [
                ...props.server.roles
                  .filter((role) => role.kind === "CUSTOM")
                  .map((role) => ({
                    type: "role" as const,
                    roleId: role.id,
                    displayName: role.name.replace(/^@/u, ""),
                    detail: "@роль",
                  })),
                {
                  type: "everyone" as const,
                  displayName: "everyone",
                  detail: "Все участники канала",
                },
              ]
            : []),
        ]}
        mentions={draftMentions}
        {...(editingMessage !== null
          ? {
              context: { mode: "edit" as const, label: editingMessage.content },
              onCancelContext,
            }
          : replyingMessage !== null
            ? {
                context: {
                  mode: "reply" as const,
                  label: `${replyingMessage.authorName}: ${replyingMessage.content}`,
                },
                onCancelContext,
              }
            : {})}
        {...(editingMessage === null &&
        channelPermissions.includes("SEND_ATTACHMENTS")
          ? { onFilesSelected: onAddAttachments }
          : {})}
        onChange={props.onMessageDraft}
        onMentionsChange={onMentionsChange}
        onRemoveAttachment={onRemoveAttachment}
        onSubmit={submitMessage}
        value={props.messageDraft}
      />
      {attachmentError === null ? null : (
        <div
          className="vui-server-error vui-server-error--attachment"
          role="alert"
        >
          {attachmentError}
        </div>
      )}
      {props.error === null ? null : (
        <div
          className="vui-server-error vui-server-error--floating"
          role="alert"
        >
          {props.error}
        </div>
      )}
      <Modal
        onClose={() => setSelectedMention(null)}
        open={selectedMention !== null}
        size="sm"
        title={
          selectedMention?.userId
            ? "Профиль участника"
            : selectedMention?.roleId
              ? "Роль сервера"
              : "Упоминание канала"
        }
      >
        <div className="vui-server-mention-profile">
          <strong>@{selectedMention?.displayName}</strong>
          {selectedMention?.userId ? (
            <p>
              {props.server.members
                .find((member) => member.userId === selectedMention.userId)
                ?.roles.map((role) => role.name)
                .join(" · ") || "Участник сервера"}
            </p>
          ) : selectedMention?.roleId ? (
            <p>
              {props.server.roles.find(
                (role) => role.id === selectedMention.roleId,
              )?.name ?? "Роль больше недоступна"}
            </p>
          ) : (
            <p>
              Сообщение адресовано всем участникам, которые видят этот канал.
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
