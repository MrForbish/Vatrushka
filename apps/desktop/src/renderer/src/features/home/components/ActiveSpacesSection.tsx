import { Avatar, Badge, Button, Icon } from "../../../ui";
import type { HomeActiveSpaceItem } from "../model/home.types";

export interface ActiveSpacesSectionProps {
  items: HomeActiveSpaceItem[];
  onOpen: (item: HomeActiveSpaceItem) => void;
}

export function ActiveSpacesSection({
  items,
  onOpen,
}: ActiveSpacesSectionProps): React.JSX.Element {
  return (
    <section
      className="home-widget home-spaces"
      aria-labelledby="home-spaces-title"
    >
      <header className="home-widget__header">
        <div>
          <span>Сейчас в Ватрушке</span>
          <h2 id="home-spaces-title">Активные пространства</h2>
        </div>
        {items.length === 0 ? null : <Badge>{items.length}</Badge>}
      </header>
      {items.length === 0 ? (
        <div className="home-empty">
          <span>
            <Icon name="voice" size={22} />
          </span>
          <div>
            <strong>Сейчас никто не общается</strong>
            <p>
              Когда участники подключатся к голосовому каналу, активные
              пространства появятся здесь.
            </p>
          </div>
        </div>
      ) : (
        <div className="home-spaces__list">
          {items.slice(0, 4).map((item) => (
            <article className="home-space-row" key={item.id}>
              <span className="home-card-icon">
                <Icon
                  name={item.type === "voice_channel" ? "voice" : "hash"}
                  size={18}
                />
              </span>
              <div className="home-space-row__copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
              <div className="home-avatar-stack">
                {item.participants.slice(0, 4).map((participant) => (
                  <Avatar
                    key={participant.id}
                    name={participant.displayName}
                    size="sm"
                  />
                ))}
                {item.participantCount > 4 ? (
                  <span>+{item.participantCount - 4}</span>
                ) : null}
              </div>
              {item.hasVoiceActivity ? (
                <span
                  className="home-wave"
                  aria-label="Есть голосовая активность"
                  role="img"
                >
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {item.unreadCount > 0 ? (
                <Badge tone="primary">{item.unreadCount}</Badge>
              ) : null}
              <Button onClick={() => onOpen(item)} size="sm" variant="quiet">
                Перейти
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
