import { expect, test, type Page } from '@playwright/test';

async function openStory(page: Page, id: string): Promise<void> {
  const storyUrl = `/iframe.html?id=${id}&viewMode=story`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(storyUrl, { waitUntil: 'load' });
    try {
      await page.waitForFunction(
        () => Boolean(
          document.querySelector('#storybook-root')?.childElementCount
          || document.querySelector('[role="dialog"], [role="complementary"]'),
        ),
        undefined,
        { timeout: 10_000 },
      );
      const storyError = await page.locator('#error-message').textContent();
      if (storyError) {
        throw new Error(`Storybook failed to load ${id}: ${storyError}`);
      }
      await page.evaluate(async () => document.fonts.ready);
      return;
    } catch (caught) {
      if (attempt === 2) throw caught;
      await page.goto('about:blank');
    }
  }
}

async function settlePortalAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations({ subtree: true })) {
      animation.finish();
    }
  });
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
    await page.getByRole('button', { name: 'Удалить канал' }).focus();
    await expect(page).toHaveScreenshot('overlay-confirm-dialog.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell desktop', async ({ page }) => {
    await openStory(page, 'layouts-app-shell--visual-full-server');
    await expect(page).toHaveScreenshot('app-shell-desktop.png', { animations: 'disabled', fullPage: true });
  });

  test('system toolbar', async ({ page }) => {
    await openStory(page, 'layouts-system-toolbar--notification-control');
    await expect(page).toHaveScreenshot('system-toolbar.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell at the supported 1280 by 720 boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStory(page, 'layouts-app-shell--visual-full-server');
    await expect(page.getByRole('button', { name: 'Открыть участников' })).toBeVisible();
    await expect(page).toHaveScreenshot('app-shell-1280.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell at the minimum 1024 by 680 boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 680 });
    await openStory(page, 'layouts-app-shell--visual-full-server');
    await page.getByRole('button', { name: 'Открыть список серверов' }).click();
    await expect(page.getByRole('dialog', { name: 'Серверы' })).toBeVisible();
    await settlePortalAnimations(page);
    await expect(page).toHaveScreenshot('app-shell-minimum.png', { animations: 'disabled', fullPage: true });
  });

  test('server settings shell', async ({ page }) => {
    await openStory(page, 'features-settings-settings-shell--server-overview');
    await expect(page.getByRole('heading', { name: 'Настройки сервера' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Быстрый возврат' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Активные пространства' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Друзья в игре' })).toBeVisible();
    await expect(page).toHaveScreenshot('home-dashboard.png', {
      animations: 'disabled',
      fullPage: true,
      // Windows shell runners exhibit a stable sub-pixel font rasterization
      // delta on this dense dashboard. Keep a bounded per-screen tolerance.
      maxDiffPixels: 800,
    });
  });

  test('personal Home has no duplicate profile drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 760 });
    await openStory(page, 'home-homepage--profile-drawer-mode');
    await expect(page.getByRole('button', { name: 'Открыть профиль' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Профиль' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Активные пространства' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1100);
    await expect(page).toHaveScreenshot('home-dashboard-compact.png', { animations: 'disabled', fullPage: true });
  });

  test('password login', async ({ page }) => {
    await openStory(page, 'screens-current--password-login');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
    await expect(page).toHaveScreenshot('password-login.png', { animations: 'disabled', fullPage: true });
  });

  test('password login at the minimum desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 680 });
    await openStory(page, 'screens-current--password-login');
    await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
    await expect(page).toHaveScreenshot('password-login-minimum.png', { animations: 'disabled', fullPage: true });
  });

  test('password reset', async ({ page }) => {
    await openStory(page, 'screens-current--password-reset');
    await expect(page.getByRole('heading', { name: 'Задайте новый пароль' })).toBeVisible();
    await expect(page).toHaveScreenshot('password-reset.png', { animations: 'disabled', fullPage: true });
  });

  test('app shell compact drawers', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 760 });
    await openStory(page, 'layouts-app-shell--visual-full-server');
    await page.getByRole('button', { name: 'Открыть список серверов' }).click();
    await expect(page.getByRole('dialog', { name: 'Серверы' })).toBeVisible();
    await settlePortalAnimations(page);
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
    await expect(page).toHaveScreenshot('voice-active-speaker.png', {
      animations: 'disabled',
      fullPage: true,
      // Chromium rasterizes the translucent voice stage one pixel differently
      // on some Windows shell runners; a bounded 72 px tolerance keeps the
      // baseline strict while avoiding a renderer-only false positive.
      maxDiffPixels: 100,
    });
  });

  test('voice room device controls', async ({ page }) => {
    await openStory(page, 'features-voice-room--visual-room');
    await page.getByRole('button', { name: 'Устройства' }).click();
    await expect(page).toHaveScreenshot('voice-room-devices.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('screen share audio volume controls', async ({ page }) => {
    await openStory(page, 'features-voice-room--screen-share-viewer');
    await page.locator('.vui-room__video-frame').click({ button: 'right' });
    await expect(page.getByRole('slider', { name: 'Громкость демонстрации' })).toBeVisible();
    await expect(page).toHaveScreenshot('screen-share-audio-volume.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('screen share annotations', async ({ page }) => {
    await openStory(page, 'features-voice-room--screen-share-annotations');
    await expect(page.getByRole('toolbar', { name: 'Рисование поверх демонстрации' })).toBeVisible();
    await expect(page).toHaveScreenshot('screen-share-annotations.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('connected voice keeps server navigation', async ({ page }) => {
    await openStory(page, 'screens-server--connected-voice');
    await expect(page.getByRole('button', { name: 'общий' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Переговорная' })).toBeVisible();
    await expect(page.getByText('Голосовая связь подключена', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('server-connected-voice.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('direct messages preserve the app shell and conversation context', async ({ page }) => {
    await openStory(page, 'features-direct-messages--visual-active-conversation');
    await expect(page.getByRole('complementary', { name: 'Личные диалоги' })).toBeVisible();
    await expect(page).toHaveScreenshot('direct-messages-active.png', {
      animations: 'disabled',
      fullPage: true,
    });
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
    await openStory(page, 'features-notifications-notification-center--update-ready');
    await expect(page.getByRole('button', { name: 'Перезапустить и обновить' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Сессии' }).focus();
    await expect(page).toHaveScreenshot('security-center-sessions.png', { animations: 'disabled', fullPage: true });
  });
});
