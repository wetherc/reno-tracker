import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test('the filter narrows every view and says what it hides', async ({
  page,
  request,
}) => {
  const { id } = await seedProject(
    request,
    { name: 'Filtered', startDate: '2026-01-05' },
    [
      {
        title: 'Demo',
        startDate: '2026-01-05',
        endDate: '2026-01-07',
        responsibleParty: 'Crew',
      },
      {
        title: 'Rough plumbing',
        startDate: '2026-01-08',
        endDate: '2026-01-09',
        responsibleParty: 'Pinch Plumbing',
      },
      { title: 'Paint', startDate: '2099-03-02', endDate: '2099-03-04' },
    ],
  );
  await openProject(page, 'Filtered');
  const bar = page.getByRole('search', { name: 'Filter the schedule' });
  const search = bar.getByRole('searchbox', { name: 'Search items' });
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(3);

  await search.fill('plumb');
  await expect(rows).toHaveCount(1);
  await expect(search).toBeFocused();
  await expect(bar).toContainText('1 of 3 items');
  await page.screenshot({
    path: 'test-results/filter-table.png',
    animations: 'disabled',
  });

  // The same filter holds in the gantt.
  await page.getByRole('radio', { name: 'Gantt' }).click();
  await expect(page.locator('.gantt__names > *')).toHaveCount(1);

  await search.fill('');
  await bar.getByLabel('Responsible party').selectOption('Crew');
  await expect(page.locator('.gantt__names > *')).toHaveCount(1);
  await bar.getByLabel('Responsible party').selectOption('');

  // Late keeps the open items past their end date.
  await page.getByRole('radio', { name: 'Table' }).click();
  await bar.getByRole('radio', { name: 'Late', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Mark Demo complete' }).check();
  await expect(rows).toHaveCount(1);

  // No match shows an empty state whose button clears everything.
  await search.fill('paint');
  await expect(page.getByText('No items match the filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(rows).toHaveCount(3);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');

  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill('p');
  await page.screenshot({
    path: 'test-results/filter-narrow.png',
    animations: 'disabled',
  });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);

  await dropProject(request, id);
});
