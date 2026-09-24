import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceDefaults,
  invoiceErrors,
  invoiceName,
  invoiceTotal,
  MAX_LINES,
  pickLines,
  validateInvoice,
} from '../../../src/entities/invoice.js';

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
    lines: [
      {
        scheduleItemId: 'a',
        materialItemId: null,
        description: '',
        amountCents: 500,
      },
    ],
  });
  assert.deepEqual(invoiceDefaults({}).lines, []);
  assert.deepEqual(invoiceDefaults({}).party, '');
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
      lines: [
        { ...line, id: '1', materialItemId: null, description: '' },
        {
          ...line,
          id: '2',
          materialItemId: null,
          description: '',
          amountCents: 250,
        },
      ],
    }),
    750,
  );
});
