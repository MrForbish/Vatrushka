import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { displayNameSchema, roomCodeSchema, type DesktopSourceInfo, type LocalSettings, type PublicUser, type RoomConnection } from '@vatrushka/shared';

import { apiClient, ClientError } from './api.js';
import { AuthPanel, GuestJoinPanel, HomePanel, InvitePanel, ProfilePanel, RoomView, SourcePicker } from './components.js';
import { MediaSession } from './media.js';

type Screen = 'boot' | 'auth' | 'profile' | 'home' | 'invite' | 'guest' | 'room';
const media = new MediaSession(apiClient);

export default function App(): ReactNode {
  const [screen, setScreen] = useState<Screen>('boot');
  const [user, setUser] = useState<PublicUser | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  const [authStage, setAuthStage] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
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
  const mediaSnapshot = useSyncExternalStore(media.subscribe, media.getSnapshot, media.getSnapshot);

  const updateUser = (next: PublicUser | null): void => {
    userRef.current = next;
    setUser(next);
  };

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({ inputs: all.filter((device) => device.kind === 'audioinput'), outputs: all.filter((device) => device.kind === 'audiooutput') });
    } catch {
      setDevices({ inputs: [], outputs: [] });
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
      const response = await apiClient.requestCode(email);
      setRetrySeconds(response.retryAfterSeconds);
      setAuthStage('otp');
    });
  };

  const verifyCode = (): void => {
    void run(async () => {
      const response = await apiClient.verifyCode(email, otp);
      updateUser(response.user);
      if (!response.user.displayName) setScreen('profile');
      else setScreen(pendingCode ? 'invite' : 'home');
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

  const enterRoom = async (room: RoomConnection): Promise<void> => {
    await media.connect(room, settings);
    setConnection(room);
    setRoomCode(room.code);
    const nextSettings = { ...settings, lastRoomCode: room.code };
    setSettings(nextSettings);
    await window.desktop.updateLocalSettings(nextSettings);
    setScreen('room');
    await refreshDevices();
  };

  const createRoom = (): void => { void run(async () => enterRoom(await apiClient.createRoom())); };
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
      await media.disconnect();
      setConnection(null);
      setScreen(userRef.current ? 'home' : 'auth');
    });
  };

  const logout = (): void => {
    void run(async () => {
      await media.disconnect();
      await apiClient.logout();
      updateUser(null);
      setConnection(null);
      setAuthStage('email');
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
    const text = `Присоединяйтесь к голосовой комнате «Ватрушка»\nКод: ${connection.code}\nСсылка: vatrushka://join/${connection.code}\nОткройте ссылку в приложении или введите код вручную.`;
    void window.desktop.copyToClipboard(text);
  };

  if (screen === 'boot') return <main className="bootScreen"><div className="pulseLogo"><span /></div><span>Подключаем «Ватрушку»…</span></main>;
  if (screen === 'auth') return <AuthPanel stage={authStage} email={email} code={otp} retrySeconds={retrySeconds} busy={busy} error={error} onEmailChange={setEmail} onCodeChange={setOtp} onRequest={requestCode} onVerify={verifyCode} onBack={() => { setAuthStage('email'); setError(null); }} />;
  if (screen === 'profile') return <ProfilePanel value={displayName} busy={busy} error={error} onChange={setDisplayName} onSave={saveProfile} />;
  if (screen === 'invite' && pendingCode) return <InvitePanel code={pendingCode} authenticated={Boolean(user)} error={error} busy={busy} onJoin={() => joinRoom(pendingCode)} onLogin={() => setScreen('auth')} onGuest={() => setScreen('guest')} onBack={() => setScreen(user ? 'home' : 'auth')} />;
  if (screen === 'guest' && pendingCode) return <GuestJoinPanel code={pendingCode} name={guestName} busy={busy} error={error} onName={setGuestName} onJoin={joinGuest} onBack={() => setScreen('invite')} />;
  if (screen === 'home' && user) return <HomePanel user={user} version={version} roomCode={roomCode} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} busy={busy} error={error} onRoomCode={setRoomCode} onCreate={createRoom} onJoin={() => joinRoom()} onLogout={logout} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} />;
  if (screen === 'room' && connection) return <><RoomView connection={connection} snapshot={mediaSnapshot} devices={devices} microphoneId={settings.microphoneDeviceId} outputId={settings.outputDeviceId} locked={locked} busy={busy} error={error} onMute={() => void run(() => media.setMuted(!mediaSnapshot.isMuted))} onShare={showSourcePicker} onCopy={copyInvite} onLeave={leaveRoom} onLock={() => void run(async () => { const result = await apiClient.setRoomLock(connection.roomId, !locked); setLocked(result.isLocked); })} onClose={() => void run(async () => { await apiClient.closeRoom(connection.roomId); await media.disconnect(false); setConnection(null); setScreen('home'); })} onKick={(identity) => void run(() => apiClient.kickParticipant(connection.roomId, identity))} onMicrophone={(value) => persistDevice('microphoneDeviceId', value)} onOutput={(value) => persistDevice('outputDeviceId', value)} onStartAudio={() => void media.startAudio()} />{sources && <SourcePicker sources={sources} includeAudio={includeAudio} platform={platform} onAudio={setIncludeAudio} onSelect={selectSource} onCancel={cancelSourcePicker} />}</>;
  return <main className="bootScreen"><span>Не удалось открыть экран</span><button className="secondaryButton" onClick={() => setScreen(user ? 'home' : 'auth')}>Вернуться</button></main>;
}

function userMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
