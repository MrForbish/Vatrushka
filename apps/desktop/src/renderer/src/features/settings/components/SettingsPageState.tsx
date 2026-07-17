import { Button, Icon, Skeleton } from '../../../ui';

export type SettingsPageStateKind = 'loading' | 'empty' | 'error' | 'permission' | 'conflict';

export interface SettingsPageStateProps {
  kind: SettingsPageStateKind;
  title?: string;
  description?: string;
  onAction?: (() => void) | undefined;
}

const copy: Record<Exclude<SettingsPageStateKind, 'loading'>, { title: string; description: string }> = {
  empty: { title: 'Здесь пока пусто', description: 'Данные появятся после первого сохранения.' },
  error: { title: 'Не удалось загрузить раздел', description: 'Проверьте соединение и повторите попытку.' },
  permission: { title: 'Недостаточно прав', description: 'Доступ к этому разделу мог быть изменён владельцем сервера.' },
  conflict: { title: 'Настройки изменились', description: 'Другая сессия сохранила новую версию. Обновите данные перед повторным сохранением.' },
};

export function SettingsPageState({ description, kind, onAction, title }: SettingsPageStateProps): React.JSX.Element {
  if (kind === 'loading') {
    return <section aria-busy="true" aria-label="Загрузка настроек" className="vui-settings-page-state vui-settings-page-state--loading"><Skeleton height="28px" width="42%" /><Skeleton height="92px" rounded /><Skeleton height="92px" rounded /></section>;
  }
  const stateCopy = copy[kind];
  return (
    <section className="vui-settings-page-state" role={kind === 'error' || kind === 'conflict' ? 'alert' : 'status'}>
      <span><Icon name={kind === 'permission' ? 'lock' : kind === 'empty' ? 'info' : 'warning'} size={24} /></span>
      <div><strong>{title ?? stateCopy.title}</strong><p>{description ?? stateCopy.description}</p></div>
      {onAction === undefined ? null : <Button icon="refresh" onClick={onAction} size="sm" type="button" variant="secondary">{kind === 'conflict' ? 'Обновить данные' : 'Повторить'}</Button>}
    </section>
  );
}
