import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject, editRecord } from './seed.js';

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
    const lines = dialog.locator('.line-item');
    await lines.nth(0).getByLabel('Bills').selectOption('Tile the floor');
    await lines.nth(0).getByLabel('Amount').fill('1,200');
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await lines.nth(1).getByLabel('Bills').selectOption('Vanity');
    await lines.nth(1).getByLabel('Amount').fill('875.50');
    await lines.nth(1).getByLabel('Note').fill('Delivered');
    await expect(dialog.locator('.line-list__total')).toHaveText(
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
    await table
      .getByRole('button', { name: 'Pinch Plumbing', exact: true })
      .click();
    await page.screenshot({
      path: 'test-results/invoice-view-dark.png',
      animations: 'disabled',
    });
    await editRecord(page);
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
    await editRecord(page);
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

test('payments and retainage set what an invoice still owes', async ({
  page,
  request,
}) => {
  const project = await seedProject(
    request,
    { name: 'Payment bath', startDate: '2026-01-05' },
    [
      {
        title: 'Rough plumbing',
        startDate: '2026-01-05',
        endDate: '2026-01-09',
      },
    ],
  );
  const itemId = project.items[0].id;
  for (const [number, dueDate, cents] of /** @type {const} */ ([
    ['1043', '2026-02-01', 400_000],
    ['1044', '2099-03-01', 120_000],
  ])) {
    await request.post(`/api/projects/${project.id}/invoices`, {
      data: {
        number,
        party: 'Pinch Plumbing',
        issuedDate: '2026-01-10',
        dueDate,
        retainageCents: number === '1043' ? 40_000 : 0,
        lines: [{ scheduleItemId: itemId, amountCents: cents }],
      },
    });
  }
  try {
    await openProject(page, 'Payment bath');
    await page.getByRole('button', { name: 'Invoices' }).click();
    const tiles = page.locator('.invoice-owed');
    await expect(tiles).toContainText('Owed$5,200.00On 2 invoices');
    await expect(tiles).toContainText('Overdue$3,600.00');
    await expect(tiles).toContainText('Held back$400.00');

    const table = page.getByRole('table', {
      name: 'Invoices for Payment bath',
    });
    await table
      .getByRole('button', { name: 'Pinch Plumbing', exact: true })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await editRecord(page);
    const payments = dialog.locator('.payment-list');
    await expect(payments.locator('.payment-list__empty')).toBeVisible();
    await payments.getByRole('button', { name: 'Add payment' }).click();
    const payment = payments.locator('.payment').first();
    await expect(payment.getByLabel('Amount')).toHaveValue('3600.00');
    await payment.getByLabel('Paid on').fill('2026-01-20');
    await payment.getByLabel('Amount').fill('3,600');
    await payment.getByLabel('Note').fill('Check 1204');
    await expect(payments.locator('.payment-list__paid')).toHaveText(
      'Paid $3,600.00 of $4,000.00. $400.00 owed, $400.00 of it held back.',
    );
    await page.screenshot({
      path: 'test-results/invoice-payments.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const first = table.locator('tbody tr').first();
    await expect(first).toContainText('$400.00$400.00 held');
    await expect(first).toContainText('Retainage held');
    await expect(tiles).not.toContainText('Overdue');
    await page.screenshot({
      path: 'test-results/invoices-owed.png',
      animations: 'disabled',
      fullPage: true,
    });

    await first
      .getByRole('button', {
        name: 'Mark invoice 1043 from Pinch Plumbing paid',
      })
      .click();
    await expect(page.locator('.toast').last()).toContainText(
      'Recorded $400.00 paid on invoice 1043 from Pinch Plumbing',
    );
    await expect(first).toContainText('Paid');
    await expect(tiles).toContainText('Owed$1,200.00On 1 invoice');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.screenshot({
      path: 'test-results/invoices-owed-dark.png',
      animations: 'disabled',
      fullPage: true,
    });
    await page.getByRole('radio', { name: 'Auto' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/invoices-owed-narrow.png',
      animations: 'disabled',
      fullPage: true,
    });
  } finally {
    await dropProject(request, project.id);
  }
});

test('a line rate overrides the invoice rate in the editor and the table', async ({
  page,
  request,
}) => {
  const project = await seedProject(
    request,
    { name: 'Line rate bath', startDate: '2026-10-01' },
    [
      {
        title: 'Tile the floor',
        startDate: '2026-10-13',
        endDate: '2026-10-15',
      },
    ],
  );
  await request.patch(`/api/projects/${project.id}`, {
    data: { markupBasisPoints: 1000 },
  });
  await request.post(`/api/projects/${project.id}/materials`, {
    data: { name: 'Vanity' },
  });
  try {
    await openProject(page, 'Line rate bath');
    await page.getByRole('button', { name: 'Invoices' }).click();
    await page.getByRole('button', { name: 'Add invoice' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('From').fill('Pinch Plumbing');
    await dialog.getByLabel('Issued').fill('2026-10-16');
    const lines = dialog.locator('.line-item');
    await lines.nth(0).getByLabel('Bills').selectOption('Tile the floor');
    await lines.nth(0).getByLabel('Amount').fill('1,000');
    await expect(lines.nth(0).getByLabel('Markup (%)')).toHaveAttribute(
      'placeholder',
      '10',
    );
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await lines.nth(1).getByLabel('Bills').selectOption('Vanity');
    await lines.nth(1).getByLabel('Amount').fill('500');
    await lines.nth(1).getByLabel('Markup (%)').fill('20');
    await lines.nth(1).getByLabel('Note').fill('Delivered');
    await expect(dialog.locator('.line-list__total')).toHaveText(
      'Lines $1,500.00 + markup $200.00 = total $1,700.00',
    );
    await page.screenshot({
      path: 'test-results/invoice-line-rate.png',
      animations: 'disabled',
    });
    await dialog.locator('.line-list__footer').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/invoice-line-rate-footer.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await lines.nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/invoice-line-rate-narrow.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await dialog.getByRole('button', { name: 'Add invoice' }).click();
    await expect(dialog).toBeHidden();
    const table = page.getByRole('table', {
      name: 'Invoices for Line rate bath',
    });
    await expect(table.locator('tbody tr')).toContainText('$1,700.00');
  } finally {
    await dropProject(request, project.id);
  }
});
