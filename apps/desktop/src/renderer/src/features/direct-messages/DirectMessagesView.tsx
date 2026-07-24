import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import type {
  DirectConversationSummary,
  DirectMessage,
  DirectMessageCandidate,
  EffectivePresenceStatus,
  PresencePreference,
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
  IconButton,
  Input,
  MessageComposer,
  MessageList,
  Modal,
  Select,
  UserProfileDock,
  GlobalSidebar,
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
  targetMessageId?: string | null | undefined;
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
  profileCoverUrl?: string | null | undefined;
  presenceStatus?: EffectivePresenceStatus | undefined;
  onStatus?: (status: PresencePreference) => void | Promise<void>;
  voiceProfileConnection?: ReactNode | undefined;
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

function conversationTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
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
  const [conversationSearch, setConversationSearch] = useState("");
  const [notesByParticipantId, setNotesByParticipantId] = useState<
    Record<string, string>
  >({});
  const activeConversation =
    props.conversations.find(
      (conversation) => conversation.id === props.activeConversationId,
    ) ?? null;
  const activeParticipantBlocked =
    activeConversation !== null &&
    (props.blockedParticipantIds ?? []).includes(
      activeConversation.participant.userId,
    );
  const activityLabel = activeParticipantBlocked
    ? "Диалог заблокирован"
    : "Статус активности недоступен";

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

  const visibleConversations = props.conversations.filter((conversation) => {
    const query = conversationSearch.trim().toLocaleLowerCase("ru-RU");
    if (query.length === 0) return true;
    return (
      conversation.participant.displayName
        .toLocaleLowerCase("ru-RU")
        .includes(query) ||
      conversationPreview(conversation).toLocaleLowerCase("ru-RU").includes(query)
    );
  });
  const serverCards: WorkspaceNavigationItem[] = props.servers.map((server) => ({
    id: server.id,
    name: server.name,
    memberCount: server.memberCount,
    iconUrl: server.iconUrl ?? null,
    bannerUrl: server.bannerUrl ?? null,
    accentColor: server.accentColor ?? null,
  }));
  const messageModels: MessageViewModel[] = props.messages.map((message) => ({
    id: message.id,
    authorId: message.authorUserId,
    authorName: message.authorDisplayName,
    ...(message.authorAvatarUrl === undefined
      ? {}
      : { authorAvatarUrl: message.authorAvatarUrl }),
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

  const globalSidebar = (
    <GlobalSidebar
      activeSection="messages"
      onCommunity={() => {
        const firstServer = props.servers[0];
        if (firstServer) props.onSwitchServer(firstServer.id);
        else setServerCreateOpen(true);
      }}
      onDirectMessages={() => undefined}
      onHome={props.onHome}
      onServerSelect={props.onSwitchServer}
      profile={
        <UserProfileDock
          avatarUrl={props.user.avatarUrl ?? null}
          coverUrl={props.profileCoverUrl}
          email={props.user.email}
          founder={props.user.platformRole === "owner"}
          name={userDisplayName(props.user)}
          enableTilt
          onLogout={props.onLogout}
          onSecurity={props.onSecurity}
          {...(props.onStatus ? { onStatus: props.onStatus } : {})}
          {...(props.presenceStatus ? { status: props.presenceStatus } : {})}
          voiceConnection={props.voiceProfileConnection}
        />
      }
      servers={serverCards}
    />
  );
  const conversationList = (
    <aside aria-label="Личные диалоги" className="vui-direct-context">
      <header className="vui-direct-context__tabs">
        <button aria-current="page" type="button">Личные</button>
        <button aria-disabled="true" disabled title="Групповые диалоги появятся позже" type="button">Групповые</button>
        <IconButton icon="plus" label="Новый личный диалог" onClick={() => setNewConversationOpen(true)} size="sm" type="button" />
        <IconButton disabled icon="search" label="Фильтры личных диалогов появятся позже" size="sm" type="button" />
      </header>
      <label className="vui-direct-context__search">
        <Icon name="search" size={16} />
        <input
          aria-label="Поиск личных диалогов"
          onChange={(event) => setConversationSearch(event.target.value)}
          placeholder="Поиск по сообщениям"
          type="search"
          value={conversationSearch}
        />
      </label>
      <div className="vui-direct-context__list">
        {props.conversations.length === 0 ? (
          <div className="vui-direct-context__empty">
            <Icon name="message" size={28} />
            <strong>Здесь будут ваши диалоги</strong>
            <span>Начните разговор с участником общего сервера.</span>
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="vui-direct-context__empty vui-direct-context__empty--search">
            <Icon name="search" size={28} />
            <strong>Ничего не найдено</strong>
            <span>Попробуйте другое имя или текст сообщения.</span>
          </div>
        ) : (
          visibleConversations.map((conversation) => (
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
              <Avatar
                name={conversation.participant.displayName}
                size="md"
                {...(conversation.participant.avatarUrl
                  ? { src: conversation.participant.avatarUrl }
                  : {})}
              />
              <span>
                <strong>{conversation.participant.displayName}</strong>
                <small>{conversationPreview(conversation)}</small>
              </span>
              <span className="vui-direct-context__meta">
                <time dateTime={conversation.updatedAt}>{conversationTime(conversation.updatedAt)}</time>
                {conversation.unreadCount === 0 ? null : (
                  <Badge tone="primary">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </Badge>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
  const members = activeConversation === null ? (
    <aside aria-label="Информация о диалоге" className="vui-direct-inspector vui-direct-inspector--empty">
      <Icon name="message" size={30} />
      <strong>Выберите диалог</strong>
      <span>Здесь появится краткая информация о собеседнике.</span>
    </aside>
  ) : (
    <aside aria-label="Информация о собеседнике" className="vui-direct-inspector">
      <div className="vui-direct-inspector__cover" />
      <Avatar
        className="vui-direct-inspector__avatar"
        name={activeConversation.participant.displayName}
        size="lg"
        {...(activeConversation.participant.avatarUrl ? { src: activeConversation.participant.avatarUrl } : {})}
      />
      <div className="vui-direct-inspector__identity">
        <strong>
          {activeConversation.participant.displayName}
          <i aria-hidden="true" className="vui-direct-activity-dot" data-state={activeParticipantBlocked ? "blocked" : "unknown"} />
        </strong>
        <span data-state={activeParticipantBlocked ? "blocked" : "unknown"}>{activityLabel}</span>
      </div>
      <section>
        <small>УЧАСТНИКИ ДИАЛОГА</small>
        <div className="vui-direct-inspector__people">
          <Avatar name={userDisplayName(props.user)} size="sm" {...(props.user.avatarUrl ? { src: props.user.avatarUrl } : {})} />
          <span>{userDisplayName(props.user)} <em>Вы</em></span>
        </div>
        <div className="vui-direct-inspector__people">
          <Avatar name={activeConversation.participant.displayName} size="sm" {...(activeConversation.participant.avatarUrl ? { src: activeConversation.participant.avatarUrl } : {})} />
          <span>{activeConversation.participant.displayName} <em>Собеседник</em></span>
        </div>
      </section>
      <section className="vui-direct-inspector__future">
        <small>ОБЩИЕ СЕРВЕРЫ И ДРУЗЬЯ</small>
        <span>Эти данные появятся после подключения соответствующего API.</span>
      </section>
      <section className="vui-direct-inspector__future">
        <small>ОБЩИЕ ФАЙЛЫ</small>
        <span>Вложения из личного диалога будут доступны здесь.</span>
      </section>
      <section className="vui-direct-inspector__future">
        <small>ИГРАЕТ В</small>
        <span>Игровая активность появится после подключения API присутствия.</span>
      </section>
      <section className="vui-direct-inspector__future">
        <small>НЕДАВНИЕ ИГРЫ</small>
        <span>Недавние игры будут доступны после подключения истории активности.</span>
      </section>
      <section className="vui-direct-note">
        <label htmlFor={`direct-note-${activeConversation.participant.userId}`}>ЗАМЕТКИ</label>
        <textarea
          aria-describedby={`direct-note-hint-${activeConversation.participant.userId}`}
          id={`direct-note-${activeConversation.participant.userId}`}
          maxLength={240}
          onChange={(event) =>
            setNotesByParticipantId((current) => ({
              ...current,
              [activeConversation.participant.userId]: event.target.value,
            }))
          }
          placeholder="Добавьте личную заметку"
          value={notesByParticipantId[activeConversation.participant.userId] ?? ""}
        />
        <span id={`direct-note-hint-${activeConversation.participant.userId}`}>
          Пока сохраняется только в этом окне.
        </span>
      </section>
    </aside>
  );
  const topBar = (
    <div className="vui-direct-topbar">
      {activeConversation === null ? (
        <span className="vui-direct-topbar__icon">
          <Icon name="message" size={19} />
        </span>
      ) : (
        <Avatar
          name={activeConversation.participant.displayName}
          size="lg"
          {...(activeConversation.participant.avatarUrl
            ? { src: activeConversation.participant.avatarUrl }
            : {})}
        />
      )}
      <span>
        <strong>
          {activeConversation?.participant.displayName ?? "Личные сообщения"}
          {activeConversation === null ? null : (
            <i aria-hidden="true" className="vui-direct-activity-dot" data-state={activeParticipantBlocked ? "blocked" : "unknown"} />
          )}
        </strong>
        <small data-state={activeParticipantBlocked ? "blocked" : activeConversation === null ? undefined : "unknown"}>
          {activeConversation === null
            ? "Выберите или создайте диалог"
            : activeParticipantBlocked
              ? "Пользователь заблокирован"
              : "Статус активности недоступен"}
        </small>
      </span>
      {activeConversation === null ? null : (
        <>
          <IconButton
            disabled
            icon="phone"
            label="Звонки в личных диалогах появятся позже"
            type="button"
          />
          <IconButton
            className="vui-direct-topbar__notifications"
            icon="bell"
            label="Настройки уведомлений диалога"
            onClick={() => setNotificationSettingsOpen(true)}
            type="button"
          />
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
        globalSidebar={globalSidebar}
        variant="direct-messages"
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
          <section className="vui-message-stage vui-direct-stage">
            <MessageList
              channelName={activeConversation.participant.displayName}
              conversationId={activeConversation.id}
              emptyDescription="Отправьте первое сообщение — оно будет видно только участникам этого диалога."
              emptyTitle={`Начало диалога с ${activeConversation.participant.displayName}`}
              firstUnreadMessageId={props.firstUnreadMessageId}
              targetMessageId={props.targetMessageId}
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
