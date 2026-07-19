import type {
  GamingHomeFriend,
  GamingHomeQuickReturnItem,
  GamingHomeVoiceSpace,
  GamingHomeVoiceStatus,
} from "@vatrushka/shared";
import type { ReactNode } from "react";

import { Avatar, Badge, Button, Icon } from "../../../ui";

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="gaming-section-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </header>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: "users" | "voice";
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="gaming-empty">
      <span><Icon name={icon} size={20} /></span>
      <div><strong>{title}</strong><p>{description}</p></div>
    </div>
  );
}

function ParticipantAvatars({
  avatars,
  count,
}: {
  avatars: string[];
  count: number;
}): React.JSX.Element {
  const visible = avatars.slice(0, 4);
  return (
    <span aria-label={`${count} участников`} className="gaming-avatar-stack">
      {visible.map((avatar, index) => <img alt="" key={avatar} src={avatar} style={{ zIndex: visible.length - index }} />)}
      {visible.length === 0 ? <i><Icon name="users" size={14} /></i> : null}
      {count > visible.length ? <i>+{count - visible.length}</i> : null}
    </span>
  );
}

export function VoiceStatusBar({
  status,
  onAudioSettings,
}: {
  status: GamingHomeVoiceStatus;
  onAudioSettings(): void;
}): React.JSX.Element {
  const qualityLabel = {
    excellent: "Отличное",
    good: "Хорошее",
    poor: "Нестабильное",
    offline: "Нет соединения",
  }[status.connectionQuality];
  return (
    <section aria-label="Статус голоса" className="gaming-voice-status">
      <span className="gaming-voice-status__label">Статус голоса</span>
      <button onClick={onAudioSettings} type="button">
        <Icon name={status.microphone.enabled ? "mic" : "micOff"} size={18} />
        <span><small>Микрофон</small><strong>{status.microphone.available ? status.microphone.enabled ? "Включён" : "Выключен" : "Недоступен"}</strong></span>
      </button>
      <button onClick={onAudioSettings} type="button">
        <Icon name="headphones" size={18} />
        <span><small>Наушники</small><strong title={status.output.label ?? undefined}>{status.output.label ?? "Не выбраны"}</strong></span>
      </button>
      <span className="gaming-voice-status__metric">
        <Icon name="sparkles" size={18} />
        <span><small>Пинг</small><strong>{status.pingMs === null ? "—" : `${status.pingMs} мс`}</strong></span>
      </span>
      <span className="gaming-voice-status__metric" data-quality={status.connectionQuality}>
        <i />
        <span><small>Соединение</small><strong>{qualityLabel}</strong></span>
      </span>
    </section>
  );
}

function capacityLabel(space: GamingHomeVoiceSpace): string {
  return space.participantLimit === null
    ? `${space.participantCount} в голосе`
    : `${space.participantCount} / ${space.participantLimit}`;
}

function ctaLabel(space: GamingHomeVoiceSpace, returnReason?: GamingHomeQuickReturnItem["returnReason"]): string {
  if (!space.hasFreeSlots) return "Канал заполнен";
  if (!space.canJoin) return "Нет доступа";
  if (returnReason === "current_voice") return "Открыть";
  if (returnReason === "recently_left") return "Вернуться";
  return "Присоединиться";
}

