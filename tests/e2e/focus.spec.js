import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test('focus stays on the control after a write rebuilds the panel', async ({
  page,
  request,
}) => {
  const seeded = await seedProject(
    request,
    { name: 'Focus check', startDate: '2026-10-01' },
    [
      { title: 'Demo', startDate: '2026-10-01', endDate: '2026-10-03' },
      { title: 'Framing', startDate: '2026-10-05', endDate: '2026-10-09' },
    ],
  );
  await openProject(page, 'Focus check');

  const box = page.getByRole('checkbox', { name: 'Mark Demo complete' });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.toast').last()).toContainText(
    'Marked Demo complete',
  );
  await expect(
    page.getByRole('checkbox', { name: 'Reopen Demo' }),
  ).toBeFocused();

  const title = page.getByRole('button', { name: 'Framing', exact: true });
  await title.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('End').fill('2026-10-12');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Framing', exact: true }),
  ).toBeFocused();

  await page.keyboard.press('Enter');
  await dialog.getByRole('checkbox', { name: 'Mark Framing complete' }).focus();
  await page.keyboard.press('Space');
  await expect(
    dialog.getByRole('checkbox', { name: 'Reopen Framing' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete Framing?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.panel__title')).toBeFocused();

  await page.getByRole('radio', { name: 'Calendar' }).click();
  await expect(page.getByRole('radio', { name: 'Calendar' })).toBeFocused();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeFocused();
  await page.getByRole('radio', { name: 'Table' }).click();
  await dropProject(request, seeded.id);
});
