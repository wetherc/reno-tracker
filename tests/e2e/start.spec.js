import { test, expect } from './fixtures.js';

test('the panel says loading, then shows a failure with Retry', async ({
  page,
}) => {
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((resolve) => (release = () => resolve(null)));
  await page.route('**/api/projects', async (route) => {
    await held;
    await route.abort();
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Loading projects…');
  await expect(
    page.getByRole('button', { name: 'Start a project' }),
  ).toHaveCount(0);
  release();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Could not load the projects.');
  await page.unroute('**/api/projects');
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
  await expect(
    page.getByRole('button', { name: 'Start a project' }),
  ).toBeVisible();
});
