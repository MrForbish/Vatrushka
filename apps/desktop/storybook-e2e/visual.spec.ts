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
});
