import { Icon, type IconName } from '../../../ui';

interface QuickAction {
  id: 'create' | 'invite' | 'audio';
  icon: IconName;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface QuickActionsPanelProps {
  onCreate: () => void;
  onInvite: () => void;
  onAudio: () => void;
  networkAvailable?: boolean;
}

export function QuickActionsPanel({ networkAvailable = true, onAudio, onCreate, onInvite }: QuickActionsPanelProps): React.JSX.Element {
  const actions: QuickAction[] = [
    { id: 'create', icon: 'plus', title: 'Создать сервер', description: 'Новое пространство для команды или друзей.', onClick: onCreate, disabled: !networkAvailable },
    { id: 'invite', icon: 'invite', title: 'Пригласить друзей', description: 'Отправьте короткую ссылку на сервер.', onClick: onInvite, disabled: !networkAvailable },
    { id: 'audio', icon: 'headphones', title: 'Настроить звук', description: 'Выберите микрофон и наушники.', onClick: onAudio },
  ];
  return <section className="home-quick-actions" aria-label="Быстрые действия">{actions.map((action) => <button aria-label={action.title} disabled={action.disabled} key={action.id} onClick={action.onClick} type="button"><span className="home-card-icon"><Icon name={action.icon} size={18} /></span><span><strong>{action.title}</strong><small>{action.description}</small></span><Icon name="chevronDown" size={17} /></button>)}</section>;
}
