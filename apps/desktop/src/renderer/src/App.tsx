import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ConnectionState } from 'livekit-client';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { channelNameSchema, codePointLength, displayNameSchema, inviteTokenSchema, messageContentSchema, passwordSchema, roleNameSchema, serverNameSchema, type ConversationMessage, type ConversationSummary, type DesktopSourceInfo, type DesktopUpdateState, type DirectConversationSummary, type DirectMessage, type DirectMessageCandidate, type HomeDestination, type InternalNotification, type LocalSettings, type MessageMentionInput, type PermissionOverwriteTargetType, type PublicUser, type RoomConnection, type ServerAuditLogEntry, type ServerDetail, type ServerPermission, type ServerSummary, type TextMessage, type UserPresence, type UserUnreadSummary } from '@vatrushka/shared';

import { apiClient, ClientError } from './api.js';
import { parseSettingsRoute, serverSettingsPath, userSettingsPath, type ServerSettingsSection } from './app/routes';
import { splitAudioDevices, type AudioDevices } from './audio-devices.js';
import { AuthPanel, ProfilePanel } from './components.js';
import { featureFlags } from './config/feature-flags';
import { DirectMessagesView } from './features/direct-messages/index.js';
import { HomePage, homeDashboardQueryKey, useHomeDashboard } from './features/home/index.js';
import { SourcePicker } from './features/screen-share/index.js';
import { SecurityCenter } from './features/security/index.js';
import { ServerView } from './features/servers/index.js';
import { UpdateStatus } from './features/update/index.js';
import { diffRemoteParticipants, RoomView, VoiceConnectionPanel, VoiceCuePlayer, type VoiceCue } from './features/voice/index.js';
import { MediaSession } from './media.js';
import { RealtimeClient } from './realtime.js';

type Screen = 'boot' | 'auth' | 'profile' | 'home' | 'server' | 'direct';
const media = new MediaSession(apiClient);
const realtime = new RealtimeClient((forceRefresh) => apiClient.realtimeCredentials(forceRefresh));
const SettingsRoutePage = lazy(async () => {
  const module = await import('./app/routes/SettingsRoutePage');
  return { default: module.SettingsRoutePage };
});

