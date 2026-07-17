import type { DesktopUpdateState } from '@vatrushka/shared';

import './update-status.css';

export interface UpdateStatusProps {
  state: DesktopUpdateState;
  onCheck(): void;
  onInstall(): void;
}

export function UpdateStatus({ state, onCheck, onInstall }: UpdateStatusProps): React.JSX.Element | null {
  if (state.status === 'unsupported') return null;

  const version = state.version ? ` ${state.version}` : '';
  const content = state.status === 'checking'
    ? 'Проверяем обновления…'
    : state.status === 'available'
      ? `Доступна версия${version}. Начинаем загрузку…`
      : state.status === 'downloading'
        ? `Загружаем версию${version}: ${state.percent ?? 0}%`
        : state.status === 'ready'
          ? `Версия${version} готова к установке`
          : state.status === 'error'
            ? state.message ?? 'Не удалось проверить обновления.'
            : state.status === 'up-to-date'
              ? 'Установлена актуальная версия'
              : `Версия ${state.currentVersion}`;

  return (
    <div className="updateStatus" data-status={state.status} role="status" aria-live="polite">
      <span className="updateStatusDot" aria-hidden="true" />
      <div>
        <strong>Обновление клиента</strong>
        <span>{content}</span>
        {state.status === 'downloading'
          ? <progress aria-label="Загрузка обновления" max={100} value={state.percent ?? 0} />
          : null}
      </div>
      {state.status === 'ready'
        ? <button onClick={onInstall} type="button">Перезапустить</button>
        : state.status === 'idle' || state.status === 'up-to-date' || state.status === 'error'
          ? <button onClick={onCheck} type="button">Проверить</button>
          : null}
    </div>
  );
}
