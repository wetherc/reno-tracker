import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  openChangeOrderView,
  openInvoiceView,
  openMaterialView,
  openScheduleView,
} from '../../../src/app/recordViews.js';
import {
  changeOrderOf,
  invoiceOf,
  itemOf,
  lineOf,
  materialOf,
  setupSchedule,
} from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {Parameters<typeof setupSchedule>[0]} seed */
async function setup(seed) {
  const fx = setupSchedule(seed);
  await fx.ctx.openProject('p1');
  return fx;
}

/** @param {any} dialog @returns {[string, string][]} */
const facts = (dialog) =>
  dialog
    .querySelectorAll('.record-view__fact')
    .map((/** @type {any} */ row) => [
      row.children[0].textContent,
      row.children[1].textContent,
    ]);

/** @param {any} dialog @param {string} label */
const press = (dialog, label) =>
  dialog
    .querySelectorAll('button')
    .find((/** @type {any} */ b) => b.textContent === label)
    .click();

test('an invoice view lists facts, lines, payments, and balance', async () => {
  const fx = await setup({
    schedule: [itemOf('a', { title: 'Plumbing' })],
    materials: [materialOf('m', { name: 'Faucet' })],
    invoices: [
      invoiceOf('i', {
        number: '1043',
        party: 'Pinch',
        markupBasisPoints: 1000,
        retainageCents: 500,
        lines: [
          { ...lineOf({ scheduleItemId: 'a' }, 10000), description: 'Deposit' },
          { ...lineOf({ materialItemId: 'm' }, 5000), markupBasisPoints: 0 },
          lineOf({ scheduleItemId: 'gone' }, 100),
        ],
        payments: [
          {
            id: 'p',
            paidDate: '2026-09-02',
            amountCents: 50000,
            note: 'Check',
          },
        ],
      }),
    ],
  });
  const handle = openInvoiceView({ ctx: fx.ctx, invoice: fx.invoices()[0] });
  const dialog = $(handle?.el);
  assert.ok(dialog.classList.contains('record-view'));
  assert.ok(dialog.classList.contains('modal--wide'));
  assert.equal(
    dialog.querySelector('.modal__title').textContent,
    'Invoice 1043 from Pinch',
  );
  const text = dialog.textContent;
  assert.match(text, /Plumbing: Deposit\$100\.0010% \(invoice rate\)/);
  assert.match(text, /Faucet\$50\.000%/);
  assert.match(text, /Unknown row/);
  assert.match(text, /Sep 2, 2026\$500\.00Check/);
  assert.deepEqual(facts(dialog).at(-1), ['Overpaid', '$338.90']);
  assert.ok(facts(dialog).some(([l, v]) => l === 'Due' && v === 'No due day'));
  press(dialog, 'Edit');
  const editor = $(dom.body.children.at(-1));
  assert.equal(editor.classList.contains('record-view'), false);
  editor.close();
  assert.equal(dom.body.children.length, 0);
});

test('an invoice with no payments says so and has no overpaid row', async () => {
  const fx = await setup({
    invoices: [invoiceOf('i', { dueDate: '2026-10-01', lines: [] })],
  });
  const dialog = $(
    openInvoiceView({ ctx: fx.ctx, invoice: fx.invoices()[0] })?.el,
  );
  assert.equal(
    facts(dialog).some(([l]) => l === 'Payments'),
    false,
  );
  assert.equal(
    dialog.querySelector('.empty-state').textContent,
    'No payments yet.',
  );
  assert.equal(
    facts(dialog).some(([l]) => l === 'Overpaid'),
    false,
  );
  dialog.close();
});

test('a change order view shows status and closes once it is deleted', async () => {
  const fx = await setup({
    schedule: [itemOf('a')],
    changeOrders: [
      changeOrderOf('c', {
        approved: false,
        lines: [lineOf({ scheduleItemId: 'a' }, 2000)],
      }),
      changeOrderOf('d', { description: 'More tile' }),
    ],
  });
  const dialog = $(
    openChangeOrderView({ ctx: fx.ctx, order: fx.changeOrders()[0] })?.el,
  );
  assert.ok(dialog.classList.contains('modal--wide'));
  assert.ok(facts(dialog).some(([l, v]) => l === 'Status' && v === 'Pending'));
  assert.ok(
    facts(dialog).some(([l, v]) => l === 'Reason' && v === 'None given'),
  );
  assert.match(dialog.textContent, /\(change order rate\)/);
  const other = $(
    openChangeOrderView({ ctx: fx.ctx, order: fx.changeOrders()[1] })?.el,
  );
  assert.ok(facts(other).some(([l, v]) => l === 'Status' && v === 'Approved'));
  assert.ok(facts(other).some(([l, v]) => l === 'Reason' && v === 'More tile'));
  other.close();
  await $(fx.ctx).api.deleteChangeOrder('c');
  await fx.ctx.openProject('p1');
  assert.equal(dialog.open, false);
  assert.equal(dom.body.children.length, 0);
  press(dialog, 'Edit');
  $(dom.body.children.at(-1)).close();
});

