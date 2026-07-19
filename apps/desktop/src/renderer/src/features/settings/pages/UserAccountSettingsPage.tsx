import { useCallback, useEffect, useState } from "react";

import type { PublicUser, UserAccountSettings } from "@vatrushka/shared";

import { Button, Input } from "../../../ui";
import { SettingsPageState } from "../components/SettingsPageState";
import "./user-settings-pages.css";

interface Props {
  user: PublicUser;
  onLoad(): Promise<UserAccountSettings>;
  onRequestEmail(input: {
    email: string;
    password: string;
    totpCode: string | null;
  }): Promise<unknown>;
  onConfirmEmail(code: string): Promise<PublicUser>;
  onExport(): Promise<Record<string, unknown>>;
  onDeactivate(input: {
    password: string;
    totpCode: string | null;
  }): Promise<UserAccountSettings>;
  onCancelDeactivation(): Promise<UserAccountSettings>;
  onLogout(): void;
  onUserChange(user: PublicUser): void;
}

function downloadJson(data: Record<string, unknown>): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vatrushka-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function UserAccountSettingsPage(props: Props): React.JSX.Element {
  const [account, setAccount] = useState<UserAccountSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void props
      .onLoad()
      .then(setAccount)
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось загрузить аккаунт",
        ),
      );
  }, [props.onLoad]);
  useEffect(load, [load]);
  if (!account)
    return error ? (
      <SettingsPageState description={error} kind="error" onAction={load} />
    ) : (
      <SettingsPageState kind="loading" />
    );
  const run = (action: () => Promise<unknown>, success: string): void => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void action()
      .then(() => setNotice(success))
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось выполнить действие",
        ),
      )
      .finally(() => setBusy(false));
  };
  const reauthentication = { password, totpCode: totpCode || null };
  return (
    <section className="vui-user-settings-page">
      <header className="vui-user-settings-page__heading">
        <div>
          <span>Аккаунт</span>
          <h1>Управление аккаунтом</h1>
          <p>
            Email, экспорт данных и отложенная анонимизация с 14-дневным сроком
            отмены.
          </p>
        </div>
      </header>
      {error ? (
        <aside className="vui-user-settings-note vui-user-settings-note--error">
          {error}
        </aside>
      ) : null}
      {notice ? (
        <aside className="vui-user-settings-note">{notice}</aside>
      ) : null}
      <div className="vui-user-profile-settings__grid">
        <article className="vui-user-settings-card">
          <header>
            <div>
              <h2>Email</h2>
              <p>
                Новый адрес вступит в силу только после подтверждения кода из
                письма.
              </p>
            </div>
          </header>
          <div className="vui-user-settings-readonly">
            <span>Текущий адрес</span>
            <strong>{account.email}</strong>
            <small>
              {account.emailVerified ? "Подтверждён" : "Не подтверждён"}
            </small>
          </div>
          <Input
            label="Новый email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            autoComplete="current-password"
            label="Пароль"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            autoComplete="one-time-code"
            label="Код 2FA"
            inputMode="numeric"
            maxLength={6}
            placeholder="Если включена"
            value={totpCode}
            onChange={(event) =>
              setTotpCode(event.target.value.replace(/\D/gu, "").slice(0, 6))
            }
          />
          <Button
            disabled={!email || !password}
            loading={busy}
            onClick={() =>
              run(
                () => props.onRequestEmail({ email, ...reauthentication }),
                "Код отправлен на новый email",
              )
            }
          >
            Отправить код
          </Button>
          {account.pendingEmail || notice ? (
            <>
              <Input
                label="Код из письма"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))
                }
              />
              <Button
                disabled={code.length !== 6}
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    const user = await props.onConfirmEmail(code);
                    props.onUserChange(user);
                    setAccount(await props.onLoad());
                    setCode("");
                  }, "Email изменён")
                }
              >
                Подтвердить email
              </Button>
            </>
          ) : null}
        </article>
        <article className="vui-user-settings-card">
          <header>
            <div>
              <h2>Данные и сессия</h2>
              <p>
                Экспорт создаётся на сервере из ваших профильных данных и
                сообщений.
              </p>
            </div>
          </header>
          <Button
            variant="secondary"
            onClick={() =>
              run(
                async () => downloadJson(await props.onExport()),
                "Экспорт подготовлен",
              )
            }
          >
            Скачать данные JSON
          </Button>
          <Button variant="secondary" onClick={props.onLogout}>
            Выйти из аккаунта
          </Button>
        </article>
      </div>
      <article className="vui-user-settings-card vui-user-account-danger">
        <header>
          <div>
            <h2>Danger Zone</h2>
            <p>
              После подтверждения аккаунт будет анонимизирован через 14 дней.
              Сообщения сохранятся с автором «Удалённый пользователь».
            </p>
          </div>
        </header>
        {account.ownsServers ? (
          <aside className="vui-user-settings-note vui-user-settings-note--error">
            Сначала передайте владение всеми своими серверами.
          </aside>
        ) : null}
        {account.deactivationScheduledAt ? (
          <div className="vui-user-deactivation-status">
            <strong>Удаление запланировано</strong>
            <span>
              Анонимизация:{" "}
              {account.deletionAt
                ? new Date(account.deletionAt).toLocaleString("ru-RU")
                : "через 14 дней"}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  async () => setAccount(await props.onCancelDeactivation()),
                  "Удаление отменено",
                )
              }
            >
              Отменить удаление
            </Button>
          </div>
        ) : (
          <Button
            disabled={account.ownsServers || !password}
            variant="danger"
            onClick={() => {
              if (window.confirm("Запланировать удаление аккаунта?"))
                run(
                  async () =>
                    setAccount(await props.onDeactivate(reauthentication)),
                  "Удаление запланировано",
                );
            }}
          >
            Запланировать удаление
          </Button>
        )}
      </article>
    </section>
  );
}
