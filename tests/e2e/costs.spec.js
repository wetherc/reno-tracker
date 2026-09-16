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
  await expect(tiles).toHaveCount(6);
  await expect(tiles.nth(0)).toContainText('$50,000.00');
  await expect(tiles.nth(1)).toContainText('$33,200.00');
  await expect(tiles.nth(2)).toContainText('$2,400.00');
  await expect(tiles.nth(3)).toContainText('Budget headroom');
  await expect(tiles.nth(3)).toContainText('$16,400.00');
  // Demo spans 3 of the 20 schedule days; no material is bought.
  await expect(tiles.nth(4)).toContainText('Work done');
  await expect(tiles.nth(4)).toContainText('15%');
  await expect(tiles.nth(5)).toContainText('Materials bought');
  await expect(tiles.nth(5)).toContainText('0%');
  await expect(tiles.nth(5)).toContainText('0 of 2 bought');

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
  const bars = page.getByRole('img', { name: 'Cost of Kitchen by week' });
  // Sep 3 to Nov 10 covers eleven Sundays, Aug 30 through Nov 8.
  await expect(bars.locator('.chart__expected-bar')).toHaveCount(11);
  await expect(bars.locator('.chart__actual-bar')).toHaveCount(1);

  // Each mark is a button named with its numbers; the arrow keys walk
  // them and the picked one lights up.
  await expect(page.locator('.chart-readout')).toHaveCount(0);
  const demoDot = page.getByRole('button', {
    name: 'Sep 3, 2026 · Demo · $3,500.00 expected so far · $2,400.00 paid so far · $46,500.00 of budget left',
  });
  await demoDot.hover();
  await expect(line.locator('.chart__mark--active')).toHaveCount(1);
  // The callout lists the row and the running totals.
  const tip = page.locator('.chart-tip').first();
  await expect(tip).toBeVisible();
  await expect(tip.locator('.chart-tip__date')).toHaveText('Thu, Sep 3, 2026');
  await expect(tip.locator('.chart-tip__row')).toHaveText(['Demo$2,000.00']);
  await expect(tip.locator('dd')).toHaveText([
    '$3,500.00',
    '$2,400.00',
    '$46,500.00',
  ]);
  // The axis names every Sunday by its day and each month once.
  await expect(line.locator('.chart__tick--month')).toHaveText([
    'Sep 2026',
    'Oct',
    'Nov',
  ]);
  await expect(line.locator('.chart__tick--week').first()).toHaveText('6');
  await demoDot.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('button', { name: /^Sep 12, 2026 · Rough plumbing/ }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(
    page.getByRole('button', { name: /^Nov 10, 2026 · Quartz counter/ }),
  ).toBeFocused();
  await expect(tip.locator('.chart-tip__date')).toHaveText('Tue, Nov 10, 2026');
  // The week axis names the Sundays by day and the months once. August
  // has one bar, so September takes its name slot and the year.
  await expect(bars.locator('.chart__tick--month')).toHaveText([
    'Sep 2026',
    'Oct',
    'Nov',
  ]);
  await page
    .getByRole('button', {
      name: 'Week of Oct 25, 2026 · $18,000.00 expected · $0.00 paid',
    })
    .hover();
  await expect(bars.locator('.chart__expected-bar--active')).toHaveCount(1);

  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().click();
  await page.screenshot({
    path: 'test-results/costs-panel-hover.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.mouse.move(0, 0);
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Costs' }).click();
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
