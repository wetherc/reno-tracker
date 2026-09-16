import { test, expect } from '@playwright/test';

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
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
}

test('the calendar draws bars, folds the overflow, and turns months', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  await addItem(page, 'Demo', '2026-10-12', '2026-10-14');
  await addItem(page, 'Rough plumbing', '2026-10-13', '2026-10-13');
  await addItem(page, 'Electrical', '2026-10-13', '2026-10-15');
  await addItem(page, 'Inspection', '2026-10-13', '2026-10-14');
  await addItem(page, 'Drywall', '2026-10-29', '2026-11-04');

  await page.getByRole('radio', { name: 'Calendar' }).click();
  const cal = page.locator('.cal');
  await expect(cal.locator('.cal__title')).toHaveText('October 2026');
  await expect(
    cal.getByRole('button', { name: 'Demo, Oct 12 to Oct 14' }),
  ).toBeVisible();
  await expect(
    cal.getByRole('button', { name: '1 more on Oct 13' }),
  ).toBeVisible();
  const drywall = cal.getByRole('button', { name: 'Drywall, Oct 29 to Nov 4' });
  await expect(drywall).toHaveClass(/cal-bar--after/);
  await page.screenshot({
    path: 'test-results/calendar-october.png',
    animations: 'disabled',
    fullPage: true,
  });

  await cal.getByRole('button', { name: 'Next month' }).click();
  await expect(cal.locator('.cal__title')).toHaveText('November 2026');
  await expect(drywall).toHaveClass(/cal-bar--before/);

  // A bar opens the editor for its item, and the editor marks it
  // complete without a save.
  await drywall.click();
  await expect(dialog.getByLabel('Title')).toHaveValue('Drywall');
  await dialog.getByLabel('Mark Drywall complete').check();
  await expect(page.getByText('Marked Drywall complete')).toBeVisible();
  await expect(dialog.getByLabel('Reopen Drywall')).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(drywall).toHaveClass(/cal-bar--complete/);

  // The overflow count lands in the agenda view.
  await cal.getByRole('button', { name: 'Previous month' }).click();
  await cal.getByRole('button', { name: '1 more on Oct 13' }).click();
  await expect(page.getByRole('radio', { name: 'Agenda' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.getByRole('radio', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
