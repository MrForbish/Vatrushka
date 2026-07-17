import { audioDeviceOptions, type AudioDevices } from '../../../audio-devices';
import { AudioLevelMeter, Button, Icon, Select } from '../../../ui';
import type { MicrophonePermissionState } from '../hooks/useAudioReadiness';

export interface AudioReadinessCardProps {
  devices: AudioDevices;
  microphoneId: string | undefined;
  outputId: string | undefined;
  busy: boolean;
  inputLevel?: number;
  permission?: MicrophonePermissionState;
  signalDetected?: boolean;
  error?: string | null;
  testing?: boolean;
  onMicrophone: (value: string) => void;
  onOutput: (value: string) => void;
  onRefresh: () => void;
  onTestOutput?: (() => void) | undefined;
}

export function AudioReadinessCard({ busy, devices, error = null, inputLevel = 0, microphoneId, onMicrophone, onOutput, onRefresh, onTestOutput, outputId, permission = 'prompt', signalDetected = false, testing = false }: AudioReadinessCardProps): React.JSX.Element {
  const inputOptions = audioDeviceOptions(devices.inputs, 'input');
  const outputOptions = audioDeviceOptions(devices.outputs, 'output');
  const hasInput = devices.inputs.length > 0;
  const hasOutput = devices.outputs.length > 0;
  const permissionDenied = permission === 'denied';
  const ready = hasInput && hasOutput && !permissionDenied && error === null;
  const inputStatus = permissionDenied ? 'Доступ запрещён' : error ?? (testing ? signalDetected ? 'Сигнал получен' : 'Ожидаем сигнал' : hasInput ? 'Нажмите «Проверить»' : 'Устройство не найдено');
  return (
    <section className="home-widget home-audio-readiness" id="home-audio" aria-labelledby="home-audio-title">
      <header className="home-widget__header"><div><span>Перед звонком</span><h2 id="home-audio-title">Готовность к аудио</h2></div><Button disabled={busy} icon="refresh" onClick={onRefresh} size="sm" variant="quiet">Обновить</Button></header>
      <div className="home-audio-readiness__devices">
        <article data-error={permissionDenied || error !== null || undefined}><header><span className="home-card-icon"><Icon name="mic" size={18} /></span><div><strong>Микрофон</strong><small>{inputStatus}</small></div></header><Select label="Устройство ввода" onValueChange={onMicrophone} options={inputOptions} value={microphoneId ?? 'default'} /><div className="home-audio-readiness__meter"><AudioLevelMeter label="Уровень сигнала микрофона" value={inputLevel} /><span>{signalDetected ? 'Сигнал есть' : testing ? 'Говорите в микрофон' : 'Проверка не запущена'}</span></div><Button disabled={busy} onClick={onRefresh} size="sm" variant="secondary">Проверить микрофон</Button></article>
        <article><header><span className="home-card-icon home-card-icon--cyan"><Icon name="headphones" size={18} /></span><div><strong>Вывод звука</strong><small>{hasOutput ? 'Устройство доступно' : 'Устройство не найдено'}</small></div></header><Select label="Динамики / наушники" onValueChange={onOutput} options={outputOptions} value={outputId ?? 'default'} /><div className="home-audio-readiness__output"><Icon name="volume" size={17} /><span>Общая громкость управляется системой</span></div><Button disabled={busy || !hasOutput || onTestOutput === undefined} onClick={onTestOutput} size="sm" variant="secondary">Воспроизвести сигнал</Button></article>
      </div>
      <p className="home-audio-readiness__summary" data-ready={ready || undefined}><Icon name={ready ? 'check' : 'warning'} size={16} />{ready ? 'Устройства настроены и готовы к работе' : 'Проверьте доступ к микрофону и устройство вывода'}</p>
    </section>
  );
}
