import { Badge, Button, Icon } from '../../../ui';
import type { HomeContinueItem } from '../model/home.types';

export interface ContinueSectionProps {
  items: HomeContinueItem[];
  onOpen: (item: HomeContinueItem) => void;
}

export function ContinueSection({ items, onOpen }: ContinueSectionProps): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className="home-widget home-continue" aria-labelledby="home-continue-title">
      <header className="home-widget__header"><div><span>Быстрый возврат</span><h2 id="home-continue-title">Продолжить</h2></div></header>
      <div className="home-continue__grid">
        {items.slice(0, 2).map((item) => (
          <article className="home-continue-card" data-active={item.active || undefined} key={item.id}>
            <span className="home-card-icon"><Icon name={item.type === 'active_call' || item.type === 'voice_channel' ? 'voice' : item.type === 'text_channel' ? 'hash' : 'users'} size={20} /></span>
            <div className="home-continue-card__copy"><strong>{item.title}</strong><small>{item.subtitle}</small></div>
            {item.active ? <Badge tone="success">В звонке</Badge> : null}
            <div className="home-continue-card__meta"><span><span className="home-live-dot" />{item.participantCount} участников</span><Button onClick={() => onOpen(item)} size="sm" variant={item.active ? 'primary' : 'secondary'}>{item.active ? 'Вернуться' : 'Перейти'}</Button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
