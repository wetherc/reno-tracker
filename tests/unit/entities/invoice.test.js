import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanInvoiceInput,
  invoiceDefaults,
  invoiceErrors,
  invoiceName,
  invoicePaid,
  invoiceMarkup,
  invoiceSubtotal,
  invoiceTotal,
  MAX_LINES,
  MAX_PAYMENTS,
  paymentDefaults,
  pickLines,
  pickPayments,
  validateInvoice,
} from '../../../src/entities/invoice.js';
import {
  lineMarkups,
  lineRate,
  markupOf,
  sharedRate,
} from '../../../src/entities/lineItems.js';

const line = { scheduleItemId: 'a', amountCents: 500 };
const ok = { party: 'Pinch Plumbing', issuedDate: '2026-01-05', lines: [line] };

test('an invoice needs a party, an issue day, and a line', () => {
  assert.deepEqual(invoiceErrors(ok), []);
  assert.deepEqual(
    invoiceErrors({}).map((e) => e.field),
    ['party', 'issuedDate', 'lines'],
  );
  assert.deepEqual(invoiceErrors({}, { partial: true }), []);
  assert.equal(
    validateInvoice({ ...ok, lines: [] })?.message,
    'lines must list at least one line',
  );
  assert.equal(validateInvoice({ ...ok, lines: 'x' })?.field, 'lines');
  assert.equal(
    validateInvoice({ ...ok, lines: Array(MAX_LINES + 1).fill(line) })?.message,
    `lines must list at most ${MAX_LINES} lines, got ${MAX_LINES + 1}`,
  );
  assert.equal(
    validateInvoice({ ...ok, number: 'x'.repeat(101) })?.field,
    'number',
  );
  assert.equal(validateInvoice({ ...ok, dueDate: null }), null);
});

test('each line bills one row and has whole cents', () => {
  /** @param {unknown} l */
  const errors = (l) => invoiceErrors({ ...ok, lines: [line, l] });
  assert.deepEqual(errors(7), [
    { field: 'lines.1', message: 'line 2 must be an object, got 7' },
  ]);
  assert.deepEqual(errors({ amountCents: 1 }), [
    {
      field: 'lines.1.item',
      message: 'line 2 must bill one schedule item or one material',
    },
  ]);
  assert.equal(
    errors({ scheduleItemId: 'a', materialItemId: 'm', amountCents: 1 })[0]
      .field,
    'lines.1.item',
  );
  assert.equal(
    errors({ materialItemId: '', amountCents: 1 })[0].field,
    'lines.1.item',
  );
  assert.deepEqual(errors({ materialItemId: 'm', scheduleItemId: null }), [
    {
      field: 'lines.1.amountCents',
      message:
        'line 2: amountCents must be whole cents, zero or more, got undefined',
    },
  ]);
  assert.equal(
    errors({ materialItemId: 'm', amountCents: 1, description: 5 })[0].field,
    'lines.1.description',
  );
});

test('an invoice is due on or after its issue day', () => {
  assert.deepEqual(validateInvoice({ ...ok, dueDate: '2026-01-04' }), {
    field: 'dueDate',
    message: 'dueDate 2026-01-04 is before issuedDate 2026-01-05',
  });
  const current = { issuedDate: '2026-01-05', dueDate: '2026-01-20' };
  assert.equal(
    validateInvoice({ issuedDate: '2026-01-21' }, { partial: true, current })
      ?.field,
    'dueDate',
  );
  assert.equal(
    validateInvoice(
      { issuedDate: '2026-01-21', dueDate: null },
      { partial: true, current },
    ),
    null,
  );
  assert.equal(
    validateInvoice({ issuedDate: 'nope' }, { partial: true, current })?.field,
    'issuedDate',
  );
});

