import { expect, test, type Page } from '@playwright/test';

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' });
  await page.locator('#storybook-root:not(:empty):visible, [role="dialog"]:visible, [role="complementary"]:visible').first().waitFor({ state: 'attached' });
  await page.evaluate(async () => document.fonts.ready);
}

test.describe('Vatrushka design system visual baseline', () => {
  test('foundations', async ({ page }) => {
    await openStory(page, 'foundations-colors--palette');
    await expect(page).toHaveScreenshot('foundations-colors.png', { animations: 'disabled', fullPage: true });
  });

  test('buttons', async ({ page }) => {
    await openStory(page, 'primitives-button--states');
    await expect(page).toHaveScreenshot('primitives-buttons.png', { animations: 'disabled', fullPage: true });
  });

  test('form fields', async ({ page }) => {
    await openStory(page, 'primitives-form-fields--catalog');
    await expect(page).toHaveScreenshot('primitives-fields.png', { animations: 'disabled', fullPage: true });
  });

  test('confirm dialog', async ({ page }) => {
    await openStory(page, 'overlays-modal-confirmdialog-drawer--confirm-destructive');
    await expect(page).toHaveScreenshot('overlay-confirm-dialog.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell desktop', async ({ page }) => {
    await openStory(page, 'layouts-app-shell--full-server');
    await expect(page).toHaveScreenshot('app-shell-desktop.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell at the supported 1280 by 720 boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStory(page, 'layouts-app-shell--full-server');
    await expect(page.getByRole('button', { name: 'Открыть участников' })).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-1280.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell at the minimum 1024 by 680 boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 680 });
    await openStory(page, 'layouts-app-shell--full-server');
    await page.getByRole('button', { name: 'Открыть список серверов' }).click();
    await expect(page.getByRole('dialog', { name: 'Серверы' })).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-minimum.png', { animations: 'disabled', fullPage: true });
  });

  test('server settings shell', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--server-overview');
    await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Разделы настроек' })).toBeVisible();
    await expect(page).toHaveScreenshot('settings-shell-server.png', { animations: 'disabled', fullPage: true });
  });

  test('routed user security settings', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--user-security-live-section');
    await expect(page.getByRole('heading', { name: 'Пароль' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Разделы настроек' })).toBeVisible();
    await expect(page).toHaveScreenshot('settings-shell-user-security.png', { animations: 'disabled', fullPage: true });
  });

  test('routed user profile settings', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--user-profile');
    await expect(page.getByRole('heading', { name: 'Мой профиль' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Отображаемое имя' })).toHaveValue('Илья Форбиш');
    await expect(page).toHaveScreenshot('settings-shell-user-profile.png', { animations: 'disabled', fullPage: true });
  });

  test('routed user audio settings', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--user-audio-devices');
    await expect(page.getByRole('heading', { name: 'Голос и звук' })).toBeVisible();
    await expect(page.getByText('Shure MV7 — рабочий стол')).toBeVisible();
    await expect(page.getByText('Наушники Arctis Nova 7')).toBeVisible();
    await expect(page).toHaveScreenshot('settings-shell-user-audio.png', { animations: 'disabled', fullPage: true });
  });

  test('routed DND presence settings', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--user-presence-dnd');
    await expect(page.getByRole('heading', { name: 'Статус и активность' })).toBeVisible();
    await expect(page.getByText('Режим «Не беспокоить» активен.')).toBeVisible();
    await expect(page).toHaveScreenshot('settings-shell-user-presence.png', { animations: 'disabled', fullPage: true });
  });

  test('routed user privacy settings', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--user-privacy');
    await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Показывать активность' })).toBeVisible();
    await expect(page).toHaveScreenshot('settings-shell-user-privacy.png', { animations: 'disabled', fullPage: true });
  });

  test('personal Home dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openStory(page, 'home-homepage--returning-user');
    await expect(page.getByRole('heading', { name: 'Продолжить' })).toBeVisible();
    await expect(page).toHaveScreenshot('home-dashboard.png', { animations: 'disabled', fullPage: true });
  });

  test('personal Home profile drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 760 });
    await openStory(page, 'home-homepage--profile-drawer-mode');
    await page.getByRole('button', { name: 'Открыть профиль' }).click();
    await expect(page.getByRole('dialog', { name: 'Профиль' })).toBeVisible();
    await expect(page).toHaveScreenshot('home-profile-drawer.png', { animations: 'disabled', fullPage: true });
  });

  test('password login', async ({ page }) => {
    await openStory(page, 'screens-current--password-login');
    await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
    await expect(page).toHaveScreenshot('password-login.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell compact drawers', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 760 });
    await openStory(page, 'layouts-app-shell--full-server');
    await page.getByRole('button', { name: 'Открыть список серверов' }).click();
    await expect(page.getByRole('dialog', { name: 'Серверы' })).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-compact.png', { animations: 'disabled', fullPage: true });
  });

  test('message conversation', async ({ page }) => {
    await openStory(page, 'messaging-text-channel--conversation');
    await expect(page).toHaveScreenshot('messaging-conversation.png', { animations: 'disabled', fullPage: true });
  });

  test('message composer states', async ({ page }) => {
    await openStory(page, 'messaging-text-channel--composer-states');
    await expect(page).toHaveScreenshot('messaging-composer.png', { animations: 'disabled', fullPage: true });
  });

  test('message mention autocomplete', async ({ page }) => {
    await openStory(page, 'messaging-text-channel--mention-autocomplete');
    const editor = page.getByRole('textbox', { name: 'Сообщение' });
    await editor.fill('@ан');
    await expect(page.getByRole('listbox', { name: 'Упомянуть участника' })).toBeVisible();
    await expect(page).toHaveScreenshot('messaging-mention-autocomplete.png', { animations: 'disabled', fullPage: true });
  });

  test('voice active speaker', async ({ page }) => {
    await openStory(page, 'voice-voice-stage--visual-stage');
    await expect(page).toHaveScreenshot('voice-active-speaker.png', { animations: 'disabled', fullPage: true });
  });

  test('voice room device controls', async ({ page }) => {
    await openStory(page, 'features-voice-room--visual-room');
    await page.getByRole('button', { name: 'Устройства' }).click();
    await expect(page).toHaveScreenshot('voice-room-devices.png', { animations: 'disabled', fullPage: true });
  });

  test('screen share audio volume controls', async ({ page }) => {
    await openStory(page, 'features-voice-room--screen-share-viewer');
    await page.locator('.vui-room__video-frame').click({ button: 'right' });
    await expect(page.getByRole('slider', { name: 'Громкость демонстрации' })).toBeVisible();
    await expect(page).toHaveScreenshot('screen-share-audio-volume.png', { animations: 'disabled', fullPage: true });
  });

  test('connected voice keeps server navigation', async ({ page }) => {
    await openStory(page, 'screens-server--connected-voice');
    await expect(page.getByRole('button', { name: 'общий' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Переговорная' })).toBeVisible();
    await expect(page.getByText('Голосовая связь подключена', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('server-connected-voice.png', { animations: 'disabled', fullPage: true });
  });

  test('server invite short link', async ({ page }) => {
    await openStory(page, 'screens-server--invite-link');
    await expect(page.getByRole('dialog', { name: 'Пригласить на сервер' })).toBeVisible();
    await expect(page.getByText('https://myvatrushka.ru/i/ABCD2345test')).toBeVisible();
    await expect(page).toHaveScreenshot('server-invite-link.png', { animations: 'disabled', fullPage: true });
  });

  test('screen share source picker', async ({ page }) => {
    await openStory(page, 'features-screen-share--visual-picker');
    await expect(page).toHaveScreenshot('screen-share-picker.png', { animations: 'disabled', fullPage: true });
  });

  test('client update ready', async ({ page }) => {
    await openStory(page, 'features-client-update--ready');
    await expect(page.getByRole('button', { name: 'Перезапустить' })).toBeVisible();
    await expect(page).toHaveScreenshot('client-update-ready.png', { animations: 'disabled', fullPage: true });
  });

  test('routed server role editor', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--server-roles');
    await expect(page.getByRole('heading', { name: 'Роли и права' })).toBeVisible();
    await expect(page).toHaveScreenshot('server-settings-roles.png', { animations: 'disabled', fullPage: true });
  });

  test('routed channel permission overrides', async ({ page }) => {
    await openStory(page, 'features-settings-channel-permissions--role-override');
    await expect(page.getByRole('heading', { name: 'Права конкретного канала' })).toBeVisible();
    await expect(page).toHaveScreenshot('server-settings-overrides.png', { animations: 'disabled', fullPage: true });
  });

  test('security center protection', async ({ page }) => {
    await openStory(page, 'features-security-center--protection');
    await expect(page.getByRole('dialog', { name: 'Безопасность аккаунта' })).toBeVisible();
    await expect(page).toHaveScreenshot('security-center-protection.png', { animations: 'disabled', fullPage: true });
  });

  test('security center sessions', async ({ page }) => {
    await openStory(page, 'features-security-center--sessions');
    await expect(page.getByText('Рабочий ноутбук')).toBeVisible();
    await expect(page).toHaveScreenshot('security-center-sessions.png', { animations: 'disabled', fullPage: true });
  });
});
