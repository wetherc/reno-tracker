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
    Object.keys(localStorage).map((key) => [key, localStorage[key]]),
  );
  const projects = stored.filter(([key]) =>
    key.startsWith('reno-tracker:project:'),
  );
  expect(projects).toHaveLength(1);
  expect(projects[0][1]).toContain('Pour slab');
  expect(apiCalls).toEqual([]);

  await page.getByRole('button', { name: 'Delete project' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});

test('the static build moves a combined document to one key per project', async ({
  page,
}) => {
  const project = {
    id: 'p1',
    name: 'Attic',
    budgetCents: 0,
    startDate: '2026-11-02',
    createdAt: '2026-11-01T00:00:00.000Z',
  };
  await page.addInitScript(
    (doc) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('reno-tracker:db', JSON.stringify(doc));
      }
    },
    { projects: [project] },
  );
  await page.goto('/');
  await page.getByRole('combobox').selectOption({ label: 'Attic' });
  await expect(page.locator('.empty-state')).not.toContainText(
    'No project open',
  );
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain('reno-tracker:project:p1');
  expect(keys).not.toContain('reno-tracker:db');
});
