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

test('the agenda lists days, marks today, filters finished work, and lands on a date', async ({
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
  await addItem(page, 'Cabinets', '2026-10-14', '2026-10-16');
  await addItem(page, 'Drywall', '2026-10-29', '2026-11-04');
  await page.getByRole('checkbox', { name: 'Mark Demo complete' }).check();
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Demo complete',
  );

  await page.getByRole('radio', { name: 'Agenda' }).click();
  const agenda = page.locator('.agenda');
  const days = agenda.locator('.agenda-day');
  await expect(days).toHaveCount(7);
  await expect(agenda.locator('.agenda__month').first()).toHaveText(
    'October 2026',
  );
  await expect(agenda.locator('.agenda__month').last()).toHaveText(
    'November 2026',
  );
  await expect(agenda.locator('.agenda__today')).toHaveCount(1);
  await expect(
    days.nth(1).getByRole('heading', { name: 'Tuesday, October 13, 2026' }),
  ).toBeVisible();
  await expect(days.nth(1).locator('.section-label')).toHaveCount(0);
  await expect(days.nth(2).locator('.section-label')).toHaveText([
    'Starting',
    'Finishing',
  ]);
  await expect(days.nth(2).locator('.agenda-row__meta').last()).toHaveText(
    '2 days, since Oct 13',
  );
  await page.screenshot({
    path: 'test-results/agenda.png',
    animations: 'disabled',
    fullPage: true,
  });

  // Hiding finished work drops Demo from both of its days.
  await agenda.getByRole('checkbox', { name: 'Hide finished' }).check();
  await expect(days).toHaveCount(6);
  await expect(agenda.locator('.agenda-row--complete')).toHaveCount(0);
  await agenda.getByRole('checkbox', { name: 'Hide finished' }).uncheck();

  // A title opens the editor.
  await agenda.getByRole('button', { name: 'Drywall' }).last().click();
  await expect(dialog.getByLabel('Title')).toHaveValue('Drywall');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // The calendar's overflow count lands on that day with focus on it.
  await page.getByRole('radio', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: '1 more on Oct 13' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tuesday, October 13, 2026' }),
  ).toBeFocused();

  await page.getByRole('radio', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
