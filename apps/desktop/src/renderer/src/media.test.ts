import { describe, expect, it, vi } from 'vitest';

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
  function screenShareSession(setScreenShareEnabled: ReturnType<typeof vi.fn>): MediaSession {
    const session = new MediaSession({} as ApiClient);
    const internals = session as unknown as {
      room: { localParticipant: { setScreenShareEnabled: typeof setScreenShareEnabled } };
      connection: RoomConnection;
      startHeartbeat(): void;
      refreshSnapshot(): void;
    };
    internals.room = { localParticipant: { setScreenShareEnabled } };
    internals.connection = { roomId: 'room-1', ownerUserId: 'owner-1', code: 'ABC234', livekitUrl: 'ws://test', livekitToken: 'token', participantIdentity: 'local', participantDisplayName: 'Local', isOwner: true };
    vi.spyOn(internals, 'startHeartbeat').mockImplementation(() => undefined);
    vi.spyOn(internals, 'refreshSnapshot').mockImplementation(() => undefined);
    return session;
  }

  it('requests system audio while excluding the app own audio', async () => {
    const setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
    const session = screenShareSession(setScreenShareEnabled);

    await session.startScreenShare(true);

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        audio: expect.objectContaining({ restrictOwnAudio: true }),
        systemAudio: 'include',
      }),
      expect.any(Object),
    );
  });

  it('reports a closed source instead of a generic publish failure', async () => {
    const session = screenShareSession(vi.fn().mockRejectedValue(new DOMException('gone', 'NotFoundError')));

    await expect(session.startScreenShare(true)).rejects.toThrow('Выбранный экран или окно больше недоступны');
  });
});
