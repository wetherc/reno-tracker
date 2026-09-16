import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costSummary } from '../../../src/costs/summary.js';

/**
 * @param {Partial<import('../../../src/costs/timeline.js').CostEvent>} extra
 * @returns {import('../../../src/costs/timeline.js').CostEvent}
 */
const event = (extra) => ({
  id: 'x',
  source: 'schedule',
  title: 'x',
  date: '2026-10-01',
  complete: false,
  expectedCents: 1000,
  actualCents: null,
  ...extra,
});

test('costSummary adds up committed, spent, projected, and remaining', () => {
  const summary = costSummary(
    [
      event({ expectedCents: 10000, actualCents: 12000, complete: true }),
      event({ expectedCents: 30000 }),
      event({ expectedCents: 700, complete: true }),
    ],
    50000,
  );
  assert.deepEqual(summary, {
    budgetCents: 50000,
    committedCents: 40700,
    spentCents: 12000,
    projectedCents: 42700,
    remainingCents: 7300,
    percentComplete: 67,
    accruedCents: 700,
    accruedCount: 1,
  });
});

test('costSummary goes negative when the project runs over', () => {
  const summary = costSummary([event({ expectedCents: 60000 })], 50000);
  assert.equal(summary.remainingCents, -10000);
  assert.equal(summary.percentComplete, 0);
});

test('costSummary on an empty project is all zero but the budget', () => {
  assert.deepEqual(costSummary([], 50000), {
    budgetCents: 50000,
    committedCents: 0,
    spentCents: 0,
    projectedCents: 0,
    remainingCents: 50000,
    percentComplete: 0,
    accruedCents: 0,
    accruedCount: 0,
  });
});
