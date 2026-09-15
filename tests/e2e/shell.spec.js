import { test, expect } from '@playwright/test';

test('the empty shell renders in light and dark', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.panel__title')).toHaveText('Schedule');
  await expect(page.locator('.empty-state')).toContainText('No project open');
  await expect(page.locator('[aria-current="page"]')).toHaveText('Schedule');
  await page.screenshot({
    path: 'test-results/shell-light.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: 'test-results/shell-dark.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Materials' }).click();
  await expect(page.locator('.panel__title')).toHaveText('Materials');
  await page.reload();
  await expect(page.locator('.panel__title')).toHaveText('Materials');

  await page.setViewportSize({ width: 800, height: 900 });
  await page.screenshot({
    path: 'test-results/shell-narrow.png',
    fullPage: true,
    animations: 'disabled',
  });
});
