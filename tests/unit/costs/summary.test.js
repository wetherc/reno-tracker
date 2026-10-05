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
  expectedMarkupCents: 0,
  invoicedCents: null,
  billedCents: null,
  billedMarkupCents: null,
  ...extra,
});

test('costSummary adds up committed, spent, projected, and headroom', () => {
  const summary = costSummary(
    [
      event({
        expectedCents: 10000,
        invoicedCents: 12000,
        billedCents: 12000,
        billedMarkupCents: 0,
        complete: true,
      }),
      // An open row with an invoice counts in Spent.
      event({
        expectedCents: 30000,
        invoicedCents: 2000,
        billedCents: 2000,
        billedMarkupCents: 0,
      }),
      event({ expectedCents: 700, complete: true }),
      // A typed price on a complete row is not invoiced, so it accrues.
      event({
        expectedCents: 900,
        billedCents: 800,
        billedMarkupCents: 0,
        complete: true,
      }),
    ],
    50000,
  );
  assert.deepEqual(summary, {
    budgetCents: 50000,
    committedCents: 41600,
    spentCents: 14000,
    projectedCents: 43500,
    headroomCents: 6500,
    accruedCents: 1500,
    accruedCount: 2,
    markupCents: 0,
  });
});

test('costSummary goes negative when the project runs over', () => {
  const summary = costSummary([event({ expectedCents: 60000 })], 50000);
  assert.equal(summary.headroomCents, -10000);
});

test('costSummary on an empty project is all zero but the budget', () => {
  assert.deepEqual(costSummary([], 50000), {
    budgetCents: 50000,
    committedCents: 0,
    spentCents: 0,
    projectedCents: 0,
    headroomCents: 50000,
    accruedCents: 0,
    accruedCount: 0,
    markupCents: 0,
  });
});

test('costSummary projects an entered price on a row not marked complete', () => {
  const summary = costSummary(
    [
      event({
        expectedCents: 300000,
        billedCents: 500000,
        billedMarkupCents: 0,
      }),
    ],
    1000000,
  );
  assert.equal(summary.spentCents, 0);
  assert.equal(summary.projectedCents, 500000);
  assert.equal(summary.headroomCents, 500000);
});

test('costSummary keeps the estimate on an open row billed below it', () => {
  const summary = costSummary(
    [
      event({
        expectedCents: 5_000,
        expectedMarkupCents: 1_000,
        billedCents: 1_250,
        billedMarkupCents: 250,
      }),
      event({
        complete: true,
        expectedCents: 5_000,
        expectedMarkupCents: 1_000,
        invoicedCents: 1_250,
        billedCents: 1_250,
        billedMarkupCents: 250,
      }),
    ],
    20_000,
  );
  assert.equal(summary.projectedCents, 6_250);
  assert.equal(summary.markupCents, 1_250);
  assert.equal(summary.headroomCents, 13_750);
});

test('costSummary counts the billed markup where billed, else the estimated one', () => {
  const summary = costSummary(
    [
      event({
        expectedCents: 1_100,
        expectedMarkupCents: 100,
        billedCents: 1_380,
        billedMarkupCents: 180,
      }),
      event({ expectedCents: 550, expectedMarkupCents: 50 }),
    ],
    0,
  );
  assert.equal(summary.projectedCents, 1_930);
  assert.equal(summary.markupCents, 230);
});
