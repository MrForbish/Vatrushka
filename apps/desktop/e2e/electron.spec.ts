import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let application: ElectronApplication;
let apiServer: Server | undefined;
const testProfiles = new Set<string>();

async function launchElectron(
  extraArgs: string[] = [],
): Promise<ElectronApplication> {
  const profile = mkdtempSync(join(tmpdir(), "vatrushka-e2e-"));
  testProfiles.add(profile);
  return electron.launch({
    args: [".", ...extraArgs, `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: electronEnvironment(),
  });
}

async function waitForApplicationWindow(
  previousWindow: Page,
): Promise<Page> {
  await expect.poll(
    () => application.windows().some((window) => window !== previousWindow && !window.isClosed()),
  ).toBe(true);
  const window = application.windows().find(
    (candidate) => candidate !== previousWindow && !candidate.isClosed(),
  );
  if (!window) throw new Error("Application window was not created after authentication.");
  await window.waitForLoadState("domcontentloaded");
  return window;
}

function electronEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

test.afterEach(async () => {
  if (application) await application.close();
  if (apiServer)
    await new Promise<void>((resolve, reject) =>
      apiServer?.close((error) => (error ? reject(error) : resolve())),
    );
  apiServer = undefined;
  const safePrefix = `${resolve(tmpdir(), "vatrushka-e2e-")}`;
  for (const profile of testProfiles) {
    const target = resolve(profile);
    if (target.startsWith(safePrefix))
      rmSync(target, { recursive: true, force: true });
    testProfiles.delete(profile);
  }
});

test("launches the secure auth shell with an allowlisted preload API", async () => {
  application = await launchElectron();
  const window = await application.firstWindow();
  await expect(
    window.getByRole("heading", { name: "Добро пожаловать" }),
  ).toBeVisible();
  await expect(window.getByLabel("Email")).toBeVisible();
  expect(
    await window.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({
    clientHeight: 680,
    clientWidth: 520,
    scrollHeight: 680,
    scrollWidth: 520,
  });
  const authWindowBounds = await application.evaluate(
    ({ BrowserWindow, screen }) => {
      const authWindow = BrowserWindow.getAllWindows()[0];
      if (!authWindow) throw new Error("Auth window is not available");
      const bounds = authWindow.getBounds();
      const workArea = screen.getDisplayMatching(bounds).workArea;
      return { bounds, workArea };
    },
  );
  expect(
    Math.abs(
      authWindowBounds.bounds.x + authWindowBounds.bounds.width / 2 -
        (authWindowBounds.workArea.x + authWindowBounds.workArea.width / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      authWindowBounds.bounds.y + authWindowBounds.bounds.height / 2 -
        (authWindowBounds.workArea.y + authWindowBounds.workArea.height / 2),
    ),
  ).toBeLessThanOrEqual(1);

  expect(
    await window.evaluate(
      () => typeof (window as unknown as { require?: unknown }).require,
    ),
  ).toBe("undefined");
  expect(
    await window.evaluate(
      () => typeof (window as unknown as { process?: unknown }).process,
    ),
  ).toBe("undefined");
  expect(
    await window.evaluate(() =>
      Object.keys(
        (window as unknown as { desktop: Record<string, unknown> }).desktop,
      ).sort(),
    ),
  ).toEqual(
    [
      "clearAuthSession",
      "clearSelectedDesktopSource",
      "copyToClipboard",
      "openExternal",
      "setBadgeCount",
      "getAppVersion",
      "getUpdateState",
      "checkForUpdates",
      "installUpdate",
      "onUpdateState",
      "getLocalSettings",
      "getPlatform",
      "listDesktopSources",
      "logMediaDiagnostic",
      "onDeepLink",
      "onMessageNotificationClick",
      "selectDesktopSource",
      "showMessageNotification",
      "logoutAuthSession",
      "refreshAuthSession",
      "completeAuthSession",
      "updateLocalSettings",
    ].sort(),
  );
});

test("supports keyboard-only authentication with a visible focus indicator", async () => {
  application = await launchElectron();
  const window = await application.firstWindow();
  const email = window.getByLabel("Email");
  const password = window.getByRole("textbox", { name: "Пароль", exact: true });

  await expect(email).toBeVisible();
  await expect(email).toBeFocused();
  await email.fill("keyboard@example.com");
  await window.keyboard.press("Tab");
  await expect(password).toBeFocused();
  expect(
    await password.evaluate(
      (element) =>
        getComputedStyle(element.closest(".vui-input-frame") as Element)
          .boxShadow,
    ),
  ).not.toBe("none");

  const registrationTab = window.getByRole("button", { name: "Регистрация" });
  await registrationTab.focus();
  await window.keyboard.press("Enter");
  await expect(registrationTab).toHaveAttribute("aria-pressed", "true");
  await expect(window.getByLabel("Повторите пароль")).toBeVisible();
});

test("completes password reset and returns to login with a confirmation", async () => {
  apiServer = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost:3000");
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/reset/request-code"
    ) {
      response.end(
        JSON.stringify({ status: "CODE_SENT", retryAfterSeconds: 60 }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/reset/complete"
    ) {
      response.end(JSON.stringify({ status: "PASSWORD_RESET" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve, reject) =>
    apiServer?.listen(3000, () => resolve()).once("error", reject),
  );

  application = await launchElectron();
  const window = await application.firstWindow();
  await window.getByRole("button", { name: "Забыли пароль?" }).click();
  await expect(
    window.getByRole("heading", { name: "Восстановление пароля" }),
  ).toBeVisible();
  await window.getByLabel("Email").fill("reset@example.com");
  await window.getByRole("button", { name: "Отправить код" }).click();
  await window.getByLabel("Код из письма").fill("123456");
  await window
    .getByRole("textbox", { name: "Новый пароль", exact: true })
    .fill("new-secure-password-42");
  await window
    .getByRole("textbox", { name: "Повторите новый пароль", exact: true })
    .fill("new-secure-password-42");
  await window.getByRole("button", { name: "Сохранить новый пароль" }).click();
  await expect(
    window.getByRole("heading", { name: "Добро пожаловать" }),
  ).toBeVisible();
  await expect(window.getByRole("status")).toHaveText(
    "Пароль изменён. Войдите с новым паролем.",
  );
});

test("grants audio permission and exposes device labels to the trusted renderer", async () => {
  application = await launchElectron(["--use-fake-device-for-media-stream"]);
  const window = await application.firstWindow();
  const devices = await window.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    try {
      return (await navigator.mediaDevices.enumerateDevices())
        .filter(
          (device) =>
            device.kind === "audioinput" || device.kind === "audiooutput",
        )
        .map((device) => ({ kind: device.kind, label: device.label }));
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  });

  expect(devices.some((device) => device.kind === "audioinput")).toBe(true);
  expect(
    devices
      .filter((device) => device.kind === "audioinput")
      .every((device) => device.label.trim().length > 0),
  ).toBe(true);
  expect(
    devices.every(
      (device) => !/^(?:Микрофон|Динамики) \d+$/u.test(device.label),
    ),
  ).toBe(true);
});

test("revokes another device without exposing its refresh token to the renderer", async () => {
  let remoteSessionActive = true;
  apiServer = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost:3000");
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/begin"
    ) {
      response.end(
        JSON.stringify({
          status: "SECOND_FACTOR_REQUIRED",
          factor: "email",
          retryAfterSeconds: 60,
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/complete"
    ) {
      response.end(
        JSON.stringify({
          accessToken: "access-token-for-e2e-user-1234567890",
          refreshToken: "rotated-refresh-token-for-e2e-user-1234567890",
          expiresIn: 900,
          user: {
            id: "user-e2e",
            email: "owner@myvatrushka.ru",
            displayName: "Илья",
            platformRole: "owner",
            hasPassword: true,
            twoFactorEnabled: true,
          },
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/auth/sessions") {
      response.end(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            deviceName: "Текущий компьютер",
            current: true,
            trusted: true,
            createdAt: "2026-07-15T10:00:00.000Z",
            lastUsedAt: "2026-07-17T10:00:00.000Z",
            expiresAt: "2026-08-15T10:00:00.000Z",
          },
          ...(remoteSessionActive
            ? [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  deviceName: "Старый ноутбук",
                  current: false,
                  trusted: false,
                  createdAt: "2026-07-10T10:00:00.000Z",
                  lastUsedAt: "2026-07-16T10:00:00.000Z",
                  expiresAt: "2026-08-10T10:00:00.000Z",
                },
              ]
            : []),
        ]),
      );
      return;
    }
    if (
      request.method === "DELETE" &&
      url.pathname ===
        "/api/v1/auth/sessions/22222222-2222-4222-8222-222222222222"
    ) {
      remoteSessionActive = false;
      response.end(JSON.stringify({ current: false }));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/me/security-events"
    ) {
      response.end("[]");
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
      response.end(
        JSON.stringify({
          accessToken: "refreshed-access-token-for-e2e-user",
          refreshToken: "refreshed-refresh-token-for-e2e-user",
          expiresIn: 900,
          user: {
            id: "user-e2e",
            email: "owner@myvatrushka.ru",
            displayName: "Илья",
            platformRole: "owner",
            hasPassword: true,
            twoFactorEnabled: true,
          },
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/servers") {
      response.end("[]");
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/notifications/messages"
    ) {
      response.end(JSON.stringify({ items: [], cursor: null }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve, reject) =>
    apiServer?.listen(3000, () => resolve()).once("error", reject),
  );

  application = await launchElectron();
  let window = await application.firstWindow();
  await window
    .getByRole("textbox", { name: "Email" })
    .fill("owner@myvatrushka.ru");
  await window
    .getByRole("textbox", { name: "Пароль", exact: true })
    .fill("secure-vatrushka-42");
  await window.getByRole("button", { name: /Продолжить/u }).click();
  await window.getByLabel("Код из письма").fill("123456");
  const applicationWindow = waitForApplicationWindow(window);
  await window.getByRole("button", { name: /Подтвердить вход/u }).click();
  window = await applicationWindow;
  await window
    .getByRole("button", { name: "Настройки пользователя" })
    .click();
  await expect(
    window.getByRole("button", { name: "Безопасность" }),
  ).toBeVisible();
  expect(
    await window.evaluate(
      () =>
        "getStoredRefreshToken" in
        (window as unknown as { desktop: Record<string, unknown> }).desktop,
    ),
  ).toBe(false);

  await window.getByRole("button", { name: "Безопасность" }).click();
  await window.getByRole("button", { name: "Сессии" }).click();
  const remote = window
    .locator(".session-card")
    .filter({ hasText: "Старый ноутбук" });
  await expect(remote).toBeVisible();
  await remote.getByRole("button", { name: "Завершить" }).click();
  const confirmation = window.getByRole("dialog", {
    name: "Завершить сессию?",
  });
  await confirmation.getByRole("button", { name: "Завершить" }).click();
  await expect(remote).toHaveCount(0);
});

test("opens the routed settings shell without replacing the application controller", async () => {
  let user = {
    id: "settings-e2e-user",
    email: "settings@myvatrushka.ru",
    displayName: "Настройки E2E",
    platformRole: "member",
    hasPassword: true,
    twoFactorEnabled: true,
  };
  let profile = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: "settings_e2e",
    bio: null,
    avatarUrl: null,
    usernameChangedAt: null,
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
  let presence = {
    preference: "online",
    effectiveStatus: "online",
    customText: null,
    customTextExpiresAt: null,
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
  const privacy = {
    directMessages: "shared_servers",
    presenceVisibility: "shared_servers",
    activityVisible: true,
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
  const notificationPreferences = {
    desktopEnabled: true,
    soundEnabled: true,
    previewMode: "full",
    directMessagesEnabled: true,
    mentionsEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    quietHoursTimezone: null,
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
  const home = {
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: null,
      presence: "online",
      platformBadge: null,
    },
    readiness: { connection: "healthy", audioSetupRequired: false },
    servers: [],
    continueItems: [],
    activeSpaces: [],
    recentActivity: [],
    onboarding: {
      visible: true,
      steps: [
        {
          id: "create_server",
          title: "Создайте свой сервер",
          description: "Первый шаг",
          complete: false,
          destination: null,
        },
        {
          id: "configure_channels",
          title: "Настройте каналы",
          description: "Второй шаг",
          complete: false,
          destination: null,
        },
        {
          id: "invite_members",
          title: "Пригласите участников",
          description: "Третий шаг",
          complete: false,
          destination: null,
        },
      ],
    },
  };
  apiServer = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost:3000");
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/begin"
    ) {
      response.end(
        JSON.stringify({
          status: "SECOND_FACTOR_REQUIRED",
          factor: "email",
          retryAfterSeconds: 60,
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/complete"
    ) {
      response.end(
        JSON.stringify({
          accessToken: "settings-access-token-for-e2e-user-12345",
          refreshToken: "settings-refresh-token-for-e2e-user-12345",
          expiresIn: 900,
          user,
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
      response.end(
        JSON.stringify({
          accessToken: "settings-refreshed-access-token-12345",
          refreshToken: "settings-refreshed-refresh-token-12345",
          expiresIn: 900,
          user,
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/servers") {
      response.end("[]");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/home") {
      response.end(JSON.stringify(home));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/notifications/messages"
    ) {
      response.end(JSON.stringify({ items: [], cursor: null }));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/direct-conversations"
    ) {
      response.end("[]");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/auth/sessions") {
      response.end("[]");
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/me/security-events"
    ) {
      response.end("[]");
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/users/me/profile"
    ) {
      response.end(JSON.stringify(profile));
      return;
    }
    if (
      request.method === "PATCH" &&
      url.pathname === "/api/v1/users/me/profile"
    ) {
      user = { ...user, displayName: "Новое имя" };
      profile = { ...profile, displayName: user.displayName };
      response.end(JSON.stringify(profile));
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/me/presence/heartbeat"
    ) {
      response.end(JSON.stringify(presence));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/me/presence") {
      response.end(JSON.stringify(presence));
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/v1/me/presence") {
      presence = {
        ...presence,
        preference: "do_not_disturb",
        effectiveStatus: "dnd",
      };
      response.end(JSON.stringify(presence));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/me/privacy") {
      response.end(JSON.stringify(privacy));
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/v1/me/privacy") {
      response.end(JSON.stringify(privacy));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/me/notification-preferences"
    ) {
      response.end(JSON.stringify(notificationPreferences));
      return;
    }
    if (
      request.method === "PUT" &&
      url.pathname === "/api/v1/me/notification-preferences"
    ) {
      response.end(JSON.stringify(notificationPreferences));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve, reject) =>
    apiServer?.listen(3000, () => resolve()).once("error", reject),
  );

  application = await launchElectron(["--use-fake-device-for-media-stream"]);
  let window = await application.firstWindow();
  await window.getByRole("textbox", { name: "Email" }).fill(user.email);
  await window
    .getByRole("textbox", { name: "Пароль", exact: true })
    .fill("secure-vatrushka-42");
  await window.getByRole("button", { name: /Продолжить/u }).click();
  await window.getByLabel("Код из письма").fill("123456");
  const applicationWindow = waitForApplicationWindow(window);
  await window.getByRole("button", { name: /Подтвердить вход/u }).click();
  window = await applicationWindow;
  await expect(
    window.getByRole("region", { name: "Быстрый возврат" }),
  ).toBeVisible();

  await window.evaluate(() => {
    globalThis.location.hash = "#/settings/profile?settingsPreview=1";
  });
  await expect(window).toHaveURL(/#\/settings\/profile/u);
  await expect(
    window.getByRole("heading", { name: "Мой профиль" }),
  ).toBeVisible();
  const settingsNavigation = window.getByRole("navigation", {
    name: "Разделы настроек",
  });
  await expect(settingsNavigation).toBeVisible();
  await window
    .getByRole("textbox", { name: "Отображаемое имя" })
    .fill("Новое имя");
  await expect(
    window.getByText("Есть изменения", { exact: true }),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Уведомления/u })
    .click();
  const discardDialog = window.getByRole("dialog", {
    name: "Отменить изменения?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(window).toHaveURL(/#\/settings\/profile/u);
  await window.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    window
      .locator(".vui-user-profile-preview")
      .getByText("Новое имя", { exact: true }),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Голос и звук/u })
    .click();
  await expect(window).toHaveURL(/#\/settings\/audio/u);
  await expect(
    window.getByRole("heading", { name: "Голос и звук" }),
  ).toBeVisible();
  await expect(
    window.getByRole("button", { name: "Устройство ввода" }),
  ).toContainText("Fake Default Audio Input");
  await expect(
    window.getByRole("button", { name: "Динамики / наушники" }),
  ).toContainText("Fake Default Audio Output");
  await settingsNavigation
    .getByRole("button", { name: /Статус и активность/u })
    .click();
  await expect(
    window.getByRole("heading", { name: "Статус и активность" }),
  ).toBeVisible();
  await window.getByRole("radio", { name: /Не беспокоить/u }).click();
  await window.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    window.getByText("Режим «Не беспокоить» активен."),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Уведомления/u })
    .click();
  await expect(window).toHaveURL(/#\/settings\/notifications/u);
  await expect(
    window.getByRole("heading", { name: "Уведомления" }),
  ).toBeVisible();
  const desktopNotifications = window.getByRole("switch", {
    name: /Desktop-уведомления/u,
  });
  await expect(desktopNotifications).toBeVisible();
  await expect(desktopNotifications).toBeChecked();
  await expect(
    window.getByText("Статус «Не беспокоить» активен.", { exact: true }),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Конфиденциальность/u })
    .click();
  await expect(
    window.getByRole("heading", { name: "Конфиденциальность" }),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Безопасность/u })
    .click();
  await window.getByRole("button", { name: "Управлять кодами" }).click();
  await expect(window).toHaveURL(/#\/settings\/security\/backup-codes/u);
  await expect(
    window.getByRole("heading", { name: "Резервные коды" }),
  ).toBeVisible();
  await settingsNavigation
    .getByRole("button", { name: /Устройства и сессии/u })
    .click();
  await expect(window).toHaveURL(/#\/settings\/sessions/u);
  await expect(
    window.getByRole("heading", { name: "Активные устройства" }),
  ).toBeVisible();
  await window.getByRole("button", { name: "Вернуться" }).click();
  await expect(
    window.getByRole("region", { name: "Быстрый возврат" }),
  ).toBeVisible();
  await window
    .getByRole("complementary", { name: "Глобальная навигация" })
    .getByRole("button", { name: "Выйти из аккаунта" })
    .click();
  const logoutDialog = window.getByRole("dialog", { name: "Выйти из аккаунта?" });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(logoutDialog).toBeHidden();
});

test("opens the redesigned Home, creates the first server, and restores it after returning", async () => {
  let serverCreated = false;
  const user = {
    id: "home-e2e-user",
    email: "home@myvatrushka.ru",
    displayName: "Домашний пользователь",
    platformRole: "member",
    hasPassword: true,
    twoFactorEnabled: false,
  };
  const server = {
    id: "home-e2e-server",
    name: "Первый сервер",
    inviteUrl: "http://localhost:3000/i/homeInvite42",
    ownerUserId: user.id,
    memberCount: 1,
    createdAt: "2026-07-17T10:00:00.000Z",
    permissions: [
      "VIEW_SERVER",
      "VIEW_CHANNEL",
      "READ_MESSAGE_HISTORY",
      "SEND_MESSAGES",
      "CONNECT_VOICE",
    ],
    channels: [
      {
        id: "home-e2e-text",
        serverId: "home-e2e-server",
        name: "общий",
        type: "text",
        position: 0,
        unreadCount: 0,
        permissions: ["VIEW_CHANNEL", "READ_MESSAGE_HISTORY", "SEND_MESSAGES"],
      },
      {
        id: "home-e2e-voice",
        serverId: "home-e2e-server",
        name: "Голосовой",
        type: "voice",
        position: 1,
        unreadCount: 0,
        voiceParticipants: [],
        permissions: ["VIEW_CHANNEL", "CONNECT_VOICE"],
      },
    ],
    roles: [],
    members: [],
  };
  apiServer = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost:3000");
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/begin"
    ) {
      response.end(
        JSON.stringify({
          status: "SECOND_FACTOR_REQUIRED",
          factor: "email",
          retryAfterSeconds: 60,
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/complete"
    ) {
      response.end(
        JSON.stringify({
          accessToken: "home-access-token-for-e2e-user-1234567890",
          refreshToken: "home-refresh-token-for-e2e-user-1234567890",
          expiresIn: 900,
          user,
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
      response.end(
        JSON.stringify({
          accessToken: "home-refreshed-access-token-for-e2e-user",
          refreshToken: "home-refreshed-refresh-token-for-e2e-user",
          expiresIn: 900,
          user,
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/servers") {
      response.end(JSON.stringify(serverCreated ? [server] : []));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/servers") {
      serverCreated = true;
      response.statusCode = 201;
      response.end(JSON.stringify(server));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/home") {
      response.end(
        JSON.stringify({
          user: {
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            avatarUrl: null,
            presence: "online",
            platformBadge: null,
          },
          readiness: { connection: "healthy", audioSetupRequired: false },
          servers: serverCreated
            ? [{ ...server, unreadCount: 0, activeVoiceCount: 0 }]
            : [],
          continueItems: serverCreated
            ? [
                {
                  id: "server-home-e2e-server",
                  type: "server",
                  title: server.name,
                  subtitle: "Ваше пространство",
                  participantCount: 0,
                  active: false,
                  lastActivityAt: server.createdAt,
                  destination: { type: "server", serverId: server.id },
                },
              ]
            : [],
          activeSpaces: [],
          recentActivity: [],
          onboarding: {
            visible: !serverCreated,
            steps: [
              {
                id: "create_server",
                title: "Создайте свой сервер",
                description: "Первый шаг",
                complete: serverCreated,
                destination: null,
              },
              {
                id: "configure_channels",
                title: "Настройте каналы",
                description: "Второй шаг",
                complete: serverCreated,
                destination: serverCreated
                  ? { type: "server", serverId: server.id }
                  : null,
              },
              {
                id: "invite_members",
                title: "Пригласите участников",
                description: "Третий шаг",
                complete: false,
                destination: serverCreated
                  ? { type: "server", serverId: server.id }
                  : null,
              },
            ],
          },
          gaming: {
            voiceStatus: {
              microphone: { available: true, enabled: true, label: null },
              output: { available: true, label: null },
              pingMs: null,
              connectionQuality: "excellent",
            },
            quickReturn: [],
            activeSpaces: [],
            friendsInGame: [],
          },
        }),
      );
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/notifications/messages"
    ) {
      response.end(JSON.stringify({ items: [], cursor: null }));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/channels/home-e2e-text/messages"
    ) {
      response.end("[]");
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve, reject) =>
    apiServer?.listen(3000, () => resolve()).once("error", reject),
  );

  application = await launchElectron(["--use-fake-device-for-media-stream"]);
  let window = await application.firstWindow();
  await window.getByRole("textbox", { name: "Email" }).fill(user.email);
  await window
    .getByRole("textbox", { name: "Пароль", exact: true })
    .fill("secure-vatrushka-42");
  await window.getByRole("button", { name: /Продолжить/u }).click();
  await window.getByLabel("Код из письма").fill("123456");
  const applicationWindow = waitForApplicationWindow(window);
  await window.getByRole("button", { name: /Подтвердить вход/u }).click();
  window = await applicationWindow;
  await expect(
    window.getByRole("region", { name: "Быстрый возврат" }),
  ).toBeVisible();
  await expect(window.getByRole("region", { name: "Поиск тиммейтов" })).toBeVisible();
  await expect(window.getByText(/Войти по коду/u)).toHaveCount(0);

  await window
    .getByRole("complementary", { name: "Глобальная навигация" })
    .getByRole("button", { name: "Сообщество" })
    .click();
  const dialog = window.getByRole("dialog", { name: "Новый сервер" });
  await dialog.getByLabel("Название").fill(server.name);
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(window.getByRole("button", { name: "общий" })).toBeVisible();
  await application.evaluate(({ BrowserWindow }) => {
    const browserWindow = BrowserWindow.getAllWindows()[0];
    if (!browserWindow) throw new Error("Main window is unavailable");
    browserWindow.setSize(900, 700);
  });
  await window
    .getByRole("button", { name: "Открыть список серверов" })
    .click();
  await window
    .getByRole("dialog", { name: "Навигация" })
    .getByRole("button", { name: "Главная" })
    .click();
  await expect(window.getByText(server.name).first()).toBeVisible();
  await expect(
    window.getByRole("region", { name: "Быстрый возврат" }),
  ).toBeVisible();
});

test("accepts a validated invite link after authentication without exposing a manual code or guest flow", async () => {
  const inviteToken = "ABCD2345test";
  let inviteAccepted = false;
  const server = {
    id: "server-from-invite",
    name: "Сервер по ссылке",
    inviteUrl: `http://localhost:3000/i/${inviteToken}`,
    ownerUserId: "owner-user",
    memberCount: 2,
    createdAt: "2026-07-17T10:00:00.000Z",
    permissions: [
      "VIEW_SERVER",
      "VIEW_CHANNEL",
      "READ_MESSAGE_HISTORY",
      "SEND_MESSAGES",
      "CONNECT_VOICE",
    ],
    channels: [
      {
        id: "text-from-invite",
        serverId: "server-from-invite",
        name: "общий",
        type: "text",
        position: 0,
        unreadCount: 0,
        permissions: ["VIEW_CHANNEL", "READ_MESSAGE_HISTORY", "SEND_MESSAGES"],
      },
    ],
    roles: [],
    members: [],
  };
  apiServer = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost:3000");
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/begin"
    ) {
      response.end(
        JSON.stringify({
          status: "SECOND_FACTOR_REQUIRED",
          factor: "email",
          retryAfterSeconds: 60,
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/auth/password/complete"
    ) {
      response.end(
        JSON.stringify({
          accessToken: "invite-access-token-for-e2e-user",
          refreshToken: "invite-refresh-token-for-e2e-user-1234567890",
          expiresIn: 900,
          user: {
            id: "invite-user",
            email: "invitee@myvatrushka.ru",
            displayName: "Гость по ссылке",
            platformRole: "member",
            hasPassword: true,
            twoFactorEnabled: true,
          },
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
      response.end(
        JSON.stringify({
          accessToken: "invite-refreshed-access-token-for-e2e-user",
          refreshToken: "invite-refreshed-refresh-token-for-e2e-user",
          expiresIn: 900,
          user: {
            id: "invite-user",
            email: "invitee@myvatrushka.ru",
            displayName: "Гость по ссылке",
            platformRole: "member",
            hasPassword: true,
            twoFactorEnabled: true,
          },
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === `/api/v1/invites/${inviteToken}/accept`
    ) {
      inviteAccepted = true;
      response.end(JSON.stringify(server));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/servers") {
      response.end(JSON.stringify(inviteAccepted ? [server] : []));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/notifications/messages"
    ) {
      response.end(JSON.stringify({ items: [], cursor: null }));
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/channels/text-from-invite/messages"
    ) {
      response.end("[]");
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/channels/text-from-invite/read"
    ) {
      response.statusCode = 204;
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
  await new Promise<void>((resolve, reject) =>
    apiServer?.listen(3000, () => resolve()).once("error", reject),
  );

  application = await launchElectron(["vatrushka://invite/ABCD2345test"]);
  expect(await application.evaluate(() => process.argv)).toContain(
    "vatrushka://invite/ABCD2345test",
  );
  let window = await application.firstWindow();
  await expect(
    window.getByRole("heading", { name: "Добро пожаловать" }),
  ).toBeVisible();
  await expect(window.getByText(/Гостевой вход/u)).toHaveCount(0);
  await expect(window.getByText(/Код приглашения/u)).toHaveCount(0);
  await window
    .getByRole("textbox", { name: "Email" })
    .fill("invitee@myvatrushka.ru");
  await window
    .getByRole("textbox", { name: "Пароль", exact: true })
    .fill("secure-vatrushka-42");
  await window.getByRole("button", { name: /Продолжить/u }).click();
  await window.getByLabel("Код из письма").fill("123456");
  const applicationWindow = waitForApplicationWindow(window);
  await window.getByRole("button", { name: /Подтвердить вход/u }).click();
  window = await applicationWindow;
  const serverNavigation = window.getByRole("complementary", {
    name: "Навигация сервера",
  });
  await expect(serverNavigation.getByText("Сервер по ссылке")).toBeVisible();
  await expect(window.getByRole("button", { name: "общий" })).toBeVisible();
  expect(inviteAccepted).toBe(true);
});