export function QuickReturnSection({
  items,
  onJoin,
}: {
  items: GamingHomeQuickReturnItem[];
  onJoin(serverId: string, channelId: string): void;
}): React.JSX.Element {
  return (
    <section className="gaming-section gaming-quick-return">
      <SectionHeader eyebrow="Снова в игру" title="Быстрый возврат" />
      {items.length === 0 ? (
        <EmptyState icon="voice" title="Пока некуда возвращаться" description="Недавние и активные голосовые каналы появятся здесь." />
      ) : (
        <div className="gaming-quick-return__grid">
          {items.slice(0, 3).map((item) => (
            <article className="gaming-return-card" key={item.channelId} style={item.coverUrl ? { backgroundImage: `linear-gradient(180deg, rgb(5 9 23 / 18%), rgb(5 9 23 / 96%)), url(${JSON.stringify(item.coverUrl)})` } : undefined}>
              <div className="gaming-return-card__badges">
                {item.gameName ? <Badge tone="primary">{item.gameName}</Badge> : <Badge>{item.serverName}</Badge>}
                {item.hasScreenShare ? <Badge tone="success"><Icon name="screen" size={13} /> Стрим</Badge> : null}
              </div>
              <div className="gaming-return-card__copy">
                <small title={item.serverName}>{item.serverName}</small>
                <h3 title={item.channelName}>{item.channelName}</h3>
              </div>
              <div className="gaming-return-card__meta">
                <ParticipantAvatars avatars={item.participantAvatars} count={item.participantCount} />
                <span>{capacityLabel(item)}</span>
                {item.friendCount > 0 ? <span>{item.friendCount} друзей</span> : null}
              </div>
              <Button disabled={!item.canJoin || !item.hasFreeSlots} onClick={() => onJoin(item.serverId, item.channelId)} size="sm" type="button">{ctaLabel(item, item.returnReason)}</Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActiveVoiceSpacesSection({
  items,
  onJoin,
  onShowAll,
}: {
  items: GamingHomeVoiceSpace[];
  onJoin(serverId: string, channelId: string): void;
  onShowAll(): void;
}): React.JSX.Element {
  return (
    <section className="gaming-section gaming-active-spaces">
      <SectionHeader eyebrow="Прямо сейчас" title="Активные пространства" action={items.length > 0 ? <button className="gaming-text-action" onClick={onShowAll} type="button">Показать все →</button> : undefined} />
      {items.length === 0 ? (
        <EmptyState icon="voice" title="Сейчас нет активных голосовых каналов" description="Когда участники начнут общаться, каналы появятся здесь." />
      ) : (
        <div className="gaming-active-spaces__list">
          {items.slice(0, 6).map((item) => (
            <article className="gaming-space-row" key={item.channelId}>
              <span className="gaming-space-row__server">{item.serverIconUrl ? <img alt="" src={item.serverIconUrl} /> : item.serverName.slice(0, 2).toUpperCase()}</span>
              <div className="gaming-space-row__copy">
                <small>{item.serverName}{item.gameName ? ` · ${item.gameName}` : ""}</small>
                <strong title={item.channelName}>{item.channelName}</strong>
                <span>{capacityLabel(item)}{item.hasScreenShare ? " · Идёт трансляция" : ""}{item.friendCount ? ` · ${item.friendCount} друзей` : ""}</span>
              </div>
              <ParticipantAvatars avatars={item.participantAvatars} count={item.participantCount} />
              <Button disabled={!item.canJoin || !item.hasFreeSlots} onClick={() => onJoin(item.serverId, item.channelId)} size="sm" type="button" variant="secondary">{item.hasFreeSlots ? item.canJoin ? "Войти" : "Нет доступа" : "Заполнен"}</Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function FriendsInGameSection({
  friends,
  onJoin,
  onMessage,
  onShowAll,
}: {
  friends: GamingHomeFriend[];
  onJoin(serverId: string, channelId: string): void;
  onMessage(userId: string): void;
  onShowAll(): void;
}): React.JSX.Element {
  return (
    <section className="gaming-section gaming-friends">
      <SectionHeader eyebrow="Ваша команда" title="Друзья в игре" action={friends.length > 0 ? <button className="gaming-text-action" onClick={onShowAll} type="button">Показать всех →</button> : undefined} />
      {friends.length === 0 ? (
        <EmptyState icon="users" title="Сейчас никто из друзей не играет" description="Друзья появятся здесь, когда будут online или зайдут в голосовой канал." />
      ) : (
        <div className="gaming-friends__grid">
          {friends.slice(0, 8).map((friend) => (
            <article className="gaming-friend-row" key={friend.userId}>
              <Avatar
                name={friend.displayName}
                size="md"
                status={friend.presence === "away" ? "idle" : friend.presence}
                {...(friend.avatarUrl ? { src: friend.avatarUrl } : {})}
              />
              <div className="gaming-friend-row__copy">
                <strong>{friend.displayName}</strong>
                <small>{friend.gameName ?? (friend.voiceChannel ? "В голосовом канале" : "Готов к общению")}</small>
                {friend.gameDetails ? <span>{friend.gameDetails}</span> : null}
              </div>
              <div className="gaming-friend-row__actions">
                <Button icon="message" onClick={() => onMessage(friend.userId)} size="sm" type="button" variant="quiet">Написать</Button>
                {friend.voiceChannel ? <Button disabled={!friend.voiceChannel.canJoin} onClick={() => onJoin(friend.voiceChannel!.serverId, friend.voiceChannel!.channelId)} size="sm" type="button">Войти</Button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
