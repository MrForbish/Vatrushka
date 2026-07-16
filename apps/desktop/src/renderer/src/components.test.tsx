import { ConnectionState } from 'livekit-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RoomConnection, ServerDetail } from '@vatrushka/shared';

import { AuthPanel, GuestJoinPanel, HomePanel } from './components.js';
import { ServerView } from './features/servers/index.js';
import { RoomView } from './features/voice/index.js';
import type { MediaSnapshot } from './media.js';

const noop = (): void => undefined;

describe('authentication screens', () => {
  it('renders an accessible email form', async () => {
    const onRequest = vi.fn();
    render(<AuthPanel mode="email" stage="credentials" factor="email" totpAvailable={false} email="" code="" password="" passwordConfirmation="" retrySeconds={0} busy={false} error={null} onMode={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRequest={onRequest} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByRole('heading', { name: 'Войдите по email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    await userEvent.click(screen.getByRole('button', { name: /Получить код/u }));
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('renders OTP state, retry countdown, and an error alert', () => {
    render(<AuthPanel mode="email" stage="otp" factor="email" totpAvailable={false} email="test@example.com" code="123" password="" passwordConfirmation="" retrySeconds={42} busy={false} error="Неверный код" onMode={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRequest={noop} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByLabelText('Код из письма')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('button', { name: 'Отправить снова через 42 с' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });
});

describe('main and guest screens', () => {
  it('shows user identity, room actions, audio settings, and app version', () => {
    render(<HomePanel user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: false, twoFactorEnabled: false }} version="1.2.3" roomCode="ABC234" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[]} serverName="" serverInvite="" onRoomCode={noop} onCreate={noop} onJoin={noop} onLogout={noop} onSecurity={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onServerName={noop} onServerInvite={noop} onCreateServer={noop} onJoinServer={noop} onOpenServer={noop} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать комнату/u })).toBeEnabled();
    expect(screen.getByLabelText('Код комнаты')).toHaveValue('ABC234');
    expect(screen.getByLabelText('Устройство записи')).toBeInTheDocument();
    expect(screen.getByLabelText('Устройство воспроизведения')).toBeInTheDocument();
    expect(screen.getByText(/Ватрушка 1.2.3/u)).toBeInTheDocument();
  });

  it('renders a guest-only join flow', () => {
    render(<GuestJoinPanel code="ABC234" name="Guest" busy={false} error={null} onName={noop} onJoin={noop} onBack={noop} />);
    expect(screen.getByText(/Гостевой вход · ABC234/u)).toBeInTheDocument();
    expect(screen.getByLabelText('Ваше имя')).toHaveAttribute('maxlength', '30');
    expect(screen.getByRole('button', { name: /Войти в комнату/u })).toBeEnabled();
  });
});

describe('room UI', () => {
  const connection: RoomConnection = {
    roomId: 'room-1',
    ownerUserId: 'owner-1',
    code: 'ABC234',
    livekitUrl: 'ws://test',
    livekitToken: 'token',
    participantIdentity: 'user_owner-1_local',
    participantDisplayName: 'Owner',
    isOwner: true,
  };

  const baseSnapshot: MediaSnapshot = {
    connectionState: ConnectionState.Connected,
    participants: [
      { identity: 'user_owner-1_local', displayName: 'Owner', isLocal: true, isOwner: true, isGuest: false, isMuted: true, isSpeaking: false, audioLevel: 0, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'owner', connectionQuality: 'Отличное' },
      { identity: 'guest_guest-1_remote', displayName: 'Visitor', isLocal: false, isOwner: false, isGuest: true, isMuted: false, isSpeaking: true, audioLevel: 0.7, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'member', connectionQuality: 'Хорошее' },
    ],
    isMuted: true,
    isScreenSharing: false,
    screenTrack: null,
    screenSharerName: null,
    screenShareIsLocal: false,
    hasScreenShareAudio: false,
    screenShareAudioMuted: false,
    screenShareAudioVolume: 1,
    canPlayAudio: true,
    error: null,
  };

  it('shows participants, speaking and mute text, stable controls, and owner moderation', async () => {
    const onParticipantMute = vi.fn();
    render(<RoomView connection={connection} snapshot={baseSnapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} locked={false} busy={false} error={null} onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onLock={noop} onClose={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={onParticipantMute} onParticipantVolume={noop} />);
    expect(screen.getAllByText('Owner (вы)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Visitor/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/говорит/ui).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mute-control')).toHaveAccessibleName('Включить микрофон');
    expect(screen.getByTestId('screen-share-control')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Закрыть вход' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Исключить Visitor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Заглушить локально' }));
    expect(onParticipantMute).toHaveBeenCalledWith('guest_guest-1_remote', true);
  });

  it('shows reconnect, busy, and error states without relying only on color', () => {
    const snapshot = { ...baseSnapshot, connectionState: ConnectionState.Reconnecting };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} locked={true} busy error="Другой участник уже показывает экран" onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onLock={noop} onClose={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={noop} onParticipantVolume={noop} />);
    expect(screen.getByText('Переподключение…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Другой участник уже показывает экран');
    expect(screen.getByRole('button', { name: 'Открыть вход' })).toBeDisabled();
    expect(screen.getByTestId('screen-share-control')).toBeDisabled();
  });
});

describe('server UI', () => {
  const server: ServerDetail = {
    id: 'server-1',
    name: 'Команда',
    inviteCode: 'ABCD2345',
    ownerUserId: 'user-1',
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT_VOICE', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_MESSAGES'],
    channels: [
      { id: 'text-1', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0 },
      { id: 'voice-1', serverId: 'server-1', name: 'Голосовой', type: 'voice', position: 1, unreadCount: 0 },
    ],
    roles: [{ id: 'role-1', serverId: 'server-1', name: '@everyone', color: '#8d7a72', position: 0, isDefault: true, permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] }],
    members: [{ userId: 'user-1', displayName: 'Anna', platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', roles: [] }],
  };

  it('shows persistent channels, messages, members, and role management', async () => {
    const onChannel = vi.fn();
    const onMessageDraft = vi.fn();
    const onMessageReaction = vi.fn();
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="text-1" messages={[{ id: 'message-1', channelId: 'text-1', authorUserId: 'user-1', authorDisplayName: 'Anna', authorPlatformRole: 'owner', content: 'Привет, команда!', replyTo: null, reactions: [], attachments: [], createdAt: '2026-01-01T10:00:00.000Z', editedAt: null }]} messageDraft="" serverName="" serverInvite="" busy={false} error={null} onBack={noop} onSwitchServer={noop} onChannel={onChannel} onMessageDraft={onMessageDraft} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={onMessageReaction} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={noop} onCopyInvite={noop} onCreateChannel={noop} onDeleteChannel={noop} onCreateRole={noop} onAssignRoles={noop} onKickMember={noop} onServerName={noop} onServerInvite={noop} onCreateServer={noop} onJoinServer={noop} onSecurity={noop} onLogout={noop} />);
    expect(screen.getByText('Привет, команда!')).toBeInTheDocument();
    expect(screen.getByText('Владелец сервера')).toBeInTheDocument();
    const upload = screen.getByLabelText('Выбрать вложения');
    await userEvent.upload(upload, new File(['preview'], 'preview.txt', { type: 'text/plain' }));
    expect(screen.getByText('preview.txt')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ответить' }));
    expect(screen.getByText('Ответ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Редактировать сообщение' }));
    expect(onMessageDraft).toHaveBeenCalledWith('Привет, команда!');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию 👍' }));
    expect(onMessageReaction).toHaveBeenCalledWith('message-1', '👍');
    await userEvent.click(screen.getByRole('button', { name: 'Голосовой' }));
    expect(onChannel).toHaveBeenCalledWith('voice-1');
    await userEvent.click(screen.getByRole('button', { name: /Роли и права/u }));
    expect(screen.getByRole('heading', { name: 'Роли и права' })).toBeInTheDocument();
  });
});
