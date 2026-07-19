import type { PublicUser, ServerSummary } from "@vatrushka/shared";

import {
  Badge,
  Button,
  Icon,
  UserProfileDock,
  WorkspaceCard,
  type WorkspaceNavigationItem,
} from "../../../ui";

export interface HomeNavigationProps {
  user: PublicUser;
  servers: ServerSummary[];
  directUnreadCount: number;
  onCreate: () => void;
  onDirectMessages?: (() => void) | undefined;
  onOpenServer: (serverId: string) => void;
  onSecurity: () => void;
  onLogout: () => void;
  onSpaces: () => void;
  networkAvailable?: boolean;
}

export function HomeNavigation({
  directUnreadCount,
  networkAvailable = true,
  onCreate,
  onDirectMessages,
  onLogout,
  onOpenServer,
  onSecurity,
  onSpaces,
  servers,
  user,
}: HomeNavigationProps): React.JSX.Element {
  const name = user.displayName ?? user.email;
  const workspaces: WorkspaceNavigationItem[] = servers.map((server) => {
    const dashboardServer = server as ServerSummary & {
      unreadCount?: number;
      activeVoiceCount?: number;
    };
    return {
      id: server.id,
      name: server.name,
      memberCount: server.memberCount,
      iconUrl: server.iconUrl ?? null,
      accentColor: server.accentColor ?? null,
      unread: (dashboardServer.unreadCount ?? 0) > 0,
      activeVoice: (dashboardServer.activeVoiceCount ?? 0) > 0,
    };
  });
  return (
    <aside className="home-navigation" aria-label="Основная навигация">
      <div className="home-navigation__brand">
        <span aria-hidden="true">В</span>
        <strong>Ватрушка</strong>
      </div>
      <nav className="home-navigation__primary" aria-label="Разделы приложения">
        <button aria-current="page" data-active="true" type="button">
          <Icon name="home" size={18} />
          <span>Главная</span>
        </button>
        <button onClick={onSpaces} type="button">
          <Icon name="users" size={18} />
          <span>Пространства</span>
          <Badge>{servers.length}</Badge>
        </button>
        <button
          disabled={!networkAvailable || onDirectMessages === undefined}
          onClick={onDirectMessages}
          type="button"
        >
          <Icon name="message" size={18} />
          <span>Личные сообщения</span>
          {directUnreadCount === 0 ? null : (
            <Badge tone="danger">
              {directUnreadCount > 99 ? "99+" : directUnreadCount}
            </Badge>
          )}
        </button>
      </nav>
      <div className="home-navigation__heading">
        <span>Серверы</span>
        <button
          aria-label="Создать сервер"
          disabled={!networkAvailable}
          onClick={onCreate}
          type="button"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      {workspaces.length === 0 ? (
        <div className="home-navigation__empty">
          <span>
            <Icon name="users" size={22} />
          </span>
          <strong>У вас пока нет серверов</strong>
          <p>Создайте первый сервер или примите приглашение по ссылке.</p>
          <Button disabled={!networkAvailable} onClick={onCreate} size="sm">
            Создать сервер
          </Button>
        </div>
      ) : (
        <nav className="home-navigation__servers" aria-label="Серверы">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              disabled={!networkAvailable}
              key={workspace.id}
              onSelect={onOpenServer}
              workspace={workspace}
            />
          ))}
        </nav>
      )}
      {servers.length === 0 ? (
        <div className="home-navigation__start">
          <Icon name="sparkles" size={17} />
          <div>
            <strong>Готовы начать?</strong>
            <small>Создайте своё первое пространство.</small>
          </div>
        </div>
      ) : null}
      <div className="home-navigation__create">
        <button disabled={!networkAvailable} onClick={onCreate} type="button">
          <Icon name="plus" size={17} />
          Создать сервер
        </button>
      </div>
      <UserProfileDock
        avatarUrl={user.avatarUrl ?? null}
        email={user.email}
        founder={user.platformRole === "owner"}
        name={name}
        onLogout={onLogout}
        onSecurity={onSecurity}
      />
    </aside>
  );
}
