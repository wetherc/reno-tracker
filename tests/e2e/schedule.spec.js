import { test, expect } from '@playwright/test';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, who?: string, start: string, end: string, estimate: string }} item
 */
async function addItem(page, { title, who, start, end, estimate }) {
  await page.getByRole('button', { name: 'Add item' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  if (who) await dialog.getByLabel('Responsible party').fill(who);
  await dialog.getByLabel('Start').fill(start);
  await dialog.getByLabel('End').fill(end);
  await dialog.getByLabel('Estimate').fill(estimate);
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
}

test('add items, edit one with a reason, note it, mark one complete', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen remodel');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByLabel('Budget').fill('45,000');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.empty-state')).toContainText(
    'Nothing scheduled for Kitchen remodel yet',
  );

  await addItem(page, {
    title: 'Demo',
    who: 'Crew',
    start: '2026-10-01',
    end: '2026-10-03',
    estimate: '2,500',
  });
  await expect(page.locator('.toast').last()).toContainText('Added Demo');
  await addItem(page, {
    title: 'Rough plumbing',
    who: 'Plumber',
    start: '2026-10-06',
    end: '2026-10-10',
    estimate: '6,800',
  });
  await addItem(page, {
    title: 'Cabinets',
    start: '2026-10-13',
    end: '2026-10-17',
    estimate: '14,200',
  });
  const table = page.getByRole('table', {
    name: 'Schedule for Kitchen remodel',
  });
  await expect(table.locator('tbody tr')).toHaveCount(3);

  // Edit with a reason. The change log gets the row.
  await table
    .getByRole('button', { name: 'Rough plumbing', exact: true })
    .click();
  await expect(dialog.getByRole('tab', { name: 'Details' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog.getByLabel('End').fill('2026-10-14');
  await dialog.getByLabel('Actual').fill('7,150');
  await dialog.getByLabel('Why the change?').fill('Slab needed a second pour');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const plumbing = table.locator('tbody tr', { hasText: 'Rough plumbing' });
  await expect(plumbing).toContainText('9');
  await expect(plumbing.locator('.variance--over')).toHaveText('+$350.00');

  await table
    .getByRole('button', { name: 'Rough plumbing', exact: true })
    .click();
  await dialog.getByRole('tab', { name: 'Changes' }).click();
  const entries = dialog.locator('.variance-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText('Slab needed a second pour');
  await page.screenshot({
    path: 'test-results/schedule-changes.png',
    animations: 'disabled',
  });

  // Chain the three items, then try to close the chain into a loop. The
  // server refuses and the message names every item in the loop.
  await dialog.getByRole('tab', { name: 'Waits on' }).click();
  await dialog.getByLabel('Has to finish first').selectOption('Demo');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText(
    'Rough plumbing now waits on Demo',
  );
  const waitsOn = dialog.getByRole('list', { name: 'Waits on' });
  await expect(waitsOn.getByRole('listitem')).toHaveCount(1);
  await expect(waitsOn).toContainText('Demo');
  await expect(waitsOn).toContainText('2 days free');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await table.getByRole('button', { name: 'Cabinets', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Waits on' }).click();
  await dialog.getByLabel('Has to finish first').selectOption('Rough plumbing');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(waitsOn).toContainText('overlaps by 2 days');
  await page.screenshot({
    path: 'test-results/schedule-links.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Close' }).click();

  await table.getByRole('button', { name: 'Demo', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Waits on' }).click();
  await expect(dialog.getByRole('list', { name: 'Holds up' })).toContainText(
    'Rough plumbing',
  );
  await dialog.getByLabel('Has to finish first').selectOption('Cabinets');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(dialog.locator('.form__error:not([hidden])')).toHaveText(
    'This dependency makes a loop: Demo -> Rough plumbing -> Cabinets -> Demo',
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await table
    .getByRole('button', { name: 'Rough plumbing', exact: true })
    .click();

  // A note from the notes tab shows without closing.
  await dialog.getByRole('tab', { name: 'Notes' }).click();
  await dialog.getByLabel('New note').fill('Inspector booked for the 15th.');
  await dialog.getByRole('button', { name: 'Add note' }).click();
  await expect(dialog.locator('.note__body')).toHaveText(
    'Inspector booked for the 15th.',
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(
    table.getByRole('button', { name: '1 notes on Rough plumbing' }),
  ).toBeVisible();

  // Mark Demo complete.
  await table.getByLabel('Mark Demo complete').check();
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Demo complete',
  );
  const demo = table.locator('tbody tr', { hasText: 'Demo' });
  await expect(demo).toHaveClass(/schedule-row--complete/);
  await expect(table.getByLabel('Reopen Demo')).toBeChecked();

  // Sort by estimate.
  await table.getByRole('button', { name: 'Estimate' }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Demo');
  await table.getByRole('button', { name: 'Estimate' }).click();
  await expect(table.locator('tbody tr').first()).toContainText('Cabinets');
  await page.screenshot({
    path: 'test-results/schedule-table.png',
    animations: 'disabled',
    fullPage: true,
  });

  // Delete Cabinets from the editor.
  await table.getByRole('button', { name: 'Cabinets', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog').last()).toContainText(
    'Delete Cabinets?',
  );
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(dialog).toBeHidden();

  // Leave the database as it was found so the other specs start empty.
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
