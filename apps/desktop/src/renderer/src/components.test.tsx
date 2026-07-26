import { ConnectionState } from 'livekit-client';
import type { LocalTrack } from 'livekit-client';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMentionDraft, RoomConnection, ServerDetail } from '@vatrushka/shared';

import { AuthPanel } from './components.js';
import { HomePage } from './features/home/index.js';
import { ServerView } from './features/servers/index.js';
import { RoomView } from './features/voice/index.js';
import type { MediaSnapshot } from './media.js';
import { Avatar, MessageComposer, MessageList, Select, UserProfileDock, VoiceProfileConnection } from './ui/index.js';

const noop = (): void => undefined;

describe('form controls', () => {
  it('ports a select menu to the viewport and flips it above the trigger', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        x: 40,
        y: 700,
        top: 700,
        right: 260,
        bottom: 742,
        left: 40,
        width: 220,
        height: 42,
        toJSON: () => ({}),
      });
    const onValueChange = vi.fn();
    render(
      <Select
        label="Аудиоустройство"
        onValueChange={onValueChange}
        options={[
          { value: 'default', label: 'Системное устройство' },
          { value: 'usb', label: 'USB Headset' },
        ]}
        value="default"
      />,
    );

    await userEvent.click(screen.getByLabelText('Аудиоустройство'));
    const listbox = screen.getByRole('listbox', { name: 'Аудиоустройство' });
    expect(listbox.parentElement).toBe(document.body);
    expect(Number.parseFloat(listbox.style.top)).toBeLessThan(700);
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('usb');
    rect.mockRestore();
  });
});

