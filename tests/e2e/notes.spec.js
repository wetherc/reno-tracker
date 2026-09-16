import { test, expect } from '@playwright/test';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, who?: string, start: string, end: string }} item
 */
async function addItem(page, { title, who, start, end }) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add item' }).click();
  await dialog.getByLabel('Title').fill(title);
  if (who) await dialog.getByLabel('Responsible party').fill(who);
  await dialog.getByLabel('Start').fill(start);
  await dialog.getByLabel('End').fill(end);
  await dialog.getByRole('button', { name: 'Add to schedule' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {string} body
 */
async function addNote(page, title, body) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: title, exact: true }).click();
  await dialog.getByRole('tab', { name: 'Notes' }).click();
  await dialog.getByLabel('New note').fill(body);
  await dialog.getByRole('button', { name: 'Add note' }).click();
  await expect(dialog.locator('.note__body').first()).toHaveText(body);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

test('the notes section reads every note by day and opens the item', async ({
  page,
}) => {
  const sections = page.getByRole('navigation', { name: 'Sections' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Kitchen');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  await sections.getByRole('button', { name: 'Notes' }).click();
  await expect(page.locator('.panel__title')).toHaveText('Notes');
  await expect(page.locator('.empty-state')).toContainText('No notes yet');
  await page.getByRole('button', { name: 'Open the schedule' }).click();
  await expect(page.locator('.panel__title')).toHaveText('Schedule');

  await addItem(page, {
    title: 'Demo',
    who: 'Crew',
    start: '2026-10-01',
    end: '2026-10-03',
  });
  await addItem(page, {
    title: 'Rough plumbing',
    who: 'Plumber',
    start: '2026-10-06',
    end: '2026-10-10',
  });
  await addNote(page, 'Demo', 'Dumpster arrives at 7.');
  await addNote(page, 'Rough plumbing', 'Inspector booked for the 15th.');
  await addNote(page, 'Demo', 'Found knob and tube behind the range.');

  await sections.getByRole('button', { name: 'Notes' }).click();
  const list = page.getByRole('list', { name: 'Notes on Kitchen' });
  await expect(list.locator('.notes-day')).toHaveCount(1);
  await expect(list.locator('.note__body')).toHaveText([
    'Found knob and tube behind the range.',
    'Inspector booked for the 15th.',
    'Dumpster arrives at 7.',
  ]);
  await expect(list.locator('.note__item')).toHaveText([
    'Demo',
    'Rough plumbing',
    'Demo',
  ]);
  await expect(list.locator('.note__party').nth(1)).toHaveText('Plumber');
  await page.screenshot({
    path: 'test-results/notes-light.png',
    fullPage: true,
    animations: 'disabled',
  });

  await list.getByRole('button', { name: 'Rough plumbing' }).click();
  const editor = page.getByRole('dialog', { name: 'Rough plumbing' });
  await expect(editor.getByRole('tab', { name: 'Notes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await editor.getByRole('button', { name: 'Delete note' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this note?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toBeHidden();
  await expect(list.locator('.note__body')).toHaveCount(2);

  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.screenshot({
    path: 'test-results/notes-dark.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Delete project' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
