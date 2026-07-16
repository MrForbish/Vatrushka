import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';

import { channelNameSchema, displayNameSchema, messageContentSchema, passwordSchema, roleNameSchema, roomCodeSchema, serverInviteCodeSchema, serverNameSchema, type DesktopSourceInfo, type LocalSettings, type PublicUser, type RoomConnection, type ServerDetail, type ServerPermission, type ServerSummary, type TextMessage, type TwoFactorSetup } from '@vatrushka/shared';

import { apiClient, ClientError } from './api.js';
import { AuthPanel, GuestJoinPanel, HomePanel, InvitePanel, ProfilePanel, RoomView, SecurityPanel, SourcePicker } from './components.js';
import { ServerView } from './features/servers/index.js';
import { MediaSession } from './media.js';

type Screen = 'boot' | 'auth' | 'profile' | 'home' | 'server' | 'invite' | 'guest' | 'room';
const media = new MediaSession(apiClient);

export default function App(): ReactNode {
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<PublicUser | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<'password' | 'email' | 'register'>('password');
  const [authStage, setAuthStage] = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPasswordValue] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [secondFactor, setSecondFactor] = useState<'email' | 'totp'>('email');
  const [totpAvailable, setTotpAvailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const pendingCodeRef = useRef<string | null>(null);
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [settings, setSettings] = useState<LocalSettings>({ volume: 1 });
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [version, setVersion] = useState('0.1.0');
  const [platform, setPlatform] = useState('win32');
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [sources, setSources] = useState<DesktopSourceInfo[] | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [serverDetail, setServerDetail] = useState<ServerDetail | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [serverName, setServerName] = useState('');
  const [serverInvite, setServerInvite] = useState('');
  const [securityStage, setSecurityStage] = useState<'overview' | 'password' | 'totp-enable' | 'totp-disable'>('overview');
  const [securityCode, setSecurityCode] = useState('');
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityPasswordConfirmation, setSecurityPasswordConfirmation] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorQr, setTwoFactorQr] = useState<string | null>(null);
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
      setDevices({ inputs: all.filter((device) => device.kind === 'audioinput'), outputs: all.filter((device) => device.kind === 'audiooutput') });
    } catch (caught) {
      if (requestPermission) throw new Error('Не удалось получить доступ к аудиоустройствам. Проверьте разрешение на микрофон в Windows.', { cause: caught });
      setDevices({ inputs: [], outputs: [] });
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.onDeepLink((code) => {
      pendingCodeRef.current = code;
      setPendingCode(code);
      setRoomCode(code);
      setError(null);
      setScreen('invite');
    });
    void Promise.all([window.desktop.getAppVersion(), window.desktop.getPlatform(), window.desktop.getLocalSettings(), apiClient.restoreSession()])
      .then(([appVersion, currentPlatform, localSettings, restoredUser]) => {
        if (!active) return;
        setVersion(appVersion);
        setPlatform(currentPlatform);
        setSettings(localSettings);
        updateUser(restoredUser);
        if (pendingCodeRef.current) setScreen('invite');
        else setScreen(restoredUser ? (restoredUser.displayName ? 'home' : 'profile') : 'auth');
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
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => setRetrySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

  useEffect(() => {
    if (!user || (screen !== 'home' && screen !== 'server')) return;
    let active = true;
    void apiClient.listServers().then((items) => { if (active) setServers(items); }).catch((caught) => { if (active) setError(userMessage(caught)); });
    return () => { active = false; };
  }, [screen, user]);

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
      } else if (authMode === 'password') {
        const validPassword = passwordSchema.parse(password);
        const challenge = await apiClient.beginPasswordLogin(email, validPassword, authStage === 'otp' ? secondFactor : 'auto');
        response = challenge;
        setSecondFactor(challenge.factor);
        setTotpAvailable(challenge.factor === 'totp');
      } else {
        response = await apiClient.requestCode(email);
        setSecondFactor('email');
      }
      setRetrySeconds(response.retryAfterSeconds);
      setAuthStage('otp');
    });
  };

  const verifyCode = (): void => {
    void run(async () => {
      const response = authMode === 'register'
        ? await apiClient.verifyRegistration(email, otp)
        : authMode === 'password'
          ? await apiClient.completePasswordLogin(email, password, otp, secondFactor)
          : await apiClient.verifyCode(email, otp);
      updateUser(response.user);
      if (!response.user.displayName) setScreen('profile');
      else setScreen(pendingCode ? 'invite' : 'home');
    });
  };

  const switchPasswordFactor = (factor: 'email' | 'totp'): void => {
    void run(async () => {
      const challenge = await apiClient.beginPasswordLogin(email, password, factor);
      setSecondFactor(challenge.factor);
      setRetrySeconds(challenge.retryAfterSeconds);
      setOtp('');
    });
  };

  const resetSecurity = (): void => {
    setSecurityStage('overview');
    setSecurityCode('');
    setSecurityPassword('');
    setSecurityPasswordConfirmation('');
    setTwoFactorSetup(null);
    setTwoFactorQr(null);
    setError(null);
  };

  const startPasswordSetup = (): void => {
    void run(async () => {
      const response = await apiClient.requestPasswordSetup();
      setRetrySeconds(response.retryAfterSeconds);
      setSecurityStage('password');
    });
  };

  const savePassword = (): void => {
    void run(async () => {
      const validPassword = passwordSchema.parse(securityPassword);
      if (validPassword !== securityPasswordConfirmation) throw new Error('Пароли не совпадают');
      updateUser(await apiClient.setPassword(securityCode, validPassword));
      resetSecurity();
    });
  };

  const startTwoFactorSetup = (): void => {
    void run(async () => {
      const setup = await apiClient.beginTwoFactorSetup();
      setTwoFactorSetup(setup);
      setTwoFactorQr(await QRCode.toDataURL(setup.otpauthUri, { width: 220, margin: 1, color: { dark: '#1b1110', light: '#fff8f0' } }));
      setSecurityStage('totp-enable');
    });
  };

  const enableTwoFactor = (): void => {
    void run(async () => {
      updateUser(await apiClient.enableTwoFactor(securityCode));
      resetSecurity();
    });
  };

  const disableTwoFactor = (): void => {
    void run(async () => {
      updateUser(await apiClient.disableTwoFactor(securityCode));
      resetSecurity();
    });
  };

  const saveProfile = (): void => {
    void run(async () => {
      const name = displayNameSchema.parse(displayName);
      const updated = await apiClient.updateProfile(name);
      updateUser(updated);
      setScreen(pendingCode ? 'invite' : 'home');
    });
  };

  const openServer = (serverId: string): void => {
    void run(async () => {
      const detail = await apiClient.getServer(serverId);
      setServerDetail(detail);
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setMessages([]);
      setScreen('server');
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
      setActiveChannelId(detail.channels.find((channel) => channel.type === 'text')?.id ?? detail.channels[0]?.id ?? null);
      setServerInvite('');
      setServers(await apiClient.listServers());
      setScreen('server');
    });
  };

  const sendMessage = (replyToMessageId?: string): void => {
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
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      setMessageDraft('');
      setMessages((current) => [...current, optimistic]);
      try {
        const sent = await apiClient.createMessage(activeChannelId, content, replyToMessageId);
        setMessages((current) => [...current.filter((message) => message.id !== optimisticId && message.id !== sent.id), sent]);
      } catch (caught) {
        setMessages((current) => current.filter((message) => message.id !== optimisticId));
        setMessageDraft(content);
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

  const assignCommunityRoles = (userId: string, roleIds: string[]): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.assignServerMemberRoles(serverDetail.id, userId, roleIds);
      await refreshServer();
    });
  };

  const kickCommunityMember = (userId: string): void => {
    void run(async () => {
      if (!serverDetail) return;
      await apiClient.kickServerMember(serverDetail.id, userId);
      await refreshServer();
    });
  };

  const enterRoom = async (room: RoomConnection): Promise<void> => {
    await media.connect(room, settings);
    setConnection(room);
    setRoomCode(room.code);
    const nextSettings = room.contextType === 'channel' ? { ...settings } : { ...settings, lastRoomCode: room.code };
    setSettings(nextSettings);
    await window.desktop.updateLocalSettings(nextSettings);
    setScreen('room');
    await refreshDevices();
  };

  const createRoom = (): void => { void run(async () => enterRoom(await apiClient.createRoom())); };
  const connectVoiceChannel = (channelId: string): void => { void run(async () => enterRoom(await apiClient.connectVoiceChannel(channelId))); };
  const joinRoom = (code = roomCode): void => {
    void run(async () => {
      const normalized = roomCodeSchema.parse(code);
      await enterRoom(await apiClient.joinRoom(normalized));
      pendingCodeRef.current = null;
      setPendingCode(null);
    });
  };
  const joinGuest = (): void => {
    void run(async () => {
      const code = roomCodeSchema.parse(pendingCode ?? roomCode);
      const name = displayNameSchema.parse(guestName);
      await enterRoom(await apiClient.joinGuest(code, name));
      pendingCodeRef.current = null;
      setPendingCode(null);
    });
  };

  const leaveRoom = (): void => {
    void run(async () => {
      const returnToServer = connection?.contextType === 'channel' && serverDetail;
      await media.disconnect();
      setConnection(null);
      setScreen(returnToServer ? 'server' : userRef.current ? 'home' : 'auth');
    });
  };

  const logout = (): void => {
    void run(async () => {
      await media.disconnect();
      await apiClient.logout();
      updateUser(null);
      setConnection(null);
      setServerDetail(null);
      setServers([]);
      setAuthStage('credentials');
      setOtp('');
      setScreen('auth');
    });
  };

  const persistDevice = (key: 'microphoneDeviceId' | 'outputDeviceId', value: string): void => {
    const deviceId = value === 'default' ? undefined : value;
    const next = { ...settings };
    if (deviceId) next[key] = deviceId; else delete next[key];
    setSettings(next);
    void window.desktop.updateLocalSettings(next);
    if (screen === 'room') {
      void run(() => key === 'microphoneDeviceId' ? media.switchMicrophone(value) : media.switchOutput(value));
    }
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
      setSources(null);
      try {
        await window.desktop.selectDesktopSource(source.id, includeAudio);
        await media.startScreenShare(includeAudio);
      } catch (caught) {
        await window.desktop.clearSelectedDesktopSource();
        await apiClient.releaseScreenShare(connection);
        throw caught;
      }
    });
  };

  const copyInvite = (): void => {
    if (!connection) return;
    const text = connection.contextType === 'channel'
      ? `Присоединяйтесь к серверу «${serverDetail?.name ?? 'Ватрушка'}»\nКод приглашения: ${connection.code}\nОткройте «Ватрушку» и введите этот код в разделе серверов.`
      : `Присоединяйтесь к голосовой комнате «Ватрушка»\nКод: ${connection.code}\nСсылка: vatrushka://join/${connection.code}\nОткройте ссылку в приложении или введите код вручную.`;
    void window.desktop.copyToClipboard(text);
  };

  const renderSecurityPanel = (): ReactNode => user && securityOpen ? <SecurityPanel user={user} stage={securityStage} code={securityCode} password={securityPassword} passwordConfirmation={securityPasswordConfirmation} setup={twoFactorSetup} qrDataUrl={twoFactorQr} busy={busy} error={error} onCode={setSecurityCode} onPassword={setSecurityPassword} onPasswordConfirmation={setSecurityPasswordConfirmation} onStartPassword={startPasswordSetup} onSavePassword={savePassword} onStartTwoFactor={startTwoFactorSetup} onEnableTwoFactor={enableTwoFactor} onAskDisable={() => { setSecurityCode(''); setSecurityStage('totp-disable'); }} onDisableTwoFactor={disableTwoFactor} onBack={resetSecurity} onClose={() => { resetSecurity(); setSecurityOpen(false); }} /> : null;

  if (screen === 'boot') return <main className="bootScreen"><div className="pulseLogo"><span /></div><span>Подключаем «Ватрушку»…</span></main>;
  if (screen === 'auth') return <AuthPanel mode={authMode} stage={authStage} factor={secondFactor} totpAvailable={totpAvailable} email={email} code={otp} password={password} passwordConfirmation={passwordConfirmation} retrySeconds={retrySeconds} busy={busy} error={error} onMode={(mode) => { setAuthMode(mode); setAuthStage('credentials'); setOtp(''); setError(null); }} onEmailChange={setEmail} onCodeChange={setOtp} onPasswordChange={setPasswordValue} onPasswordConfirmationChange={setPasswordConfirmation} onRequest={requestCode} onVerify={verifyCode} onFactor={switchPasswordFactor} onBack={() => { setAuthStage('credentials'); setOtp(''); setError(null); }} />;
  if (screen === 'profile') return <ProfilePanel value={displayName} busy={busy} error={error} onChange={setDisplayName} onSave={saveProfile} />;
  if (screen === 'invite' && pendingCode) return <InvitePanel code={pendingCode} authenticated={Boolean(user)} error={error} busy={busy} onJoin={() => joinRoom(pendingCode)} onLogin={() => setScreen('auth')} onGuest={() => setScreen('guest')} onBack={() => setScreen(user ? 'home' : 'auth')} />;
  if (screen === 'guest' && pendingCode) return <GuestJoinPanel code={pendingCode} name={guestName} busy={busy} error={error} onName={setGuestName} onJoin={joinGuest} onBack={() => setScreen('invite')} />;
  if (screen === 'home' && user) return <><HomePanel user={user} version={version} roomCode={roomCode} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} busy={busy} error={error} servers={servers} serverName={serverName} serverInvite={serverInvite} onRoomCode={setRoomCode} onCreate={createRoom} onJoin={() => joinRoom()} onLogout={logout} onSecurity={() => { resetSecurity(); setSecurityOpen(true); }} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onRefreshDevices={() => void run(() => refreshDevices(true))} onServerName={setServerName} onServerInvite={setServerInvite} onCreateServer={createServer} onJoinServer={joinServer} onOpenServer={openServer} />{renderSecurityPanel()}</>;
  if (screen === 'server' && user && serverDetail) return <><ServerView user={user} server={serverDetail} servers={servers} activeChannelId={activeChannelId} messages={messages} messageDraft={messageDraft} serverName={serverName} serverInvite={serverInvite} busy={busy} error={error} onBack={() => setScreen('home')} onSwitchServer={openServer} onChannel={(channelId) => { setActiveChannelId(channelId); setMessages([]); setError(null); }} onMessageDraft={setMessageDraft} onSendMessage={sendMessage} onUpdateMessage={updateMessage} onMessageReaction={toggleMessageReaction} onDeleteMessage={deleteMessage} onConnectVoice={connectVoiceChannel} onCopyInvite={() => void window.desktop.copyToClipboard(`Присоединяйтесь к серверу «${serverDetail.name}»\nКод приглашения: ${serverDetail.inviteCode}`)} onCreateChannel={createCommunityChannel} onDeleteChannel={deleteCommunityChannel} onCreateRole={createCommunityRole} onAssignRoles={assignCommunityRoles} onKickMember={kickCommunityMember} onServerName={setServerName} onServerInvite={setServerInvite} onCreateServer={createServer} onJoinServer={joinServer} onSecurity={() => { resetSecurity(); setSecurityOpen(true); }} onLogout={logout} />{renderSecurityPanel()}</>;
  if (screen === 'room' && connection) return <><RoomView connection={connection} snapshot={mediaSnapshot} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} locked={locked} busy={busy} error={error} onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))} onShare={showSourcePicker} onCopy={copyInvite} onLeave={leaveRoom} onLock={() => void run(async () => { const result = await apiClient.setRoomLock(connection.roomId, !locked); setLocked(result.isLocked); })} onClose={() => void run(async () => { await apiClient.closeRoom(connection.roomId); await media.disconnect(false); setConnection(null); setScreen('home'); })} onKick={(identity) => void run(() => apiClient.kickMediaParticipant(connection, identity))} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onStartAudio={() => void media.startAudio()} onScreenAudioMute={() => media.setScreenShareAudioMuted(!mediaSnapshot.screenShareAudioMuted)} onScreenAudioVolume={setScreenShareVolume} />{sources && <SourcePicker sources={sources} includeAudio={includeAudio} platform={platform} onAudio={setIncludeAudio} onSelect={selectSource} onCancel={cancelSourcePicker} />}</>;
  return <main className="bootScreen"><span>Не удалось открыть экран</span><button className="secondaryButton" onClick={() => setScreen(user ? 'home' : 'auth')}>Вернуться</button></main>;
}

function userMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
