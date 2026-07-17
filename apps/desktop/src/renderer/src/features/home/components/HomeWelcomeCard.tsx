import type { PublicUser } from '@vatrushka/shared';

import { Badge, Icon } from '../../../ui';

export interface HomeWelcomeCardProps {
  user: PublicUser;
  audioReady: boolean;
  connection: 'healthy' | 'degraded' | 'offline';
}

export function HomeWelcomeCard({ audioReady, connection, user }: HomeWelcomeCardProps): React.JSX.Element {
  const name = user.displayName ?? user.email;
  const status = connection === 'offline'
    ? { tone: 'danger' as const, label: 'Нет подключения' }
    : connection === 'degraded'
      ? { tone: 'warning' as const, label: 'Связь нестабильна' }
      : audioReady
        ? { tone: 'success' as const, label: 'Всё готово' }
        : { tone: 'warning' as const, label: 'Настройте звук' };

  return (
    <section className="home-welcome" aria-labelledby="home-welcome-title">
      <div className="home-welcome__copy">
        <Badge tone={status.tone}><span className="home-live-dot" />{status.label}</Badge>
        <h1 id="home-welcome-title">Добро пожаловать, <em>{name}</em></h1>
        <p>{connection === 'offline' ? 'Показываем последние доступные данные. Сетевые действия временно недоступны.' : 'Возвращайтесь в разговор, посмотрите, где сейчас общаются, или начните новое пространство.'}</p>
      </div>
      <div aria-hidden="true" className="home-welcome__art"><span><Icon name="voice" size={30} /></span><i /><i /></div>
    </section>
  );
}
