import { useEffect, useRef, useState } from 'react';

import { cameraDeviceOptions, type AudioDevices } from '../../../audio-devices';
import { AudioReadinessCard, useAudioReadiness } from '../../home';
import { Button, Icon, Select, Slider } from '../../../ui';
import './user-settings-pages.css';

export interface UserAudioSettingsPageProps {
  busy: boolean;
  cameraId?: string | undefined;
  devices: AudioDevices;
  inputLevel: number;
  microphoneId: string | undefined;
  microphoneVolume: number;
  outputId: string | undefined;
  outputVolume: number;
  voiceConnected: boolean;
  appSoundVolume: number;
  onMicrophone(deviceId: string): void;
  onCamera?(deviceId: string): void;
  onMicrophoneVolume(value: number): void;
  onOutput(deviceId: string): void;
  onOutputVolume(value: number): void;
  onRefresh(): void;
  onTestOutput(): void;
  onTestNotification(): void;
  onAppSoundVolume(value: number): void;
}

export function UserAudioSettingsPage({ appSoundVolume, busy, cameraId, devices, inputLevel, microphoneId, microphoneVolume, onAppSoundVolume, onCamera, onMicrophone, onMicrophoneVolume, onOutput, onOutputVolume, onRefresh, onTestNotification, onTestOutput, outputId, outputVolume, voiceConnected }: UserAudioSettingsPageProps): React.JSX.Element {
  const [testRevision, setTestRevision] = useState(0);
  const [microphoneTestActive, setMicrophoneTestActive] = useState(false);
  const readiness = useAudioReadiness(microphoneId, !voiceConnected && microphoneTestActive, testRevision);
  const effectiveLevel = voiceConnected ? inputLevel : readiness.inputLevel;

  return (
    <section className="vui-user-settings-page" aria-labelledby="user-audio-settings-title">
      <header className="vui-user-settings-page__heading"><div><span>Локальные настройки</span><h1 id="user-audio-settings-title">Звук и видео</h1><p>Выбор применяется к этому компьютеру и сохраняется через защищённый Electron bridge.</p></div></header>
      <div className="vui-user-audio-settings__grid">
        <AudioReadinessCard busy={busy} devices={devices} error={readiness.error} inputLevel={effectiveLevel} microphoneId={microphoneId} microphoneVolume={microphoneVolume} onMicrophone={onMicrophone} onMicrophoneVolume={onMicrophoneVolume} onOutput={onOutput} onOutputVolume={onOutputVolume} onRefresh={() => { onRefresh(); setTestRevision((value) => value + 1); }} onTestMicrophone={() => { setMicrophoneTestActive((active) => !active); setTestRevision((value) => value + 1); }} onTestOutput={onTestOutput} outputId={outputId} outputVolume={outputVolume} permission={readiness.permission} signalDetected={effectiveLevel > 0.025} testing={voiceConnected || readiness.testing} />
        <article className="vui-user-settings-card vui-user-audio-settings__volume">
          <header><div><h2>Громкость уведомлений</h2><p>Короткие сигналы Ватрушки для сообщений, голоса, демонстрации и обновлений. Системный toast остаётся без отдельного звука.</p></div></header>
          <Slider label="Громкость уведомлений" max={100} min={0} onChange={(event) => onAppSoundVolume(Number(event.target.value) / 100)} value={Math.round(appSoundVolume * 100)} valueLabel={`${Math.round(appSoundVolume * 100)}%`} />
          <Button disabled={busy} onClick={onTestNotification} size="sm" variant="secondary">Проверить уведомление</Button>
        </article>
        <CameraSettingsCard
          busy={busy}
          cameraId={cameraId}
          devices={devices.cameras ?? []}
          onCamera={onCamera ?? (() => undefined)}
        />
      </div>
      <aside className="vui-user-settings-note">Во время активного голосового подключения проверка использует уже открытый микрофон и не создаёт второй поток захвата.</aside>
    </section>
  );
}

function CameraSettingsCard({
  busy,
  cameraId,
  devices,
  onCamera,
}: {
  busy: boolean;
  cameraId: string | undefined;
  devices: MediaDeviceInfo[];
  onCamera(deviceId: string): void;
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const options = cameraDeviceOptions(devices);
  const selected = cameraId ?? options[0]?.value;

  const stopPreview = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewOpen(false);
  };

  const startPreview = async (deviceId = selected): Promise<void> => {
    stopPreview();
    if (!deviceId) return;
    setPreviewError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { ideal: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPreviewOpen(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setPreviewError(
        name === "NotAllowedError"
          ? "Доступ к камере запрещён в настройках Windows."
          : name === "NotFoundError"
            ? "Камера не найдена. Подключите устройство и обновите список."
            : "Не удалось открыть камеру. Возможно, её использует другое приложение.",
      );
    }
  };

  useEffect(() => () => stopPreview(), []);

  return (
    <article className="vui-user-settings-card vui-user-audio-settings__camera">
      <header><div><h2>Камера</h2><p>Камера включается только по кнопке в голосовом канале или при открытии предпросмотра.</p></div></header>
      {options.length > 0 ? (
        <Select
          disabled={busy}
          label="Устройство камеры"
          onValueChange={(value) => {
            onCamera(value);
            if (previewOpen) void startPreview(value);
          }}
          options={options}
          {...(selected === undefined ? {} : { value: selected })}
        />
      ) : (
        <p className="vui-user-audio-settings__camera-empty"><Icon name="cameraOff" size={18} /> Камера не найдена</p>
      )}
      {previewError ? <p className="vui-user-audio-settings__camera-error" role="alert">{previewError}</p> : null}
      {previewOpen ? (
        <div className="vui-user-audio-settings__camera-preview">
          <video autoPlay muted playsInline ref={videoRef} />
          <Button onClick={stopPreview} size="sm" variant="secondary">Закрыть предпросмотр</Button>
        </div>
      ) : (
        <Button disabled={busy || options.length === 0} onClick={() => void startPreview()} size="sm" variant="secondary">Открыть предпросмотр</Button>
      )}
    </article>
  );
}
