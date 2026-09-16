import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { barChartModel, renderBarChart } from '../../../src/charts/barChart.js';

installDom();

const weeks = [
  { week: '2026-11-01', expectedCents: 40000, actualCents: 10000 },
  { week: '2026-11-08', expectedCents: 0, actualCents: 0 },
  { week: '2026-11-15', expectedCents: 80000, actualCents: 0 },
];

test('barChartModel gives each week a slot with a bar in it', () => {
  const model = barChartModel({ weeks, width: 372, height: 140 });
  // 372 less 72 of padding is 300, so each of three weeks gets 100.
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
      ['Nov 1', 71, 70, 62, 99.5],
      ['Nov 8', 171, 70, 112, 112],
      ['Nov 15', 271, 70, 12, 112],
    ],
  );
  assert.equal(model.bars[0].expectedHeight, 50);
  assert.equal(model.bars[0].actualHeight, 12.5);
  assert.equal(model.bars[0].expectedCents, 40000);
});

test('barChartModel with no weeks has an empty frame', () => {
  const model = barChartModel({ weeks: [] });
  assert.deepEqual(model.bars, []);
  assert.equal(model.yTicks[model.yTicks.length - 1].label, '$1');
});

test('barChartModel labels every nth week when the slots are narrow', () => {
  // 300 wide over ten weeks is 30 per slot, under the 52 a label needs,
  // so every second bar is named.
  const many = Array.from({ length: 10 }, (_, i) => ({
    week: `2026-11-${String(1 + i * 7).padStart(2, '0')}`,
    expectedCents: 100,
    actualCents: 0,
  })).map((w, i) =>
    i < 5
      ? w
      : { ...w, week: `2026-12-${String(i * 7 - 29).padStart(2, '0')}` },
  );
  const model = barChartModel({ weeks: many, width: 372, height: 140 });
  assert.deepEqual(
    model.bars.map((b) => b.label),
    ['Nov 1', '', 'Nov 15', '', 'Nov 29', '', 'Dec 13', '', 'Dec 27', ''],
  );
  const svg = /** @type {any} */ (renderBarChart(model, 'Cost by week'));
  // The y axis ticks share the class, so count past them.
  const ticks = svg.querySelectorAll('.chart__tick').length;
  assert.equal(ticks - model.yTicks.length, 5);
});

test('renderBarChart draws one expected bar per week and an actual bar where paid', () => {
  const model = barChartModel({ weeks, width: 372, height: 140 });
  const svg = /** @type {any} */ (renderBarChart(model, 'Cost by week'));
  assert.equal(svg.querySelector('title').textContent, 'Cost by week');
  const expected = svg.querySelectorAll('.chart__expected-bar');
  assert.equal(expected.length, 3);
  assert.equal(expected[1].getAttribute('data-week'), '2026-11-08');
  const paid = svg.querySelectorAll('.chart__actual-bar');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].getAttribute('x'), '88.5');
  assert.equal(paid[0].getAttribute('width'), '35');
  assert.equal(paid[0].getAttribute('height'), '12.5');
  const labels = svg
    .querySelectorAll('.chart__tick')
    .map((/** @type {any} */ t) => t.textContent);
  assert.deepEqual(labels.slice(-3), ['Nov 1', 'Nov 8', 'Nov 15']);
});
