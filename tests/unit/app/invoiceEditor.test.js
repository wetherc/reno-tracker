import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  openInvoiceEditor,
  readRow,
  rowValue,
  totalText,
} from '../../../src/app/invoiceEditor.js';
import { MAX_LINES } from '../../../src/entities/invoice.js';
import { todayIso } from '../../../src/schedule/dates.js';
import {
  invoiceOf,
  itemOf,
  materialOf,
  setupSchedule,
  tick,
} from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @param {any} form */
const shownErrors = (form) =>
  form
    .querySelectorAll('.form__error')
    .filter((/** @type {any} */ e) => !e.hidden)
    .map((/** @type {any} */ e) => e.textContent);

/** @param {any} form */
const lineEls = (form) => form.querySelectorAll('.invoice-line');

/** @param {any} lineEl */
const parts = (lineEl) => ({
  title: lineEl.children[0],
  remove: lineEl.children[1],
  row: lineEl.querySelector('select'),
  amount: lineEl.querySelector('[inputmode="decimal"]'),
  note: lineEl.querySelectorAll('[type="text"]').at(-1),
});

/** @param {any} dialog */
const addLineButton = (dialog) =>
  $(dialog.el).querySelector('.invoice-lines__footer').children[0];

async function project() {
  const fx = setupSchedule({
    schedule: [
      itemOf('b', { title: 'Tile', startDate: '2026-10-13' }),
      itemOf('a', { title: 'Demo', startDate: '2026-10-01' }),
    ],
    materials: [
      materialOf('m2', { name: 'Vanity' }),
      materialOf('m1', { name: 'Grout' }),
    ],
  });
  await fx.ctx.openProject('p1');
  return fx;
}

test('rowValue and readRow turn links into a select value and back', () => {
  assert.equal(
    rowValue({ scheduleItemId: 'a', materialItemId: null }),
    'schedule:a',
  );
  assert.equal(
    rowValue({ scheduleItemId: null, materialItemId: 'm' }),
    'material:m',
  );
  assert.equal(rowValue({}), '');
  assert.deepEqual(readRow('schedule:a:b'), {
    scheduleItemId: 'a:b',
    materialItemId: null,
  });
  assert.deepEqual(readRow('material:m'), {
    scheduleItemId: null,
    materialItemId: 'm',
  });
  assert.deepEqual(readRow(''), { scheduleItemId: null, materialItemId: null });
});

test('a new invoice starts with one line and groups the rows it can bill', async () => {
  const fx = await project();
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const el = $(dialog.el);
  assert.equal(el.children[0].children[0].textContent, 'New invoice');
  const form = el.querySelector('form');
  assert.equal(form.querySelector('[type="date"]').value, todayIso());
  const [only] = lineEls(form);
  const line = parts(only);
  assert.equal(line.title.textContent, 'Line 1');
  assert.equal(line.remove.disabled, true);
  assert.equal(line.row.value, '');
  const groups = line.row.children.slice(1);
  assert.deepEqual(
    groups.map((/** @type {any} */ g) => [
      g.label,
      g.children.map((/** @type {any} */ o) => o.textContent),
    ]),
    [
      ['Schedule', ['Demo', 'Tile']],
      ['Materials', ['Grout', 'Vanity']],
    ],
  );
  assert.equal(
    form.querySelector('.invoice-lines__total').textContent,
    'Total $0.00',
  );
  dialog.close();
});

test('only the groups with rows appear', async () => {
  const fx = setupSchedule({ materials: [materialOf('m1')] });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const select = $(dialog.el).querySelector('select');
  assert.deepEqual(
    select.children.slice(1).map((/** @type {any} */ g) => g.label),
    ['Materials'],
  );
  dialog.close();
});

