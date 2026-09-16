import { test, expect } from '@playwright/test';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, start: string, end: string, estimate: string, actual?: string }} item
 */
async function addItem(page, { title, start, end, estimate, actual }) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add item' }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Start').fill(start);
  await dialog.getByLabel('End').fill(end);
  await dialog.getByLabel('Estimate').fill(estimate);
  if (actual) await dialog.getByLabel('Actual').fill(actual);
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
}

test('the costs panel sums the project and draws both charts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen');
  await dialog.getByLabel('Start date').fill('2026-09-01');
  await dialog.getByLabel('Budget').fill('50,000');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Costs' }).click();
  await expect(page.locator('.empty-state')).toContainText(
    'No costs in Kitchen yet',
  );

  await page.getByRole('button', { name: 'Schedule' }).click();
  await addItem(page, {
    title: 'Demo',
    start: '2026-09-01',
    end: '2026-09-03',
    estimate: '2,000',
    actual: '2,400',
  });
  await addItem(page, {
    title: 'Rough plumbing',
    start: '2026-09-08',
    end: '2026-09-12',
    estimate: '6,500',
  });
  await addItem(page, {
    title: 'Cabinets',
    start: '2026-10-19',
    end: '2026-10-30',
    estimate: '18,000',
  });
  await page.getByRole('checkbox', { name: 'Mark Demo complete' }).check();
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Demo complete',
  );

  await page.getByRole('button', { name: 'Materials' }).click();
  await page.getByRole('button', { name: 'Add material' }).click();
  await dialog.getByLabel('Material', { exact: true }).fill('Quartz counter');
  await dialog.getByLabel('Expected').fill('2026-11-10');
  await dialog.getByLabel('Allowance').fill('4,000');
  await dialog.getByLabel('Estimate').fill('5,200');
  await dialog.getByRole('button', { name: 'Add to materials' }).click();
  await expect(dialog).toBeHidden();
  // An allowance with no estimate counts as the expected cost.
  await page.getByRole('button', { name: 'Add material' }).click();
  await dialog.getByLabel('Material', { exact: true }).fill('Sink');
  await dialog.getByLabel('Allowance').fill('1,500');
  await dialog.getByRole('button', { name: 'Add to materials' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Costs' }).click();
  const tiles = page.locator('.cost-tile');
  await expect(tiles).toHaveCount(5);
  await expect(tiles.nth(0)).toContainText('$50,000.00');
  await expect(tiles.nth(1)).toContainText('$33,200.00');
  await expect(tiles.nth(2)).toContainText('$2,400.00');
  await expect(tiles.nth(3)).toContainText('Remaining');
  await expect(tiles.nth(3)).toContainText('$16,400.00');
  await expect(tiles.nth(4)).toContainText('20%');

  const items = page.getByRole('table', { name: 'Line items in Kitchen' });
  await expect(items.locator('tbody tr')).toHaveCount(5);
  const demo = items.locator('tbody tr', { hasText: 'Demo' });
  await expect(demo).toContainText('Labor');
  await expect(demo.locator('.variance--over')).toHaveText('+$400.00');
  const sink = items.locator('tbody tr', { hasText: 'Sink' });
  await expect(sink).toContainText('Material');
  await expect(sink).toContainText('$1,500.00');
  const itemTotals = items.locator('tfoot tr');
  await expect(itemTotals).toContainText('$33,200.00');
  await expect(itemTotals).toContainText('$2,400.00');
  // The name opens the editor for the row behind it.
  await items.getByRole('button', { name: 'Quartz counter' }).click();
  await expect(dialog.getByLabel('Allowance')).toHaveValue('4000.00');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  const line = page.getByRole('img', { name: 'Cumulative cost of Kitchen' });
  await expect(line.locator('.chart__expected')).toHaveCount(1);
  await expect(line.locator('.chart__actual')).toHaveCount(1);
  await expect(line.locator('.chart__budget')).toHaveCount(1);
  const bars = page.getByRole('img', { name: 'Cost of Kitchen by month' });
  await expect(bars.locator('.chart__expected-bar')).toHaveCount(3);
  await expect(bars.locator('.chart__actual-bar')).toHaveCount(1);

  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
  await page.screenshot({
    path: 'test-results/costs-panel.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: 'test-results/costs-panel-dark.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'light' });

  // Push the project over budget and the remaining tile flips.
  await page.getByRole('button', { name: 'Schedule' }).click();
  await addItem(page, {
    title: 'Appliances',
    start: '2026-11-02',
    end: '2026-11-06',
    estimate: '20,000',
  });
  await page.getByRole('button', { name: 'Costs' }).click();
  await expect(tiles.nth(3)).toContainText('Over budget');
  await expect(tiles.nth(3)).toContainText('$3,600.00');
  await expect(tiles.nth(3)).toHaveClass(/cost-tile--over/);

  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
