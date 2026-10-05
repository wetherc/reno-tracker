import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountInvoices } from '../../../src/app/invoices.js';
import { lineNames } from '../../../src/app/lineList.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import {
  invoiceOf,
  itemOf,
  materialOf,
  setupSchedule,
  tick,
} from './scheduleFixtures.js';
import { todayIso } from '../../../src/schedule/dates.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/**
 * @param {string | null} scheduleItemId
 * @param {string | null} materialItemId
 * @param {number} amountCents
 */
const line = (scheduleItemId, materialItemId, amountCents) => ({
  id: `l${amountCents}`,
  scheduleItemId,
  materialItemId,
  description: '',
  amountCents,
  markupBasisPoints: null,
});

/** @param {Parameters<typeof setupSchedule>[0]} [seed] */
async function setup(seed, saved = {}) {
  const fx = setupSchedule(seed);
  for (const [key, value] of Object.entries(saved)) {
    fx.ctx.prefs.write(/** @type {any} */ (key), value);
  }
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountInvoices({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  return { ...fx, shell, panel };
}

/** @param {any} shell */
const table = (shell) => shell.body.children[1].children[0];
/** @param {any} shell */
const rows = (shell) => $(table(shell).children[2]).children;
/** @param {any} shell */
const cellText = (shell) =>
  rows(shell).map((/** @type {any} */ tr) =>
    tr.children.map((/** @type {any} */ td) => td.textContent),
  );

const seed = {
  schedule: [itemOf('a', { title: 'Demo' })],
  materials: [materialOf('m', { name: 'Vanity' })],
  invoices: [
    invoiceOf('i2', {
      party: 'Pinch Plumbing',
      number: '10',
      issuedDate: '2026-10-20',
      dueDate: '2099-11-19',
      lines: [line('a', null, 5000), line(null, 'm', 2500), line('a', null, 1)],
    }),
    invoiceOf('i1', {
      party: 'Acme',
      number: '9',
      issuedDate: '2026-10-05',
      lines: [line(null, 'gone', 300)],
    }),
  ],
};

test('lineNames lists each billed row once in line order', () => {
  const payload = /** @type {any} */ (seed);
  assert.equal(lineNames(seed.invoices[0], payload), 'Demo, Vanity');
  assert.equal(lineNames(seed.invoices[1], payload), '');
});

test('show does nothing without a project', () => {
  const fx = setupSchedule();
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  mountInvoices({ ctx: fx.ctx, shell }).show();
  assert.equal(shell.body.children.length, 0);
});

test('a project with nothing to bill points to Schedule and Materials', async () => {
  const { shell } = await setup();
  assert.equal($(shell.tools.children[0]).disabled, true);
  assert.match(
    $(shell.body.children[0]).textContent,
    /Kitchen has none yet\. Add one under Schedule or Materials first\./,
  );
});

test('an empty list invites the first invoice', async () => {
  const { shell } = await setup({ schedule: [itemOf('a')] });
  const add = $(shell.tools.children[0]);
  assert.equal(add.textContent, 'Add invoice');
  assert.equal(add.disabled, false);
  add.click();
  $(dom.body.children[0]).close();
  const empty = $(shell.body.children[0]);
  assert.match(empty.textContent, /No invoices for Kitchen yet/);
  empty.children[1].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.children[0].children[0].textContent, 'New invoice');
  dialog.close();
});

test('the table lists every invoice with its rows, days, and total', async () => {
  const { shell } = await setup(seed);
  const heads = $(table(shell).children[1]).children[0].children;
  assert.deepEqual(
    heads.map((/** @type {any} */ th) => th.textContent),
    [
      'From',
      'Invoice no.',
      'Issued',
      'Due',
      'Bills',
      'Total',
      'Owed',
      'Status',
      'Payment',
    ],
  );
  assert.deepEqual(cellText(shell), [
    [
      'Pinch Plumbing',
      '10',
      'Oct 20',
      'Nov 19',
      'Demo, Vanity',
      '$75.01',
      '$75.01',
      'Due',
      'Mark paid',
    ],
    ['Acme', '9', 'Oct 5', '—', '', '$3.00', '$3.00', 'Unpaid', 'Mark paid'],
  ]);
  const foot = $(table(shell).children[3]).children[0].children;
  assert.deepEqual(
    foot.map((/** @type {any} */ td) => td.textContent),
    ['Total', '', '', '', '', '$78.01', '$78.01', '', ''],
  );
  assert.deepEqual(
    $(shell.body.children[0]).children.map(
      (/** @type {any} */ tile) => tile.textContent,
    ),
    [
      'Owed$78.01On 2 invoices',
      'Due next$75.01First on Nov 19',
      'No due day$3.00',
    ],
  );
  rows(shell)[0].children[0].children[0].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(
    dialog.children[0].children[0].textContent,
    'Invoice 10 from Pinch Plumbing',
  );
  dialog.close();
});

test('each column sorts, and the sort is kept', async () => {
  const noNumber = invoiceOf('i3', {
    party: 'Zed',
    issuedDate: '2026-10-10',
    lines: [line('a', null, 1)],
    payments: [{ id: 'p', paidDate: '2026-10-10', amountCents: 1, note: '' }],
  });
  const { shell, ctx } = await setup({
    ...seed,
    invoices: [...seed.invoices, noNumber],
  });
  /** @param {number} col */
  const sortBy = (col) =>
    $(table(shell).children[1]).children[0].children[col].children[0].click();
  const parties = () =>
    cellText(shell).map((/** @type {string[]} */ r) => r[0]);
  const expected = {
    0: ['Acme', 'Pinch Plumbing', 'Zed'],
    1: ['Zed', 'Acme', 'Pinch Plumbing'],
    2: ['Acme', 'Zed', 'Pinch Plumbing'],
    3: ['Pinch Plumbing', 'Acme', 'Zed'],
    4: ['Acme', 'Zed', 'Pinch Plumbing'],
    5: ['Zed', 'Acme', 'Pinch Plumbing'],
    6: ['Zed', 'Acme', 'Pinch Plumbing'],
    7: ['Pinch Plumbing', 'Zed', 'Acme'],
  };
  for (const [col, order] of Object.entries(expected)) {
    sortBy(Number(col));
    assert.deepEqual(parties(), order, `column ${col}`);
  }
  assert.equal(ctx.prefs.read('invoicesSort'), 'status:asc');
});

test('Mark paid records the open balance as one payment dated today', async () => {
  const { shell, invoices, toasts } = await setup({
    ...seed,
    invoices: [
      invoiceOf('i1', {
        party: 'Acme',
        number: '9',
        issuedDate: '2026-01-02',
        dueDate: '2026-01-06',
        retainageCents: 100,
        lines: [line('a', null, 300)],
        payments: [
          { id: 'p', paidDate: '2026-01-01', amountCents: 50, note: 'Deposit' },
        ],
      }),
    ],
  });
  const [row] = rows(shell);
  assert.deepEqual(
    row.children.slice(6).map((/** @type {any} */ td) => td.textContent),
    ['$2.50$1.00 held', 'Overdue', 'Mark paid'],
  );
  assert.deepEqual(
    $(shell.body.children[0]).children.map(
      (/** @type {any} */ tile) => tile.textContent,
    ),
    [
      'Owed$2.50On 1 invoice',
      'Overdue$1.50Past the due day',
      'Held back$1.00Retainage, paid when the work is done',
    ],
  );
  const pay = row.children[8].children[0];
  assert.equal(pay.getAttribute('aria-label'), 'Mark invoice 9 from Acme paid');
  pay.click();
  await tick();
  assert.deepEqual(invoices()[0].payments, [
    { paidDate: '2026-01-01', amountCents: 50, note: 'Deposit' },
    { paidDate: todayIso(), amountCents: 250, note: '' },
  ]);
  assert.equal(toasts.at(-1), 'ok Recorded $2.50 paid on invoice 9 from Acme');
  const [after] = rows(shell);
  assert.deepEqual(
    after.children.slice(6).map((/** @type {any} */ td) => td.textContent),
    ['$0.00', 'Paid', ''],
  );
  assert.deepEqual(
    $(shell.body.children[0]).children.map(
      (/** @type {any} */ tile) => tile.textContent,
    ),
    ['Owed$0.00Every invoice is paid'],
  );
});

test('a failed Mark paid lets the button try again', async () => {
  const { shell, ctx } = await setup(seed);
  ctx.api.patchInvoice = async () => {
    throw new Error('offline');
  };
  const pay = rows(shell)[0].children[8].children[0];
  pay.click();
  assert.equal(pay.disabled, true);
  await tick();
  assert.equal(pay.disabled, false);
});

test('overpaid and held invoices get their own tiles and badges', async () => {
  const { shell } = await setup({
    ...seed,
    invoices: [
      invoiceOf('over', {
        lines: [line('a', null, 100)],
        payments: [
          { id: 'p', paidDate: '2026-10-05', amountCents: 150, note: '' },
        ],
      }),
      invoiceOf('held', {
        retainageCents: 500,
        lines: [line('a', null, 200)],
      }),
    ],
  });
  assert.deepEqual(
    rows(shell).map((/** @type {any} */ tr) => tr.children[7].textContent),
    ['Overpaid', 'Retainage held'],
  );
  assert.deepEqual(
    $(shell.body.children[0]).children.map(
      (/** @type {any} */ tile) => tile.children[0].textContent,
    ),
    ['Owed', 'Held back', 'Overpaid'],
  );
});
