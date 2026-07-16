import { describe, expect, it, vi } from 'vitest';

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
