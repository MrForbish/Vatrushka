import type { PublicUser } from '@vatrushka/shared';

import { Avatar, Badge, Icon, IconButton, StatusDot } from '../../../ui';

export interface HomeProfileRailProps {
  user: PublicUser;
  version: string;
  onSecurity: () => void;
  onLogout: () => void;
}

export function HomeProfileRail({ onLogout, onSecurity, user, version }: HomeProfileRailProps): React.JSX.Element {
  const name = user.displayName ?? user.email;
  const founder = user.platformRole === 'owner';
  return (
    <aside className="home-profile-rail" aria-label="Профиль пользователя">
      <header><span>Профиль</span><StatusDot label="В сети" status="online" /></header>
      <div className="home-profile-rail__identity"><Avatar name={name} size="lg" status="online" /><strong>{name}</strong><small>{user.email}</small>{founder ? <Badge tone="founder">FOUNDER · DEV</Badge> : <Badge tone="success">В сети</Badge>}</div>
      <div className="home-profile-rail__status"><span className="home-live-dot" /><div><strong>Готов к общению</strong><small>Уведомления включены</small></div></div>
      <div className="home-profile-rail__tip"><Icon name="info" size={17} /><p>Выбор аудиоустройств хранится только на этом компьютере.</p></div>
      <footer><span>Vatrushka v{version}</span><div><IconButton icon="settings" label="Безопасность и настройки" onClick={onSecurity} size="sm" type="button" /><IconButton icon="logout" label="Выйти из аккаунта" onClick={onLogout} size="sm" type="button" /></div></footer>
    </aside>
  );
}
