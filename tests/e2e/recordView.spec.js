import { test, expect } from './fixtures.js';
import { dropProject, editRecord, openProject, seedProject } from './seed.js';

/**
 * The value next to one label in the fact list of a dialog.
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} label
 */
const fact = (dialog, label) =>
  dialog
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

/**
 * A project with a linked pair of items and one invoice on them. The
 * project rate is 10%, and the Vanity line has a rate of 20%.
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function seed(request) {
  const project = await seedProject(
    request,
    { name: 'View bath', startDate: '2026-10-01' },
    [
      {
        title: 'Demo',
        startDate: '2026-10-05',
        endDate: '2026-10-07',
      },
      {
        title: 'Tile the floor',
        startDate: '2026-10-13',
        endDate: '2026-10-15',
        estimatedCents: 100_000,
        responsibleParty: 'Pinch Plumbing',
      },
    ],
  );
  const [demo, tile] = project.items;
  await request.patch(`/api/projects/${project.id}`, {
    data: { markupBasisPoints: 1000 },
  });
  await request.post(`/api/projects/${project.id}/dependencies`, {
    data: { predecessorId: demo.id, successorId: tile.id },
  });
  const material = await (
    await request.post(`/api/projects/${project.id}/materials`, {
      data: { name: 'Vanity', allowanceCents: 90_000 },
    })
  ).json();
  await request.post(`/api/projects/${project.id}/invoices`, {
    data: {
      number: '1043',
      party: 'Pinch Plumbing',
      issuedDate: '2026-10-16',
      dueDate: '2026-11-15',
      lines: [
        { scheduleItemId: tile.id, amountCents: 120_000 },
        {
          materialItemId: material.id,
          amountCents: 50_000,
          markupBasisPoints: 2000,
        },
      ],
    },
  });
  return project;
}

/**
 * Checks the schedule view of Tile the floor, then Edit, then a fresh
 * view closed with Escape.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} opener
 * @param {string} shot
 */
