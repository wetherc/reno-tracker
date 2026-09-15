import { test, expect } from '@playwright/test';

test('start, edit, and delete a project from the picker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await dialog.getByLabel('Name').fill('Kitchen remodel');
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByLabel('Budget').fill('45,000');
  await page.screenshot({
    path: 'test-results/project-new.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue(/./);
  await expect(page.locator('.toast')).toContainText('Started Kitchen remodel');
  await expect(page.locator('.empty-state')).toContainText(
    'Nothing scheduled for Kitchen remodel yet',
  );

  await page.getByRole('button', { name: 'New project' }).click();
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog.locator('.form__error:not([hidden])')).toHaveText(
    'name cannot be blank',
  );
  await dialog.getByLabel('Name').fill('Deck');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByLabel('Project', { exact: true }).locator('option'),
  ).toHaveCount(2);
  await page.screenshot({
    path: 'test-results/project-picker.png',
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Edit project' }).click();
  await expect(dialog.getByLabel('Name')).toHaveValue('Deck');
  await dialog.getByLabel('Name').fill('Back deck');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.empty-state')).toContainText('Back deck');

  await page
    .getByLabel('Project', { exact: true })
    .selectOption({ label: 'Kitchen remodel' });
  await expect(page.locator('.empty-state')).toContainText('Kitchen remodel');
  await page.reload();
  await expect(page.locator('.empty-state')).toContainText('Kitchen remodel');

  await page.getByRole('button', { name: 'Delete project' }).click();
  await expect(dialog).toContainText('Delete Kitchen remodel?');
  await page.screenshot({
    path: 'test-results/project-delete.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.empty-state')).toContainText('Back deck');
  await page.getByRole('button', { name: 'Delete project' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.empty-state')).toContainText('No project open');
  await expect(page.getByLabel('Project', { exact: true })).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Load from a file' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/project-none.png',
    animations: 'disabled',
  });
});

test('save a project to a file and load it back as a new project', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Garage');
  await dialog.getByLabel('Budget').fill('9,000');
  await dialog.getByRole('button', { name: 'Start project' }).click();
  await expect(dialog).toBeHidden();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project to a file' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^garage-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  await expect(page.locator('.toast').last()).toContainText('Saved garage-');

  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load project from a file' }).click();
  const chooser = await choosing;
  await chooser.setFiles(path);
  await expect(page.locator('.toast').last()).toContainText(
    'Loaded Garage from',
  );
  const select = page.getByLabel('Project', { exact: true });
  await expect(select.locator('option')).toHaveCount(2);
  await page.screenshot({
    path: 'test-results/project-loaded.png',
    animations: 'disabled',
  });

  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: 'Delete project' }).click();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.locator('.empty-state')).toContainText('No project open');
});
