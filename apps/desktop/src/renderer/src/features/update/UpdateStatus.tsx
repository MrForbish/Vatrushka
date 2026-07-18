import { useEffect, useState } from 'react';

import type { DesktopUpdateState } from '@vatrushka/shared';

import { Button, IconButton } from '../../ui';
import './update-status.css';

export interface UpdateStatusProps {
  state: DesktopUpdateState;
  installBlocked?: boolean;
  onInstall(): void;
}

export function UpdateStatus({ installBlocked = false, state, onInstall }: UpdateStatusProps): React.JSX.Element | null {
  const notificationKey = `${state.status}:${state.version ?? ''}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  useEffect(() => { setDismissedKey(null); }, [notificationKey]);
  const visible = state.status === 'available' || state.status === 'downloading' || state.status === 'ready';
  if (!visible || dismissedKey === notificationKey) return null;

  const version = state.version ? ` ${state.version}` : '';
  const content = state.status === 'available'
      ? `Доступна версия${version}. Начинаем загрузку…`
      : state.status === 'downloading'
        ? `Загружаем версию${version}: ${state.percent ?? 0}%`
        : `Версия${version} готова к установке`;

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
        ? <Button disabled={installBlocked} onClick={onInstall} size="sm" {...(installBlocked ? { title: 'Сначала завершите голосовой звонок' } : {})} type="button">{installBlocked ? 'После звонка' : 'Перезапустить'}</Button>
        : null}
      <IconButton className="updateStatusClose" icon="close" label="Скрыть уведомление об обновлении" onClick={() => setDismissedKey(notificationKey)} size="sm" type="button" />
    </div>
  );
}