test('lines add, total, remove, and save as one invoice', async () => {
  const fx = await project();
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');

  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'From cannot be blank',
    'Line 1 must bill one schedule item or one material',
  ]);

  form.querySelectorAll('[type="text"]')[1].value = ' Pinch ';
  const first = parts(lineEls(form)[0]);
  first.row.value = 'schedule:a';
  first.amount.value = '1,200';
  first.amount.dispatchEvent({ type: 'input' });
  addLineButton(dialog).click();
  assert.equal(dom.activeElement, parts(lineEls(form)[1]).row);
  addLineButton(dialog).click();
  const [, second, third] = lineEls(form).map(parts);
  assert.equal(first.remove.disabled, false);
  assert.equal(third.title.textContent, 'Line 3');
  second.row.value = 'material:m1';
  second.amount.value = 'lots';
  second.note.value = ' Bags ';
  second.amount.dispatchEvent({ type: 'input' });
  const total = form.querySelector('.invoice-lines__total');
  assert.equal(total.textContent, 'Total $1,200.00');

  third.remove.click();
  assert.equal(lineEls(form).length, 2);
  assert.equal(dom.activeElement, addLineButton(dialog));
  assert.equal(
    parts(lineEls(form)[1]).remove.getAttribute('aria-label'),
    'Remove line 2',
  );

  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Line 2: Amount must be dollars and cents, like 1,250.00',
  ]);
  second.amount.value = '30.50';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['create invoice Pinch']);
  assert.deepEqual(fx.toasts, ['ok Added an invoice from Pinch']);
  assert.equal(dom.body.children.length, 0);
  assert.deepEqual(fx.invoices()[0].lines, [
    {
      scheduleItemId: 'a',
      materialItemId: null,
      amountCents: 120000,
      description: '',
    },
    {
      scheduleItemId: null,
      materialItemId: 'm1',
      amountCents: 3050,
      description: 'Bags',
    },
  ]);
});

test('Add line stops at the most lines an invoice takes', async () => {
  const fx = await project();
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const add = addLineButton(dialog);
  for (let i = 1; i < MAX_LINES; i += 1) add.click();
  assert.equal(add.disabled, true);
  dialog.close();
});

test('a server field error lands under its line', async () => {
  const fx = await project();
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  form.querySelectorAll('[type="text"]')[1].value = 'boom';
  parts(lineEls(form)[0]).row.value = 'material:m1';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Line 1 bills a material that is not in this project',
  ]);
  assert.equal($(dialog.el).open, true);
  dialog.close();
});

test('editing fills the lines, patches, and closes when the invoice is gone', async () => {
  const invoice = invoiceOf('i1', {
    number: '1043',
    party: 'Pinch',
    dueDate: '2026-11-04',
    lines: [
      {
        id: 'l1',
        scheduleItemId: 'a',
        materialItemId: null,
        description: 'Labor',
        amountCents: 5000,
      },
      {
        id: 'l2',
        scheduleItemId: null,
        materialItemId: 'm2',
        description: '',
        amountCents: 250,
      },
    ],
  });
  const fx = setupSchedule({
    schedule: [itemOf('a')],
    materials: [materialOf('m2')],
    invoices: [invoice],
  });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx, invoice });
  const el = $(dialog.el);
  assert.equal(
    el.children[0].children[0].textContent,
    'Invoice 1043 from Pinch',
  );
  const form = el.querySelector('form');
  const lines = lineEls(form).map(parts);
  assert.deepEqual(
    lines.map((/** @type {any} */ l) => [
      l.row.value,
      l.amount.value,
      l.note.value,
    ]),
    [
      ['schedule:a', '50.00', 'Labor'],
      ['material:m2', '2.50', ''],
    ],
  );
  assert.equal(
    form.querySelector('.invoice-lines__total').textContent,
    'Total $52.50',
  );
  assert.equal(el.children[2].children[2].textContent, 'Save');
  form.querySelectorAll('[type="date"]')[1].value = '';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['patch invoice i1']);
  assert.deepEqual(fx.toasts, ['ok Saved invoice 1043 from Pinch']);
  assert.equal(fx.invoices()[0].dueDate, null);

  const again = openInvoiceEditor({ ctx: fx.ctx, invoice: fx.invoices()[0] });
  await fx.ctx.write((api) => api.patchInvoice('i1', { party: 'Pinch Co' }));
  assert.equal($(again.el).open, true);
  await fx.ctx.write((api) => api.deleteInvoice('i1'));
  assert.equal($(again.el).open, false);
  assert.equal(dom.body.children.length, 0);
});

