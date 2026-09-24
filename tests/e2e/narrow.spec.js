import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test.use({ hasTouch: true });

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
  await request.post(`/api/projects/${seeded.id}/invoices`, {
    data: {
      number: '2207',
      party: 'Pacific Plumbing and Heating',
      issuedDate: '2026-10-12',
      dueDate: '2026-11-11',
      lines: [{ scheduleItemId: seeded.items[0].id, amountCents: 480_000 }],
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page, 'Narrow check');
  const width = () => page.evaluate(() => document.documentElement.scrollWidth);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  for (const view of ['Table', 'Calendar', 'Gantt', 'Agenda']) {
    await page.getByRole('radio', { name: view }).click();
    expect(await width(), view).toBe(390);
  }
  for (const section of ['Notes', 'Materials', 'Invoices', 'Costs']) {
    await nav.getByRole('button', { name: section }).click();
    await expect(page.locator('.panel__title')).toHaveText(section);
    expect(await width(), section).toBe(390);
  }
  await nav.getByRole('button', { name: 'Invoices' }).click();
  await page
    .getByRole('button', { name: 'Pacific Plumbing and Heating' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await width(), 'invoice editor').toBe(390);
  await page.screenshot({
    path: 'test-results/invoice-editor-narrow.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('radio', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: /^Wednesday, October 7, 2026/ }).tap();
  await expect(page.locator('.cal-day__title')).toHaveText(
    'Wednesday, October 7, 2026',
  );
  await page
    .locator('.cal-day')
    .getByRole('button', { name: 'Rough plumbing' })
    .tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  const costs = await nav.getByRole('button', { name: 'Costs' }).boundingBox();
  expect(costs && costs.x + costs.width).toBeLessThanOrEqual(390);
  await nav.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('radio', { name: 'Table' }).click();
  await dropProject(request, seeded.id);
});
