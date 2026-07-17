import { expect, test, type Page } from '@playwright/test';

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.waitForLoadState('networkidle');
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

  test('voice active speaker', async ({ page }) => {
    await openStory(page, 'voice-voice-stage--visual-stage');
    await expect(page).toHaveScreenshot('voice-active-speaker.png', { animations: 'disabled', fullPage: true });
  });

  test('voice room device controls', async ({ page }) => {
    await openStory(page, 'features-voice-room--visual-room');
    await expect(page).toHaveScreenshot('voice-room-devices.png', { animations: 'disabled', fullPage: true });
  });

  test('screen share source picker', async ({ page }) => {
    await openStory(page, 'features-screen-share--visual-picker');
    await expect(page).toHaveScreenshot('screen-share-picker.png', { animations: 'disabled', fullPage: true });
  });

  test('server role editor', async ({ page }) => {
    await openStory(page, 'features-server-settings--visual-roles');
    await expect(page.getByRole('dialog', { name: 'Настройки сервера' })).toBeVisible();
    await expect(page).toHaveScreenshot('server-settings-roles.png', { animations: 'disabled', fullPage: true });
  });

  test('channel permission overrides', async ({ page }) => {
    await openStory(page, 'features-server-settings--channel-overrides');
    await expect(page.getByRole('heading', { name: 'Права конкретного канала' })).toBeVisible();
    await expect(page).toHaveScreenshot('server-settings-overrides.png', { animations: 'disabled', fullPage: true });
  });
});
