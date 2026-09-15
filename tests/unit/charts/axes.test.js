import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayScale,
  formatAxisCents,
  linear,
  moneyAxis,
  niceStep,
} from '../../../src/charts/axes.js';

test('niceStep picks 1, 2, or 5 times a power of ten', () => {
  assert.equal(niceStep(1), 1);
  assert.equal(niceStep(1.2), 2);
  assert.equal(niceStep(3), 5);
  assert.equal(niceStep(7), 10);
  assert.equal(niceStep(10), 10);
  assert.equal(niceStep(1250), 2000);
  assert.equal(niceStep(0.3), 0.5);
});

test('moneyAxis tops out on a nice step above the largest value', () => {
  assert.deepEqual(moneyAxis(4_700_000), {
    max: 6_000_000,
    values: [0, 2_000_000, 4_000_000, 6_000_000],
  });
  assert.deepEqual(moneyAxis(100_000), {
    max: 100_000,
    values: [0, 50_000, 100_000],
  });
  assert.deepEqual(moneyAxis(0), { max: 100, values: [0, 50, 100] });
  assert.deepEqual(moneyAxis(1_000_000, 10).values.length, 11);
});

test('linear and dayScale map onto a length', () => {
  const y = linear(200, 100);
  assert.equal(y(0), 0);
  assert.equal(y(50), 25);
  assert.equal(y(200), 100);
  const x = dayScale('2026-10-01', '2026-10-11', 500);
  assert.equal(x('2026-10-01'), 0);
  assert.equal(x('2026-10-06'), 250);
  assert.equal(x('2026-10-11'), 500);
  const one = dayScale('2026-10-01', '2026-10-01', 500);
  assert.equal(one('2026-10-01'), 0);
  assert.equal(one('2026-10-02'), 500);
});

test('formatAxisCents shortens to k and M', () => {
  assert.equal(formatAxisCents(0), '$0');
  assert.equal(formatAxisCents(85_000), '$850');
  assert.equal(formatAxisCents(120_000), '$1.2k');
  assert.equal(formatAxisCents(4_500_000), '$45k');
  assert.equal(formatAxisCents(150_000_000), '$1.5M');
  assert.equal(formatAxisCents(200_000_000), '$2M');
});
