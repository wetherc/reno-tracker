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
    'Nothing in Kitchen remodel yet',
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
});
