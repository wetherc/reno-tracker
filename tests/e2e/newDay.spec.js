import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test('a new day marks today and late items with no reload', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date(2026, 9, 13, 23, 58) });
  const seeded = await seedProject(
    request,
    { name: 'Midnight', startDate: '2026-10-01' },
    [{ title: 'Tile', startDate: '2026-10-12', endDate: '2026-10-13' }],
  );
  await openProject(page, 'Midnight');
  await page.getByRole('radio', { name: 'Calendar' }).click();
  const cal = page.locator('.cal');
  await expect(cal.locator('.cal__day--today')).toHaveAttribute(
    'data-date',
    '2026-10-13',
  );
  await expect(cal.locator('.cal-bar--late')).toHaveCount(0);

  await page.clock.runFor('03:00');
  await expect(cal.locator('.cal__day--today')).toHaveAttribute(
    'data-date',
    '2026-10-14',
  );
  await expect(
    cal.getByRole('button', { name: 'Tile, Oct 12 to Oct 13, late' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/new-day-calendar.png',
    animations: 'disabled',
    fullPage: true,
  });
  await dropProject(request, seeded.id);
});
