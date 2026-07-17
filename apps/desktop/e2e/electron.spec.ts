import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer, type Server } from 'node:http';

let application: ElectronApplication;
let apiServer: Server | undefined;

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
  if (apiServer) await new Promise<void>((resolve, reject) => apiServer?.close((error) => error ? reject(error) : resolve()));
  apiServer = undefined;
});

test('launches the secure auth shell with an allowlisted preload API', async () => {
  application = await electron.launch({ args: ['.', '--user-data-dir=.e2e-user-data'], cwd: process.cwd(), env: electronEnvironment() });
  const window = await application.firstWindow();
  await expect(window.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await expect(window.getByLabel('Email')).toBeVisible();

  expect(await window.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
  expect(await window.evaluate(() => typeof (window as unknown as { process?: unknown }).process)).toBe('undefined');
  expect(await window.evaluate(() => Object.keys((window as unknown as { desktop: Record<string, unknown> }).desktop).sort())).toEqual([
    'clearAuthSession',
    'clearSelectedDesktopSource',
    'copyToClipboard',
    'getAppVersion',
    'getUpdateState',
    'checkForUpdates',
    'installUpdate',
    'onUpdateState',
    'getLocalSettings',
    'getPlatform',
    'listDesktopSources',
    'onDeepLink',
    'onMessageNotificationClick',
    'selectDesktopSource',
    'showMessageNotification',
    'logoutAuthSession',
    'refreshAuthSession',
    'completeAuthSession',
    'updateLocalSettings',
  ].sort());
});

test('supports keyboard-only authentication with a visible focus indicator', async () => {
  application = await electron.launch({ args: ['.', '--user-data-dir=.e2e-user-data-keyboard'], cwd: process.cwd(), env: electronEnvironment() });
  const window = await application.firstWindow();
  const email = window.getByLabel('Email');
  const password = window.getByRole('textbox', { name: 'Пароль', exact: true });

  await expect(email).toBeVisible();
  await expect(email).toBeFocused();
  await email.fill('keyboard@example.com');
  await window.keyboard.press('Tab');
  await expect(password).toBeFocused();
  expect(await password.evaluate((element) => getComputedStyle(element.closest('.vui-input-frame') as Element).boxShadow)).not.toBe('none');

  const registrationTab = window.getByRole('button', { name: 'Регистрация' });
  await registrationTab.focus();
  await window.keyboard.press('Enter');
  await expect(registrationTab).toHaveAttribute('aria-pressed', 'true');
  await expect(window.getByLabel('Повторите пароль')).toBeVisible();
});

test('grants audio permission and exposes device labels to the trusted renderer', async () => {
  application = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream', '--user-data-dir=.e2e-user-data-media'],
    cwd: process.cwd(),
    env: electronEnvironment(),
  });
  const window = await application.firstWindow();
  const devices = await window.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    try {
      return (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
        .map((device) => ({ kind: device.kind, label: device.label }));
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  });

  expect(devices.some((device) => device.kind === 'audioinput')).toBe(true);
  expect(devices.filter((device) => device.kind === 'audioinput').every((device) => device.label.trim().length > 0)).toBe(true);
  expect(devices.every((device) => !/^(?:Микрофон|Динамики) \d+$/u.test(device.label))).toBe(true);
});

test('revokes another device without exposing its refresh token to the renderer', async () => {
  let remoteSessionActive = true;
  apiServer = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
    const url = new URL(request.url ?? '/', 'http://localhost:3000');
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/password/begin') {
      response.end(JSON.stringify({ status: 'SECOND_FACTOR_REQUIRED', factor: 'email', retryAfterSeconds: 60 }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/password/complete') {
      response.end(JSON.stringify({ accessToken: 'access-token-for-e2e-user-1234567890', refreshToken: 'rotated-refresh-token-for-e2e-user-1234567890', expiresIn: 900, user: { id: 'user-e2e', email: 'owner@myvatrushka.ru', displayName: 'Илья', platformRole: 'owner', hasPassword: true, twoFactorEnabled: true } }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/sessions') {
      response.end(JSON.stringify([
        { id: '11111111-1111-4111-8111-111111111111', deviceName: 'Текущий компьютер', current: true, trusted: true, createdAt: '2026-07-15T10:00:00.000Z', lastUsedAt: '2026-07-17T10:00:00.000Z', expiresAt: '2026-08-15T10:00:00.000Z' },
        ...(remoteSessionActive ? [{ id: '22222222-2222-4222-8222-222222222222', deviceName: 'Старый ноутбук', current: false, trusted: false, createdAt: '2026-07-10T10:00:00.000Z', lastUsedAt: '2026-07-16T10:00:00.000Z', expiresAt: '2026-08-10T10:00:00.000Z' }] : []),
      ]));
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/auth/sessions/22222222-2222-4222-8222-222222222222') {
      remoteSessionActive = false;
      response.end(JSON.stringify({ current: false }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/me/security-events') { response.end('[]'); return; }
    if (request.method === 'GET' && url.pathname === '/api/v1/servers') { response.end('[]'); return; }
    if (request.method === 'GET' && url.pathname === '/api/v1/notifications/messages') { response.end(JSON.stringify({ items: [], cursor: null })); return; }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 'NOT_FOUND' }));
  });
  await new Promise<void>((resolve, reject) => apiServer?.listen(3000, () => resolve()).once('error', reject));

  application = await electron.launch({ args: ['.', '--user-data-dir=.e2e-user-data-security'], cwd: process.cwd(), env: electronEnvironment() });
  const window = await application.firstWindow();
  await window.getByRole('textbox', { name: 'Email' }).fill('owner@myvatrushka.ru');
  await window.getByRole('textbox', { name: 'Пароль', exact: true }).fill('secure-vatrushka-42');
  await window.getByRole('button', { name: /Продолжить/u }).click();
  await window.getByLabel('Код из письма').fill('123456');
  await window.getByRole('button', { name: /Подтвердить вход/u }).click();
  await expect(window.getByRole('button', { name: 'Безопасность' })).toBeVisible();
  expect(await window.evaluate(() => 'getStoredRefreshToken' in (window as unknown as { desktop: Record<string, unknown> }).desktop)).toBe(false);

  await window.getByRole('button', { name: 'Безопасность' }).click();
  await window.getByRole('button', { name: 'Сессии' }).click();
  const remote = window.locator('.session-card').filter({ hasText: 'Старый ноутбук' });
  await expect(remote).toBeVisible();
  await remote.getByRole('button', { name: 'Завершить' }).click();
  const confirmation = window.getByRole('dialog', { name: 'Завершить сессию?' });
  await confirmation.getByRole('button', { name: 'Завершить' }).click();
  await expect(remote).toHaveCount(0);
});

test('accepts a validated server invite deep link at startup without exposing a guest room flow', async () => {
  application = await electron.launch({ args: ['.', 'vatrushka://server/ABCD2345', '--user-data-dir=.e2e-user-data-link'], cwd: process.cwd(), env: electronEnvironment() });
  expect(await application.evaluate(() => process.argv)).toContain('vatrushka://server/ABCD2345');
  const window = await application.firstWindow();
  await expect(window.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
  await expect(window.getByText(/Гостевой вход/u)).toHaveCount(0);
});
