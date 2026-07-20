import { useState } from 'react';

import type { AudioDevices } from '../../../audio-devices';
import { AudioReadinessCard, useAudioReadiness } from '../../home';
import { Slider } from '../../../ui';
import './user-settings-pages.css';

export interface UserAudioSettingsPageProps {
  busy: boolean;
  devices: AudioDevices;
  inputLevel: number;
  microphoneId: string | undefined;
  outputId: string | undefined;
  voiceConnected: boolean;
  appSoundVolume: number;
  onMicrophone(deviceId: string): void;
  onOutput(deviceId: string): void;
  onRefresh(): void;
  onTestOutput(): void;
  onAppSoundVolume(value: number): void;
}

export function UserAudioSettingsPage({ appSoundVolume, busy, devices, inputLevel, microphoneId, onAppSoundVolume, onMicrophone, onOutput, onRefresh, onTestOutput, outputId, voiceConnected }: UserAudioSettingsPageProps): React.JSX.Element {
  const [testRevision, setTestRevision] = useState(0);
  const readiness = useAudioReadiness(microphoneId, !voiceConnected, testRevision);
  const effectiveLevel = voiceConnected ? inputLevel : readiness.inputLevel;

  return (
    <section className="vui-user-settings-page" aria-labelledby="user-audio-settings-title">
      <header className="vui-user-settings-page__heading"><div><span>Локальные настройки</span><h1 id="user-audio-settings-title">Голос и звук</h1><p>Выбор применяется к этому компьютеру и сохраняется через защищённый Electron bridge.</p></div></header>
      <AudioReadinessCard busy={busy} devices={devices} error={readiness.error} inputLevel={effectiveLevel} microphoneId={microphoneId} onMicrophone={onMicrophone} onOutput={onOutput} onRefresh={() => { onRefresh(); setTestRevision((value) => value + 1); }} onTestOutput={onTestOutput} outputId={outputId} permission={readiness.permission} signalDetected={effectiveLevel > 0.025} testing={voiceConnected || readiness.testing} />
      <article className="vui-user-settings-card">
        <header><div><h2>Громкость звуков приложения</h2><p>Вход и выход из голоса, старт и остановка демонстрации, сообщения и обновления.</p></div></header>
        <Slider label="Громкость звуков приложения" max={100} min={0} onChange={(event) => onAppSoundVolume(Number(event.target.value) / 100)} value={Math.round(appSoundVolume * 100)} valueLabel={`${Math.round(appSoundVolume * 100)}%`} />
      </article>
      <aside className="vui-user-settings-note">Во время активного голосового подключения проверка использует уже открытый микрофон и не создаёт второй поток захвата.</aside>
    </section>
  );
}
