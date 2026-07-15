import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let application: ElectronApplication;

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
});

test('launches the secure auth shell with an allowlisted preload API', async () => {
  application = await electron.launch({ args: ['.', '--user-data-dir=.e2e-user-data'], cwd: process.cwd(), env: electronEnvironment() });
  const window = await application.firstWindow();
  await expect(window.getByRole('heading', { name: 'Войдите без пароля' })).toBeVisible();
  await expect(window.getByLabel('Email')).toBeVisible();

  expect(await window.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
  expect(await window.evaluate(() => typeof (window as unknown as { process?: unknown }).process)).toBe('undefined');
  expect(await window.evaluate(() => Object.keys((window as unknown as { desktop: Record<string, unknown> }).desktop).sort())).toEqual([
    'clearRefreshToken',
    'clearSelectedDesktopSource',
    'copyToClipboard',
    'getAppVersion',
    'getLocalSettings',
    'getPlatform',
    'getStoredRefreshToken',
    'listDesktopSources',
    'onDeepLink',
    'selectDesktopSource',
    'storeRefreshToken',
    'updateLocalSettings',
  ].sort());
});

test('handles a validated room deep link at startup', async () => {
  application = await electron.launch({ args: ['.', 'vatrushka://join/ABC234', '--user-data-dir=.e2e-user-data-link'], cwd: process.cwd(), env: electronEnvironment() });
  expect(await application.evaluate(() => process.argv)).toContain('vatrushka://join/ABC234');
  const window = await application.firstWindow();
  await expect(window.getByRole('heading', { name: /Комната ABC234/u })).toBeVisible();
  await expect(window.getByRole('button', { name: /Войти по email/u })).toBeVisible();
});
