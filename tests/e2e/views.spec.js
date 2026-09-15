import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
// 68rem is 1088px, so 1000px sits under the one breakpoint.
const NARROW = { width: 1000, height: 800 };
const VIEWS = ['Table', 'Calendar', 'Gantt', 'Agenda'];

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {string} start
 * @param {string} end
 */
async function addItem(page, title, start, end) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add item' }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Start').fill(start);
  await dialog.getByLabel('End').fill(end);
  await dialog.getByLabel('Estimate').fill('1200');
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Success toasts from the seed writes would cover the right half of every
 * shot, so each one is dismissed first.
 * @param {import('@playwright/test').Page} page
 */
async function clearToasts(page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
  await expect(page.locator('.toast')).toHaveCount(0);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} suffix
 */
async function shootViews(page, suffix) {
  await clearToasts(page);
  for (const view of VIEWS) {
    await page.getByRole('radio', { name: view }).click();
    await expect(page.getByRole('radio', { name: view })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.screenshot({
      path: `test-results/view-${view.toLowerCase()}-${suffix}.png`,
      animations: 'disabled',
      fullPage: true,
    });
  }
}

test('every schedule view renders at desktop and at the breakpoint', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  await addItem(page, 'Demo', '2026-10-01', '2026-10-03');
  await addItem(page, 'Rough plumbing', '2026-10-06', '2026-10-10');
  await addItem(page, 'Electrical', '2026-10-06', '2026-10-09');
  await addItem(page, 'Inspection', '2026-10-13', '2026-10-13');
  await addItem(page, 'Drywall', '2026-10-14', '2026-10-20');
  await addItem(page, 'Cabinets', '2026-10-21', '2026-10-28');
  await page.getByRole('checkbox', { name: 'Mark Demo complete' }).check();
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Demo complete',
  );

  await shootViews(page, 'desktop');
  await page.setViewportSize(NARROW);
  await shootViews(page, 'narrow');

  // Nothing scrolls sideways at the breakpoint.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  await page.setViewportSize(DESKTOP);
  await page.getByRole('radio', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
