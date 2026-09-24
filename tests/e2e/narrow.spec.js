import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test('no section or view scrolls sideways on a 390px phone', async ({
  page,
  request,
}) => {
  const seeded = await seedProject(
    request,
    { name: 'Narrow check', startDate: '2026-10-01' },
    [
      {
        title: 'Rough plumbing',
        responsibleParty: 'Pacific Plumbing and Heating',
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      },
    ],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page, 'Narrow check');
  const width = () => page.evaluate(() => document.documentElement.scrollWidth);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  for (const view of ['Table', 'Calendar', 'Gantt', 'Agenda']) {
    await page.getByRole('radio', { name: view }).click();
    expect(await width(), view).toBe(390);
  }
  for (const section of ['Notes', 'Materials', 'Costs']) {
    await nav.getByRole('button', { name: section }).click();
    await expect(page.locator('.panel__title')).toHaveText(section);
    expect(await width(), section).toBe(390);
  }
  const costs = await nav.getByRole('button', { name: 'Costs' }).boundingBox();
  expect(costs && costs.x + costs.width).toBeLessThanOrEqual(390);
  await nav.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('radio', { name: 'Table' }).click();
  await dropProject(request, seeded.id);
});
