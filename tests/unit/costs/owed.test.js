import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, owedSummary, status } from '../../../src/costs/owed.js';
import { invoiceOf } from '../app/scheduleFixtures.js';

const TODAY = '2026-10-15';

/** @param {number} amountCents */
const line = (amountCents) => ({
  id: `l${amountCents}`,
  scheduleItemId: 'a',
  materialItemId: null,
  description: '',
  amountCents,
  markupBasisPoints: null,
});

/** @param {number} amountCents */
const pay = (amountCents) => ({
  id: `p${amountCents}`,
  paidDate: '2026-10-10',
  amountCents,
  note: '',
});

/**
 * @param {string} id
 * @param {Partial<import('../../../src/types.ts').Invoice>} extra
 */
const bill = (id, extra) => invoiceOf(id, { lines: [line(1_000)], ...extra });

test('the balance owes the markup on top of the lines', () => {
  const b = balance(
    bill('a', { markupBasisPoints: 1500, payments: [pay(1_000)] }),
  );
  assert.equal(b.totalCents, 1_150);
  assert.equal(b.owedCents, 150);
  assert.equal(b.dueCents, 150);
});

test('balance keeps retainage back from what is due', () => {
  assert.deepEqual(balance(bill('a', { retainageCents: 100 })), {
    totalCents: 1_000,
    paidCents: 0,
    owedCents: 1_000,
    heldCents: 100,
    dueCents: 900,
    creditCents: 0,
  });
  const most = balance(
    bill('b', { retainageCents: 100, payments: [pay(950)] }),
  );
  assert.deepEqual(
    [most.owedCents, most.heldCents, most.dueCents],
    [50, 50, 0],
  );
  const over = balance(
    bill('c', { retainageCents: 5_000, payments: [pay(1_200)] }),
  );
  assert.deepEqual(
    [over.owedCents, over.heldCents, over.dueCents, over.creditCents],
    [0, 0, 0, 200],
  );
});

test('status reads the balance against the due day', () => {
  /** @param {Partial<import('../../../src/types.ts').Invoice>} extra */
  const of = (extra) => status(bill('x', extra), TODAY);
  assert.equal(of({ payments: [pay(1_000)] }), 'paid');
  assert.equal(of({ payments: [pay(1_001)] }), 'credit');
  assert.equal(of({ retainageCents: 1_000 }), 'held');
  assert.equal(of({ dueDate: null }), 'unpaid');
  assert.equal(of({ dueDate: '2026-10-14' }), 'overdue');
  assert.equal(of({ dueDate: TODAY }), 'due');
});

test('owedSummary splits what is owed by when it is due', () => {
  const summary = owedSummary(
    [
      bill('late', { dueDate: '2026-10-01', payments: [pay(400)] }),
      bill('soon', { dueDate: '2026-10-20', retainageCents: 100 }),
      bill('sooner', { dueDate: '2026-10-16' }),
      bill('open', {}),
      bill('held', { retainageCents: 2_000, dueDate: '2026-10-01' }),
      bill('paid', { payments: [pay(1_000)] }),
      bill('over', { payments: [pay(1_300)] }),
    ],
    TODAY,
  );
  assert.deepEqual(summary, {
    owedCents: 4_600,
    overdueCents: 600,
    upcomingCents: 1_900,
    nextDue: '2026-10-16',
    undatedCents: 1_000,
    heldCents: 1_100,
    creditCents: 300,
    openCount: 5,
  });
  assert.equal(owedSummary([], TODAY).nextDue, null);
});
