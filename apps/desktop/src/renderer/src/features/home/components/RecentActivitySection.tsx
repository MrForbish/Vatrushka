import { Icon } from '../../../ui';
import type { HomeRecentActivityItem } from '../model/home.types';

const activityIcons: Record<HomeRecentActivityItem['type'], 'hash' | 'voice' | 'message' | 'users' | 'bell'> = {
  opened_channel: 'hash',
  joined_voice: 'voice',
  left_voice: 'voice',
  sent_message: 'message',
  joined_server: 'users',
  mention_received: 'bell',
};

export interface RecentActivitySectionProps {
  items: HomeRecentActivityItem[];
  onOpen?: ((item: HomeRecentActivityItem) => void) | undefined;
}

export function RecentActivitySection({ items, onOpen }: RecentActivitySectionProps): React.JSX.Element {
  return (
    <section className="home-widget home-recent" aria-labelledby="home-recent-title">
      <header className="home-widget__header"><div><span>История</span><h2 id="home-recent-title">Недавняя активность</h2></div></header>
      {items.length === 0 ? <div className="home-empty home-empty--compact"><span><Icon name="sparkles" size={20} /></span><div><strong>Здесь появится ваша активность</strong><p>Открывайте каналы и общайтесь — важные места останутся под рукой.</p></div></div> : <div className="home-recent__list">{items.slice(0, 5).map((item) => <button disabled={item.destination === null || onOpen === undefined} key={item.id} onClick={() => onOpen?.(item)} type="button"><span className="home-card-icon"><Icon name={activityIcons[item.type]} size={17} /></span><span><strong>{item.title}</strong><small>{item.context}</small></span><time dateTime={item.occurredAt}>{formatActivityTime(item.occurredAt)}</time></button>)}</div>}
    </section>
  );
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(date);
}
