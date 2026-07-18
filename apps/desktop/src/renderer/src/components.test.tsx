import { ConnectionState } from 'livekit-client';
import type { LocalTrack } from 'livekit-client';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMentionDraft, RoomConnection, ServerDetail } from '@vatrushka/shared';

import { AuthPanel } from './components.js';
import { HomePage } from './features/home/index.js';
import { ServerView } from './features/servers/index.js';
import { RoomView } from './features/voice/index.js';
import type { MediaSnapshot } from './media.js';
import { MessageComposer, MessageList } from './ui/index.js';

const noop = (): void => undefined;

describe('authentication screens', () => {
  it('renders an accessible password form', async () => {
    const onRequest = vi.fn();
    render(<AuthPanel mode="password" stage="credentials" factor="email" totpAvailable={false} email="" code="" password="secure-pass-42" passwordConfirmation="" retrySeconds={0} busy={false} error={null} onMode={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRequest={onRequest} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByRole('heading', { name: 'С возвращением' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: /Продолжить/u }));
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('renders OTP state, retry countdown, and an error alert', () => {
    render(<AuthPanel mode="password" stage="otp" factor="email" totpAvailable={false} email="test@example.com" code="123" password="secure-pass-42" passwordConfirmation="" retrySeconds={42} busy={false} error="Неверный код" onMode={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRequest={noop} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByLabelText('Код из письма')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('button', { name: 'Повторить через 42 с' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });
});

describe('main screen', () => {
  it('shows user identity, server actions, audio settings, and app version', () => {
    render(<HomePage user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} version="1.2.3" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[]} serverName="Команда" onLogout={noop} onSecurity={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onServerName={noop} onCreateServer={noop} onOpenServer={noop} onCopyInvite={noop} />);
    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Создать сервер/u }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Пригласить друзей' })).toBeInTheDocument();
    expect(screen.queryByText(/войти по коду/iu)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Код приглашения')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Устройство ввода')).toBeInTheDocument();
    expect(screen.getByLabelText('Динамики / наушники')).toBeInTheDocument();
    expect(screen.getAllByText(/1\.2\.3/u).length).toBeGreaterThan(0);
    expect(document.querySelector('.vui-app-shell__server-context')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Безопасность и настройки' }).length).toBeGreaterThan(0);
  });

  it('copies only a short server link and reports success', async () => {
    const onCopyInvite = vi.fn().mockResolvedValue(undefined);
    render(<HomePage user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} version="1.2.3" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[{ id: 'server-1', name: 'Команда', inviteUrl: 'https://myvatrushka.ru/i/shortLink42', ownerUserId: 'user-1', memberCount: 1, createdAt: '2026-07-17T10:00:00.000Z' }]} serverName="" onLogout={noop} onSecurity={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onServerName={noop} onCreateServer={noop} onOpenServer={noop} onCopyInvite={onCopyInvite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить друзей' }));
    expect(screen.getByText('https://myvatrushka.ru/i/shortLink42')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(onCopyInvite).toHaveBeenCalledWith('https://myvatrushka.ru/i/shortLink42');
    expect(await screen.findByRole('button', { name: 'Ссылка скопирована' })).toBeInTheDocument();
  });

  it('uses widget skeletons instead of a fullscreen loader', () => {
    render(<HomePage user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} version="1.2.3" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[]} serverName="" dashboardLoading onLogout={noop} onSecurity={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onServerName={noop} onCreateServer={noop} onOpenServer={noop} onCopyInvite={noop} />);
    expect(screen.getByLabelText('Загрузка блока Продолжить')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Загрузка активных пространств')).toBeInTheDocument();
    expect(screen.queryByText(/Подключаем «Ватрушку»/u)).not.toBeInTheDocument();
  });
});

describe('room UI', () => {
  const connection: RoomConnection = {
    roomId: 'room-1',
    ownerUserId: 'owner-1',
    livekitUrl: 'ws://test',
    livekitToken: 'token',
    participantIdentity: 'user_owner-1_local',
    participantDisplayName: 'Owner',
    isOwner: true,
    contextType: 'channel',
    serverId: 'server-1',
    channelId: 'channel-1',
  };

  const baseSnapshot: MediaSnapshot = {
    connectionState: ConnectionState.Connected,
    participants: [
      { identity: 'user_owner-1_local', displayName: 'Owner', isLocal: true, isOwner: true, isMuted: true, isSpeaking: false, audioLevel: 0, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'owner', connectionQuality: 'Отличное' },
      { identity: 'user_visitor-1_remote', displayName: 'Visitor', isLocal: false, isOwner: false, isMuted: false, isSpeaking: true, audioLevel: 0.7, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'member', connectionQuality: 'Хорошее' },
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
  const voiceDevices = {
    inputs: [{ deviceId: 'microphone-studio', groupId: 'group-input', kind: 'audioinput', label: 'Studio Microphone', toJSON: () => ({}) } as MediaDeviceInfo],
    outputs: [{ deviceId: 'headphones-usb', groupId: 'group-output', kind: 'audiooutput', label: 'USB Headphones', toJSON: () => ({}) } as MediaDeviceInfo],
  };

  it('shows participants, speaking and mute text, stable controls, and owner moderation', async () => {
    const onParticipantMute = vi.fn();
    const onMicrophone = vi.fn();
    const onOutput = vi.fn();
    const onRefreshDevices = vi.fn();
    render(<RoomView connection={connection} snapshot={baseSnapshot} devices={voiceDevices} microphoneId={undefined} outputId={undefined} busy={false} error={null} onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onKick={noop} onMicrophone={onMicrophone} onOutput={onOutput} onRefreshDevices={onRefreshDevices} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={onParticipantMute} onParticipantVolume={noop} />);
    expect(screen.getAllByText('Owner (вы)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Visitor/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/говорит/ui).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mute-control')).toHaveAccessibleName('Включить микрофон');
    expect(screen.getByTestId('screen-share-control')).toBeEnabled();
    expect(screen.getByText('Голосовая связь активна')).toBeInTheDocument();
    expect(document.querySelector('.vui-room__participant-grid')?.children).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Исключить Visitor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Заглушить локально' }));
    expect(onParticipantMute).toHaveBeenCalledWith('user_visitor-1_remote', true);
    await userEvent.click(screen.getByRole('button', { name: 'Устройства' }));
    await userEvent.click(screen.getByLabelText('Устройство ввода'));
    await userEvent.click(screen.getByRole('option', { name: 'Studio Microphone' }));
    await userEvent.click(screen.getByLabelText('Устройство вывода'));
    await userEvent.click(screen.getByRole('option', { name: 'USB Headphones' }));
    expect(onMicrophone).toHaveBeenCalledWith('microphone-studio');
    expect(onOutput).toHaveBeenCalledWith('headphones-usb');
    await userEvent.click(screen.getByRole('button', { name: 'Обновить список аудиоустройств' }));
    expect(onRefreshDevices).toHaveBeenCalledOnce();
  });

  it('keeps the participant volume control mounted when the active speaker changes', () => {
    const commonProps = { connection, devices: voiceDevices, microphoneId: undefined, outputId: undefined, busy: false, error: null, onMute: noop, onShare: noop, onCopy: noop, onLeave: noop, onKick: noop, onMicrophone: noop, onOutput: noop, onRefreshDevices: noop, onStartAudio: noop, onScreenAudioMute: noop, onScreenAudioVolume: noop, onParticipantMute: noop, onParticipantVolume: noop };
    const { rerender } = render(<RoomView {...commonProps} snapshot={baseSnapshot} />);
    const volumeSlider = screen.getByRole('slider', { name: 'Громкость Visitor' });
    const nextSnapshot = {
      ...baseSnapshot,
      participants: baseSnapshot.participants.map((participant) => ({
        ...participant,
        isSpeaking: participant.isLocal,
      })),
    };

    rerender(<RoomView {...commonProps} snapshot={nextSnapshot} />);
    expect(screen.getByRole('slider', { name: 'Громкость Visitor' })).toBe(volumeSlider);
  });

  it('shows reconnect, busy, and error states without relying only on color', () => {
    const snapshot = { ...baseSnapshot, connectionState: ConnectionState.Reconnecting };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy error="Другой участник уже показывает экран" onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={noop} onParticipantVolume={noop} />);
    expect(screen.getByText('Переподключение…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Другой участник уже показывает экран');
    expect(screen.getByTestId('screen-share-control')).toBeDisabled();
  });

  it('lets a viewer mute and adjust screen-share audio independently', async () => {
    const onScreenAudioMute = vi.fn();
    const onScreenAudioVolume = vi.fn();
    const track = { attach: vi.fn(), detach: vi.fn(() => []) } as unknown as LocalTrack;
    const snapshot = { ...baseSnapshot, screenTrack: track, screenSharerName: 'Visitor', screenShareIsLocal: false, hasScreenShareAudio: true, screenShareAudioVolume: 0.7 };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onRefreshDevices={noop} onStartAudio={noop} onScreenAudioMute={onScreenAudioMute} onScreenAudioVolume={onScreenAudioVolume} onParticipantMute={noop} onParticipantVolume={noop} />);

    expect(screen.getByText('Звук трансляции')).toBeInTheDocument();
    expect(screen.getByText('Громкость меняется только для вас')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выключить звук трансляции' }));
    expect(onScreenAudioMute).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость трансляции' }), { target: { value: '35' } });
    expect(onScreenAudioVolume).toHaveBeenCalledWith(0.35);
  });
});

describe('message composer', () => {
  it('submits an attachment without requiring text', async () => {
    const onSubmit = vi.fn();
    render(<MessageComposer attachments={[{ id: 'draft-image', name: 'photo.png', size: 128, mimeType: 'image/png' }]} channelName="общий" onChange={noop} onSubmit={onSubmit} value="" />);

    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('selects a structured member mention with keyboard navigation', async () => {
    const changed = vi.fn();
    function Harness(): React.JSX.Element {
      const [value, setValue] = useState('');
      const [mentions, setMentions] = useState<ConversationMentionDraft[]>([]);
      return <MessageComposer channelName="общий" mentionCandidates={[{ type: 'user', userId: '11111111-1111-4111-8111-111111111111', displayName: 'Member' }]} mentions={mentions} onChange={setValue} onMentionsChange={(next) => { setMentions(next); changed(next); }} onSubmit={noop} value={value} />;
    }
    render(<Harness />);
    const editor = screen.getByRole('textbox', { name: 'Сообщение' });
    await userEvent.type(editor, '@mem');
    expect(screen.getByRole('listbox', { name: 'Упомянуть участника или роль' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(editor).toHaveValue('@Member');
    expect(changed).toHaveBeenLastCalledWith([{ type: 'user', userId: '11111111-1111-4111-8111-111111111111', displayName: 'Member', start: 0, length: 7 }]);
  });

  it('renders the current safe label over the original mention text', () => {
    render(<MessageList channelName="общий" messages={[{ id: 'message', authorId: 'author', authorName: 'Author', content: 'Привет, @Old', mentions: [{ key: 'user:member', userId: 'member', start: 8, length: 4, displayName: 'Renamed' }], createdAt: '2026-01-01T10:00:00.000Z' }]} />);
    expect(screen.getByText('@Renamed')).toHaveAttribute('data-user-id', 'member');
    expect(screen.queryByText(/@Old/u)).not.toBeInTheDocument();
  });

  it('selects role mentions and exposes history and delivery recovery actions', async () => {
    const onMentionsChange = vi.fn();
    const onLoadOlder = vi.fn();
    const onRetry = vi.fn();
    function Harness(): React.JSX.Element {
      const [value, setValue] = useState('');
      return <><MessageComposer channelName="общий" mentionCandidates={[{ type: 'role', roleId: '33333333-3333-4333-8333-333333333333', displayName: 'Разработчики' }]} onChange={setValue} onMentionsChange={onMentionsChange} onSubmit={noop} value={value} /><MessageList channelName="общий" hasOlder messages={[{ id: 'failed', authorId: 'author', authorName: 'Author', content: 'Повторить меня', createdAt: '2026-01-01T10:00:00.000Z', deliveryState: 'failed' }]} onLoadOlder={onLoadOlder} onRetry={onRetry} /></>;
    }
    render(<Harness />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Сообщение' }), '@раз');
    await userEvent.keyboard('{Enter}');
    expect(onMentionsChange).toHaveBeenLastCalledWith([{ type: 'role', roleId: '33333333-3333-4333-8333-333333333333', displayName: 'Разработчики', start: 0, length: 13 }]);
    await userEvent.click(screen.getByRole('button', { name: 'Показать более ранние сообщения' }));
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onLoadOlder).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith('failed');
  });
});

describe('server UI', () => {
  const server: ServerDetail = {
    id: 'server-1',
    name: 'Команда',
    inviteUrl: 'https://myvatrushka.ru/i/ABCD2345test',
    ownerUserId: 'user-1',
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_MESSAGES'],
    channels: [
      { id: 'text-1', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0 },
      { id: 'voice-1', serverId: 'server-1', name: 'Голосовой', type: 'voice', position: 1, unreadCount: 0, voiceParticipants: [{ identity: 'user_user-1_desktop', userId: 'user-1', displayName: 'Anna', platformRole: 'owner' }] },
    ],
    roles: [{ id: 'role-1', serverId: 'server-1', name: '@everyone', color: '#8d7a72', position: 0, isDefault: true, permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] }],
    members: [{ userId: 'user-1', displayName: 'Anna', platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', roles: [] }],
  };

  it('shows persistent channels, messages, members, and role management', async () => {
    const onChannel = vi.fn();
    const onMessageDraft = vi.fn();
    const onMessageReaction = vi.fn();
    const onConnectVoice = vi.fn();
    const onCopyInvite = vi.fn(async () => undefined);
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="text-1" messages={[{ id: 'message-1', channelId: 'text-1', authorUserId: 'user-1', authorDisplayName: 'Anna', authorPlatformRole: 'owner', content: 'Привет, команда!', replyTo: null, reactions: [], attachments: [], createdAt: '2026-01-01T10:00:00.000Z', editedAt: null }]} messageDraft="" serverName="" busy={false} error={null} auditLog={[]} onBack={noop} onSwitchServer={noop} onChannel={onChannel} onMessageDraft={onMessageDraft} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={onMessageReaction} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={onConnectVoice} onCopyInvite={onCopyInvite} onCreateChannel={noop} onDeleteChannel={noop} onCreateRole={noop} onUpdateRole={noop} onDeleteRole={noop} onReorderRole={noop} onAssignRoles={noop} onSetChannelOverwrite={noop} onLoadAudit={noop} onKickMember={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);
    expect(screen.getByText('Привет, команда!')).toBeInTheDocument();
    expect(screen.getByText('Владелец сервера')).toBeInTheDocument();
    expect(document.querySelectorAll('.vui-channel-row__participants > div')).toHaveLength(1);
    const upload = screen.getByLabelText('Выбрать вложения');
    await userEvent.upload(upload, new File(['preview'], 'preview.txt', { type: 'text/plain' }));
    expect(screen.getByText('preview.txt')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ответить' }));
    expect(screen.getByText('Ответ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Редактировать сообщение' }));
    expect(onMessageDraft).toHaveBeenCalledWith('Привет, команда!');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить реакцию' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Реакция 👍' }));
    expect(onMessageReaction).toHaveBeenCalledWith('message-1', '👍');
    await userEvent.click(screen.getByRole('button', { name: /^Голосовой/u }));
    expect(onChannel).toHaveBeenCalledWith('voice-1');
    await userEvent.dblClick(screen.getByRole('button', { name: /^Голосовой/u }));
    expect(onConnectVoice).toHaveBeenCalledWith('voice-1');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить на сервер' }));
    expect(screen.getByRole('dialog', { name: 'Пригласить на сервер' })).toBeInTheDocument();
    expect(screen.getByText(server.inviteUrl)).toBeInTheDocument();
    expect(screen.queryByText(/код приглашения/iu)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(onCopyInvite).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    await userEvent.click(screen.getByRole('button', { name: /Роли и права/u }));
    expect(screen.getByRole('heading', { name: 'Настройки сервера' })).toBeInTheDocument();
  });

  it('keeps the server and channel navigation visible inside a connected voice channel', async () => {
    const onChannel = vi.fn();
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="voice-1" connectedVoiceChannelId="voice-1" connectedVoiceServerId="server-1" voiceStage={<div>Активная голосовая сцена</div>} voiceConnectionPanel={<div>Голосовая связь подключена</div>} messages={[]} messageDraft="" serverName="" busy={false} error={null} auditLog={[]} onBack={noop} onSwitchServer={noop} onChannel={onChannel} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={noop} onCopyInvite={noop} onCreateChannel={noop} onDeleteChannel={noop} onCreateRole={noop} onUpdateRole={noop} onDeleteRole={noop} onReorderRole={noop} onAssignRoles={noop} onSetChannelOverwrite={noop} onLoadAudit={noop} onKickMember={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onLogout={noop} />);

    expect(screen.getByText('Активная голосовая сцена')).toBeInTheDocument();
    expect(screen.getByText('Голосовая связь подключена')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'общий' }));
    expect(onChannel).toHaveBeenCalledWith('text-1');
  });
});
