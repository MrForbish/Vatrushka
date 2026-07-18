import { describe, expect, it, vi } from 'vitest';
import { ConnectionState, Track } from 'livekit-client';

import type { RoomConnection } from '@vatrushka/shared';

import type { ApiClient } from './api';
import { MediaSession } from './media';

interface DeviceSwitchRoom {
  switchActiveDevice(kind: 'audioinput' | 'audiooutput', deviceId: string, exact: boolean): Promise<boolean>;
}

function sessionWithRoom(room: DeviceSwitchRoom): MediaSession {
  const session = new MediaSession({} as ApiClient);
  (session as unknown as { room: DeviceSwitchRoom }).room = room;
  return session;
}

describe('MediaSession audio devices', () => {
  it('switches LiveKit input and output devices immediately', async () => {
    const switchActiveDevice = vi.fn().mockResolvedValue(true);
    const session = sessionWithRoom({ switchActiveDevice });

    await session.switchMicrophone('microphone-studio');
    await session.switchOutput('headphones-usb');

    expect(switchActiveDevice).toHaveBeenNthCalledWith(1, 'audioinput', 'microphone-studio', true);
    expect(switchActiveDevice).toHaveBeenNthCalledWith(2, 'audiooutput', 'headphones-usb', true);
  });

  it('does not silently accept a device rejected by LiveKit', async () => {
    const session = sessionWithRoom({ switchActiveDevice: vi.fn().mockResolvedValue(false) });

    await expect(session.switchMicrophone('missing-microphone')).rejects.toThrow('Не удалось выбрать микрофон');
    await expect(session.switchOutput('missing-output')).rejects.toThrow('Не удалось выбрать устройство вывода');
  });
});

describe('MediaSession incoming audio', () => {
  function deafeningSession(): {
    session: MediaSession;
    setMicrophoneEnabled: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
  } {
    const session = new MediaSession({} as ApiClient);
    const setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
    const setVolume = vi.fn();
    const participant = { identity: 'remote-1', setVolume };
    const internals = session as unknown as {
      room: {
        localParticipant: { setMicrophoneEnabled(enabled: boolean): Promise<void> };
        remoteParticipants: Map<string, typeof participant>;
      };
      refreshSnapshot(): void;
    };
    internals.room = {
      localParticipant: { setMicrophoneEnabled },
      remoteParticipants: new Map([[participant.identity, participant]]),
    };
    vi.spyOn(internals, 'refreshSnapshot').mockImplementation(() => undefined);
    return { session, setMicrophoneEnabled, setVolume };
  }

  it('mutes the microphone, voices and screen audio while preserving local volume preferences', async () => {
    const { session, setMicrophoneEnabled, setVolume } = deafeningSession();
    session.setParticipantVolume('remote-1', 0.4);
    session.setScreenShareAudioVolume(0.6);

    await session.setDeafened(true);
    session.setParticipantVolume('remote-1', 0.7);
    await session.setMuted(false);

    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(setVolume).toHaveBeenCalledWith(0, Track.Source.Microphone);
    expect(setVolume).toHaveBeenCalledWith(0, Track.Source.ScreenShareAudio);

    await session.setDeafened(false);

    expect(setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith(0.7, Track.Source.Microphone);
    expect(setVolume).toHaveBeenCalledWith(0.6, Track.Source.ScreenShareAudio);
  });
});

describe('MediaSession screen share', () => {
  function screenShareSession(setScreenShareEnabled: (...args: unknown[]) => Promise<void>, restrictOwnAudio = true): MediaSession {
    const session = new MediaSession({} as ApiClient);
    const internals = session as unknown as {
      room: {
        state: ConnectionState;
        localParticipant: {
          isScreenShareEnabled: boolean;
          setScreenShareEnabled: typeof setScreenShareEnabled;
          getTrackPublication(source: Track.Source): { track: { mediaStreamTrack: { getSettings(): { restrictOwnAudio: boolean } } } } | undefined;
        };
      };
      connection: RoomConnection;
      startHeartbeat(): void;
      refreshSnapshot(): void;
    };
    const localParticipant = {
      isScreenShareEnabled: false,
      setScreenShareEnabled: vi.fn(async (...args: unknown[]) => {
        await setScreenShareEnabled(...args);
        localParticipant.isScreenShareEnabled = args[0] === true;
      }),
      getTrackPublication: (source: Track.Source) => source === Track.Source.ScreenShareAudio
        ? { track: { mediaStreamTrack: { getSettings: () => ({ restrictOwnAudio }) } } }
        : undefined,
    };
    internals.room = {
      state: ConnectionState.Connected,
      localParticipant,
    };
    internals.connection = { roomId: 'channel-1', ownerUserId: 'owner-1', livekitUrl: 'ws://test', livekitToken: 'token', participantIdentity: 'local', participantDisplayName: 'Local', isOwner: true, contextType: 'channel', serverId: 'server-1', channelId: 'channel-1' };
    vi.spyOn(internals, 'startHeartbeat').mockImplementation(() => undefined);
    vi.spyOn(internals, 'refreshSnapshot').mockImplementation(() => undefined);
    return session;
  }

  it('requests system audio while excluding the app own audio', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare({ width: 3840, height: 2160 });

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        audio: expect.objectContaining({ restrictOwnAudio: { exact: true } }),
        resolution: { width: 1920, height: 1080, frameRate: 60 },
        systemAudio: 'include',
      }),
      expect.objectContaining({
        degradationPreference: 'maintain-resolution',
        screenShareEncoding: expect.objectContaining({ maxBitrate: 10_000_000, maxFramerate: 60 }),
      }),
    );
  });

  it('stops an unsafe audio share when Chromium did not exclude the app voices', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled, false);

    await expect(session.startScreenShare()).rejects.toThrow('Windows не смогла безопасно исключить голоса участников');
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false);
  });

  it('turns the LiveKit publishing timeout into a reconnect instruction', async () => {
    const session = screenShareSession(vi.fn().mockRejectedValue(new Error('publishing rejected as engine not connected within timeout')));

    await expect(session.startScreenShare()).rejects.toThrow('Дождитесь переподключения');
  });

  it('reports a closed source instead of a generic publish failure', async () => {
    const session = screenShareSession(vi.fn().mockRejectedValue(new DOMException('gone', 'NotFoundError')));

    await expect(session.startScreenShare()).rejects.toThrow('Выбранный экран или окно больше недоступны');
  });

  it('publishes the optional 1440p preset at 60 FPS', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare({ width: 3840, height: 2160 }, '1440p60');

    expect(setScreenShareEnabled).toHaveBeenCalledWith(true, expect.objectContaining({ resolution: { width: 2560, height: 1440, frameRate: 60 } }), expect.objectContaining({ screenShareEncoding: expect.objectContaining({ maxBitrate: 18_000_000, maxFramerate: 60 }) }));
  });
});