function toTextMessage(message: ConversationMessage, server: ServerDetail, user: PublicUser): TextMessage {
  const author = server.members.find((member) => member.userId === message.author.id);
  return {
    id: message.id,
    channelId: message.conversationId,
    authorUserId: message.author.id,
    authorDisplayName: message.author.displayName,
    authorPlatformRole: author?.platformRole ?? (message.author.id === user.id ? user.platformRole : 'member'),
    content: message.content,
    mentions: message.mentions.flatMap((mention) => mention.type === 'user' && mention.userId && mention.start !== null && mention.length !== null ? [{ userId: mention.userId, start: mention.start, length: mention.length, displayName: server.members.find((member) => member.userId === mention.userId)?.displayName ?? 'Участник' }] : []),
    replyTo: message.replyTo === null ? null : { messageId: message.replyTo.id, authorUserId: message.replyTo.authorId, authorDisplayName: message.replyTo.authorDisplayName, content: message.replyTo.content },
    reactions: message.reactions,
    attachments: message.attachments.map((attachment) => ({ id: attachment.id, messageId: message.id, fileName: attachment.fileName, mimeType: attachment.mimeType, size: Number(attachment.sizeBytes), createdAt: message.createdAt })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
  };
}

function toDirectMessage(message: ConversationMessage, user: PublicUser, conversations: DirectConversationSummary[]): DirectMessage {
  const peer = conversations.find((conversation) => conversation.id === message.conversationId)?.participant;
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.author.id,
    authorDisplayName: message.author.displayName,
    authorPlatformRole: message.author.id === user.id ? user.platformRole : peer?.platformRole ?? 'member',
    content: message.content,
    replyTo: message.replyTo === null ? null : { messageId: message.replyTo.id, authorUserId: message.replyTo.authorId, authorDisplayName: message.replyTo.authorDisplayName, content: message.replyTo.content },
    reactions: message.reactions,
    attachments: message.attachments.map((attachment) => ({ id: attachment.id, messageId: message.id, fileName: attachment.fileName, mimeType: attachment.mimeType, size: Number(attachment.sizeBytes), createdAt: message.createdAt })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
  };
}

function mergeDirectSummaries(legacy: DirectConversationSummary[], canonical: ConversationSummary[]): DirectConversationSummary[] {
  const canonicalById = new Map(canonical.filter((conversation) => conversation.type === 'direct').map((conversation) => [conversation.id, conversation]));
  return legacy.map((conversation) => {
    const current = canonicalById.get(conversation.id);
    if (!current) return conversation;
    return {
      ...conversation,
      lastMessage: current.lastMessage === null ? null : { authorUserId: current.lastMessage.authorId, content: current.lastMessage.content, createdAt: current.lastMessage.createdAt },
      unreadCount: current.unreadCount,
      updatedAt: current.updatedAt,
    };
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export default function App(): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [presence, setPresence] = useState<UserPresence | null>(null);
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
  const [settings, setSettings] = useState<LocalSettings>({ volume: 1, desktopNotificationsEnabled: true, messageSoundsEnabled: true });
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
  const [settingsServerLoading, setSettingsServerLoading] = useState(false);
  const [settingsServerError, setSettingsServerError] = useState<string | null>(null);
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
  const [, setNotifications] = useState<InternalNotification[]>([]);
  const [unreadSummary, setUnreadSummary] = useState<UserUnreadSummary | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [serverName, setServerName] = useState('');
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const notificationUserRef = useRef<string | null>(null);
  const notificationInitializedRef = useRef(false);
  const shownNotificationIdsRef = useRef(new Set<string>());
  const voiceCuePlayerRef = useRef<VoiceCuePlayer | null>(null);
  const participantConnectionRef = useRef<RoomConnection | null>(null);
  const previousRemoteParticipantsRef = useRef<Set<string> | null>(null);
  const voiceTransitionRef = useRef(false);
  const lastUserActivityRef = useRef(Date.now());
  const settingsReturnScreenRef = useRef<Screen>('home');
  const mediaSnapshot = useSyncExternalStore(media.subscribe, media.getSnapshot, media.getSnapshot);
  const queryClient = useQueryClient();
  const homeDashboardQuery = useHomeDashboard(user?.id, screen === 'home');
  const homePresenceRevision = mediaSnapshot.participants.map((participant) => participant.identity).sort().join('|');
  const homeServersRevision = servers.map((server) => `${server.id}:${server.memberCount}`).join('|');
  const settingsRouteResult = parseSettingsRoute(location.pathname);
  const settingsRoute = settingsRouteResult?.kind === 'invalid' ? null : settingsRouteResult;
  const invalidSettingsCanonicalPath = settingsRouteResult?.kind === 'invalid' ? settingsRouteResult.canonicalPath : null;
  const settingsRouteKind = settingsRoute?.kind ?? null;
  const settingsServerRouteId = settingsRoute?.kind === 'server' ? settingsRoute.serverId : null;
  const activeChannelIsText = activeChannelId !== null && Boolean(serverDetail?.channels.some((channel) => channel.id === activeChannelId && channel.type === 'text'));

  useEffect(() => {
    if (user === null) {
      realtime.stop();
      return undefined;
    }
    const refresh = (): void => setRealtimeRevision((current) => current + 1);
    const unsubscribeEvent = realtime.onEvent(refresh);
    const unsubscribeStatus = realtime.onStatus((status) => { if (status === 'connected') refresh(); });
    realtime.start();
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
      realtime.stop();
    };
  }, [user?.id]);

  useEffect(() => {
    let conversationId: string | null = null;
    if (screen === 'server' && activeChannelId !== null && activeChannelIsText) conversationId = activeChannelId;
    if (screen === 'direct') conversationId = activeDirectConversationId;
    if (conversationId === null) {
      realtime.setActiveConversation(null);
      return undefined;
    }
    realtime.subscribe(conversationId);
    realtime.setActiveConversation(conversationId);
    return () => {
      realtime.unsubscribe(conversationId);
      realtime.setActiveConversation(null);
    };
  }, [activeChannelId, activeChannelIsText, activeDirectConversationId, screen]);

  useEffect(() => {
    if (invalidSettingsCanonicalPath === null) return;
    void navigate(invalidSettingsCanonicalPath, { replace: true });
  }, [invalidSettingsCanonicalPath, navigate]);

  useEffect(() => {
    if (settingsRouteKind === null) return;
    const enabled = settingsRouteKind === 'user' ? featureFlags.userSettingsPage : featureFlags.serverSettingsPage;
    if (!enabled) void navigate('/', { replace: true });
  }, [navigate, settingsRouteKind]);

  useEffect(() => {
    if (settingsServerRouteId === null || user === null || serverDetail?.id === settingsServerRouteId) return;
    let active = true;
    setSettingsServerLoading(true);
    setSettingsServerError(null);
    void apiClient.getServer(settingsServerRouteId).then((detail) => {
      if (!active) return;
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId((current) => current !== null && detail.channels.some((channel) => channel.id === current) ? current : detail.channels[0]?.id ?? null);
    }).catch((caught) => { if (active) setSettingsServerError(userMessage(caught)); }).finally(() => { if (active) setSettingsServerLoading(false); });
    return () => { active = false; };
  }, [serverDetail?.id, settingsServerRouteId, user]);

  useEffect(() => {
    if (user === null) return;
    void queryClient.invalidateQueries({ queryKey: homeDashboardQueryKey(user.id), refetchType: screen === 'home' ? 'active' : 'none' });
  }, [connection?.channelId, homePresenceRevision, homeServersRevision, queryClient, screen, user?.id]);

  const playVoiceCue = useCallback((cue: VoiceCue): void => {
    if (presence?.preference === 'do_not_disturb') return;
    voiceCuePlayerRef.current ??= new VoiceCuePlayer();
    voiceCuePlayerRef.current.play(cue, settings.outputDeviceId);
  }, [presence?.preference, settings.outputDeviceId]);

  const updateUser = (next: PublicUser | null): void => {
    userRef.current = next;
    setUser(next);
  };
  const loadPresence = useCallback(() => apiClient.getPresence(), []);
  const updatePresenceSettings = useCallback((input: Parameters<typeof apiClient.updatePresence>[0]) => apiClient.updatePresence(input), []);
  const loadPrivacySettings = useCallback(() => apiClient.getPrivacySettings(), []);
  const updatePrivacySettings = useCallback((input: Parameters<typeof apiClient.updatePrivacySettings>[0]) => apiClient.updatePrivacySettings(input), []);

  useEffect(() => {
    if (user === null) {
      setPresence(null);
      return undefined;
    }
    let active = true;
    let inFlight = false;
    const recordActivity = (): void => { lastUserActivityRef.current = Date.now(); };
    const heartbeat = (): void => {
      if (inFlight) return;
      inFlight = true;
      const idle = Date.now() - lastUserActivityRef.current >= 5 * 60 * 1_000;
      void apiClient.heartbeatPresence(idle).then((next) => { if (active) setPresence(next); }).catch(() => undefined).finally(() => { inFlight = false; });
    };
    window.addEventListener('pointerdown', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity);
    window.addEventListener('focus', recordActivity);
    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('focus', recordActivity);
    };
  }, [user?.id]);

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
    const unsubscribe = window.desktop.onDeepLink((inviteToken) => {
      const parsed = inviteTokenSchema.safeParse(inviteToken);
      if (!parsed.success) return;
      setPendingInviteToken(parsed.data);
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
    if (connection === null) {
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
      return;
    }
    if (participantConnectionRef.current !== connection) {
      participantConnectionRef.current = connection;
      previousRemoteParticipantsRef.current = null;
    }
    const changes = diffRemoteParticipants(previousRemoteParticipantsRef.current, mediaSnapshot.participants);
    previousRemoteParticipantsRef.current = changes.current;
    if (changes.joined.length > 0) playVoiceCue('join');
    if (changes.left.length > 0) playVoiceCue('leave');
  }, [connection, mediaSnapshot.participants, playVoiceCue]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    let active = true;
    let inFlight = false;
    const refresh = (): void => {
      if (inFlight) return;
      inFlight = true;
      void apiClient.listServers().then((items) => { if (active) setServers(items); }).catch((caught) => { if (active) setError(userMessage(caught)); }).finally(() => { inFlight = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [realtimeRevision, screen, user]);

  useEffect(() => {
    if (!user || screen !== 'server' || serverDetail === null) return;
    let active = true;
    let inFlight = false;
    const serverId = serverDetail.id;
    const refresh = (): void => {
      if (inFlight) return;
      inFlight = true;
      void apiClient.getServer(serverId).then((detail) => {
        if (!active) return;
        setServerDetail(detail);
        setActiveChannelId((current) => current !== null && detail.channels.some((channel) => channel.id === current) ? current : detail.channels[0]?.id ?? null);
      }).catch((caught) => { if (active) setError(userMessage(caught)); }).finally(() => { inFlight = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [realtimeRevision, screen, serverDetail?.id, user]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    if (notificationUserRef.current !== user.id) {
      notificationUserRef.current = user.id;
      shownNotificationIdsRef.current.clear();
      notificationInitializedRef.current = false;
    }
    let active = true;
    const poll = (): void => {
      void Promise.all([apiClient.listNotifications(undefined, false), apiClient.listConversations()]).then(([items, conversations]) => {
        if (!active) return;
        setNotifications(items);
        const firstLoad = !notificationInitializedRef.current;
        notificationInitializedRef.current = true;
        const fresh = firstLoad ? [] : items.filter((notification) => !shownNotificationIdsRef.current.has(notification.id));
        for (const notification of items) shownNotificationIdsRef.current.add(notification.id);
        for (const notification of fresh) {
          if (presence?.preference === 'do_not_disturb') continue;
          const conversation = notification.conversationId ? conversations.find((item) => item.id === notification.conversationId) : null;
          const preview = typeof notification.payload.preview === 'string' ? notification.payload.preview : 'Новое событие';
          if (settings.messageSoundsEnabled) playVoiceCue('message');
          if (settings.desktopNotificationsEnabled && (!document.hasFocus() || document.visibilityState !== 'visible') && conversation?.serverId && conversation.channelId) {
            void window.desktop.showMessageNotification({
              id: notification.id,
              title: notification.type === 'mention' ? `Вас упомянули · #${conversation.title}` : notification.type === 'reply' ? `Ответ · #${conversation.title}` : `Новое сообщение · #${conversation.title}`,
              body: preview.slice(0, 700),
              serverId: conversation.serverId,
              channelId: conversation.channelId,
              silent: true,
            }).catch(() => undefined);
          }
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [playVoiceCue, presence?.preference, realtimeRevision, screen, settings.desktopNotificationsEnabled, settings.messageSoundsEnabled, user]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    let active = true;
    void apiClient.getUnreadSummary().then((summary) => {
      if (!active) return;
      setUnreadSummary(summary);
      const counts = new Map(summary.conversations.map((item) => [item.conversationId, item]));
      setServerDetail((current) => current === null ? current : { ...current, channels: current.channels.map((channel) => {
        const unread = counts.get(channel.id);
        return unread ? { ...channel, unreadCount: unread.unreadCount, mentionCount: unread.mentionCount } : channel;
      }) });
      setDirectConversations((current) => current.map((conversation) => {
        const unread = counts.get(conversation.id);
        return unread ? { ...conversation, unreadCount: unread.unreadCount } : conversation;
      }));
    }).catch((caught) => { if (active) setError(userMessage(caught)); });
    return () => { active = false; };
  }, [realtimeRevision, screen, user]);

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
      void Promise.all([apiClient.listDirectConversations(), apiClient.listConversations()]).then(([legacy, canonical]) => {
        if (!active) return;
        const items = mergeDirectSummaries(legacy, canonical);
        setDirectConversations(items);
        if (screen === 'direct') setActiveDirectConversationId((current) => current !== null && items.some((conversation) => conversation.id === current) ? current : items[0]?.id ?? null);
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [realtimeRevision, screen, user]);

  useEffect(() => {
    if (!user || screen !== 'direct') return;
    let active = true;
    void apiClient.listDirectMessageCandidates().then((items) => { if (active) setDirectCandidates(items); }).catch((caught) => { if (active) setError(userMessage(caught)); });
    return () => { active = false; };
  }, [screen, user]);

  useEffect(() => {
    if (!user || screen !== 'direct' || activeDirectConversationId === null) return;
    let active = true;
    const conversationId = activeDirectConversationId;
    const refresh = (): void => {
      void apiClient.listConversationMessages(conversationId).then((page) => {
        if (!active) return;
        const items = page.items.filter((message) => message.deletedAt === null).map((message) => toDirectMessage(message, user, directConversations));
        setDirectMessages((current) => [...items, ...current.filter((message) => message.id.startsWith('optimistic_'))]);
        const latest = items.at(-1);
        if (latest) {
          if (document.visibilityState === 'visible' && document.hasFocus()) void apiClient.updateConversationReadState(conversationId, { lastDeliveredMessageId: latest.id, lastReadMessageId: latest.id }).catch((caught) => { if (active) setError(userMessage(caught)); });
          else void apiClient.updateConversationReadState(conversationId, { lastDeliveredMessageId: latest.id }).catch(() => undefined);
          setDirectConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation));
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [realtimeRevision, screen, activeDirectConversationId, user?.id]);

  useEffect(() => {
    if (!user || screen !== 'server' || !serverDetail || !activeChannelId) return;
    const channel = serverDetail.channels.find((candidate) => candidate.id === activeChannelId);
    if (channel?.type !== 'text') return;
    let active = true;
    const refresh = (): void => {
      void apiClient.listConversationMessages(channel.id).then((page) => {
        if (!active) return;
        const items = page.items.filter((message) => message.deletedAt === null).map((message) => toTextMessage(message, serverDetail, user));
        setMessages((current) => [...items, ...current.filter((message) => message.id.startsWith('optimistic_'))]);
        const latest = items.at(-1);
        if (latest) {
          if (document.visibilityState === 'visible' && document.hasFocus()) {
            void apiClient.updateConversationReadState(channel.id, { lastDeliveredMessageId: latest.id, lastReadMessageId: latest.id }).catch((caught) => { if (active) setError(userMessage(caught)); });
            setServerDetail((current) => current === null ? current : { ...current, channels: current.channels.map((item) => item.id === channel.id ? { ...item, unreadCount: 0, mentionCount: 0 } : item) });
          } else void apiClient.updateConversationReadState(channel.id, { lastDeliveredMessageId: latest.id }).catch(() => undefined);
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [realtimeRevision, screen, serverDetail?.id, activeChannelId, user?.id]);

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (pendingInviteToken === null || !user?.displayName) return;
    const inviteToken = pendingInviteToken;
    setPendingInviteToken(null);
    void run(async () => {
      const detail = await apiClient.acceptServerInvite(inviteToken);
      setServerDetail(detail);
      setServerAuditLog([]);
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setMessages([]);
      setServers(await apiClient.listServers());
      setScreen('server');
    });
  }, [pendingInviteToken, run, user?.displayName]);

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

  const openDestination = (destination: HomeDestination): void => {
    void run(async () => {
      const detail = await apiClient.getServer(destination.serverId);
      setServerDetail(detail);
      setServerAuditLog([]);
      const requestedChannel = destination.channelId && detail.channels.some((channel) => channel.id === destination.channelId) ? destination.channelId : null;
      setActiveChannelId(requestedChannel ?? detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setMessages([]);
      setScreen('server');
      if (requestedChannel) void apiClient.recordOpenedChannel(requestedChannel).catch(() => undefined);
    });
  };

  const openServer = (serverId: string): void => openDestination({ type: 'server', serverId });

  const openDirectMessages = (): void => {
    void run(async () => {
      const [legacyConversations, canonicalConversations, candidates] = await Promise.all([apiClient.listDirectConversations(), apiClient.listConversations(), apiClient.listDirectMessageCandidates()]);
      const conversations = mergeDirectSummaries(legacyConversations, canonicalConversations);
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

  const sendMessage = (replyToMessageId?: string, files: File[] = [], draftMentions: MessageMentionInput[] = []): void => {
    void run(async () => {
      if (!activeChannelId || !user || !serverDetail) return;
      const content = messageDraft.trim().length > 0 ? messageContentSchema.parse(messageDraft) : files.length > 0 ? '' : messageContentSchema.parse(messageDraft);
      const leadingCodePoints = codePointLength(messageDraft) - codePointLength(messageDraft.trimStart());
      const mentions = draftMentions.map((mention) => ({ ...mention, start: mention.start - leadingCodePoints })).filter((mention) => mention.start >= 0 && mention.start + mention.length <= codePointLength(content));
      const clientMessageId = crypto.randomUUID();
      const optimisticId = `optimistic_${clientMessageId}`;
      const replyTarget = replyToMessageId === undefined ? null : messages.find((message) => message.id === replyToMessageId) ?? null;
      const optimistic: TextMessage = {
        id: optimisticId,
        channelId: activeChannelId,
        authorUserId: user.id,
        authorDisplayName: user.displayName ?? user.email.split('@')[0] ?? 'Пользователь',
        authorPlatformRole: user.platformRole,
        content,
        mentions: mentions.map((mention) => ({ ...mention, displayName: serverDetail?.members.find((member) => member.userId === mention.userId)?.displayName ?? 'Участник' })),
        replyTo: replyTarget === null ? null : { messageId: replyTarget.id, authorUserId: replyTarget.authorUserId, authorDisplayName: replyTarget.authorDisplayName, content: replyTarget.content },
        reactions: [],
        attachments: files.map((file) => ({ id: `optimistic_${crypto.randomUUID()}`, messageId: optimisticId, fileName: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() })),
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      setMessageDraft('');
      setMessages((current) => [...current, optimistic]);
      try {
        const attachmentIds = await Promise.all(files.map((file) => apiClient.uploadConversationAttachment(file)));
        const canonical = await apiClient.createConversationMessage(activeChannelId, {
          clientMessageId,
          content,
          ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
          attachmentIds,
          mentions: mentions.map((mention) => ({ type: 'user' as const, userId: mention.userId, start: mention.start, length: mention.length })),
        });
        const created = toTextMessage(canonical, serverDetail, user);
        setMessages((current) => [...current.filter((message) => message.id !== optimisticId && message.id !== created.id), created]);
      } catch (caught) {
        setMessages((current) => current.filter((message) => message.id !== optimisticId));
        setMessageDraft(content);
        throw caught;
      }
    });
  };

  const deleteMessage = (messageId: string): void => {
    void run(async () => {
      if (!activeChannelId) return;
      await apiClient.deleteConversationMessage(activeChannelId, messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    });
  };

  const deleteAttachment = (attachmentId: string): void => {
    void run(async () => {
      if (!serverDetail || !user) return;
      const updated = toTextMessage(await apiClient.deleteConversationAttachment(attachmentId), serverDetail, user);
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const downloadAttachment = (attachmentId: string, fileName: string): void => {
    void run(async () => {
      const blob = await apiClient.downloadConversationAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const loadAttachment = useCallback((attachmentId: string): Promise<Blob> => apiClient.downloadConversationAttachment(attachmentId), []);

  const updateMessage = (messageId: string, value: string, draftMentions: MessageMentionInput[] = []): void => {
    void run(async () => {
      const content = messageContentSchema.parse(value);
      const leadingCodePoints = codePointLength(value) - codePointLength(value.trimStart());
      const mentions = draftMentions.map((mention) => ({ ...mention, start: mention.start - leadingCodePoints })).filter((mention) => mention.start >= 0 && mention.start + mention.length <= codePointLength(content));
      if (!activeChannelId || !serverDetail || !user) return;
      const canonical = await apiClient.updateConversationMessage(activeChannelId, messageId, content, mentions.map((mention) => ({ type: 'user', userId: mention.userId, start: mention.start, length: mention.length })));
      const updated = toTextMessage(canonical, serverDetail, user);
      setMessageDraft('');
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const toggleMessageReaction = (messageId: string, emoji: string): void => {
    void run(async () => {
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const active = message.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByCurrentUser !== true;
      if (!activeChannelId || !serverDetail || !user) return;
      const canonical = await apiClient.setConversationReaction(activeChannelId, messageId, emoji, active);
      const updated = toTextMessage(canonical, serverDetail, user);
      setMessages((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    });
  };

  const sendDirectMessage = (replyToMessageId?: string, files: File[] = []): void => {
    void run(async () => {
      if (activeDirectConversationId === null || !user) return;
      const content = directMessageDraft.trim().length > 0 ? messageContentSchema.parse(directMessageDraft) : files.length > 0 ? '' : messageContentSchema.parse(directMessageDraft);
      const conversationId = activeDirectConversationId;
      const clientMessageId = crypto.randomUUID();
      const optimisticId = `optimistic_${clientMessageId}`;
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
      try {
        const attachmentIds = await Promise.all(files.map((file) => apiClient.uploadConversationAttachment(file)));
        const canonical = await apiClient.createConversationMessage(conversationId, { clientMessageId, content, ...(replyToMessageId === undefined ? {} : { replyToMessageId }), attachmentIds });
        const created = toDirectMessage(canonical, user, directConversations);
        setDirectMessages((current) => [...current.filter((message) => message.id !== optimisticId && message.id !== created.id), created]);
        const [legacy, conversations] = await Promise.all([apiClient.listDirectConversations(), apiClient.listConversations()]);
        setDirectConversations(mergeDirectSummaries(legacy, conversations));
      } catch (caught) {
        setDirectMessages((current) => current.filter((message) => message.id !== optimisticId));
        setDirectMessageDraft(content);
        throw caught;
      }
    });
  };

  const updateDirectMessage = (messageId: string, value: string): void => {
    void run(async () => {
      if (!activeDirectConversationId || !user) return;
      const canonical = await apiClient.updateConversationMessage(activeDirectConversationId, messageId, messageContentSchema.parse(value));
      const updated = toDirectMessage(canonical, user, directConversations);
      setDirectMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      const [legacy, conversations] = await Promise.all([apiClient.listDirectConversations(), apiClient.listConversations()]);
      setDirectConversations(mergeDirectSummaries(legacy, conversations));
    });
  };

  const deleteDirectMessage = (messageId: string): void => {
    void run(async () => {
      if (!activeDirectConversationId) return;
      await apiClient.deleteConversationMessage(activeDirectConversationId, messageId);
      setDirectMessages((current) => current.filter((message) => message.id !== messageId));
      const [legacy, conversations] = await Promise.all([apiClient.listDirectConversations(), apiClient.listConversations()]);
      setDirectConversations(mergeDirectSummaries(legacy, conversations));
    });
  };

  const toggleDirectMessageReaction = (messageId: string, emoji: string): void => {
    void run(async () => {
      const message = directMessages.find((candidate) => candidate.id === messageId);
      if (!message) return;
      const active = message.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByCurrentUser !== true;
      if (!activeDirectConversationId || !user) return;
      const canonical = await apiClient.setConversationReaction(activeDirectConversationId, messageId, emoji, active);
      const updated = toDirectMessage(canonical, user, directConversations);
      setDirectMessages((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    });
  };

  const deleteDirectAttachment = (attachmentId: string): void => {
    void run(async () => {
      if (!user) return;
      const updated = toDirectMessage(await apiClient.deleteConversationAttachment(attachmentId), user, directConversations);
      setDirectMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    });
  };

  const downloadDirectAttachment = (attachmentId: string, fileName: string): void => {
    void run(async () => {
      const blob = await apiClient.downloadConversationAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
  };

  const loadDirectAttachment = useCallback((attachmentId: string): Promise<Blob> => apiClient.downloadConversationAttachment(attachmentId), []);

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
    if (connection !== null) playVoiceCue('leave');
    participantConnectionRef.current = null;
    previousRemoteParticipantsRef.current = null;
    await media.connect(voiceConnection, settings);
    setConnection(voiceConnection);
    setConnectedVoiceChannelName(voiceConnection.channelName ?? serverDetail?.channels.find((channel) => channel.id === voiceConnection.channelId)?.name ?? 'Голосовой канал');
    setActiveChannelId(voiceConnection.channelId);
    setScreen('server');
    playVoiceCue('join');
    await refreshDevices(true);
  };

  const connectVoiceChannel = (channelId: string): void => {
    if (voiceTransitionRef.current) return;
    voiceTransitionRef.current = true;
    void run(async () => {
      try {
        await enterVoiceChannel(await apiClient.connectVoiceChannel(channelId));
      } finally {
        voiceTransitionRef.current = false;
      }
    });
  };

  const leaveRoom = (): void => {
    void run(async () => {
      if (connection !== null) {
        playVoiceCue('leave');
        void apiClient.recordLeftVoiceChannel(connection.channelId).catch(() => undefined);
      }
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
      await media.disconnect();
      setConnection(null);
      setConnectedVoiceChannelName('');
      setScreen(serverDetail ? 'server' : userRef.current ? 'home' : 'auth');
    });
  };

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server' && screen !== 'direct')) return;
    let active = true;
    const poll = (): void => {
      if (voiceTransitionRef.current) return;
      void apiClient.pollVoiceMoveRequest().then(async (voiceConnection) => {
        if (!active || voiceConnection === null || voiceConnection.channelId === connection?.channelId) return;
        voiceTransitionRef.current = true;
        try {
          if (serverDetail?.id !== voiceConnection.serverId) {
            const detail = await apiClient.getServer(voiceConnection.serverId);
            if (!active) return;
            setServerDetail(detail);
            setServerAuditLog([]);
            setMessages([]);
          }
          if (voiceConnection.seamlesslyMoved === true && mediaSnapshot.connectionState === ConnectionState.Connected) {
            playVoiceCue('leave');
            participantConnectionRef.current = null;
            previousRemoteParticipantsRef.current = null;
            setConnection(voiceConnection);
            setConnectedVoiceChannelName(voiceConnection.channelName ?? 'Голосовой канал');
            setActiveChannelId(voiceConnection.channelId);
            setScreen('server');
            playVoiceCue('join');
          } else {
            await enterVoiceChannel(voiceConnection);
          }
        } finally {
          voiceTransitionRef.current = false;
        }
      }).catch((caught) => { if (active) setError(userMessage(caught)); });
    };
    poll();
    const timer = window.setInterval(poll, 2_500);
    return () => { active = false; window.clearInterval(timer); };
  }, [connection?.channelId, mediaSnapshot.connectionState, playVoiceCue, screen, serverDetail?.id, user]);

  const moveVoiceMember = (channelId: string, userId: string): void => {
    void run(async () => {
      await apiClient.moveVoiceMember(channelId, userId);
      await refreshServer();
    });
  };

  const logout = (): void => {
    void run(async () => {
      if (connection !== null) playVoiceCue('leave');
      participantConnectionRef.current = null;
      previousRemoteParticipantsRef.current = null;
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
      await navigate('/', { replace: true });
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
      await media.waitForPublishingReady();
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
        await media.waitForPublishingReady();
        await apiClient.heartbeatScreenShare(connection);
        await window.desktop.selectDesktopSource(source.id, shareAudio);
        await media.startScreenShare(shareAudio, source);
        await window.desktop.clearSelectedDesktopSource();
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
    if (!connection || !serverDetail) return;
    const text = `Присоединяйтесь к серверу «${serverDetail.name}»\n${serverDetail.inviteUrl}`;
    void window.desktop.copyToClipboard(text);
  };

  const updateNotificationSettings = (values: Pick<LocalSettings, 'desktopNotificationsEnabled' | 'messageSoundsEnabled'>): void => {
    const next = { ...settings, ...values };
    setSettings(next);
    void window.desktop.updateLocalSettings(next).catch((caught) => setError(userMessage(caught)));
  };
  const handleCurrentSessionRevoked = (): void => {
    updateUser(null);
    void navigate('/', { replace: true });
    setScreen('auth');
  };
  const renderSecurityPanel = (): ReactNode => user && securityOpen ? <SecurityCenter dndActive={presence?.preference === 'do_not_disturb'} open user={user} settings={settings} onSettingsChange={updateNotificationSettings} onClose={() => setSecurityOpen(false)} onUserChange={updateUser} onCurrentSessionRevoked={handleCurrentSessionRevoked} /> : null;
  const withUpdateStatus = (content: ReactNode): ReactNode => <>{content}<UpdateStatus state={updateState} onInstall={() => void window.desktop.installUpdate().catch((caught) => setError(userMessage(caught)))} /></>;
  const directUnreadCount = unreadSummary?.totalDirectUnread ?? directConversations.reduce((count, conversation) => count + conversation.unreadCount, 0);
  const localInputLevel = connection === null ? undefined : mediaSnapshot.participants.find((participant) => participant.isLocal)?.audioLevel;
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
  const voiceConnectionPanel = connection ? <VoiceConnectionPanel canShare={connection.canStream !== false && mediaSnapshot.connectionState === ConnectionState.Connected} channelName={connectedVoiceChannelName} snapshot={mediaSnapshot} onLeave={leaveRoom} onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))} onOpen={openConnectedVoice} onShare={showSourcePicker} /> : undefined;
  const openUserSettings = (): void => {
    if (!featureFlags.userSettingsPage) {
      setSecurityOpen(true);
      return;
    }
    settingsReturnScreenRef.current = screen;
    void navigate(userSettingsPath());
  };
  const openServerSettings = (section: ServerSettingsSection = 'overview'): void => {
    if (!featureFlags.serverSettingsPage || serverDetail === null) return;
    settingsReturnScreenRef.current = 'server';
    void navigate(serverSettingsPath(serverDetail.id, section));
  };
  const closeSettings = (): void => {
    const returnScreen = settingsRoute?.kind === 'server' && serverDetail?.id === settingsRoute.serverId ? 'server' : settingsReturnScreenRef.current;
    void navigate('/', { replace: true });
    setScreen(returnScreen === 'boot' || returnScreen === 'auth' || returnScreen === 'profile' ? 'home' : returnScreen);
  };
  const leaveSettingsForHome = (): void => {
    void navigate('/', { replace: true });
    setScreen('home');
  };
  const leaveSettingsForDirectMessages = (): void => {
    void navigate('/', { replace: true });
    openDirectMessages();
  };
  const leaveSettingsForServer = (serverId: string): void => {
    void navigate('/', { replace: true });
    openServer(serverId);
  };

  if (screen === 'boot') return withUpdateStatus(<main className="bootScreen"><div className="pulseLogo"><span /></div><span>Подключаем «Ватрушку»…</span></main>);
  if (screen === 'auth') return withUpdateStatus(<AuthPanel mode={authMode} stage={authStage} factor={secondFactor} totpAvailable={totpAvailable} email={email} code={otp} password={password} passwordConfirmation={passwordConfirmation} retrySeconds={retrySeconds} busy={busy} error={error} onMode={(mode) => { setAuthMode(mode); setAuthStage('credentials'); setOtp(''); setError(null); }} onEmailChange={setEmail} onCodeChange={setOtp} onPasswordChange={setPasswordValue} onPasswordConfirmationChange={setPasswordConfirmation} onRequest={requestCode} onVerify={verifyCode} onFactor={switchPasswordFactor} onBack={() => { setAuthStage('credentials'); setOtp(''); setError(null); }} />);
  if (screen === 'profile') return withUpdateStatus(<ProfilePanel value={displayName} busy={busy} error={error} onChange={setDisplayName} onSave={saveProfile} />);
  if (settingsRoute !== null && user !== null && (settingsRoute.kind === 'user' ? featureFlags.userSettingsPage : featureFlags.serverSettingsPage)) return withUpdateStatus(
    <Suspense fallback={<main className="bootScreen"><div className="pulseLogo"><span /></div><span>Открываем настройки…</span></main>}>
      <SettingsRoutePage
        busy={busy}
        devices={devices}
        directUnreadCount={directUnreadCount}
        error={settingsRoute.kind === 'server' ? settingsServerError : null}
        inputLevel={localInputLevel ?? 0}
        loading={settingsRoute.kind === 'server' && (settingsServerLoading || serverDetail?.id !== settingsRoute.serverId && settingsServerError === null)}
        microphoneId={settings.microphoneDeviceId}
        onBack={closeSettings}
        onCreateServer={leaveSettingsForHome}
        onCurrentSessionRevoked={handleCurrentSessionRevoked}
        onDirectMessages={leaveSettingsForDirectMessages}
        onHome={leaveSettingsForHome}
        onMicrophone={(deviceId) => persistDevice('microphoneDeviceId', deviceId)}
        onNavigate={(path) => { void navigate(path); }}
        onNotificationSettingsChange={updateNotificationSettings}
        onOpenServer={leaveSettingsForServer}
        onOutput={(deviceId) => persistDevice('outputDeviceId', deviceId)}
        onRefreshDevices={() => { void run(() => refreshDevices(true)); }}
        onTestOutput={() => playVoiceCue('message')}
        onLoadPresence={loadPresence}
        onLoadPrivacy={loadPrivacySettings}
        onPresenceChange={setPresence}
        onUpdatePresence={updatePresenceSettings}
        onUpdatePrivacy={updatePrivacySettings}
        onUpdateProfile={(name) => apiClient.updateProfile(name)}
        onUserChange={updateUser}
        outputId={settings.outputDeviceId}
        presence={presence}
        presenceEnabled={featureFlags.presenceStatuses}
        route={settingsRoute}
        server={serverDetail?.id === (settingsRoute.kind === 'server' ? settingsRoute.serverId : '') ? serverDetail : null}
        servers={servers}
        settings={settings}
        user={user}
        voiceConnected={connection !== null}
      />
    </Suspense>,
  );
  if (screen === 'home' && user) return withUpdateStatus(<><HomePage user={user} version={version} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} inputLevel={localInputLevel} busy={busy} error={error} servers={servers} serverName={serverName} directUnreadCount={directUnreadCount} connection={connection} dashboard={homeDashboardQuery.data} dashboardLoading={homeDashboardQuery.isFetching && homeDashboardQuery.data === undefined} dashboardError={homeDashboardQuery.error ? userMessage(homeDashboardQuery.error) : null} onRetryDashboard={() => void homeDashboardQuery.refetch()} onLogout={logout} onSecurity={openUserSettings} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onRefreshDevices={() => void run(() => refreshDevices(true))} onTestOutput={() => playVoiceCue('message')} onServerName={setServerName} onCreateServer={createServer} onOpenServer={openServer} onOpenDestination={openDestination} onReturnToCall={openConnectedVoice} onDirectMessages={openDirectMessages} onCopyInvite={(inviteUrl) => window.desktop.copyToClipboard(inviteUrl)} />{renderSecurityPanel()}</>);
  if (screen === 'server' && user && serverDetail) return withUpdateStatus(<><ServerView user={user} server={serverDetail} servers={servers} activeChannelId={activeChannelId} messages={messages} messageDraft={messageDraft} serverName={serverName} busy={busy} error={error} auditLog={serverAuditLog} directUnreadCount={directUnreadCount} connectedVoiceChannelId={connection?.serverId === serverDetail.id ? connection.channelId : undefined} connectedVoiceServerId={connection?.serverId} voiceStage={voiceStage} voiceConnectionPanel={voiceConnectionPanel} onBack={() => setScreen('home')} onDirectMessages={openDirectMessages} onSwitchServer={openServer} onChannel={(channelId) => { setActiveChannelId(channelId); setMessages([]); setError(null); void apiClient.recordOpenedChannel(channelId).catch(() => undefined); }} onMessageDraft={setMessageDraft} onSendMessage={sendMessage} onUpdateMessage={updateMessage} onMessageReaction={toggleMessageReaction} onDeleteMessage={deleteMessage} onDeleteAttachment={deleteAttachment} onDownloadAttachment={downloadAttachment} onLoadAttachment={loadAttachment} onConnectVoice={connectVoiceChannel} onMoveVoiceMember={moveVoiceMember} onCopyInvite={() => window.desktop.copyToClipboard(serverDetail.inviteUrl)} onCreateChannel={createCommunityChannel} onDeleteChannel={deleteCommunityChannel} onCreateRole={createCommunityRole} onUpdateRole={updateCommunityRole} onDeleteRole={deleteCommunityRole} onReorderRole={reorderCommunityRole} onAssignRoles={assignCommunityRoles} onSetChannelOverwrite={setCommunityChannelOverwrite} onLoadAudit={loadServerAuditLog} onKickMember={kickCommunityMember} onServerName={setServerName} onCreateServer={createServer} onSecurity={openUserSettings} {...(featureFlags.serverSettingsPage ? { onServerSettings: () => openServerSettings('roles') } : {})} onLogout={logout} />{sources && <SourcePicker audioAllowed={connection?.canStreamApplicationAudio !== false} audioProtectionAvailable={supportsOwnAudioExclusion()} busy={busy} sources={sources} includeAudio={includeAudio} platform={platform} onAudio={setIncludeAudio} onSelect={selectSource} onCancel={cancelSourcePicker} />}{renderSecurityPanel()}</>);
  if (screen === 'direct' && user) return withUpdateStatus(<><DirectMessagesView user={user} servers={servers} conversations={directConversations} candidates={directCandidates} activeConversationId={activeDirectConversationId} messages={directMessages} messageDraft={directMessageDraft} serverName={serverName} busy={busy} error={error} onHome={() => setScreen('home')} onSwitchServer={openServer} onConversation={selectDirectConversation} onCreateConversation={createDirectConversation} onMessageDraft={setDirectMessageDraft} onSendMessage={sendDirectMessage} onUpdateMessage={updateDirectMessage} onMessageReaction={toggleDirectMessageReaction} onDeleteMessage={deleteDirectMessage} onDeleteAttachment={deleteDirectAttachment} onDownloadAttachment={downloadDirectAttachment} onLoadAttachment={loadDirectAttachment} onServerName={setServerName} onCreateServer={createServer} onSecurity={openUserSettings} onLogout={logout} />{renderSecurityPanel()}</>);
  return withUpdateStatus(<main className="bootScreen"><span>Не удалось открыть экран</span><button className="secondaryButton" onClick={() => setScreen(user ? 'home' : 'auth')}>Вернуться</button></main>);
}

function supportsOwnAudioExclusion(): boolean {
  const constraints = navigator.mediaDevices.getSupportedConstraints?.() as (MediaTrackSupportedConstraints & { restrictOwnAudio?: boolean }) | undefined;
  return constraints?.restrictOwnAudio === true;
}

function userMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
