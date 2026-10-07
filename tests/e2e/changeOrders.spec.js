import { test, expect } from './fixtures.js';
import { dropProject, openProject, seedProject, editRecord } from './seed.js';

test('an approved change order raises the estimates of the rows it adds to', async ({
  page,
  request,
}) => {
  const project = await seedProject(
    request,
    { name: 'Change bath', startDate: '2026-10-01', budgetCents: 500_000 },
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
    await openProject(page, 'Change bath');
    await page.getByRole('button', { name: 'Change orders' }).click();
    await expect(page.locator('.empty-state')).toContainText(
      'No change orders for Change bath yet',
    );

    await page.getByRole('button', { name: 'Add change order' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Change order no.').fill('7');
    await dialog.getByLabel('From').fill('Pinch Plumbing');
    await dialog.getByLabel('Dated').fill('2026-10-12');
    await dialog.getByLabel('Reason').fill('Move the drain under the tub');
    const lines = dialog.locator('.line-item');
    await lines.nth(0).getByLabel('Adds to').selectOption('Tile the floor');
    await lines.nth(0).getByLabel('Amount').fill('300');
    await dialog.getByRole('button', { name: 'Add line' }).click();
    await lines.nth(1).getByLabel('Adds to').selectOption('Vanity');
    await lines.nth(1).getByLabel('Amount').fill('125');
    await lines.nth(1).getByLabel('Note').fill('Wider top');
    await expect(dialog.locator('.line-list__total')).toHaveText(
      'Total $425.00',
    );
    // The contractor prices this change at 10%, under any project rate.
    await dialog.getByLabel('Change order markup (%)').fill('10');
    await expect(dialog.locator('.line-list__total')).toHaveText(
      'Lines $425.00 + 10% markup $42.50 = total $467.50',
    );
    await page.screenshot({
      path: 'test-results/change-order-editor.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Add change order' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast').last()).toContainText(
      'Added change order 7 from Pinch Plumbing',
    );

    const table = page.getByRole('table', {
      name: 'Change orders for Change bath',
    });
    const row = table.locator('tbody tr');
    await expect(row).toContainText('Tile the floor, Vanity');
    await expect(row).toContainText('Pending');
    await expect(page.locator('.change-orders__note')).toHaveText(
      '1 pending change order adds $467.50 once approved. The total counts approved change orders only.',
    );

    // A pending change order leaves the estimate as typed.
    await page.getByRole('button', { name: 'Schedule' }).click();
    const tile = page.locator('tbody tr', { hasText: 'Tile the floor' });
    await expect(tile).toContainText('$1,000.00');
    await expect(tile).not.toContainText('change orders');

    await page.getByRole('button', { name: 'Change orders' }).click();
    await table.getByRole('button', { name: 'Pinch Plumbing' }).click();
    await editRecord(page);
    await dialog.getByLabel('Status').selectOption('approved');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('Approved');
    await expect(page.locator('.change-orders__note')).toHaveCount(0);
    await page.screenshot({
      path: 'test-results/change-orders-table.png',
      animations: 'disabled',
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(tile).toContainText('$1,300.00+$300.00 change orders');
    await page.screenshot({
      path: 'test-results/change-order-schedule.png',
      animations: 'disabled',
      fullPage: true,
    });
    await tile
      .getByRole('button', { name: 'Tile the floor', exact: true })
      .click();
    await editRecord(page);
    await expect(dialog.getByLabel('Raw estimate')).toHaveValue('1000.00');
    await expect(
      dialog.getByText(
        'Plus $300.00 from 1 approved change order line, before $30.00 markup',
      ),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.toast').last()).toContainText(
      'Change order 7 from Pinch Plumbing adds to Tile the floor. Remove that line first.',
    );
    await page.screenshot({
      path: 'test-results/change-order-item-editor.png',
      animations: 'disabled',
    });
    // A failure toast stays in the dialog until it is dismissed.
    await page
      .locator('.toast--danger')
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // The material adds the change to the allowance that stands in for
    // its estimate.
    await page.getByRole('button', { name: 'Materials' }).click();
    const vanity = page.locator('tbody tr', { hasText: 'Vanity' });
    await expect(vanity).toContainText('$1,025.00+$125.00 change orders');

    await page.getByRole('button', { name: 'Costs' }).click();
    // 1000 + 900 typed, 425 of change orders, and 42.50 markup on them.
    await expect(page.locator('.costs')).toContainText('$2,367.50');
    await page.screenshot({
      path: 'test-results/change-order-costs.png',
      animations: 'disabled',
      fullPage: true,
    });

    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.getByRole('button', { name: 'Change orders' }).click();
    await table.getByRole('button', { name: 'Pinch Plumbing' }).click();
    await page.screenshot({
      path: 'test-results/change-order-view-dark.png',
      animations: 'disabled',
    });
    await editRecord(page);
    await page.screenshot({
      path: 'test-results/change-order-editor-dark.png',
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('radio', { name: 'Auto' }).click();
  } finally {
    await dropProject(request, project.id);
  }
});
