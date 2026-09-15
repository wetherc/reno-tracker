import { test, expect } from '@playwright/test';

// Runs against the static build served with no /api, the way GitHub
// Pages serves it. Data has to come back after a reload from the
// browser's own storage, and no request may go to the server API.

test('the static build keeps a project in the browser', async ({ page }) => {
  /** @type {string[]} */
  const apiCalls = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) {
      apiCalls.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.locator('.empty-state')).toContainText('No project open');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Garage');
  await dialog.getByLabel('Start date').fill('2026-11-02');
  await dialog.getByLabel('Budget').fill('12,000');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Started Garage');

  await page.getByRole('button', { name: 'Add item' }).click();
  await dialog.getByLabel('Title').fill('Pour slab');
  await dialog.getByLabel('Start').fill('2026-11-02');
  await dialog.getByLabel('End').fill('2026-11-04');
  await dialog.getByLabel('Estimate').fill('3,200');
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: /Pour slab/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('row', { name: /Pour slab/ })).toBeVisible();
  await page.screenshot({
    path: 'test-results/pages-schedule.png',
    animations: 'disabled',
  });

  const stored = await page.evaluate(() =>
    localStorage.getItem('reno-tracker:db'),
  );
  expect(stored).toContain('Pour slab');
  expect(apiCalls).toEqual([]);

  await page.getByRole('button', { name: 'Delete project' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
