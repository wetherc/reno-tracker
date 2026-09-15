import { test, expect } from '@playwright/test';

test('list materials, tie one to the schedule, buy one, read the totals', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Bath remodel');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByLabel('Budget').fill('20,000');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  // One schedule item for a material to point at.
  await page.getByRole('button', { name: 'Add item' }).click();
  await dialog.getByLabel('Title').fill('Tile the floor');
  await dialog.getByLabel('Start').fill('2026-10-13');
  await dialog.getByLabel('End').fill('2026-10-15');
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Materials' }).click();
  await expect(page.locator('.empty-state')).toContainText(
    'No materials listed for Bath remodel yet',
  );

  await page.getByRole('button', { name: 'Add material' }).click();
  await dialog.getByLabel('Material', { exact: true }).fill('Porcelain tile');
  await dialog.getByLabel('For').selectOption('Tile the floor');
  await dialog.getByLabel('Allowance').fill('1,200');
  await dialog.getByLabel('Estimate').fill('1,450');
  await dialog.getByRole('button', { name: 'Add to materials' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText(
    'Added Porcelain tile',
  );

  await page.getByRole('button', { name: 'Add material' }).click();
  await dialog.getByLabel('Material', { exact: true }).fill('Vanity');
  await dialog.getByLabel('Expected').fill('2026-11-02');
  await dialog.getByLabel('Allowance').fill('900');
  await dialog.getByLabel('Estimate').fill('850');
  await dialog.getByRole('button', { name: 'Add to materials' }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByRole('table', { name: 'Materials for Bath remodel' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const tile = table.locator('tbody tr', { hasText: 'Porcelain tile' });
  await expect(tile).toContainText('Tile the floor');
  await expect(tile).toContainText('Oct 13');
  await expect(tile.locator('.variance--over')).toHaveText('+$250.00');
  const vanity = table.locator('tbody tr', { hasText: 'Vanity' });
  await expect(vanity).toContainText('Nov 2');
  await expect(vanity.locator('.variance--under')).toHaveText('−$50.00');
  const totals = table.locator('tfoot tr');
  await expect(totals).toContainText('$2,100.00');
  await expect(totals).toContainText('$2,300.00');
  await expect(totals.locator('.variance--over')).toHaveText('+$200.00');

  // Buying the tile at a real price moves the variance.
  await table.getByRole('button', { name: 'Porcelain tile' }).click();
  await dialog.getByLabel('Actual').fill('1,180');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile.locator('.variance--under')).toHaveText('−$20.00');
  await table.getByLabel('Mark Porcelain tile bought').check();
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Porcelain tile bought',
  );
  await expect(tile).toHaveClass(/material-row--complete/);
  await expect(totals).toContainText('$1,180.00');
  await page.screenshot({
    path: 'test-results/materials-table.png',
    animations: 'disabled',
    fullPage: true,
  });

  // Delete the vanity from the editor.
  await table.getByRole('button', { name: 'Vanity' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('Delete Vanity?');
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(table.locator('tbody tr')).toHaveCount(1);

  // Leave the database as it was found so the other specs start empty.
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
