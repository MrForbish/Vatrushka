import { useEffect, useState, type FormEvent } from "react";

import type {
  DirectConversationSummary,
  DirectMessage,
  DirectMessageCandidate,
  PublicUser,
  ServerSummary,
} from "@vatrushka/shared";

import {
  AppShell,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Icon,
  Input,
  MemberPanel,
  MessageComposer,
  MessageList,
  Modal,
  Select,
  UserProfileDock,
  WorkspaceLibrary,
  type MessageViewModel,
  type WorkspaceNavigationItem,
} from "../../ui";
import "./direct-messages.css";
import { NotificationSettingsDialog } from "../notifications/NotificationSettingsDialog";

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

export interface DirectMessagesViewProps {
  user: PublicUser;
  servers: ServerSummary[];
  conversations: DirectConversationSummary[];
  candidates: DirectMessageCandidate[];
  activeConversationId: string | null;
  messages: DirectMessage[];
  messageDraft: string;
  serverName: string;
  busy: boolean;
  error: string | null;
  typingText?: string | undefined;
  blockedParticipantIds?: string[] | undefined;
  hasOlderMessages?: boolean | undefined;
  loadingOlderMessages?: boolean | undefined;
  firstUnreadMessageId?: string | null | undefined;
  onHome(): void;
  onSwitchServer(serverId: string): void;
  onConversation(conversationId: string): void;
  onCreateConversation(participantUserId: string): void;
  onBlockParticipant(userId: string): void;
  onUnblockParticipant(userId: string): void;
  onMessageDraft(value: string): void;
  onSendMessage(replyToMessageId?: string, files?: File[]): void;
  onUpdateMessage(messageId: string, content: string): void;
  onMessageReaction(messageId: string, emoji: string): void;
  onDeleteMessage(messageId: string): void;
  onDeleteAttachment(attachmentId: string): void;
  onDownloadAttachment(attachmentId: string, fileName: string): void;
  onLoadAttachment?(attachmentId: string): Promise<Blob>;
  onLoadOlderMessages?(): void;
  onRetryMessage?(messageId: string): void;
  onServerName(value: string): void;
  onCreateServer(): void;
  onSecurity(): void;
  onLogout(): void;
}

function userDisplayName(user: PublicUser): string {
  return user.displayName ?? user.email.split("@")[0] ?? "Пользователь";
}

function conversationPreview(conversation: DirectConversationSummary): string {
  if (conversation.lastMessage === null) return "Начните разговор";
  return conversation.lastMessage.content.trim().length > 0
    ? conversation.lastMessage.content
    : "Вложение";
}

