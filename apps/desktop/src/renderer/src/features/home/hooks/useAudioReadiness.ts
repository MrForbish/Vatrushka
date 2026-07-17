import { useEffect, useState } from 'react';

export type MicrophonePermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface AudioReadinessState {
  permission: MicrophonePermissionState;
  inputLevel: number;
  signalDetected: boolean;
  error: string | null;
  testing: boolean;
}

const initialState: AudioReadinessState = { permission: 'prompt', inputLevel: 0, signalDetected: false, error: null, testing: false };

export function useAudioReadiness(deviceId: string | undefined, enabled: boolean, retryRevision = 0): AudioReadinessState {
  const [state, setState] = useState<AudioReadinessState>(initialState);

  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.getUserMedia) {
      setState((current) => ({ ...current, inputLevel: 0, signalDetected: false, testing: false }));
      return;
    }
    let active = true;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer: number | null = null;
    let permissionStatus: PermissionStatus | null = null;

    const stop = (): void => {
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close();
    };
    const startMeter = async (): Promise<void> => {
      try {
        setState((current) => ({ ...current, testing: true, error: null }));
        stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true });
        if (!active) return stop();
        context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const values = new Uint8Array(analyser.fftSize);
        timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(values);
          let sum = 0;
          for (const value of values) {
            const normalized = (value - 128) / 128;
            sum += normalized * normalized;
          }
          const level = Math.min(1, Math.sqrt(sum / values.length) * 3.4);
          setState({ permission: 'granted', inputLevel: level, signalDetected: level > 0.025, error: null, testing: true });
        }, 40);
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : '';
        const error = name === 'NotAllowedError'
          ? 'Доступ к микрофону запрещён в Windows.'
          : name === 'NotReadableError'
            ? 'Микрофон занят другим приложением.'
            : 'Не удалось проверить сигнал микрофона.';
        if (active) setState({ permission: name === 'NotAllowedError' ? 'denied' : 'granted', inputLevel: 0, signalDetected: false, error, testing: false });
      }
    };
    const inspectPermission = async (): Promise<void> => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        if (!active) return;
        const permission = permissionStatus.state;
        setState((current) => ({ ...current, permission }));
        if (permission === 'granted') await startMeter();
        else if (permission === 'denied') setState({ permission, inputLevel: 0, signalDetected: false, error: 'Доступ к микрофону запрещён в Windows.', testing: false });
        permissionStatus.onchange = () => {
          if (!active) return;
          const permission = permissionStatus?.state ?? 'prompt';
          setState((current) => ({ ...current, permission }));
          if (permission === 'granted' && stream === null) void startMeter();
        };
      } catch {
        if (active) setState((current) => ({ ...current, permission: 'unavailable', testing: false }));
      }
    };
    void inspectPermission();
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
      stop();
    };
  }, [deviceId, enabled, retryRevision]);

  return state;
}