test('a material view names its item and draws again after a refetch', async () => {
  const fx = await setup({
    markupBasisPoints: 1500,
    schedule: [itemOf('a', { title: 'Counters' })],
    materials: [
      materialOf('m', {
        name: 'Quartz',
        scheduleItemId: 'a',
        expectedDate: '2026-10-28',
        actualCents: 1200,
        complete: true,
      }),
      materialOf('n', { name: 'Faucet', markupBasisPoints: 500 }),
    ],
  });
  const dialog = $(
    openMaterialView({ ctx: fx.ctx, item: fx.materials()[0] })?.el,
  );
  assert.equal(dialog.classList.contains('modal--wide'), false);
  assert.deepEqual(facts(dialog).slice(0, 2), [
    ['For', 'Counters'],
    ['Expected', 'Oct 28, 2026'],
  ]);
  assert.ok(
    facts(dialog).some(
      ([l, v]) => l === 'Markup rate' && v === '15% (project rate)',
    ),
  );
  assert.ok(facts(dialog).some(([l, v]) => l === 'Bought' && v === 'Yes'));
  assert.match(dialog.textContent, /Projected/);
  await fx.ctx.api.setMaterialComplete('m', false);
  await fx.ctx.openProject('p1');
  assert.ok(facts(dialog).some(([l, v]) => l === 'Bought' && v === 'No'));
  dialog.close();
  const other = $(
    openMaterialView({ ctx: fx.ctx, item: fx.materials()[1] })?.el,
  );
  assert.deepEqual(facts(other).slice(0, 2), [
    ['For', 'No schedule item'],
    ['Expected', 'No day set'],
  ]);
  assert.ok(
    facts(other).some(([l, v]) => l === 'Raw actual' && v === 'Not yet'),
  );
  assert.ok(facts(other).some(([l, v]) => l === 'Markup rate' && v === '5%'));
  press(other, 'Edit');
  $(dom.body.children.at(-1)).close();
});

test('a schedule view lists links and notes and opens each editor tab', async () => {
  const fx = await setup({
    schedule: [
      itemOf('a', {
        title: 'Rough',
        description: 'Pipes',
        actualCents: 900,
        complete: true,
      }),
      itemOf('b', { title: 'Drywall' }),
    ],
    dependencies: [
      { id: 'd', projectId: 'p1', predecessorId: 'a', successorId: 'b' },
    ],
    notes: [
      {
        id: 'n1',
        scheduleItemId: 'b',
        body: 'x',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'n2',
        scheduleItemId: 'b',
        body: 'y',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'n3',
        scheduleItemId: 'a',
        body: 'z',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      },
    ],
  });
  const first = $(openScheduleView({ ctx: fx.ctx, item: fx.items()[0] })?.el);
  assert.equal(
    first.querySelector('.record-view__description').textContent,
    'Pipes',
  );
  const a = Object.fromEntries(facts(first));
  assert.equal(a['Waits on'], 'Nothing');
  assert.equal(a['Comes before'], 'Drywall');
  assert.equal(a.Notes, '1 note');
  assert.equal(a.Complete, 'Yes');
  press(first, 'Notes');
  $(dom.body.children.at(-1)).close();
  const second = $(openScheduleView({ ctx: fx.ctx, item: fx.items()[1] })?.el);
  const b = Object.fromEntries(facts(second));
  assert.equal(b['Waits on'], 'Rough');
  assert.equal(b.Notes, '2 notes');
  assert.equal(second.querySelector('.record-view__description'), null);
  press(second, 'Edit');
  $(dom.body.children.at(-1)).close();
  assert.equal(dom.body.children.length, 0);
});

test('a view of a record that is already gone does not open', async () => {
  const fx = await setup({});
  assert.equal(openScheduleView({ ctx: fx.ctx, item: itemOf('x') }), null);
  fx.ctx.closeProject?.();
});