export function DirectMessagesView(
  props: DirectMessagesViewProps,
): React.JSX.Element {
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [serverCreateOpen, setServerCreateOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<MessageViewModel | null>(
    null,
  );
  const [replyingMessage, setReplyingMessage] =
    useState<MessageViewModel | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; file: File }>
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    useState(false);
  const activeConversation =
    props.conversations.find(
      (conversation) => conversation.id === props.activeConversationId,
    ) ?? null;
  const activeParticipantBlocked =
    activeConversation !== null &&
    (props.blockedParticipantIds ?? []).includes(
      activeConversation.participant.userId,
    );

  useEffect(() => {
    setEditingMessage(null);
    setReplyingMessage(null);
    setPendingAttachments([]);
    setAttachmentError(null);
  }, [props.activeConversationId]);

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
  const cancelContext = (): void => {
    setEditingMessage(null);
    setReplyingMessage(null);
    props.onMessageDraft("");
  };
  const submitMessage = (): void => {
    if (editingMessage === null) {
      props.onSendMessage(
        replyingMessage?.id,
        pendingAttachments.map((attachment) => attachment.file),
      );
      setPendingAttachments([]);
      setAttachmentError(null);
    } else {
      props.onUpdateMessage(editingMessage.id, props.messageDraft);
    }
    cancelContext();
  };
  const submitConversation = (event: FormEvent): void => {
    event.preventDefault();
    if (candidateId === "") return;
    props.onCreateConversation(candidateId);
    setCandidateId("");
    setNewConversationOpen(false);
  };
  const submitServerCreate = (event: FormEvent): void => {
    event.preventDefault();
    props.onCreateServer();
    setServerCreateOpen(false);
  };

  const workspaces: WorkspaceNavigationItem[] = props.servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    iconUrl: server.iconUrl ?? null,
    accentColor: server.accentColor ?? null,
  }));
  const totalUnread = props.conversations.reduce(
    (count, conversation) => count + conversation.unreadCount,
    0,
  );
  const messageModels: MessageViewModel[] = props.messages.map((message) => ({
    id: message.id,
    authorId: message.authorUserId,
    authorName: message.authorDisplayName,
    content: message.content,
    createdAt: message.createdAt,
    edited: message.editedAt !== null,
    deleted: message.deletedAt !== null && message.deletedAt !== undefined,
    own: message.authorUserId === props.user.id,
    canEdit: message.authorUserId === props.user.id && !message.deletedAt,
    canDelete: message.authorUserId === props.user.id && !message.deletedAt,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      canDelete: message.authorUserId === props.user.id,
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

  const workspaceLibrary = (
    <WorkspaceLibrary
      directActive
      directUnreadCount={totalUnread}
      onCreate={() => setServerCreateOpen(true)}
      onDirectMessages={() => undefined}
      onHome={props.onHome}
      onSelect={props.onSwitchServer}
      workspaces={workspaces}
    />
  );
  const conversationList = (
    <aside aria-label="Личные диалоги" className="vui-direct-context">
      <header>
        <span>
          <strong>Личные сообщения</strong>
          <small>{props.conversations.length} диалогов</small>
        </span>
        <Button
          icon="plus"
          onClick={() => setNewConversationOpen(true)}
          size="sm"
          type="button"
        >
          Новый
        </Button>
      </header>
      <div className="vui-direct-context__list">
        {props.conversations.length === 0 ? (
          <div className="vui-direct-context__empty">
            <Icon name="message" size={28} />
            <strong>Здесь будут ваши диалоги</strong>
            <span>Начните разговор с участником общего сервера.</span>
          </div>
        ) : (
          props.conversations.map((conversation) => (
            <button
              aria-current={
                conversation.id === props.activeConversationId
                  ? "page"
                  : undefined
              }
              data-active={
                conversation.id === props.activeConversationId || undefined
              }
              key={conversation.id}
              onClick={() => props.onConversation(conversation.id)}
              type="button"
            >
              <Avatar name={conversation.participant.displayName} size="md" />
              <span>
                <strong>{conversation.participant.displayName}</strong>
                <small>{conversationPreview(conversation)}</small>
              </span>
              {conversation.unreadCount === 0 ? null : (
                <Badge tone="danger">
                  {conversation.unreadCount > 99
                    ? "99+"
                    : conversation.unreadCount}
                </Badge>
              )}
            </button>
          ))
        )}
      </div>
      <UserProfileDock
        avatarUrl={props.user.avatarUrl ?? null}
        email={props.user.email}
        founder={props.user.platformRole === "owner"}
        name={userDisplayName(props.user)}
        onLogout={props.onLogout}
        onSecurity={props.onSecurity}
      />
    </aside>
  );
  const members =
    activeConversation === null ? (
      <MemberPanel members={[]} />
    ) : (
      <MemberPanel
        members={[
          {
            id: props.user.id,
            name: userDisplayName(props.user),
            founder: props.user.platformRole === "owner",
            roleLabel: "Вы",
            status: "online",
          },
          {
            id: activeConversation.participant.userId,
            name: activeConversation.participant.displayName,
            founder: activeConversation.participant.platformRole === "owner",
            roleLabel: "Собеседник",
          },
        ]}
      />
    );
  const topBar = (
    <div className="vui-direct-topbar">
      <Icon name="message" size={19} />
      <span>
        <strong>
          {activeConversation?.participant.displayName ?? "Личные сообщения"}
        </strong>
        <small>
          {activeConversation === null
            ? "Выберите или создайте диалог"
            : activeParticipantBlocked
              ? "Пользователь заблокирован"
              : "Приватный диалог"}
        </small>
      </span>
      {activeConversation === null ? null : (
        <>
          <Button
            className="vui-direct-topbar__notifications"
            onClick={() => setNotificationSettingsOpen(true)}
            size="sm"
            type="button"
            variant="quiet"
          >
            Уведомления
          </Button>
          <Button
            className="vui-direct-topbar__block"
            onClick={() =>
              activeParticipantBlocked
                ? props.onUnblockParticipant(
                    activeConversation.participant.userId,
                  )
                : setBlockConfirmOpen(true)
            }
            size="sm"
            type="button"
            variant="quiet"
          >
            {activeParticipantBlocked ? "Разблокировать" : "Заблокировать"}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      <AppShell
        members={members}
        membersDrawerTitle="Участники диалога"
        serverContext={conversationList}
        topBar={topBar}
        workspaceDrawerTitle="Серверы"
        workspaceLibrary={workspaceLibrary}
      >
        {activeConversation === null ? (
          <div className="vui-direct-welcome">
            <span>
              <Icon name="message" size={38} />
            </span>
            <h1>Личные сообщения</h1>
            <p>Общайтесь один на один с людьми из ваших серверов.</p>
            <Button icon="plus" onClick={() => setNewConversationOpen(true)}>
              Начать диалог
            </Button>
          </div>
        ) : (
          <section className="vui-message-stage">
            <MessageList
              channelName={activeConversation.participant.displayName}
              emptyDescription="Отправьте первое сообщение — оно будет видно только участникам этого диалога."
              emptyTitle={`Начало диалога с ${activeConversation.participant.displayName}`}
              firstUnreadMessageId={props.firstUnreadMessageId}
              hasOlder={props.hasOlderMessages}
              loadingOlder={props.loadingOlderMessages}
              messages={messageModels}
              onDelete={props.onDeleteMessage}
              onDeleteAttachment={props.onDeleteAttachment}
              onDownloadAttachment={props.onDownloadAttachment}
              onLoadAttachment={props.onLoadAttachment}
              onLoadOlder={props.onLoadOlderMessages}
              onRetry={props.onRetryMessage}
              onEdit={(message) => {
                setReplyingMessage(null);
                setEditingMessage(message);
                setPendingAttachments([]);
                setAttachmentError(null);
                props.onMessageDraft(message.content);
              }}
              onReaction={props.onMessageReaction}
              onReply={(message) => {
                setEditingMessage(null);
                setReplyingMessage(message);
              }}
            />
            {props.typingText ? (
              <div aria-live="polite" className="vui-message-typing">
                <span />
                <strong>{props.typingText}</strong> печатает…
              </div>
            ) : null}
            {activeParticipantBlocked ? (
              <div className="vui-direct-blocked-notice">
                <strong>Вы заблокировали этого пользователя</strong>
                <span>
                  Новые сообщения недоступны, пока вы его не разблокируете.
                </span>
                <Button
                  onClick={() =>
                    props.onUnblockParticipant(
                      activeConversation.participant.userId,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Разблокировать
                </Button>
              </div>
            ) : (
              <MessageComposer
                attachments={pendingAttachments.map(({ id, file }) => ({
                  id,
                  name: file.name,
                  size: file.size,
                  mimeType: file.type,
                }))}
                busy={props.busy}
                channelName={activeConversation.participant.displayName}
                {...(editingMessage !== null
                  ? {
                      context: {
                        mode: "edit" as const,
                        label: editingMessage.content,
                      },
                      onCancelContext: cancelContext,
                    }
                  : replyingMessage !== null
                    ? {
                        context: {
                          mode: "reply" as const,
                          label: `${replyingMessage.authorName}: ${replyingMessage.content}`,
                        },
                        onCancelContext: cancelContext,
                      }
                    : {})}
                {...(editingMessage === null
                  ? { onFilesSelected: addAttachments }
                  : {})}
                onChange={props.onMessageDraft}
                onRemoveAttachment={(id) => {
                  setPendingAttachments((current) =>
                    current.filter((attachment) => attachment.id !== id),
                  );
                  setAttachmentError(null);
                }}
                onSubmit={submitMessage}
                placeholder={`Написать ${activeConversation.participant.displayName}`}
                value={props.messageDraft}
              />
            )}
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
          </section>
        )}
      </AppShell>

      <Modal
        onClose={() => setNewConversationOpen(false)}
        open={newConversationOpen}
        title="Новый личный диалог"
      >
        <form className="vui-direct-form" onSubmit={submitConversation}>
          <Select
            autoFocus
            label="Участник общего сервера"
            onChange={(event) => setCandidateId(event.target.value)}
            options={[
              { value: "", label: "Выберите участника" },
              ...props.candidates.map((candidate) => ({
                value: candidate.userId,
                label: `${candidate.displayName} · ${candidate.sharedServerNames.join(", ")}`,
              })),
            ]}
            value={candidateId}
          />
          <p>
            Начать диалог можно только с участником хотя бы одного общего
            сервера.
          </p>
          <div>
            <Button
              onClick={() => setNewConversationOpen(false)}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button
              disabled={candidateId === ""}
              loading={props.busy}
              type="submit"
            >
              Открыть диалог
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        onClose={() => setServerCreateOpen(false)}
        open={serverCreateOpen}
        title="Новый сервер"
      >
        <form className="vui-direct-form" onSubmit={submitServerCreate}>
          <Input
            autoFocus
            label="Название сервера"
            maxLength={60}
            onChange={(event) => props.onServerName(event.target.value)}
            value={props.serverName}
          />
          <div>
            <Button
              onClick={() => setServerCreateOpen(false)}
              type="button"
              variant="quiet"
            >
              Отмена
            </Button>
            <Button loading={props.busy} type="submit">
              Создать
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        danger
        description={`Вы не сможете обмениваться новыми сообщениями с пользователем ${activeConversation?.participant.displayName ?? ""}. История диалога сохранится.`}
        confirmLabel="Заблокировать"
        loading={props.busy}
        onClose={() => setBlockConfirmOpen(false)}
        onConfirm={() => {
          if (activeConversation !== null)
            props.onBlockParticipant(activeConversation.participant.userId);
          setBlockConfirmOpen(false);
        }}
        open={blockConfirmOpen && activeConversation !== null}
        title="Заблокировать пользователя?"
      />
      {activeConversation === null ? null : (
        <NotificationSettingsDialog
          conversationId={activeConversation.id}
          onClose={() => setNotificationSettingsOpen(false)}
          open={notificationSettingsOpen}
          title={activeConversation.participant.displayName}
        />
      )}
    </>
  );
}
