import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { barChartModel, renderBarChart } from '../../../src/charts/barChart.js';

installDom();

const months = [
  { month: '2026-11', expectedCents: 40000, actualCents: 10000 },
  { month: '2026-12', expectedCents: 0, actualCents: 0 },
  { month: '2027-01', expectedCents: 80000, actualCents: 0 },
];

test('barChartModel gives each month a slot with a bar in it', () => {
  const model = barChartModel({ months, width: 372, height: 140 });
  // 372 less 72 of padding is 300, so each of three months gets 100.
  assert.deepEqual(model.plot, { x: 56, y: 12, width: 300, height: 100 });
  assert.deepEqual(
    model.yTicks.map((t) => [t.label, t.y]),
    [
      ['$0', 112],
      ['$200', 87],
      ['$400', 62],
      ['$600', 37],
      ['$800', 12],
    ],
  );
  assert.deepEqual(
    model.bars.map((b) => [b.label, b.x, b.width, b.expectedY, b.actualY]),
    [
      ['Nov 2026', 71, 70, 62, 99.5],
      ['Dec', 171, 70, 112, 112],
      ['Jan 2027', 271, 70, 12, 112],
    ],
  );
  assert.equal(model.bars[0].expectedHeight, 50);
  assert.equal(model.bars[0].actualHeight, 12.5);
  assert.equal(model.bars[0].expectedCents, 40000);
});

test('barChartModel with no months has an empty frame', () => {
  const model = barChartModel({ months: [] });
  assert.deepEqual(model.bars, []);
  assert.equal(model.yTicks[model.yTicks.length - 1].label, '$1');
});

test('renderBarChart draws one expected bar per month and an actual bar where paid', () => {
  const model = barChartModel({ months, width: 372, height: 140 });
  const svg = /** @type {any} */ (renderBarChart(model, 'Cost by month'));
  assert.equal(svg.querySelector('title').textContent, 'Cost by month');
  const expected = svg.querySelectorAll('.chart__expected-bar');
  assert.equal(expected.length, 3);
  assert.equal(expected[1].getAttribute('data-month'), '2026-12');
  const paid = svg.querySelectorAll('.chart__actual-bar');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].getAttribute('x'), '88.5');
  assert.equal(paid[0].getAttribute('width'), '35');
  assert.equal(paid[0].getAttribute('height'), '12.5');
  const labels = svg
    .querySelectorAll('.chart__tick')
    .map((/** @type {any} */ t) => t.textContent);
  assert.deepEqual(labels.slice(-3), ['Nov 2026', 'Dec', 'Jan 2027']);
});
