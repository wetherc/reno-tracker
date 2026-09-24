import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billedHint,
  billings,
  withInvoiceActuals,
} from '../../../src/costs/invoiced.js';
import { invoiceOf, itemOf, materialOf } from '../app/scheduleFixtures.js';

/** @param {string | null} scheduleItemId @param {string | null} materialItemId @param {number} amountCents */
const line = (scheduleItemId, materialItemId, amountCents) => ({
  id: `l${amountCents}`,
  scheduleItemId,
  materialItemId,
  description: '',
  amountCents,
});

const late = invoiceOf('late', {
  issuedDate: '2026-11-01',
  lines: [line('a', null, 300), line(null, 'm', 50)],
});
const early = invoiceOf('early', {
  issuedDate: '2026-10-01',
  lines: [line('a', null, 200)],
});

test('billings sums the lines per row and names the earliest invoice', () => {
  const byRow = billings([late, early]);
  assert.deepEqual([...byRow.keys()], ['a', 'm']);
  assert.deepEqual(byRow.get('a'), {
    cents: 500,
    markupCents: 0,
    lines: 2,
    first: early,
  });
  assert.deepEqual(byRow.get('m'), {
    cents: 50,
    markupCents: 0,
    lines: 1,
    first: late,
  });
});

test('billings gives each row its share of the markup on its lines', () => {
  const marked = invoiceOf('x', {
    markupBasisPoints: 1000,
    lines: [line('a', null, 33), line(null, 'm', 33), line('a', null, 34)],
  });
  const byRow = billings([marked]);
  assert.equal(byRow.get('a')?.markupCents, 6);
  assert.equal(byRow.get('m')?.markupCents, 4);
});

test('withInvoiceActuals sets the billed sum and keeps other rows', () => {
  const a = itemOf('a', { actualCents: 9 });
  const b = itemOf('b', { actualCents: 7 });
  const m = materialOf('m');
  const payload = /** @type {any} */ ({
    schedule: [a, b],
    materials: [m],
    invoices: [late, early],
  });
  const next = withInvoiceActuals(payload);
  assert.equal(next.schedule[0].actualCents, 500);
  assert.equal(next.schedule[1], b);
  assert.equal(next.materials[0].actualCents, 50);
  assert.equal(a.actualCents, 9);
  const plain = /** @type {any} */ ({
    schedule: [a],
    materials: [],
    invoices: [],
  });
  assert.equal(withInvoiceActuals(plain), plain);
});

test('billedHint counts the lines', () => {
  assert.equal(
    billedHint({ cents: 1, markupCents: 0, lines: 1, first: early }),
    'The sum of 1 invoice line',
  );
  assert.equal(
    billedHint({ cents: 1, markupCents: 0, lines: 3, first: early }),
    'The sum of 3 invoice lines',
  );
  assert.equal(
    billedHint({ cents: 1, markupCents: 76_200, lines: 2, first: early }),
    'The sum of 2 invoice lines, before $762.00 markup',
  );
});
