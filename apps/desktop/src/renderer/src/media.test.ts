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

describe('MediaSession screen share', () => {
  function screenShareSession(setScreenShareEnabled: ReturnType<typeof vi.fn>, restrictOwnAudio = true): MediaSession {
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
    internals.room = {
      state: ConnectionState.Connected,
      localParticipant: {
        isScreenShareEnabled: true,
        setScreenShareEnabled,
        getTrackPublication: (source) => source === Track.Source.ScreenShareAudio
          ? { track: { mediaStreamTrack: { getSettings: () => ({ restrictOwnAudio }) } } }
          : undefined,
      },
    };
    internals.connection = { roomId: 'channel-1', ownerUserId: 'owner-1', livekitUrl: 'ws://test', livekitToken: 'token', participantIdentity: 'local', participantDisplayName: 'Local', isOwner: true, contextType: 'channel', serverId: 'server-1', channelId: 'channel-1' };
    vi.spyOn(internals, 'startHeartbeat').mockImplementation(() => undefined);
    vi.spyOn(internals, 'refreshSnapshot').mockImplementation(() => undefined);
    return session;
  }

  it('requests system audio while excluding the app own audio', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare(true, { width: 3840, height: 2160 });

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        audio: expect.objectContaining({ restrictOwnAudio: { exact: true } }),
        resolution: { width: 2560, height: 1440, frameRate: 30 },
        systemAudio: 'include',
      }),
      expect.objectContaining({
        degradationPreference: 'maintain-resolution',
        screenShareEncoding: expect.objectContaining({ maxBitrate: 8_000_000, maxFramerate: 30 }),
      }),
    );
  });

  it('stops an unsafe audio share when Chromium did not exclude the app voices', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled, false);

    await expect(session.startScreenShare(true)).rejects.toThrow('Windows не смогла исключить голоса участников');
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false);
  });

  it('turns the LiveKit publishing timeout into a reconnect instruction', async () => {
    const session = screenShareSession(vi.fn().mockRejectedValue(new Error('publishing rejected as engine not connected within timeout')));

    await expect(session.startScreenShare(false)).rejects.toThrow('Дождитесь переподключения');
  });

  it('reports a closed source instead of a generic publish failure', async () => {
    const session = screenShareSession(vi.fn().mockRejectedValue(new DOMException('gone', 'NotFoundError')));

    await expect(session.startScreenShare(true)).rejects.toThrow('Выбранный экран или окно больше недоступны');
  });
});
