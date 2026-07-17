export interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

export interface AudioDeviceOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function cleanSystemLabel(label: string): string {
  return label.trim().replace(/^(?:default|по умолчанию|устройство по умолчанию)\s*[-–—:]\s*/iu, '');
}

export function splitAudioDevices(devices: MediaDeviceInfo[]): AudioDevices {
  const unique = new Map<string, MediaDeviceInfo>();
  for (const device of devices) {
    if (device.kind !== 'audioinput' && device.kind !== 'audiooutput') continue;
    unique.set(`${device.kind}:${device.deviceId}`, device);
  }
  const values = [...unique.values()];
  return {
    inputs: values.filter((device) => device.kind === 'audioinput'),
    outputs: values.filter((device) => device.kind === 'audiooutput'),
  };
}

export function audioDeviceOptions(devices: MediaDeviceInfo[], kind: 'input' | 'output'): AudioDeviceOption[] {
  const systemDevice = devices.find((device) => device.deviceId === 'default');
  const systemName = cleanSystemLabel(systemDevice?.label ?? '');
  const options: AudioDeviceOption[] = [{
    value: 'default',
    label: systemName.length > 0 ? `Системное · ${systemName}` : 'Системное устройство',
  }];
  const concrete = devices.filter((device) => device.deviceId !== 'default' && device.deviceId !== 'communications');
  for (const device of concrete) {
    const label = device.label.trim();
    options.push({
      value: device.deviceId,
      label: label.length > 0
        ? label
        : kind === 'input'
          ? 'Название микрофона скрыто Windows'
          : 'Название динамиков скрыто Windows',
    });
  }
  return options;
}
