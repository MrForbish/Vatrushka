import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { channelNameSchema, displayNameSchema, messageContentSchema, passwordSchema, roleNameSchema, serverInviteCodeSchema, serverNameSchema, type DesktopSourceInfo, type DesktopUpdateState, type DirectConversationSummary, type DirectMessage, type DirectMessageCandidate, type LocalSettings, type PermissionOverwriteTargetType, type PublicUser, type RoomConnection, type ServerAuditLogEntry, type ServerDetail, type ServerPermission, type ServerSummary, type TextMessage } from '@vatrushka/shared';

import { apiClient, ClientError } from './api.js';
import { splitAudioDevices, type AudioDevices } from './audio-devices.js';
import { AuthPanel, HomePanel, ProfilePanel } from './components.js';
import { DirectMessagesView } from './features/direct-messages/index.js';
import { SourcePicker } from './features/screen-share/index.js';
import { SecurityCenter } from './features/security/index.js';
import { ServerView } from './features/servers/index.js';
import { UpdateStatus } from './features/update/index.js';
import { RoomView, VoiceConnectionPanel } from './features/voice/index.js';
import { MediaSession } from './media.js';

type Screen = 'boot' | 'auth' | 'profile' | 'home' | 'server' | 'direct';
const media = new MediaSession(apiClient);

