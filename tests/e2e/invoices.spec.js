import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject } from './seed.js';

test('an invoice bills a schedule item and a material and sets their actual cost', async ({
  page,
  request,
}) => {
  const project = await seedProject(
    request,
    { name: 'Invoice bath', startDate: '2026-10-01' },
    [
      {
        title: 'Tile the floor',
        startDate: '2026-10-13',
        endDate: '2026-10-15',
        estimatedCents: 100_000,
      },
    ],
  );
  await request.post(`/api/projects/${project.id}/materials`, {
    data: { name: 'Vanity', allowanceCents: 90_000 },
  });
  try {
    await openProject(page, 'Invoice bath');
    await page.getByRole('button', { name: 'Invoices' }).click();
    await expect(page.locator('.empty-state')).toContainText(
      'No invoices for Invoice bath yet',
    );

    await page.getByRole('button', { name: 'Add invoice' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Invoice no.').fill('1043');
    await dialog.getByLabel('From').fill('Pinch Plumbing');
    await dialog.getByLabel('Issued').fill('2026-10-16');
    await dialog.getByLabel('Due').fill('2026-11-15');
    const lines = dialog.locator('.invoice-line');
    await lines.nth(0).getByLabel('Bills').selectOption('Tile the floor');
    await lines.nth(0).getByLabel('Amount').fill('1,200');
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await lines.nth(1).getByLabel('Bills').selectOption('Vanity');
    await lines.nth(1).getByLabel('Amount').fill('875.50');
    await lines.nth(1).getByLabel('Note').fill('Delivered');
    await expect(dialog.locator('.invoice-lines__total')).toHaveText(
      'Total $2,075.50',
    );
    await page.screenshot({
      path: 'test-results/invoice-editor.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Add invoice' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast').last()).toContainText(
      'Added invoice 1043 from Pinch Plumbing',
    );

    const table = page.getByRole('table', {
      name: 'Invoices for Invoice bath',
    });
    const row = table.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Tile the floor, Vanity');
    await expect(row).toContainText('$2,075.50');
    await page.screenshot({
      path: 'test-results/invoices-table.png',
      animations: 'disabled',
      fullPage: true,
    });
    await page.getByRole('radio', { name: 'Dark' }).click();
    await table.getByRole('button', { name: 'Pinch Plumbing' }).click();
    await page.screenshot({
      path: 'test-results/invoice-editor-dark.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('radio', { name: 'Auto' }).click();

    // The billed item reads the invoice sum as its actual price.
    await page.getByRole('button', { name: 'Materials' }).click();
    const vanity = page.locator('tbody tr', { hasText: 'Vanity' });
    await expect(vanity).toContainText('$875.50');
    await vanity.getByRole('button', { name: 'Vanity' }).click();
    await expect(dialog.getByLabel('Actual')).toHaveValue('875.50');
    await expect(dialog.getByLabel('Actual')).toHaveAttribute('readonly', '');
    await expect(dialog.getByText('The sum of 1 invoice line')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.toast').last()).toContainText(
      'Invoice 1043 from Pinch Plumbing bills Vanity. Remove that line first.',
    );
    await page.screenshot({
      path: 'test-results/invoice-billed-material.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await dropProject(request, project.id);
  }
});