test('defaults fill every field of the invoice and its lines', () => {
  assert.deepEqual(invoiceDefaults(ok), {
    number: '',
    party: 'Pinch Plumbing',
    issuedDate: '2026-01-05',
    dueDate: null,
    markupBasisPoints: 0,
    lines: [
      {
        scheduleItemId: 'a',
        materialItemId: null,
        description: '',
        amountCents: 500,
        markupBasisPoints: null,
      },
    ],
    retainageCents: 0,
    payments: [],
  });
  assert.deepEqual(invoiceDefaults({}).lines, []);
  assert.deepEqual(invoiceDefaults({}).party, '');
});

test('a body with no markup rate takes the given default', () => {
  assert.equal(invoiceDefaults(ok, 1500).markupBasisPoints, 1500);
  assert.equal(
    invoiceDefaults({ ...ok, markupBasisPoints: 0 }, 1500).markupBasisPoints,
    0,
  );
});

test('markup is whole basis points from 0 to 10000', () => {
  assert.equal(validateInvoice({ ...ok, markupBasisPoints: 10_000 }), null);
  assert.deepEqual(
    invoiceErrors({ markupBasisPoints: 12.5 }, { partial: true }),
    [
      {
        field: 'markupBasisPoints',
        message:
          'markupBasisPoints must be whole basis points from 0 to 10000, got 12.5',
      },
    ],
  );
});

test('pickLines drops unknown keys', () => {
  assert.deepEqual(pickLines([{ ...line, id: 'x', extra: 1 }]), [line]);
});

test('names and totals', () => {
  assert.equal(
    invoiceName({ number: '1043', party: 'Pinch' }),
    'Invoice 1043 from Pinch',
  );
  assert.equal(
    invoiceName({ number: '', party: 'Pinch' }),
    'An invoice from Pinch',
  );
  assert.equal(
    invoiceTotal({
      lines: [line, { ...line, amountCents: 250 }],
      markupBasisPoints: 0,
    }),
    750,
  );
});

/** @param {number[]} amounts @param {number} markupBasisPoints */
const billOf = (amounts, markupBasisPoints) => ({
  markupBasisPoints,
  lines: amounts.map((amountCents, i) => ({
    id: String(i),
    scheduleItemId: 'a',
    materialItemId: null,
    description: '',
    amountCents,
    /** @type {number | null} */
    markupBasisPoints: null,
  })),
});

test('the total adds the markup on the sum of the lines', () => {
  const bill = billOf([10_000, 2_500], 1500);
  assert.equal(invoiceSubtotal(bill), 12_500);
  assert.equal(invoiceMarkup(bill), 1875);
  assert.equal(invoiceTotal(bill), 14_375);
  assert.equal(markupOf(333, 1000), 33);
  assert.equal(markupOf(335, 1000), 34);
});

test('line markups add up to the invoice markup', () => {
  // Each line alone rounds 3.33 cents down to 3, which would lose one
  // cent of the 10-cent markup on 100 cents.
  const bill = billOf([33, 33, 34], 1000);
  assert.deepEqual(lineMarkups(bill), [3, 4, 3]);
  assert.equal(invoiceMarkup(bill), 10);
  assert.deepEqual(lineMarkups(billOf([500], 0)), [0]);
  assert.deepEqual(lineMarkups(billOf([], 1500)), []);
});

test('a line with a rate of its own takes that rate, and a blank one the invoice rate', () => {
  const bill = billOf([10_000, 10_000, 3], 1000);
  bill.lines[1].markupBasisPoints = 2500;
  bill.lines[2].markupBasisPoints = 0;
  assert.equal(lineRate(bill.lines[0], bill), 1000);
  assert.equal(lineRate(bill.lines[1], bill), 2500);
  assert.equal(lineRate(bill.lines[2], bill), 0);
  assert.deepEqual(lineMarkups(bill), [1000, 2500, 0]);
  assert.equal(invoiceMarkup(bill), 3500);
  assert.equal(invoiceTotal(bill), 23_503);
  assert.equal(sharedRate(bill), null);
});