export default function App(): ReactNode {
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<PublicUser | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<'password' | 'register'>('password');
  const [authStage, setAuthStage] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPasswordValue] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [secondFactor, setSecondFactor] = useState<'email' | 'totp' | 'recovery'>('email');
  const [totpAvailable, setTotpAvailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [connectedVoiceChannelName, setConnectedVoiceChannelName] = useState('');
  const [settings, setSettings] = useState<LocalSettings>({ volume: 1 });
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [] });
  const [version, setVersion] = useState('0.4.0');
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({ status: 'idle', currentVersion: '0.4.0' });
  const [platform, setPlatform] = useState('win32');
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DesktopSourceInfo[] | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [serverDetail, setServerDetail] = useState<ServerDetail | null>(null);
  const [serverAuditLog, setServerAuditLog] = useState<ServerAuditLogEntry[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [directConversations, setDirectConversations] = useState<DirectConversationSummary[]>([]);
  const [directCandidates, setDirectCandidates] = useState<DirectMessageCandidate[]>([]);
  const [activeDirectConversationId, setActiveDirectConversationId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [directMessageDraft, setDirectMessageDraft] = useState('');
  const [serverName, setServerName] = useState('');
  const [serverInvite, setServerInvite] = useState('');
  const notificationCursorRef = useRef<string | null>(null);
  const notificationCursorIdRef = useRef<string | null>(null);
  const notificationUserRef = useRef<string | null>(null);
  const shownNotificationIdsRef = useRef(new Set<string>());
  const mediaSnapshot = useSyncExternalStore(media.subscribe, media.getSnapshot, media.getSnapshot);

  const updateUser = (next: PublicUser | null): void => {
    userRef.current = next;
    setUser(next);
  };

  const refreshDevices = useCallback(async (requestPermission = false): Promise<void> => {
    let permissionStream: MediaStream | null = null;
    try {
      if (requestPermission) permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(splitAudioDevices(all));
    } catch (caught) {
      if (requestPermission) throw new Error('Не удалось получить доступ к аудиоустройствам. Проверьте разрешение на микрофон в Windows.', { cause: caught });
      setDevices({ inputs: [], outputs: [] });
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.onDeepLink((inviteCode) => {
      setServerInvite(inviteCode);
      setError(null);
      if (userRef.current) setScreen('home');
    });
    void Promise.all([window.desktop.getAppVersion(), window.desktop.getPlatform(), window.desktop.getLocalSettings(), apiClient.restoreSession()])
      .then(([appVersion, currentPlatform, localSettings, restoredUser]) => {
        if (!active) return;
        setVersion(appVersion);
        setPlatform(currentPlatform);
        setSettings(localSettings);
        updateUser(restoredUser);
        setScreen(restoredUser ? (restoredUser.displayName ? 'home' : 'profile') : 'auth');
      });
    void refreshDevices();
    const onDeviceChange = (): void => { void refreshDevices(); };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    const unload = (): void => { void media.disconnect(); };
    window.addEventListener('beforeunload', unload);
    return () => {
      active = false;
      unsubscribe();
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      window.removeEventListener('beforeunload', unload);
      void media.disconnect();
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (!user) return;
    void refreshDevices(true).catch((caught) => setError(userMessage(caught)));
  }, [refreshDevices, user?.id]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.onUpdateState((state) => { if (active) setUpdateState(state); });
    void window.desktop.getUpdateState().then((state) => { if (active) setUpdateState(state); }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => setRetrySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

  useEffect(() => {
    const microphoneMissing = settings.microphoneDeviceId !== undefined && devices.inputs.length > 0 && !devices.inputs.some((device) => device.deviceId === settings.microphoneDeviceId);
    const outputMissing = settings.outputDeviceId !== undefined && devices.outputs.length > 0 && !devices.outputs.some((device) => device.deviceId === settings.outputDeviceId);
    if (!microphoneMissing && !outputMissing) return;
    const next = { ...settings };
    if (microphoneMissing) delete next.microphoneDeviceId;
    if (outputMissing) delete next.outputDeviceId;
    setSettings(next);
    void window.desktop.updateLocalSettings(next).catch((caught) => setError(userMessage(caught)));
    if (connection !== null) {
      const fallbacks: Array<Promise<void>> = [];
      if (microphoneMissing) fallbacks.push(media.switchMicrophone('default'));
      if (outputMissing) fallbacks.push(media.switchOutput('default'));
      void Promise.all(fallbacks).catch((caught) => setError(userMessage(caught)));
    }
  }, [connection, devices.inputs, devices.outputs, settings]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    let active = true;
    void apiClient.listServers().then((items) => { if (active) setServers(items); }).catch((caught) => { if (active) setError(userMessage(caught)); });
    return () => { active = false; };
  }, [screen, user]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    if (notificationUserRef.current !== user.id) {
      notificationUserRef.current = user.id;
      notificationCursorRef.current = null;
      notificationCursorIdRef.current = null;
      shownNotificationIdsRef.current.clear();
    }
    let active = true;
    const poll = (): void => {
      const since = notificationCursorRef.current;
      void apiClient.listMessageNotifications(since, notificationCursorIdRef.current).then((page) => {
        if (!active) return;
        const notifications = page.items;
        const fresh = notifications.filter((notification) => !shownNotificationIdsRef.current.has(notification.id));
        for (const notification of fresh) {
          shownNotificationIdsRef.current.add(notification.id);
          void window.desktop.showMessageNotification({
            id: notification.id,
            title: `${notification.authorDisplayName} · #${notification.channelName}`,
            body: `${notification.content.slice(0, 700)}\n${notification.serverName}`,
            serverId: notification.serverId,
            channelId: notification.channelId,
          }).catch(() => undefined);
        }
        if (page.cursor) {
          notificationCursorRef.current = page.cursor.createdAt;
          notificationCursorIdRef.current = page.cursor.id;
        }
        if (fresh.length > 0) {
          const counts = new Map<string, number>();
          for (const notification of fresh) counts.set(notification.channelId, (counts.get(notification.channelId) ?? 0) + 1);
          setServerDetail((current) => current === null ? current : { ...current, channels: current.channels.map((channel) => ({ ...channel, unreadCount: channel.unreadCount + (counts.get(channel.id) ?? 0) })) });
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    poll();
    const timer = window.setInterval(poll, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, user]);

  useEffect(() => window.desktop.onMessageNotificationClick((target) => {
    if (!userRef.current) return;
    void apiClient.getServer(target.serverId).then((detail) => {
      if (!detail.channels.some((channel) => channel.id === target.channelId && channel.type === 'text')) return;
      setServerDetail(detail);
      setActiveChannelId(target.channelId);
      setMessages([]);
      setError(null);
      setScreen('server');
    }).catch((caught) => setError(userMessage(caught)));
  }), []);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    let active = true;
    const refresh = (): void => {
      void apiClient.listDirectConversations().then((items) => {
        if (!active) return;
        setDirectConversations(items);
        if (screen === 'direct') setActiveDirectConversationId((current) => current !== null && items.some((conversation) => conversation.id === current) ? current : items[0]?.id ?? null);
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, user]);

  useEffect(() => {
    if (!user || screen !== 'direct') return;
    let active = true;
    void apiClient.listDirectMessageCandidates().then((items) => { if (active) setDirectCandidates(items); }).catch((caught) => { if (active) setError(userMessage(caught)); });
    return () => { active = false; };
  }, [screen, user]);

  useEffect(() => {
    if (screen !== 'direct' || activeDirectConversationId === null) return;
    let active = true;
    const conversationId = activeDirectConversationId;
    const refresh = (): void => {
      void apiClient.listDirectMessages(conversationId).then((items) => {
        if (!active) return;
        setDirectMessages((current) => [...items, ...current.filter((message) => message.id.startsWith('optimistic_'))]);
        const latest = items.at(-1);
        if (latest) {
          void apiClient.markDirectConversationRead(conversationId, latest.id).catch((caught) => { if (active) setError(userMessage(caught)); });
          setDirectConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation));
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, activeDirectConversationId]);

  useEffect(() => {
    if (screen !== 'server' || !serverDetail || !activeChannelId) return;
    const channel = serverDetail.channels.find((candidate) => candidate.id === activeChannelId);
    if (channel?.type !== 'text') return;
    let active = true;
    const refresh = (): void => {
      void apiClient.listMessages(channel.id).then((items) => {
        if (!active) return;
        setMessages((current) => [...items, ...current.filter((message) => message.id.startsWith('optimistic_'))]);
        const latest = items.at(-1);
        if (latest) {
          void apiClient.markChannelRead(channel.id, latest.id).catch((caught) => { if (active) setError(userMessage(caught)); });
          setServerDetail((current) => current === null ? current : { ...current, channels: current.channels.map((item) => item.id === channel.id ? { ...item, unreadCount: 0 } : item) });
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = setInterval(refresh, 3_000);
    return () => { active = false; clearInterval(timer); };
  }, [screen, serverDetail, activeChannelId]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (): void => {
    void run(async () => {
      let response: { retryAfterSeconds: number };
      if (authMode === 'register') {
        const validPassword = passwordSchema.parse(password);
        if (validPassword !== passwordConfirmation) throw new Error('Пароли не совпадают');
        response = await apiClient.requestRegistration(email, validPassword);
        setSecondFactor('email');
      } else {
        const validPassword = passwordSchema.parse(password);
        const challenge = await apiClient.beginPasswordLogin(email, validPassword, authStage === 'otp' ? secondFactor : 'auto');
        response = challenge;
        setSecondFactor(challenge.factor);
        setTotpAvailable(challenge.factor === 'totp');
      }
      setRetrySeconds(response.retryAfterSeconds);
      setAuthStage('otp');
    });
  };

  const verifyCode = (): void => {
    void run(async () => {
      const response = authMode === 'register'
        ? await apiClient.verifyRegistration(email, otp)
        : await apiClient.completePasswordLogin(email, password, otp, secondFactor);
      updateUser(response.user);
      if (!response.user.displayName) setScreen('profile');
      else setScreen('home');
    });
  };

  const switchPasswordFactor = (factor: 'email' | 'totp' | 'recovery'): void => {
    void run(async () => {
      const challenge = await apiClient.beginPasswordLogin(email, password, factor);
      setSecondFactor(challenge.factor);
      setRetrySeconds(challenge.retryAfterSeconds);
      setOtp('');
    });
  };

  const saveProfile = (): void => {
    void run(async () => {
      const name = displayNameSchema.parse(displayName);
      const updated = await apiClient.updateProfile(name);
      updateUser(updated);
      setScreen('home');
    });
  };

  const openServer = (serverId: string): void => {
    void run(async () => {
      const detail = await apiClient.getServer(serverId);
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setMessages([]);
      setScreen('server');
    });
  };

  const openDirectMessages = (): void => {
    void run(async () => {
      const [conversations, candidates] = await Promise.all([apiClient.listDirectConversations(), apiClient.listDirectMessageCandidates()]);
      setDirectConversations(conversations);
      setDirectCandidates(candidates);
      setActiveDirectConversationId((current) => current !== null && conversations.some((conversation) => conversation.id === current) ? current : conversations[0]?.id ?? null);
      setDirectMessages([]);
      setDirectMessageDraft('');
      setScreen('direct');
    });
  };

  const selectDirectConversation = (conversationId: string): void => {
    setActiveDirectConversationId(conversationId);
    setDirectMessages([]);
    setDirectMessageDraft('');
    setError(null);
  };

  const createDirectConversation = (participantUserId: string): void => {
    void run(async () => {
      const conversation = await apiClient.createDirectConversation(participantUserId);
      setDirectConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setActiveDirectConversationId(conversation.id);
      setDirectMessages([]);
      setDirectMessageDraft('');
    });
  };

  const refreshServer = async (): Promise<ServerDetail> => {
    if (!serverDetail) throw new Error('Сервер не выбран');
    const detail = await apiClient.getServer(serverDetail.id);
    setServerDetail(detail);
    setServers(await apiClient.listServers());
    return detail;
  };

  const createServer = (): void => {
    void run(async () => {
      const detail = await apiClient.createServer(serverNameSchema.parse(serverName));
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setServerName('');
      setServers(await apiClient.listServers());
      setScreen('server');
    });
  };

  const joinServer = (): void => {
    void run(async () => {
      const detail = await apiClient.joinServer(serverInviteCodeSchema.parse(serverInvite));
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setServerInvite('');
      setServers(await apiClient.listServers());
      setScreen('server');
    });
  };

  const sendMessage = (replyToMessageId?: string, files: File[] = []): void => {
    void run(async () => {
      if (!activeChannelId || !user) return;
      const content = messageContentSchema.parse(messageDraft);
      const optimisticId = `optimistic_${crypto.randomUUID()}`;
      const replyTarget = replyToMessageId === undefined ? null : messages.find((message) => message.id === replyToMessageId) ?? null;
      const optimistic: TextMessage = {
        id: optimisticId,
        channelId: activeChannelId,
        authorUserId: user.id,
        authorDisplayName: user.displayName ?? user.email.split('@')[0] ?? 'Пользователь',
        authorPlatformRole: user.platformRole,
        content,
        replyTo: replyTarget === null ? null : { messageId: replyTarget.id, authorUserId: replyTarget.authorUserId, authorDisplayName: replyTarget.authorDisplayName, content: replyTarget.content },
        reactions: [],
        attachments: files.map((file) => ({ id: `optimistic_${crypto.randomUUID()}`, messageId: optimisticId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() })),
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      setMessageDraft('');
      setMessages((current) => [...current, optimistic]);
      let persisted: TextMessage | null = null;
      try {
        persisted = await apiClient.createMessage(activeChannelId, content, replyToMessageId);
        const created = persisted;
        setMessages((current) => [...current.filter((message) => message.id !== optimisticId && message.id !== created.id), created]);
        for (const file of files) {
          persisted = await apiClient.uploadMessageAttachment(persisted.id, file);
          const updated = persisted;
          setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
        }
      } catch (caught) {
        if (persisted === null) {
          setMessages((current) => current.filter((message) => message.id !== optimisticId));
          setMessageDraft(content);
        }
        throw caught;
      }
    });
  };

  const deleteMessage = (messageId: string): void => {
    void run(async () => {
      await apiClient.deleteMessage(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    });
  };

  const deleteAttachment = (attachmentId: string): void => {
    void run(async () => {
      const updated = await apiClient.deleteMessageAttachment(attachmentId);
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const downloadAttachment = (attachmentId: string, fileName: string): void => {
    void run(async () => {
      const blob = await apiClient.downloadMessageAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const updateMessage = (messageId: string, value: string): void => {
    void run(async () => {
      const updated = await apiClient.updateMessage(messageId, messageContentSchema.parse(value));
      setMessageDraft('');
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const toggleMessageReaction = (messageId: string, emoji: string): void => {
    void run(async () => {
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const active = message.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByCurrentUser !== true;
      const updated = await apiClient.setMessageReaction(messageId, emoji, active);
      setMessages((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    });
  };

  const sendDirectMessage = (replyToMessageId?: string, files: File[] = []): void => {
    void run(async () => {
      if (activeDirectConversationId === null || !user) return;
      const content = messageContentSchema.parse(directMessageDraft);
      const conversationId = activeDirectConversationId;
      const optimisticId = `optimistic_${crypto.randomUUID()}`;
      const replyTarget = replyToMessageId === undefined ? null : directMessages.find((message) => message.id === replyToMessageId) ?? null;
      const optimistic: DirectMessage = {
        id: optimisticId,
        conversationId,
        authorUserId: user.id,
        authorDisplayName: user.displayName ?? user.email.split('@')[0] ?? 'Пользователь',
        authorPlatformRole: user.platformRole,
        content,
        replyTo: replyTarget === null ? null : { messageId: replyTarget.id, authorUserId: replyTarget.authorUserId, authorDisplayName: replyTarget.authorDisplayName, content: replyTarget.content },
        reactions: [],
        attachments: files.map((file) => ({ id: `optimistic_${crypto.randomUUID()}`, messageId: optimisticId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() })),
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      setDirectMessageDraft('');
      setDirectMessages((current) => [...current, optimistic]);
      let persisted: DirectMessage | null = null;
      try {
        persisted = await apiClient.createDirectMessage(conversationId, content, replyToMessageId);
        const created = persisted;
        setDirectMessages((current) => [...current.filter((message) => message.id !== optimisticId && message.id !== created.id), created]);
        for (const file of files) {
          persisted = await apiClient.uploadDirectMessageAttachment(persisted.id, file);
          const updated = persisted;
          setDirectMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
        }
        setDirectConversations(await apiClient.listDirectConversations());
      } catch (caught) {
        if (persisted === null) {
          setDirectMessages((current) => current.filter((message) => message.id !== optimisticId));
          setDirectMessageDraft(content);
        }
        throw caught;
      }
    });
  };

  const updateDirectMessage = (messageId: string, value: string): void => {
    void run(async () => {
      const updated = await apiClient.updateDirectMessage(messageId, messageContentSchema.parse(value));
      setDirectMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      setDirectConversations(await apiClient.listDirectConversations());
    });
  };

  const deleteDirectMessage = (messageId: string): void => {
    void run(async () => {
      await apiClient.deleteDirectMessage(messageId);
      setDirectMessages((current) => current.filter((message) => message.id !== messageId));
      setDirectConversations(await apiClient.listDirectConversations());
    });
  };

  const toggleDirectMessageReaction = (messageId: string, emoji: string): void => {
    void run(async () => {
      const message = directMessages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const active = message.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByCurrentUser !== true;
      const updated = await apiClient.setDirectMessageReaction(messageId, emoji, active);
      setDirectMessages((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    });
  };

  const deleteDirectAttachment = (attachmentId: string): void => {
    void run(async () => {
      const updated = await apiClient.deleteDirectMessageAttachment(attachmentId);
      setDirectMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const downloadDirectAttachment = (attachmentId: string, fileName: string): void => {
    void run(async () => {
      const blob = await apiClient.downloadDirectMessageAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const createCommunityChannel = (name: string, type: 'text' | 'voice'): void => {
    void run(async () => {
      if (!serverDetail) return;
      const channel = await apiClient.createServerChannel(serverDetail.id, channelNameSchema.parse(name), type);
      const detail = await refreshServer();
      setActiveChannelId(detail.channels.some((candidate) => candidate.id === channel.id) ? channel.id : activeChannelId);
    });
  };

  const deleteCommunityChannel = (channelId: string): void => {
    void run(async () => {
      await apiClient.deleteServerChannel(channelId);
      const detail = await refreshServer();
      if (activeChannelId === channelId) setActiveChannelId(detail.channels[0]?.id ?? null);
    });
  };

  const createCommunityRole = (name: string, color: string, permissions: ServerPermission[]): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.createServerRole(serverDetail.id, roleNameSchema.parse(name), color, permissions);
      await refreshServer();
    });
  };

  const updateCommunityRole = (roleId: string, values: { name?: string; color?: string; permissions?: ServerPermission[] }): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.updateServerRole(serverDetail.id, roleId, values);
      await refreshServer();
    });
  };

  const deleteCommunityRole = (roleId: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.deleteServerRole(serverDetail.id, roleId);
      await refreshServer();
    });
  };

  const reorderCommunityRole = (roleId: string, position: number): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.reorderServerRole(serverDetail.id, roleId, position);
      await refreshServer();
    });
  };

  const assignCommunityRoles = (userId: string, roleIds: string[]): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.assignServerMemberRoles(serverDetail.id, userId, roleIds);
      await refreshServer();
    });
  };

  const setCommunityChannelOverwrite = (channelId: string, targetType: PermissionOverwriteTargetType, targetId: string, allow: ServerPermission[], deny: ServerPermission[]): void => {
    void run(async () => {
      await apiClient.setChannelPermissionOverwrite(channelId, targetType, targetId, allow, deny);
      await refreshServer();
    });
  };

  const loadServerAuditLog = (): void => {
    void run(async () => {
      if (!serverDetail) return;
      setServerAuditLog(await apiClient.listServerAuditLog(serverDetail.id));
    });
  };

  const kickCommunityMember = (userId: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.kickServerMember(serverDetail.id, userId);
      await refreshServer();
    });
  };

  const enterVoiceChannel = async (voiceConnection: RoomConnection): Promise<void> => {
    await media.connect(voiceConnection, settings);
    setConnection(voiceConnection);
    setConnectedVoiceChannelName(serverDetail?.channels.find((channel) => channel.id === voiceConnection.channelId)?.name ?? 'Голосовой канал');
    setActiveChannelId(voiceConnection.channelId);
    setScreen('server');
    await refreshDevices(true);
  };

  const connectVoiceChannel = (channelId: string): void => { void run(async () => enterVoiceChannel(await apiClient.connectVoiceChannel(channelId))); };

  const leaveRoom = (): void => {
    void run(async () => {
      await media.disconnect();
      setConnection(null);
      setConnectedVoiceChannelName('');
      setScreen(serverDetail ? 'server' : userRef.current ? 'home' : 'auth');
    });
  };

  const logout = (): void => {
    void run(async () => {
      await media.disconnect();
      await apiClient.logout();
      updateUser(null);
      setConnection(null);
      setConnectedVoiceChannelName('');
      setServerDetail(null);
      setServers([]);
      setDirectConversations([]);
      setDirectCandidates([]);
      setActiveDirectConversationId(null);
      setDirectMessages([]);
      setAuthStage('credentials');
      setOtp('');
      setScreen('auth');
    });
  };

  const persistDevice = (key: 'microphoneDeviceId' | 'outputDeviceId', value: string): void => {
    const deviceId = value === 'default' ? undefined : value;
    const next = { ...settings };
    if (deviceId) next[key] = deviceId; else delete next[key];
    const apply = async (): Promise<void> => {
      if (connection !== null) await (key === 'microphoneDeviceId' ? media.switchMicrophone(value) : media.switchOutput(value));
      setSettings(next);
      await window.desktop.updateLocalSettings(next);
    };
    if (connection !== null) void run(apply);
    else void apply().catch((caught) => setError(userMessage(caught)));
  };

  const setScreenShareVolume = (value: number): void => {
    const next = { ...settings, volume: value };
    setSettings(next);
    media.setScreenShareAudioVolume(value);
    void window.desktop.updateLocalSettings(next);
  };

  const showSourcePicker = (): void => {
    if (!connection) return;
    if (mediaSnapshot.isScreenSharing) {
      void run(() => media.stopScreenShare());
      return;
    }
    void run(async () => {
      await apiClient.claimScreenShare(connection);
      try {
        const available = await window.desktop.listDesktopSources();
        if (available.length === 0) throw new Error('Нет доступных окон или мониторов');
        setSources(available);
      } catch (caught) {
        await apiClient.releaseScreenShare(connection);
        throw caught;
      }
    });
  };

  const cancelSourcePicker = useCallback((): void => {
    setSources(null);
    void window.desktop.clearSelectedDesktopSource();
    if (connection) void apiClient.releaseScreenShare(connection);
  }, [connection]);

  const selectSource = (source: DesktopSourceInfo): void => {
    void run(async () => {
      if (!connection) return;
      try {
        const shareAudio = includeAudio && source.audioAvailable && connection.canStreamApplicationAudio !== false;
        await window.desktop.selectDesktopSource(source.id, shareAudio);
        await media.startScreenShare(shareAudio);
        setSources(null);
      } catch (caught) {
        setSources(null);
        await window.desktop.clearSelectedDesktopSource();
        await apiClient.releaseScreenShare(connection);
        throw caught;
      }
    });
  };

  const copyInvite = (): void => {
    if (!connection) return;
    const text = `Присоединяйтесь к серверу «${serverDetail?.name ?? 'Ватрушка'}»\nКод приглашения: ${connection.code}\nСсылка: vatrushka://server/${connection.code}`;
    void window.desktop.copyToClipboard(text);
  };

  const renderSecurityPanel = (): ReactNode => user && securityOpen ? <SecurityCenter open user={user} onClose={() => setSecurityOpen(false)} onUserChange={updateUser} onCurrentSessionRevoked={() => { updateUser(null); setScreen('auth'); }} /> : null;
  const withUpdateStatus = (content: ReactNode): ReactNode => <>{content}<UpdateStatus state={updateState} onInstall={() => void window.desktop.installUpdate().catch((caught) => setError(userMessage(caught)))} /></>;
  const directUnreadCount = directConversations.reduce((count, conversation) => count + conversation.unreadCount, 0);
  const openConnectedVoice = (): void => {
    if (!connection) return;
    if (serverDetail?.id === connection.serverId) {
      setActiveChannelId(connection.channelId);
      setScreen('server');
      return;
    }
    void run(async () => {
      const detail = await apiClient.getServer(connection.serverId);
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId(connection.channelId);
      setMessages([]);
      setScreen('server');
    });
  };
  const voiceStage = connection ? <RoomView connection={connection} snapshot={mediaSnapshot} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} busy={busy} error={error} onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))} onShare={showSourcePicker} onCopy={copyInvite} onLeave={leaveRoom} onKick={(identity) => void run(() => apiClient.kickMediaParticipant(connection, identity))} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onRefreshDevices={() => void run(() => refreshDevices(true))} onStartAudio={() => void media.startAudio()} onScreenAudioMute={() => media.setScreenShareAudioMuted(!mediaSnapshot.screenShareAudioMuted)} onScreenAudioVolume={setScreenShareVolume} onParticipantMute={(identity, muted) => media.setParticipantMuted(identity, muted)} onParticipantVolume={(identity, volume) => media.setParticipantVolume(identity, volume)} /> : undefined;
  const voiceConnectionPanel = connection ? <VoiceConnectionPanel canShare={connection.canStream !== false} channelName={connectedVoiceChannelName} snapshot={mediaSnapshot} onLeave={leaveRoom} onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))} onOpen={openConnectedVoice} onShare={showSourcePicker} /> : undefined;

  if (screen === 'boot') return withUpdateStatus(<main className="bootScreen"><div className="pulseLogo"><span /></div><span>Подключаем «Ватрушку»…</span></main>);
  if (screen === 'auth') return withUpdateStatus(<AuthPanel mode={authMode} stage={authStage} factor={secondFactor} totpAvailable={totpAvailable} email={email} code={otp} password={password} passwordConfirmation={passwordConfirmation} retrySeconds={retrySeconds} busy={busy} error={error} onMode={(mode) => { setAuthMode(mode); setAuthStage('credentials'); setOtp(''); setError(null); }} onEmailChange={setEmail} onCodeChange={setOtp} onPasswordChange={setPasswordValue} onPasswordConfirmationChange={setPasswordConfirmation} onRequest={requestCode} onVerify={verifyCode} onFactor={switchPasswordFactor} onBack={() => { setAuthStage('credentials'); setOtp(''); setError(null); }} />);
  if (screen === 'profile') return withUpdateStatus(<ProfilePanel value={displayName} busy={busy} error={error} onChange={setDisplayName} onSave={saveProfile} />);
  if (screen === 'home' && user) return withUpdateStatus(<><HomePanel user={user} version={version} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} busy={busy} error={error} servers={servers} serverName={serverName} serverInvite={serverInvite} directUnreadCount={directUnreadCount} onLogout={logout} onSecurity={() => setSecurityOpen(true)} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onRefreshDevices={() => void run(() => refreshDevices(true))} onServerName={setServerName} onServerInvite={setServerInvite} onCreateServer={createServer} onJoinServer={joinServer} onOpenServer={openServer} onDirectMessages={openDirectMessages} />{renderSecurityPanel()}</>);
  if (screen === 'server' && user && serverDetail) return withUpdateStatus(<><ServerView user={user} server={serverDetail} servers={servers} activeChannelId={activeChannelId} messages={messages} messageDraft={messageDraft} serverName={serverName} serverInvite={serverInvite} busy={busy} error={error} auditLog={serverAuditLog} directUnreadCount={directUnreadCount} connectedVoiceChannelId={connection?.serverId === serverDetail.id ? connection.channelId : undefined} connectedVoiceServerId={connection?.serverId} voiceStage={voiceStage} voiceConnectionPanel={voiceConnectionPanel} onBack={() => setScreen('home')} onDirectMessages={openDirectMessages} onSwitchServer={openServer} onChannel={(channelId) => { setActiveChannelId(channelId); setMessages([]); setError(null); }} onMessageDraft={setMessageDraft} onSendMessage={sendMessage} onUpdateMessage={updateMessage} onMessageReaction={toggleMessageReaction} onDeleteMessage={deleteMessage} onDeleteAttachment={deleteAttachment} onDownloadAttachment={downloadAttachment} onConnectVoice={connectVoiceChannel} onCopyInvite={() => void window.desktop.copyToClipboard(`Присоединяйтесь к серверу «${serverDetail.name}»\nКод приглашения: ${serverDetail.inviteCode}`)} onCreateChannel={createCommunityChannel} onDeleteChannel={deleteCommunityChannel} onCreateRole={createCommunityRole} onUpdateRole={updateCommunityRole} onDeleteRole={deleteCommunityRole} onReorderRole={reorderCommunityRole} onAssignRoles={assignCommunityRoles} onSetChannelOverwrite={setCommunityChannelOverwrite} onLoadAudit={loadServerAuditLog} onKickMember={kickCommunityMember} onServerName={setServerName} onServerInvite={setServerInvite} onCreateServer={createServer} onJoinServer={joinServer} onSecurity={() => setSecurityOpen(true)} onLogout={logout} />{sources && <SourcePicker audioAllowed={connection?.canStreamApplicationAudio !== false} busy={busy} sources={sources} includeAudio={includeAudio} platform={platform} onAudio={setIncludeAudio} onSelect={selectSource} onCancel={cancelSourcePicker} />}{renderSecurityPanel()}</>);
  if (screen === 'direct' && user) return withUpdateStatus(<><DirectMessagesView user={user} servers={servers} conversations={directConversations} candidates={directCandidates} activeConversationId={activeDirectConversationId} messages={directMessages} messageDraft={directMessageDraft} serverName={serverName} serverInvite={serverInvite} busy={busy} error={error} onHome={() => setScreen('home')} onSwitchServer={openServer} onConversation={selectDirectConversation} onCreateConversation={createDirectConversation} onMessageDraft={setDirectMessageDraft} onSendMessage={sendDirectMessage} onUpdateMessage={updateDirectMessage} onMessageReaction={toggleDirectMessageReaction} onDeleteMessage={deleteDirectMessage} onDeleteAttachment={deleteDirectAttachment} onDownloadAttachment={downloadDirectAttachment} onServerName={setServerName} onServerInvite={setServerInvite} onCreateServer={createServer} onJoinServer={joinServer} onSecurity={() => setSecurityOpen(true)} onLogout={logout} />{renderSecurityPanel()}</>);
  return withUpdateStatus(<main className="bootScreen"><span>Не удалось открыть экран</span><button className="secondaryButton" onClick={() => setScreen(user ? 'home' : 'auth')}>Вернуться</button></main>);
}

function userMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
