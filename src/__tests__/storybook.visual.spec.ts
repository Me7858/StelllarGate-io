import { expect, test } from '@playwright/test';

test('Storybook loads the core logo story', async ({ page }) => {
  await page.goto('/iframe.html?id=components-logo--default');
  await expect(page.locator('svg')).toHaveCount(1);
  await expect(page.locator('svg')).toBeVisible();
});

test('Storybook renders the confirm dialog story', async ({ page }) => {
  await page.goto('/iframe.html?id=dialogs-confirmdialog--default');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
});
