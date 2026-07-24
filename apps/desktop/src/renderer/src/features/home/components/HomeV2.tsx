import type {
  GamingHomeFriend,
  GamingHomeQuickReturnItem,
  GamingHomeVoiceSpace,
} from "@vatrushka/shared";

import { Avatar, Badge, Button, CommunityLogo, Icon, StableImage } from "../../../ui";
import "./home-v2.css";

export interface HomeV2Props {
  activeSpaces: GamingHomeVoiceSpace[];
  displayName: string;
  friends: GamingHomeFriend[];
  quickReturn: GamingHomeQuickReturnItem[];
  onJoin(serverId: string, channelId: string): void;
  onMessage(userId: string): void;
  onOpenServer(serverId: string): void;
}

function spaceMeta(space: GamingHomeVoiceSpace): string {
  return space.participantLimit === null
    ? `${space.participantCount} в голосе`
    : `${space.participantCount} / ${space.participantLimit} участников`;
}

function isOfficialServer(serverName: string): boolean {
  return serverName.trim().toLocaleLowerCase("ru-RU") === "ватрушка";
}

function AvatarStack({ avatars, count }: { avatars: string[]; count: number }): React.JSX.Element {
  return (
    <span aria-label={`${count} участников`} className="vui-home-v2__avatar-stack">
      {avatars.slice(0, 4).map((avatar, index) => <StableImage alt="" key={avatar || index} src={avatar} />)}
      {avatars.length === 0 ? <i><Icon name="users" size={13} /></i> : null}
      {count > Math.min(avatars.length, 4) ? <i>+{count - Math.min(avatars.length, 4)}</i> : null}
    </span>
  );
}

function EmptyCard({ icon, title, description }: { icon: "users" | "voice"; title: string; description: string }): React.JSX.Element {
  return <div className="vui-home-v2__empty"><Icon name={icon} size={22} /><strong>{title}</strong><span>{description}</span></div>;
}

export function HomeV2({ activeSpaces, displayName, friends, onJoin, onMessage, onOpenServer, quickReturn }: HomeV2Props): React.JSX.Element {
  const primary = quickReturn[0] ?? activeSpaces[0];
  return (
    <div className="vui-home-v2">
      <section aria-label="Главное содержимое" className="vui-home-v2__main">
        <header className="vui-home-v2__welcome">
          <h1>Добро пожаловать, {displayName}!</h1>
          <p>Твоё место для общения и игр.</p>
        </header>

        <section aria-label="Быстрый возврат" className="vui-home-v2__return">
          {primary === undefined ? <EmptyCard description="Недавние и активные голосовые каналы появятся здесь." icon="voice" title="Пока некуда возвращаться" /> : <>
            <span className="vui-home-v2__kicker">Быстрый возврат</span>
            <StableImage alt="" className="vui-home-v2__return-cover" fallback={null} src={primary.coverUrl} />
            <div className="vui-home-v2__return-content">
              <div className="vui-home-v2__return-server">
                <CommunityLogo accentColor={primary.serverAccentColor} name={primary.serverName} size="sm" src={primary.serverIconUrl} />
                <strong>{primary.serverName}</strong>
                {isOfficialServer(primary.serverName) ? <span className="vui-home-v2__official">Официальный</span> : null}
              </div>
              <div className="vui-home-v2__return-channel"><Icon name="voice" size={24} /><span><small>Голосовой канал</small><h2>{primary.channelName}</h2></span></div>
              <p className="vui-home-v2__return-meta"><Icon name="voice" size={14} /> В голосе <i /> {spaceMeta(primary)}</p>
              <AvatarStack avatars={primary.participantAvatars} count={primary.participantCount} />
              <div className="vui-home-v2__return-actions">
                <Button disabled={!primary.canJoin || !primary.hasFreeSlots} icon="voice" onClick={() => onJoin(primary.serverId, primary.channelId)} type="button">Вернуться в канал</Button>
              </div>
            </div>
            <div className="vui-home-v2__return-stats"><div><Icon name="headphones" size={23} /><strong>{activeSpaces.length}</strong><span>активных<br />голосовых</span></div><div><Icon name="users" size={23} /><strong>{friends.length}</strong><span>друзей<br />сейчас</span></div></div>
          </>}
        </section>

        <section className="vui-home-v2__section">
          <header><span className="vui-home-v2__kicker">Активные пространства</span>{activeSpaces.length > 0 ? <button onClick={() => onOpenServer(activeSpaces[0]!.serverId)} type="button">Смотреть все <Icon name="arrowRight" size={15} /></button> : null}</header>
          {activeSpaces.length === 0 ? <EmptyCard description="Когда участники начнут общаться, каналы появятся здесь." icon="voice" title="Нет активных пространств" /> : <div className="vui-home-v2__spaces">{activeSpaces.slice(0, 4).map((space) => <article key={space.channelId}><StableImage alt="" className="vui-home-v2__space-cover" fallback={null} src={space.coverUrl} />{isOfficialServer(space.serverName) ? <span className="vui-home-v2__space-official">Официальный</span> : null}<div className="vui-home-v2__space-body"><div><CommunityLogo accentColor={space.serverAccentColor} name={space.serverName} size="sm" src={space.serverIconUrl} /><strong>{space.serverName}</strong></div><p><i /> {spaceMeta(space)}</p><AvatarStack avatars={space.participantAvatars} count={space.participantCount} /></div><button aria-label={`Открыть ${space.serverName}`} onClick={() => onOpenServer(space.serverId)} type="button" /></article>)}</div>}
        </section>

        <section aria-label="Поиск тиммейтов" className="vui-home-v2__section vui-home-v2__teammates">
          <header>
            <div>
              <span className="vui-home-v2__kicker">Поиск тиммейтов</span>
              <p>Друзья и участники общих пространств появятся здесь.</p>
            </div>
          </header>
          <div className="vui-home-v2__teammates-empty" role="status">
            <span className="vui-home-v2__teammates-icon"><Icon name="users" size={25} /></span>
            <div><strong>Пока нет подходящих тиммейтов</strong><p>Когда появятся доступные друзья или участники общих каналов, их можно будет пригласить отсюда.</p></div>
          </div>
        </section>
      </section>

      <aside aria-label="Друзья в сети" className="vui-home-v2__friends">
        <header><span className="vui-home-v2__kicker">Друзья в сети</span><Badge tone="primary">{friends.length}</Badge></header>
        {friends.length === 0 ? <EmptyCard description="Друзья появятся здесь, когда будут online или зайдут в голос." icon="users" title="Сейчас никто не играет" /> : <div>{friends.slice(0, 8).map((friend) => <article key={friend.userId}><Avatar name={friend.displayName} size="md" status={friend.presence === "away" ? "idle" : friend.presence} {...(friend.avatarUrl ? { src: friend.avatarUrl } : {})} /><span><strong>{friend.displayName}</strong><small>{friend.gameName ?? "Онлайн"}</small>{friend.voiceChannel ? <em><Icon name="voice" size={13} /> В голосовом канале</em> : <em><i /> {friend.gameDetails ?? "В игре"}</em>}</span><div><button aria-label={`Написать ${friend.displayName}`} onClick={() => onMessage(friend.userId)} type="button"><Icon name="message" size={16} /></button>{friend.voiceChannel ? <button aria-label={`Войти к ${friend.displayName}`} disabled={!friend.voiceChannel.canJoin} onClick={() => onJoin(friend.voiceChannel!.serverId, friend.voiceChannel!.channelId)} type="button"><Icon name="voice" size={16} /></button> : null}</div></article>)}</div>}
      </aside>
    </div>
  );
}