test('a document rounds its markup once over lines at different rates', () => {
  // 1 cent at 50% and 1 cent at 50.01% are 0.5 and 0.5001 cents. Each
  // alone rounds to 1, but the sum, 1.0001, rounds to 1.
  const bill = billOf([1, 1], 5000);
  bill.lines[1].markupBasisPoints = 5001;
  assert.deepEqual(lineMarkups(bill), [1, 0]);
  assert.equal(invoiceMarkup(bill), 1);
});

test('sharedRate names the one rate every line takes', () => {
  const bill = billOf([1, 2], 1500);
  assert.equal(sharedRate(bill), 1500);
  bill.lines[0].markupBasisPoints = 1500;
  assert.equal(sharedRate(bill), 1500);
  bill.lines.forEach((l) => (l.markupBasisPoints = 800));
  assert.equal(sharedRate(bill), 800);
  assert.equal(sharedRate(billOf([], 1200)), 1200);
});

test('payments are optional and each needs a day and more than zero cents', () => {
  const pay = { paidDate: '2026-01-06', amountCents: 100 };
  assert.deepEqual(invoiceErrors({ ...ok, payments: [pay] }), []);
  assert.deepEqual(invoiceErrors({ ...ok, payments: 'x' }), [
    { field: 'payments', message: 'payments must be a list' },
  ]);
  assert.equal(
    validateInvoice({ ...ok, payments: Array(MAX_PAYMENTS + 1).fill(pay) })
      ?.message,
    `payments must list at most ${MAX_PAYMENTS} payments, got ${MAX_PAYMENTS + 1}`,
  );
  assert.deepEqual(invoiceErrors({ payments: [pay, 3] }, { partial: true }), [
    { field: 'payments.1', message: 'payment 2 must be an object, got 3' },
  ]);
  assert.deepEqual(
    invoiceErrors({ ...ok, payments: [{ amountCents: 0, note: 5 }] }),
    [
      {
        field: 'payments.0.paidDate',
        message:
          'payment 1: paidDate must be a date like 2026-03-14, got undefined',
      },
      {
        field: 'payments.0.amountCents',
        message: 'payment 1: amountCents must be more than zero',
      },
      {
        field: 'payments.0.note',
        message: 'payment 1: note must be text, got 5',
      },
    ],
  );
  assert.equal(
    validateInvoice({ ...ok, payments: [{ ...pay, amountCents: -1 }] })?.field,
    'payments.0.amountCents',
  );
});

test('retainage is whole cents, zero or more', () => {
  assert.equal(validateInvoice({ ...ok, retainageCents: 900 }), null);
  assert.equal(
    validateInvoice({ retainageCents: -1 }, { partial: true })?.field,
    'retainageCents',
  );
});

test('clean input keeps known keys and puts payments in paid-day order', () => {
  const late = { paidDate: '2026-02-01', amountCents: 1, extra: 1 };
  const early = { paidDate: '2026-01-01', amountCents: 2 };
  const same = { paidDate: '2026-01-01', amountCents: 3, note: 'Deposit' };
  assert.deepEqual(
    cleanInvoiceInput({ party: 'P', payments: [late, early, same] }),
    {
      party: 'P',
      payments: [
        { paidDate: '2026-01-01', amountCents: 2, note: '' },
        { paidDate: '2026-01-01', amountCents: 3, note: 'Deposit' },
        { paidDate: '2026-02-01', amountCents: 1, note: '' },
      ],
    },
  );
  assert.deepEqual(cleanInvoiceInput({ lines: [{ ...line, id: 'x' }] }), {
    lines: [
      {
        scheduleItemId: 'a',
        materialItemId: null,
        description: '',
        amountCents: 500,
        markupBasisPoints: null,
      },
    ],
  });
  assert.deepEqual(pickPayments([late]), [
    { paidDate: '2026-02-01', amountCents: 1 },
  ]);
  assert.deepEqual(paymentDefaults([]), []);
  assert.equal(
    invoicePaid({
      payments: [
        { id: '1', paidDate: '2026-01-01', amountCents: 2, note: '' },
        { id: '2', paidDate: '2026-01-02', amountCents: 5, note: '' },
      ],
    }),
    7,
  );
});
