import { Button, Icon } from '../../../ui';
import type { SettingsSaveState } from '../model/settings.types';

export interface SettingsSaveBarProps {
  state: SettingsSaveState;
  onCancel(): void;
  onSave(): void;
}

export function SettingsSaveBar({ onCancel, onSave, state }: SettingsSaveBarProps): React.JSX.Element | null {
  if (state === 'idle') return null;
  const message = state === 'dirty' ? 'Есть несохранённые изменения' : state === 'saving' ? 'Сохраняем изменения…' : state === 'saved' ? 'Изменения сохранены' : 'Не удалось сохранить изменения';
  return (
    <div aria-live="polite" className="vui-settings-save-bar" data-state={state} role={state === 'error' ? 'alert' : 'status'}>
      <span><Icon name={state === 'saved' ? 'check' : state === 'error' ? 'warning' : 'info'} size={18} />{message}</span>
      {state === 'saved' ? null : <div><Button disabled={state === 'saving'} onClick={onCancel} size="sm" type="button" variant="quiet">Отменить</Button><Button disabled={state === 'saving'} loading={state === 'saving'} onClick={onSave} size="sm" type="button">Сохранить</Button></div>}
    </div>
  );
}
