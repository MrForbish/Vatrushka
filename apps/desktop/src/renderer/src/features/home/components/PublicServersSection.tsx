import type React from "react";

import type { PublicServerSummary } from "@vatrushka/shared";

import { Button, Icon, Input, StableImage } from "../../../ui";

interface PublicServersSectionProps {
  busyServerId: string | null;
  error: string | null;
  loading: boolean;
  onJoin(server: PublicServerSummary): void;
  onOpen(server: PublicServerSummary): void;
  onRetry(): void;
  onSearch(value: string): void;
  search: string;
  servers: PublicServerSummary[];
}

function ServerImage({
  server,
}: {
  server: PublicServerSummary;
}): React.JSX.Element {
  return (
    <StableImage
      alt=""
      fallback={
        <span aria-hidden="true">
          {server.name.trim().slice(0, 2).toUpperCase()}
        </span>
      }
      src={server.iconUrl}
    />
  );
}

export function PublicServersSection(
  props: PublicServersSectionProps,
): React.JSX.Element {
  return (
    <section
      className="home-public-servers"
      aria-labelledby="home-public-servers-title"
    >
      <header>
        <div>
          <span className="home-section__eyebrow">Каталог</span>
          <h2 id="home-public-servers-title">Публичные серверы</h2>
          <p>Найдите открытое сообщество и присоединитесь без приглашения.</p>
        </div>
        <Input
          aria-label="Поиск публичных серверов"
          leadingIcon="search"
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Поиск по названию"
          value={props.search}
        />
      </header>
      {props.loading ? (
        <div className="home-public-servers__state">
          <span className="vui-spinner" /> Загружаем серверы…
        </div>
      ) : null}
      {!props.loading && props.error ? (
        <div className="home-public-servers__state" role="alert">
          <Icon name="warning" size={17} />
          {props.error}
          <Button onClick={props.onRetry} size="sm" variant="quiet">
            Повторить
          </Button>
        </div>
      ) : null}
      {!props.loading && !props.error && props.servers.length === 0 ? (
        <div className="home-public-servers__state">
          По вашему запросу ничего не найдено.
        </div>
      ) : null}
      {!props.loading && !props.error && props.servers.length > 0 ? (
        <div className="home-public-servers__grid">
          {props.servers.map((server) => (
            <article
              key={server.id}
              className="home-public-server"
              data-featured={server.featured || undefined}
              style={
                {
                  "--server-accent": server.accentColor ?? "#24c8db",
                } as React.CSSProperties
              }
            >
              <StableImage
                className="home-public-server__banner"
                alt=""
                src={server.bannerUrl}
              />
              <div className="home-public-server__overlay" />
              <div className="home-public-server__body">
                <div className="home-public-server__icon">
                  <ServerImage server={server} />
                </div>
                <div className="home-public-server__copy">
                  <strong title={server.name}>{server.name}</strong>
                  <span>
                    {server.featured
                      ? "Официальный сервер Ватрушки"
                      : `${server.memberCount} участников`}
                  </span>
                  <p>{server.description || "Открытое сообщество Ватрушки"}</p>
                </div>
                <Button
                  loading={props.busyServerId === server.id}
                  onClick={() =>
                    server.joined ? props.onOpen(server) : props.onJoin(server)
                  }
                  size="sm"
                  variant={server.joined ? "secondary" : "primary"}
                >
                  {server.joined ? "Открыть" : "Присоединиться"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
