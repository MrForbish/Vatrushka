import { ConnectionState } from 'livekit-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RoomConnection } from '@vatrushka/shared';

import { AuthPanel, GuestJoinPanel, HomePanel, RoomView } from './components.js';
import type { MediaSnapshot } from './media.js';

const noop = (): void => undefined;

describe('authentication screens', () => {
  it('renders an accessible email form', async () => {
    const onRequest = vi.fn();
    render(<AuthPanel stage="email" email="" code="" retrySeconds={0} busy={false} error={null} onEmailChange={noop} onCodeChange={noop} onRequest={onRequest} onVerify={noop} onBack={noop} />);
    expect(screen.getByRole('heading', { name: 'Войдите без пароля' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    await userEvent.click(screen.getByRole('button', { name: /Получить код/u }));
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('renders OTP state, retry countdown, and an error alert', () => {
    render(<AuthPanel stage="otp" email="test@example.com" code="123" retrySeconds={42} busy={false} error="Неверный код" onEmailChange={noop} onCodeChange={noop} onRequest={noop} onVerify={noop} onBack={noop} />);
    expect(screen.getByLabelText('Код из письма')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('button', { name: 'Отправить снова через 42 с' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });
});

describe('main and guest screens', () => {
  it('shows user identity, room actions, audio settings, and app version', () => {
    render(<HomePanel user={{ id: 'user-1', email: 'anna@example.com', displayName: 'Anna' }} version="1.2.3" roomCode="ABC234" devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} busy={false} error={null} onRoomCode={noop} onCreate={noop} onJoin={noop} onLogout={noop} onMicrophone={noop} onOutput={noop} />);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать комнату/u })).toBeEnabled();
    expect(screen.getByLabelText('Код комнаты')).toHaveValue('ABC234');
    expect(screen.getByLabelText('Микрофон')).toBeInTheDocument();
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
      { identity: 'user_owner-1_local', displayName: 'Owner', isLocal: true, isOwner: true, isGuest: false, isMuted: true, isSpeaking: false, isScreenSharing: false, connectionQuality: 'Отличное' },
      { identity: 'guest_guest-1_remote', displayName: 'Visitor', isLocal: false, isOwner: false, isGuest: true, isMuted: false, isSpeaking: true, isScreenSharing: false, connectionQuality: 'Хорошее' },
    ],
    isMuted: true,
    isScreenSharing: false,
    screenTrack: null,
    screenSharerName: null,
    canPlayAudio: true,
    error: null,
  };

  it('shows participants, speaking and mute text, stable controls, and owner moderation', () => {
    render(<RoomView connection={connection} snapshot={baseSnapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} locked={false} busy={false} error={null} onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onLock={noop} onClose={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} />);
    expect(screen.getByText('Owner (вы)')).toBeInTheDocument();
    expect(screen.getByText(/Visitor/u)).toBeInTheDocument();
    expect(screen.getByText(/говорит/u)).toBeInTheDocument();
    expect(screen.getByTestId('mute-control')).toHaveAccessibleName('Включить микрофон');
    expect(screen.getByTestId('screen-share-control')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Закрыть вход' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Исключить Visitor' })).toBeInTheDocument();
  });

  it('shows reconnect, busy, and error states without relying only on color', () => {
    const snapshot = { ...baseSnapshot, connectionState: ConnectionState.Reconnecting };
    render(<RoomView connection={connection} snapshot={snapshot} devices={{ inputs: [], outputs: [] }} microphoneId={undefined} outputId={undefined} locked={true} busy error="Другой участник уже показывает экран" onMute={noop} onShare={noop} onCopy={noop} onLeave={noop} onLock={noop} onClose={noop} onKick={noop} onMicrophone={noop} onOutput={noop} onStartAudio={noop} />);
    expect(screen.getByText('Переподключение…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Другой участник уже показывает экран');
    expect(screen.getByRole('button', { name: 'Открыть вход' })).toBeDisabled();
    expect(screen.getByTestId('screen-share-control')).toBeDisabled();
  });
});