async function checkScheduleView(page, opener, shot) {
  const dialog = page.getByRole('dialog');
  await opener.click();
  await expect(
    dialog.getByRole('heading', { name: 'Tile the floor' }),
  ).toBeVisible();
  await expect(fact(dialog, 'Dates')).toHaveText('Oct 13 to Oct 15');
  await expect(fact(dialog, 'Responsible')).toHaveText('Pinch Plumbing');
  await expect(fact(dialog, 'Raw estimate')).toHaveText('$1,000.00');
  await expect(fact(dialog, 'Raw actual')).toHaveText('$1,200.00');
  await expect(fact(dialog, 'Markup rate')).toHaveText('10% (project rate)');
  await expect(fact(dialog, 'Waits on')).toHaveText('Demo');
  await expect(fact(dialog, 'Comes before')).toHaveText('Nothing');
  await expect(dialog.getByLabel('Title')).toHaveCount(0);
  await page.screenshot({ path: shot, animations: 'disabled' });

  await editRecord(page);
  await expect(dialog.getByLabel('Title')).toHaveValue('Tile the floor');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await opener.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

/**
 * Checks the invoice view, its line totals, Edit, and Escape.
 * @param {import('@playwright/test').Page} page
 * @param {string} shot
 */
async function checkInvoiceView(page, shot) {
  const dialog = page.getByRole('dialog');
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Invoices' })
    .click();
  const opener = page
    .getByRole('table', { name: 'Invoices for View bath' })
    .getByRole('button', { name: 'Pinch Plumbing', exact: true });
  await opener.click();
  await expect(
    dialog.getByRole('heading', { name: 'Invoice 1043 from Pinch Plumbing' }),
  ).toBeVisible();
  await expect(fact(dialog, 'Party')).toHaveText('Pinch Plumbing');
  await expect(fact(dialog, 'Issued')).toHaveText('Oct 16, 2026');
  await expect(fact(dialog, 'Due')).toHaveText('Nov 15, 2026');
  await expect(fact(dialog, 'Markup rate')).toHaveText('10%');
  await expect(fact(dialog, 'Open balance')).toHaveText('$1,920.00');

  const lines = dialog.getByRole('table').first();
  const row = (/** @type {string} */ name) =>
    lines.getByRole('row').filter({
      has: page.getByRole('rowheader', { name, exact: true }),
    });
  await expect(row('Tile the floor')).toContainText('$1,200.00');
  await expect(row('Tile the floor')).toContainText('10% (invoice rate)');
  await expect(row('Vanity')).toContainText('$500.00');
  await expect(row('Vanity')).toContainText('20%');
  await expect(row('Subtotal')).toContainText('$1,700.00');
  await expect(row('Markup')).toContainText('$220.00');
  await expect(row('Total')).toContainText('$1,920.00');
  await page.screenshot({ path: shot, animations: 'disabled' });

  await editRecord(page);
  await expect(dialog.getByLabel('Invoice no.')).toHaveValue('1043');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await opener.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

test('a saved record opens a read-only view at 1280px', async ({
  page,
  request,
}) => {
  const project = await seed(request);
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openProject(page, 'View bath');
    await page.getByRole('radio', { name: 'Table' }).click();
    await checkScheduleView(
      page,
      page
        .getByRole('table')
        .getByRole('button', { name: 'Tile the floor', exact: true }),
      'test-results/record-view-schedule.png',
    );
    await page.getByRole('radio', { name: 'Gantt' }).click();
    await checkScheduleView(
      page,
      page
        .locator('.gantt')
        .getByRole('button', { name: 'Tile the floor', exact: true }),
      'test-results/record-view-gantt.png',
    );
    await checkInvoiceView(page, 'test-results/record-view-invoice.png');
  } finally {
    await dropProject(request, project.id);
  }
});

test('a saved record opens a read-only view at 375px', async ({
  page,
  request,
}) => {
  const project = await seed(request);
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await openProject(page, 'View bath');
    // The calendar bars are too thin to tap at this width, so the day
    // list under the grid opens the view.
    await page.getByRole('radio', { name: 'Calendar' }).click();
    await page
      .getByRole('button', { name: /^Tuesday, October 13, 2026/ })
      .click();
    await checkScheduleView(
      page,
      page.getByRole('button', { name: 'Tile the floor', exact: true }),
      'test-results/record-view-calendar-narrow.png',
    );
    await checkInvoiceView(page, 'test-results/record-view-invoice-narrow.png');
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBe(375);
  } finally {
    await dropProject(request, project.id);
  }
});

test('a money field selects its whole value on focus', async ({
  page,
  request,
}) => {
  const project = await seed(request);
  try {
    await openProject(page, 'View bath');
    await page.getByRole('radio', { name: 'Table' }).click();
    await page
      .getByRole('table')
      .getByRole('button', { name: 'Tile the floor', exact: true })
      .click();
    await editRecord(page);
    const dialog = page.getByRole('dialog');
    const estimate = dialog.getByLabel('Raw estimate');
    await expect(estimate).toHaveValue('1000.00');
    const selection = () =>
      estimate.evaluate((/** @type {HTMLInputElement} */ el) => [
        el.selectionStart,
        el.selectionEnd,
      ]);

    // Shift+Tab from the field after it. A Tab from the End field moves
    // between the parts of the date instead.
    await dialog.getByLabel('Raw actual').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(estimate).toBeFocused();
    expect(await selection()).toEqual([0, '1000.00'.length]);
    await page.keyboard.type('950');
    await expect(estimate).toHaveValue('950');

    // A click on another field and back selects the whole value again.
    await dialog.getByLabel('Title').click();
    await estimate.click();
    await expect(estimate).toBeFocused();
    const value = await estimate.inputValue();
    expect(await selection()).toEqual([0, value.length]);
    await page.keyboard.type('875');
    await expect(estimate).toHaveValue('875');

    // A second click on the focused field places the caret.
    await estimate.click({ position: { x: 4, y: 8 } });
    const [start, end] = await selection();
    expect(start).toBe(end);
    await page.keyboard.type('1');
    await expect(estimate).not.toHaveValue('1');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await dropProject(request, project.id);
  }
});
