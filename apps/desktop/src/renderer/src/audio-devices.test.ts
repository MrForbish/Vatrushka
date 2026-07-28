import { describe, expect, it } from 'vitest';

import { audioDeviceOptions, cameraDeviceOptions, splitAudioDevices } from './audio-devices';

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({}) };
}

describe('audio device presentation', () => {
  it('shows real Windows labels and removes pseudo communication devices', () => {
    const devices = [
      device('audioinput', 'default', 'Default - Microphone Array (Realtek Audio)'),
      device('audioinput', 'communications', 'Communications - Microphone Array (Realtek Audio)'),
      device('audioinput', 'realtek-input', 'Microphone Array (Realtek Audio)'),
    ];

    expect(audioDeviceOptions(devices, 'input')).toEqual([
      { value: 'default', label: 'Системное · Microphone Array (Realtek Audio)' },
      { value: 'realtek-input', label: 'Microphone Array (Realtek Audio)' },
    ]);
  });

  it('keeps audio inputs, outputs and cameras separate and deduplicated', () => {
    const input = device('audioinput', 'mic', 'USB Microphone');
    const output = device('audiooutput', 'speaker', 'USB Headset');
    const camera = device('videoinput', 'camera', 'USB Camera');
    expect(splitAudioDevices([input, input, output, camera, camera])).toEqual({
      inputs: [input],
      outputs: [output],
      cameras: [camera],
    });
    expect(cameraDeviceOptions([camera])).toEqual([
      { value: 'camera', label: 'USB Camera' },
    ]);
  });
});
