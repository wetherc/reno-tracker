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

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} successor
 * @param {string} predecessor
 */
async function link(page, successor, predecessor) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: successor, exact: true }).click();
  await dialog.getByRole('tab', { name: 'Waits on' }).click();
  await dialog.getByLabel('Has to finish first').selectOption(predecessor);
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText(
    `${successor} now waits on ${predecessor}`,
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

test('the gantt draws bars in order, links them, and moves a bar by key and by drag', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  await addItem(page, 'Demo', '2026-10-01', '2026-10-03');
  await addItem(page, 'Cabinets', '2026-10-08', '2026-10-17');
  await addItem(page, 'Rough plumbing', '2026-10-06', '2026-10-10');
  await link(page, 'Rough plumbing', 'Demo');
  await link(page, 'Cabinets', 'Rough plumbing');

  await page.getByRole('radio', { name: 'Gantt' }).click();
  const gantt = page.locator('.gantt');
  await expect(gantt.locator('.gantt__name')).toHaveText([
    'Demo',
    'Rough plumbing',
    'Cabinets',
  ]);
  await expect(gantt.locator('.gantt__link')).toHaveCount(2);
  await expect(gantt.locator('.gantt__link--conflict')).toHaveCount(1);
  await page.screenshot({
    path: 'test-results/gantt.png',
    animations: 'disabled',
    fullPage: true,
  });

  // Arrow keys move one end by a day.
  const demoEnd = gantt.getByRole('button', { name: 'End of Demo, Oct 3' });
  await demoEnd.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Demo now ends Oct 4')).toBeVisible();
  await expect(
    gantt.getByRole('button', { name: 'End of Demo, Oct 4' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByText('Demo now ends Oct 11')).toBeVisible();

  // A drag on the body moves both dates, and the status reads the dates
  // under the pointer before the release saves them.
  const plumb = gantt.getByRole('button', {
    name: 'Rough plumbing, Oct 6 to Oct 10',
  });
  const box = await plumb.boundingBox();
  if (!box) throw new Error('no bar');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 28 * 2, y, { steps: 4 });
  await expect(gantt.locator('.gantt__status')).toHaveText(
    'Rough plumbing: Oct 8 to Oct 12',
  );
  await page.mouse.up();
  await expect(
    page.getByText('Rough plumbing now runs Oct 8 to Oct 12'),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    gantt.getByRole('button', { name: 'Rough plumbing, Oct 8 to Oct 12' }),
  ).toBeVisible();

  // The name column marks an item complete without leaving the view.
  await gantt.getByLabel('Mark Demo complete').check();
  await expect(page.getByText('Marked Demo complete')).toBeVisible();
  await expect(gantt.locator('.gantt__label').first()).toHaveClass(
    /gantt__label--complete/,
  );
  await expect(gantt.getByLabel('Reopen Demo')).toBeChecked();

  // The change log has the drag.
  await gantt.getByRole('button', { name: 'Rough plumbing' }).first().click();
  await dialog.getByRole('tab', { name: 'Changes' }).click();
  await expect(dialog.getByText('Oct 8, 2026').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.setViewportSize({ width: 640, height: 900 });
  await page.screenshot({
    path: 'test-results/gantt-narrow.png',
    animations: 'disabled',
    fullPage: true,
  });

  await page.getByRole('radio', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