test('delete asks first and writes on yes', async () => {
  const invoice = invoiceOf('i1', {
    party: 'Pinch',
    lines: [
      {
        id: 'l1',
        scheduleItemId: 'a',
        materialItemId: null,
        description: '',
        amountCents: 1,
      },
    ],
  });
  const fx = setupSchedule({ schedule: [itemOf('a')], invoices: [invoice] });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx, invoice });
  const remove = $(dialog.el).children[2].children[0];
  remove.click();
  await tick();
  let confirm = $(dom.body.children[1]);
  assert.equal(
    confirm.children[0].textContent,
    'Delete an invoice from Pinch?',
  );
  confirm.children[2].children[0].click();
  await tick();
  assert.deepEqual(fx.log, []);
  remove.click();
  await tick();
  confirm = $(dom.body.children[1]);
  confirm.children[2].children[1].click();
  await tick();
  assert.deepEqual(fx.log, ['delete invoice i1']);
  assert.deepEqual(fx.toasts, ['ok Deleted an invoice from Pinch']);
  assert.equal(dom.body.children.length, 0);
});

test('a changed line asks before the editor closes', async () => {
  const fx = await project();
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const el = $(dialog.el);
  el.children[2].children[0].click();
  await tick();
  assert.equal(el.open, false);
  const again = openInvoiceEditor({ ctx: fx.ctx });
  addLineButton(again).click();
  $(again.el).children[0].children[1].click();
  await tick();
  assert.equal(again.el.open, true);
  assert.equal(
    $(dom.body.children[1]).children[0].children[0].textContent,
    'Discard changes?',
  );
  $(dom.body.children[1]).children[2].children[1].click();
  await tick();
  assert.equal(again.el.open, false);
});

test('totalText names the markup only when the rate is above zero', () => {
  assert.equal(
    totalText({ subtotalCents: 100, markupCents: 0, markupBasisPoints: 0 }),
    'Total $1.00',
  );
  assert.equal(
    totalText({
      subtotalCents: 10_000,
      markupCents: 1_250,
      markupBasisPoints: 1_250,
    }),
    'Lines $100.00 + 12.5% markup $12.50 = total $112.50',
  );
});

test('a new invoice starts at the project markup and saves the typed rate', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a', { title: 'Demo' })],
    markupBasisPoints: 1500,
  });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  const markup = form
    .querySelector('.invoice-lines__markup')
    .querySelector('input');
  const total = form.querySelector('.invoice-lines__total');
  assert.equal(markup.value, '15');
  form.querySelectorAll('[type="text"]')[1].value = 'Pinch';
  const line = parts(lineEls(form)[0]);
  line.row.value = 'schedule:a';
  line.amount.value = '1,000';
  line.amount.dispatchEvent({ type: 'input' });
  assert.equal(
    total.textContent,
    'Lines $1,000.00 + 15% markup $150.00 = total $1,150.00',
  );
  markup.value = 'lots';
  markup.dispatchEvent({ type: 'input' });
  assert.equal(total.textContent, 'Total $1,000.00');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Markup must be a percent from 0 to 100, like 15 or 12.5',
  ]);
  markup.value = '10';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.equal(fx.invoices()[0].markupBasisPoints, 1000);
});

test('an invoice opens on its own rate, not the project rate', async () => {
  const fx = setupSchedule({
    schedule: [itemOf('a')],
    invoices: [
      invoiceOf('i1', {
        markupBasisPoints: 500,
        lines: [
          {
            id: 'l',
            scheduleItemId: 'a',
            materialItemId: null,
            description: '',
            amountCents: 2_000,
          },
        ],
      }),
    ],
    markupBasisPoints: 1500,
  });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({
    ctx: fx.ctx,
    invoice: /** @type {any} */ (fx.ctx.payload).invoices[0],
  });
  const form = $(dialog.el).querySelector('form');
  assert.equal(
    form.querySelector('.invoice-lines__markup').querySelector('input').value,
    '5',
  );
  assert.match(
    form.querySelector('.payment-list__paid').textContent,
    /of \$21\.00/,
  );
  dialog.close();
});