describe('authentication screens', () => {
  it('renders an accessible password form', async () => {
    const onRequest = vi.fn();
    const onRememberSessionChange = vi.fn();
    render(<AuthPanel mode="password" stage="credentials" factor="email" totpAvailable={false} email="" code="" password="secure-pass-42" passwordConfirmation="" rememberSession retrySeconds={0} busy={false} error={null} notice={null} onMode={noop} onReset={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRememberSessionChange={onRememberSessionChange} onRequest={onRequest} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByRole('heading', { name: 'Добро пожаловать' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Запомнить меня' }));
    expect(onRememberSessionChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: /Продолжить/u }));
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('renders OTP state, retry countdown, and an error alert', () => {
    render(<AuthPanel mode="password" stage="otp" factor="email" totpAvailable={false} email="test@example.com" code="123" password="secure-pass-42" passwordConfirmation="" rememberSession retrySeconds={42} busy={false} error="Неверный код" notice={null} onMode={noop} onReset={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRememberSessionChange={noop} onRequest={noop} onVerify={noop} onFactor={noop} onBack={noop} />);
    expect(screen.getByLabelText('Код из письма')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('button', { name: 'Повторить через 42 с' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });

  it('requires a username when registering an account', async () => {
    const onUsernameChange = vi.fn();
    render(
      <AuthPanel
        mode="register"
        stage="credentials"
        factor="email"
        totpAvailable={false}
        email="new@example.com"
        username=""
        code=""
        password="secure-pass-42"
        passwordConfirmation="secure-pass-42"
        rememberSession
        retrySeconds={0}
        busy={false}
        error={null}
        notice={null}
        onMode={noop}
        onReset={noop}
        onEmailChange={noop}
        onUsernameChange={onUsernameChange}
        onCodeChange={noop}
        onPasswordChange={noop}
        onPasswordConfirmationChange={noop}
        onRememberSessionChange={noop}
        onRequest={noop}
        onVerify={noop}
        onFactor={noop}
        onBack={noop}
      />,
    );

    const username = screen.getByLabelText('Имя пользователя');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByText('Username уникален и меняется не чаще одного раза в 7 дней.')).toBeInTheDocument();
    await userEvent.type(username, 'new_player');
    expect(onUsernameChange).toHaveBeenCalledWith('n');
  });

  it('renders password reset without disclosing account existence', async () => {
    const onVerify = vi.fn();
    render(<AuthPanel mode="reset" stage="otp" factor="email" totpAvailable={false} email="test@example.com" code="123456" password="new-password-42" passwordConfirmation="new-password-42" rememberSession retrySeconds={0} busy={false} error={null} notice={null} onMode={noop} onReset={noop} onEmailChange={noop} onCodeChange={noop} onPasswordChange={noop} onPasswordConfirmationChange={noop} onRememberSessionChange={noop} onRequest={noop} onVerify={onVerify} onFactor={noop} onBack={noop} />);
    expect(screen.getByRole('heading', { name: 'Задайте новый пароль' })).toBeInTheDocument();
    expect(screen.getByLabelText('Новый пароль', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/все активные сессии будут завершены/iu)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить новый пароль' }));
    expect(onVerify).toHaveBeenCalledOnce();
  });
});

describe('main screen', () => {
  it('shows the UI Kit home composition and preserves navigation actions', () => {
    render(<HomePage user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} version="1.2.3" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[]} serverName="Команда" onLogout={noop} onSecurity={noop} onServerName={noop} onCreateServer={noop} onOpenServer={noop} />);
    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Сообщество' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Друзья' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Быстрый возврат' })).toBeInTheDocument();
    expect(screen.getByText('Активные пространства')).toBeInTheDocument();
    expect(screen.getByLabelText('Поиск тиммейтов')).toBeInTheDocument();
    expect(screen.getByLabelText('Друзья в сети')).toBeInTheDocument();
    expect(screen.queryByText(/войти по коду/iu)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Код приглашения')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vatrushka')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пространства' })).not.toBeInTheDocument();
    expect(document.querySelector('.vui-app-shell__server-context')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Настройки пользователя' }).length).toBeGreaterThan(0);
  });

  it('uses widget skeletons instead of a fullscreen loader', () => {
    render(<HomePage user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'member', hasPassword: true, twoFactorEnabled: false }} version="1.2.3" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} servers={[]} serverName="" dashboardLoading onLogout={noop} onSecurity={noop} onServerName={noop} onCreateServer={noop} onOpenServer={noop} />);
    expect(screen.getByLabelText('Загрузка главной страницы')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Загрузка друзей')).toBeInTheDocument();
    expect(screen.queryByText(/Подключаем «Ватрушку»/u)).not.toBeInTheDocument();
  });
});

describe('profile audio controls', () => {
  it('keeps the previous signed avatar visible until the replacement is loaded', () => {
    const preloaders: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string }> = [];
    class ImagePreloader {
      decoding = 'auto';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        preloaders.push(this);
      }
    }
    vi.stubGlobal('Image', ImagePreloader);
    const { rerender } = render(<Avatar name="Anna" src="https://cdn.example/old?signature=1" />);
    rerender(<Avatar name="Anna" src="https://cdn.example/new?signature=2" />);
    expect(screen.getByRole('img', { name: 'Anna' }).querySelector('img')).toHaveAttribute('src', 'https://cdn.example/old?signature=1');
    act(() => preloaders[0]?.onload?.());
    expect(screen.getByRole('img', { name: 'Anna' }).querySelector('img')).toHaveAttribute('src', 'https://cdn.example/new?signature=2');
    vi.unstubAllGlobals();
  });

  it('keeps the avatar image inside a dedicated round mask and closes status on Escape', async () => {
    render(
      <UserProfileDock
        avatarUrl="https://cdn.example/avatar.png"
        email="anna@example.com"
        name="Anna"
        onLogout={noop}
        onSecurity={noop}
        onStatus={noop}
      />,
    );
    const avatar = screen.getByRole('img', { name: 'Anna' });
    expect(avatar.querySelector('.vui-avatar__mask > img')).toHaveAttribute(
      'src',
      'https://cdn.example/avatar.png',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Изменить статус' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps compact voice controls in the profile card and disables media toggles while reconnecting', async () => {
    const onMicrophoneToggle = vi.fn();
    const onDeafenToggle = vi.fn();
    const onOpen = vi.fn();
    const onLeave = vi.fn();
    const { rerender } = render(<VoiceProfileConnection channelName="Лаунж" participantCount={1} state="connected" microphoneMuted={false} deafened={false} onMicrophoneToggle={onMicrophoneToggle} onDeafenToggle={onDeafenToggle} onOpen={onOpen} onLeave={onLeave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Выключить микрофон' }));
    await userEvent.click(screen.getByRole('button', { name: 'Выключить звук' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Вернуться в голосовой канал' })[0]!);
    expect(onMicrophoneToggle).toHaveBeenCalledOnce();
    expect(onDeafenToggle).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();

    rerender(<VoiceProfileConnection channelName="Лаунж" participantCount={1} state="reconnecting" microphoneMuted deafened onMicrophoneToggle={onMicrophoneToggle} onDeafenToggle={onDeafenToggle} onOpen={onOpen} onLeave={onLeave} />);
    expect(screen.getByRole('button', { name: 'Включить микрофон' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Включить звук' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Покинуть голосовой канал' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Покинуть голосовой канал' }));
    expect(onLeave).toHaveBeenCalledOnce();
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
    pingMs: 32,
    participants: [
      { identity: 'user_owner-1_local', displayName: 'Owner', isLocal: true, isOwner: true, isMuted: true, isSpeaking: false, audioLevel: 0, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'owner', connectionQuality: 'Отличное' },
      { identity: 'user_visitor-1_remote', displayName: 'Visitor', isLocal: false, isOwner: false, isMuted: false, isSpeaking: true, audioLevel: 0.7, isScreenSharing: false, volume: 1, locallyMuted: false, platformRole: 'member', connectionQuality: 'Хорошее' },
    ],
    isMuted: true,
    isDeafened: false,
    isScreenSharing: false,
    screenTrack: null,
    screenSharerName: null,
    screenShareIsLocal: false,
    hasScreenShareAudio: false,
    screenShareAudioMuted: false,
    screenShareAudioVolume: 1,
    screenAnnotations: [],
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
    const onMicrophoneVolume = vi.fn();
    const onOutputVolume = vi.fn();
    render(<RoomView connection={connection} snapshot={baseSnapshot} devices={voiceDevices} microphoneId="microphone-studio" outputId={undefined} busy={false} error={null} microphoneVolume={0.8} outputVolume={0.6} onMute={noop} onShare={noop} onLeave={noop} onKick={noop} onMicrophone={onMicrophone} onMicrophoneVolume={onMicrophoneVolume} onOutput={onOutput} onOutputVolume={onOutputVolume} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={onParticipantMute} onParticipantVolume={noop} />);
    expect(screen.getAllByText('Owner (вы)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Visitor/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/говорит/ui).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mute-control')).toHaveAccessibleName('Включить микрофон');
    expect(screen.getByTestId('screen-share-control')).toBeEnabled();
    expect(document.querySelector('.vui-room__participant-grid')?.children).toHaveLength(2);
    expect(document.querySelector('.vui-room__participant-grid .vui-audio-meter')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Микрофон выключен' })).toHaveLength(1);
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Visitor' }).closest('article')!);
    expect(screen.getByRole('menuitem', { name: 'Исключить из канала' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Отключить звук' }));
    expect(onParticipantMute).toHaveBeenCalledWith('user_visitor-1_remote', true);
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать устройство: Микрофон' }));
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Studio Microphone');
    await userEvent.click(screen.getByRole('option', { name: 'Studio Microphone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать устройство: Звук' }));
    await userEvent.click(screen.getByRole('option', { name: 'USB Headphones' }));
    expect(onMicrophone).toHaveBeenCalledWith('microphone-studio');
    expect(onOutput).toHaveBeenCalledWith('headphones-usb');
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать устройство: Микрофон' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость микрофона' }), { target: { value: '45' } });
    expect(onMicrophoneVolume).toHaveBeenCalledWith(0.45);
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать устройство: Звук' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость вывода' }), { target: { value: '35' } });
    expect(onOutputVolume).toHaveBeenCalledWith(0.35);
  });

  it('keeps the participant volume control mounted when the active speaker changes', () => {
    const commonProps = { connection, devices: voiceDevices, microphoneId: undefined, outputId: undefined, busy: false, error: null, onMute: noop, onShare: noop, onCopy: noop, onLeave: noop, onKick: noop, onMicrophone: noop, onOutput: noop, onStartAudio: noop, onScreenAudioMute: noop, onScreenAudioVolume: noop, onParticipantMute: noop, onParticipantVolume: noop };
    const { rerender } = render(<RoomView {...commonProps} snapshot={baseSnapshot} />);
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Visitor' }).closest('article')!);
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

  it('keeps reconnect, busy, and error states actionable', () => {
    const snapshot = { ...baseSnapshot, connectionState: ConnectionState.Reconnecting };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy error="Другой участник уже показывает экран" onMute={noop} onShare={noop} onLeave={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} onScreenAudioMute={noop} onScreenAudioVolume={noop} onParticipantMute={noop} onParticipantVolume={noop} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Другой участник уже показывает экран');
    expect(screen.getByTestId('screen-share-control')).toBeDisabled();
  });

  it('lets a viewer mute and adjust screen-share audio independently', async () => {
    const onScreenAudioMute = vi.fn();
    const onScreenAudioVolume = vi.fn();
    const track = { attach: vi.fn(), detach: vi.fn(() => []) } as unknown as LocalTrack;
    const snapshot = { ...baseSnapshot, screenTrack: track, screenSharerName: 'Visitor', screenShareIsLocal: false, hasScreenShareAudio: true, screenShareAudioVolume: 0.7 };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} onMute={noop} onShare={noop} onLeave={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} onScreenAudioMute={onScreenAudioMute} onScreenAudioVolume={onScreenAudioVolume} onParticipantMute={noop} onParticipantVolume={noop} />);

    fireEvent.contextMenu(document.querySelector('.vui-room__video-frame')!);
    expect(screen.getByText('Звук демонстрации')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Отключить звук' }));
    expect(onScreenAudioMute).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость демонстрации' }), { target: { value: '35' } });
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

  it('adds an image pasted from the clipboard as an attachment', () => {
    const onFilesSelected = vi.fn();
    render(<MessageComposer channelName="общий" onChange={noop} onFilesSelected={onFilesSelected} onSubmit={noop} value="" />);
    const file = new File(['image'], 'clipboard.png', { type: 'image/png' });
    fireEvent.paste(screen.getByRole('textbox', { name: 'Сообщение' }), {
      clipboardData: { files: [file], items: [] },
    });
    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('opens the emoji picker and does not show an inactive microphone', async () => {
    const onChange = vi.fn();
    render(<MessageComposer channelName="общий" onChange={onChange} onSubmit={noop} value="" />);
    expect(screen.queryByRole('button', { name: /микрофон/iu })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать emoji' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Вставить 🚀' }));
    expect(onChange).toHaveBeenCalledWith('🚀');
  });

  it('renders safe links, emoji shortcodes and an author avatar', async () => {
    const openExternal = vi.spyOn(window.desktop, 'openExternal').mockResolvedValue();
    render(<MessageList channelName="общий" messages={[{ id: 'rich', authorId: 'author', authorName: 'Author', authorAvatarUrl: 'https://storage.test/avatar.webp', content: 'Ссылка https://example.com и :rocket:', createdAt: '2026-01-01T10:00:00.000Z' }]} />);
    expect(screen.getByRole('img', { name: 'Author' }).querySelector('img')).toHaveAttribute('src', 'https://storage.test/avatar.webp');
    expect(screen.getByRole('article')).toHaveTextContent('🚀');
    await userEvent.click(screen.getByRole('link', { name: 'https://example.com' }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
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

  it('renders the current safe label over the original mention text', async () => {
    const onMention = vi.fn();
    render(<MessageList channelName="общий" messages={[{ id: 'message', authorId: 'author', authorName: 'Author', content: 'Привет, @Old', mentions: [{ key: 'user:member', userId: 'member', start: 8, length: 4, displayName: 'Renamed' }], createdAt: '2026-01-01T10:00:00.000Z' }]} onMention={onMention} />);
    expect(screen.getByText('@Renamed')).toHaveAttribute('data-user-id', 'member');
    expect(screen.queryByText(/@Old/u)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '@Renamed' }));
    expect(onMention).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member', displayName: 'Renamed' }));
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

  it('shows persisted direct-message delivery states', () => {
    render(<MessageList channelName="Анна" messages={[
      { id: 'sent', authorId: 'me', authorName: 'Я', content: 'Первое', createdAt: '2026-01-01T10:00:00.000Z', deliveryState: 'sent', own: true },
      { id: 'delivered', authorId: 'me', authorName: 'Я', content: 'Второе', createdAt: '2026-01-01T10:01:00.000Z', deliveryState: 'delivered', own: true },
      { id: 'read', authorId: 'me', authorName: 'Я', content: 'Третье', createdAt: '2026-01-01T10:02:00.000Z', deliveryState: 'read', own: true },
    ]} />);
    expect(screen.getAllByRole('img', { name: 'Отправлено' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Прочитано' })).toBeInTheDocument();
    expect(screen.queryByText('Отправлено')).not.toBeInTheDocument();
    expect(screen.queryByText('Прочитано')).not.toBeInTheDocument();
  });

  it('does not render soft-deleted messages returned by the server', () => {
    render(<MessageList channelName="Анна" messages={[
      { id: 'removed', authorId: 'other', authorName: 'Other', content: 'Удалённое содержимое', createdAt: '2026-01-01T10:00:00.000Z', deleted: true },
      { id: 'visible', authorId: 'other', authorName: 'Other', content: 'Актуальное сообщение', createdAt: '2026-01-01T10:01:00.000Z' },
    ]} />);
    expect(screen.queryByText('Удалённое содержимое')).not.toBeInTheDocument();
    expect(screen.queryByText('Сообщение удалено')).not.toBeInTheDocument();
    expect(screen.getByText('Актуальное сообщение')).toBeInTheDocument();
  });
});

describe('server UI', () => {
  const server: ServerDetail = {
    id: 'server-1',
    name: 'Команда',
    description: 'Сервер команды разработки',
    inviteUrl: 'https://myvatrushka.ru/i/ABCD2345test',
    ownerUserId: 'user-1',
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    permissions: ['VIEW_SERVER', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'SEND_ATTACHMENTS', 'ADD_REACTIONS', 'MANAGE_OWN_MESSAGES', 'CONNECT_VOICE', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_MESSAGES'],
    channels: [
      { id: 'text-1', serverId: 'server-1', name: 'общий', type: 'text', position: 0, unreadCount: 0 },
      { id: 'voice-1', serverId: 'server-1', name: 'Голосовой', type: 'voice', position: 1, unreadCount: 0, voiceParticipants: [{ identity: 'user_user-1_desktop', userId: 'user-1', displayName: 'Anna', platformRole: 'owner', muted: true, deafened: true, speaking: false, screenSharing: true, connectionQuality: 'good' }] },
      { id: 'voice-2', serverId: 'server-1', name: 'Лобби', type: 'voice', position: 2, unreadCount: 0, voiceParticipants: [] },
    ],
    roles: [{ id: 'role-1', serverId: 'server-1', name: '@everyone', color: '#8d7a72', position: 0, isDefault: true, permissions: ['VIEW_SERVER', 'VIEW_CHANNEL'] }],
    members: [{ userId: 'user-1', displayName: 'Anna', serverDisplayName: null, privateAlias: null, platformRole: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', roles: [] }],
  };

  it('shows persistent channels, messages, members, and role management', async () => {
    const onChannel = vi.fn();
    const onMessageDraft = vi.fn();
    const onMessageReaction = vi.fn();
    const onConnectVoice = vi.fn();
    const onCopyInvite = vi.fn(async () => undefined);
    const onServerSettings = vi.fn();
    const onRenameChannel = vi.fn();
    const onMoveVoiceMember = vi.fn();
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="text-1" messages={[{ id: 'message-1', channelId: 'text-1', authorUserId: 'user-1', authorDisplayName: 'Anna', authorPlatformRole: 'owner', content: 'Привет, команда!', replyTo: null, reactions: [], attachments: [], createdAt: '2026-01-01T10:00:00.000Z', editedAt: null }]} messageDraft="" serverName="" busy={false} error={null} onBack={noop} onSwitchServer={noop} onChannel={onChannel} onMessageDraft={onMessageDraft} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={onMessageReaction} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={onConnectVoice} onMoveVoiceMember={onMoveVoiceMember} onCopyInvite={onCopyInvite} onCreateChannel={noop} onRenameChannel={onRenameChannel} onDeleteChannel={noop} onKickMember={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onServerSettings={onServerSettings} onLogout={noop} />);
    expect(screen.getByText('Привет, команда!')).toBeInTheDocument();
    expect(screen.getAllByText('Сервер команды разработки').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CEO Founder').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.vui-channel-row__participants > div')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Демонстрирует экран' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Входящий звук отключён' })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Действия с участником Anna' }));
    await userEvent.click(screen.getByRole('button', { name: 'Переместить Anna в другой голосовой канал' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Переместить в…' })).getByRole('button', { name: 'Лобби' }));
    expect(onMoveVoiceMember).toHaveBeenCalledWith('voice-2', 'user-1');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'общий' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    const renameInput = screen.getByLabelText('Название канала');
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, 'новости');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onRenameChannel).toHaveBeenCalledWith('text-1', 'новости');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить на сервер' }));
    expect(screen.getByRole('dialog', { name: 'Пригласить на сервер' })).toBeInTheDocument();
    expect(screen.getByText(server.inviteUrl)).toBeInTheDocument();
    expect(screen.queryByText(/код приглашения/iu)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    expect(onCopyInvite).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    await userEvent.click(screen.getByRole('button', { name: /Роли и права/u }));
    expect(onServerSettings).toHaveBeenCalledOnce();
  });

  it('keeps the server and channel navigation visible inside a connected voice channel', async () => {
    const onChannel = vi.fn();
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="voice-1" connectedVoiceChannelId="voice-1" connectedVoiceServerId="server-1" voiceStage={<div>Активная голосовая сцена</div>} messages={[]} messageDraft="" serverName="" busy={false} error={null} onBack={noop} onSwitchServer={noop} onChannel={onChannel} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={noop} onCopyInvite={noop} onCreateChannel={noop} onRenameChannel={noop} onDeleteChannel={noop} onKickMember={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onServerSettings={noop} onLogout={noop} />);

    expect(screen.getByText('Активная голосовая сцена')).toBeInTheDocument();
    expect(screen.queryByText('Голосовая связь подключена')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'общий' }));
    expect(onChannel).toHaveBeenCalledWith('text-1');
  });

  it('uses the application confirmation dialog before deleting a channel', async () => {
    const onDeleteChannel = vi.fn();
    render(<ServerView user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true }} server={server} servers={[server]} activeChannelId="text-1" messages={[]} messageDraft="" serverName="" busy={false} error={null} onBack={noop} onSwitchServer={noop} onChannel={noop} onMessageDraft={noop} onSendMessage={noop} onUpdateMessage={noop} onMessageReaction={noop} onDeleteMessage={noop} onDeleteAttachment={noop} onDownloadAttachment={noop} onConnectVoice={noop} onCopyInvite={noop} onCreateChannel={noop} onRenameChannel={noop} onDeleteChannel={onDeleteChannel} onKickMember={noop} onServerName={noop} onCreateServer={noop} onSecurity={noop} onServerSettings={noop} onLogout={noop} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: 'общий' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить канал' }));
    expect(screen.getByRole('dialog', { name: 'Удалить «общий»?' })).toBeInTheDocument();
    expect(onDeleteChannel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Удалить канал' }));
    expect(onDeleteChannel).toHaveBeenCalledWith('text-1');
  });
});
