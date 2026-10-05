import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { openInvoiceEditor } from '../../../src/app/invoiceEditor.js';
import { paidText } from '../../../src/app/paymentList.js';
import { MAX_PAYMENTS } from '../../../src/entities/invoice.js';
import { todayIso } from '../../../src/schedule/dates.js';
import { invoiceOf, itemOf, setupSchedule, tick } from './scheduleFixtures.js';

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
const payEls = (form) =>
  form.querySelectorAll('.payment').map((/** @type {any} */ el) => ({
    title: el.children[0],
    remove: el.children[1],
    date: el.querySelector('[type="date"]'),
    amount: el.querySelector('[inputmode="decimal"]'),
    note: el.querySelectorAll('[type="text"]').at(-1),
  }));

/** @param {any} form */
const parts = (form) => {
  const list = form.querySelector('.payment-list');
  return {
    retainage: list.querySelector('[inputmode="decimal"]'),
    empty: list.querySelector('.payment-list__empty'),
    add: list.querySelector('.payment-list__footer').children[0],
    paid: list.querySelector('.payment-list__paid'),
  };
};

const invoice = invoiceOf('i1', {
  number: '7',
  party: 'Pinch',
  retainageCents: 1_000,
  lines: [
    {
      id: 'l1',
      scheduleItemId: 'a',
      materialItemId: null,
      description: '',
      amountCents: 10_000,
    },
  ],
  payments: [
    { id: 'p1', paidDate: '2026-10-01', amountCents: 2_000, note: 'Deposit' },
  ],
});

async function editor() {
  const fx = setupSchedule({ schedule: [itemOf('a')], invoices: [invoice] });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx, invoice });
  const form = $(dialog.el).querySelector('form');
  return { fx, dialog, form };
}

test('paidText names the paid part, the rest, and the held part', () => {
  const sums = { totalCents: 1_000, retainageCents: 0 };
  assert.equal(
    paidText({ ...sums, paidCents: 0 }),
    'Paid $0.00 of $10.00. $10.00 owed.',
  );
  assert.equal(
    paidText({ ...sums, paidCents: 1_000 }),
    'Paid $10.00 of $10.00. Nothing owed.',
  );
  assert.equal(
    paidText({ ...sums, paidCents: 1_250 }),
    'Paid $12.50 of $10.00. $2.50 overpaid.',
  );
  assert.equal(
    paidText({ totalCents: 1_000, retainageCents: 5_000, paidCents: 600 }),
    'Paid $6.00 of $10.00. $4.00 owed, $4.00 of it held back.',
  );
});

test('a new invoice has no payments and no retainage', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a')] });
  await fx.ctx.openProject('p1');
  const dialog = openInvoiceEditor({ ctx: fx.ctx });
  const form = $(dialog.el).querySelector('form');
  const p = parts(form);
  assert.equal(p.retainage.value, '0.00');
  assert.equal(p.empty.hidden, false);
  assert.equal(p.paid.textContent, 'Paid $0.00 of $0.00. Nothing owed.');
  dialog.close();
});

test('payments fill, add at the amount due, remove, and save', async () => {
  const { fx, form } = await editor();
  const p = parts(form);
  assert.equal(p.retainage.value, '10.00');
  assert.equal(p.empty.hidden, true);
  const [first] = payEls(form);
  assert.deepEqual(
    [first.title.textContent, first.date.value, first.amount.value],
    ['Payment 1', '2026-10-01', '20.00'],
  );
  assert.equal(first.note.value, 'Deposit');
  assert.equal(
    p.paid.textContent,
    'Paid $20.00 of $100.00. $80.00 owed, $10.00 of it held back.',
  );

  p.add.click();
  const [, second] = payEls(form);
  assert.equal(dom.activeElement, second.amount);
  assert.deepEqual(
    [second.title.textContent, second.date.value, second.amount.value],
    ['Payment 2', todayIso(), '70.00'],
  );
  assert.equal(second.remove.getAttribute('aria-label'), 'Remove payment 2');
  assert.equal(
    p.paid.textContent,
    'Paid $90.00 of $100.00. $10.00 owed, $10.00 of it held back.',
  );
  p.add.click();
  assert.equal(payEls(form)[2].amount.value, '0.00');
  payEls(form)[2].remove.click();
  assert.equal(dom.activeElement, p.add);

  second.note.value = ' Check 1204 ';
  p.retainage.value = '0';
  p.retainage.dispatchEvent({ type: 'input' });
  assert.equal(p.paid.textContent, 'Paid $90.00 of $100.00. $10.00 owed.');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(fx.log, ['patch invoice i1']);
  const saved = fx.invoices()[0];
  assert.equal(saved.retainageCents, 0);
  assert.deepEqual(saved.payments, [
    { paidDate: '2026-10-01', amountCents: 2_000, note: 'Deposit' },
    { paidDate: todayIso(), amountCents: 7_000, note: 'Check 1204' },
  ]);
});

test('a line amount change moves the readout', async () => {
  const { dialog, form } = await editor();
  const amount = form
    .querySelector('.line-item')
    .querySelector('[inputmode="decimal"]');
  amount.value = '20';
  amount.dispatchEvent({ type: 'input' });
  assert.equal(
    parts(form).paid.textContent,
    'Paid $20.00 of $20.00. Nothing owed.',
  );
  dialog.close();
});

test('money that does not parse and a zero payment show under their fields', async () => {
  const { fx, dialog, form } = await editor();
  const p = parts(form);
  p.retainage.value = 'some';
  const [first] = payEls(form);
  p.retainage.dispatchEvent({ type: 'input' });
  first.amount.value = 'x';
  first.amount.dispatchEvent({ type: 'input' });
  assert.equal(p.paid.textContent, 'Paid $0.00 of $100.00. $100.00 owed.');
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Retainage must be dollars and cents, like 1,250.00',
    'Payment 1: Amount must be dollars and cents, like 1,250.00',
  ]);
  assert.equal(dom.activeElement, p.retainage);
  p.retainage.value = '0';
  first.amount.value = '0';
  first.date.value = '';
  form.dispatchEvent({ type: 'submit' });
  await tick();
  assert.deepEqual(shownErrors(form), [
    'Payment 1: Paid on must be a date like 2026-03-14, got ""',
    'Payment 1: Amount must be more than zero',
  ]);
  assert.deepEqual(fx.log, []);
  dialog.close();
});

test('Add payment stops at the most payments an invoice takes', async () => {
  const { dialog, form } = await editor();
  const { add } = parts(form);
  for (let i = 1; i < MAX_PAYMENTS; i += 1) add.click();
  assert.equal(add.disabled, true);
  dialog.close();
});

test('a changed payment asks before the editor closes', async () => {
  const { dialog, form } = await editor();
  payEls(form)[0].note.value = 'Cash';
  $(dialog.el).children[0].children[1].click();
  await tick();
  assert.equal(dialog.el.open, true);
  assert.equal(
    $(dom.body.children[1]).children[0].children[0].textContent,
    'Discard changes?',
  );
  $(dom.body.children[1]).children[2].children[1].click();
  await tick();
  assert.equal(dialog.el.open, false);
});
