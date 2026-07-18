import type { HomePresence, PublicUser } from '@vatrushka/shared';

import { Avatar, Badge, Icon, IconButton, StatusDot } from '../../../ui';

export interface HomeProfileRailProps {
  user: PublicUser;
  version: string;
  presence?: HomePresence;
  onSecurity: () => void;
  onLogout: () => void;
}

export function HomeProfileRail({ onLogout, onSecurity, presence = 'online', user, version }: HomeProfileRailProps): React.JSX.Element {
  const name = user.displayName ?? user.email;
  const founder = user.platformRole === 'owner';
  const status = presence === 'dnd' ? { label: 'Не беспокоить', copy: 'Внешние уведомления отключены' } : presence === 'idle' ? { label: 'Неактивен', copy: 'Пользователь отошёл' } : presence === 'offline' ? { label: 'Не в сети', copy: 'Статус скрыт или соединение отсутствует' } : { label: 'В сети', copy: 'Уведомления включены' };
  return (
    <aside className="home-profile-rail" aria-label="Профиль пользователя">
      <header><span>Профиль</span><StatusDot label={status.label} status={presence} /></header>
      <div className="home-profile-rail__identity"><Avatar name={name} size="lg" status={presence} /><strong>{name}</strong><small>{user.email}</small>{founder ? <Badge tone="founder">CEO Founder</Badge> : <Badge tone={presence === 'dnd' ? 'danger' : presence === 'online' ? 'success' : 'neutral'}>{status.label}</Badge>}</div>
      <div className="home-profile-rail__status"><StatusDot label={status.label} status={presence} /><div><strong>{status.label}</strong><small>{status.copy}</small></div></div>
      <div className="home-profile-rail__tip"><Icon name="info" size={17} /><p>Выбор аудиоустройств хранится только на этом компьютере.</p></div>
      <footer><span>Vatrushka v{version}</span><div><IconButton icon="settings" label="Безопасность и настройки" onClick={onSecurity} size="sm" type="button" /><IconButton icon="logout" label="Выйти из аккаунта" onClick={onLogout} size="sm" type="button" /></div></footer>
    </aside>
  );
}
