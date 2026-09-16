import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { barChartModel, renderBarChart } from '../../../src/charts/barChart.js';
import { addDays } from '../../../src/schedule/dates.js';

installDom();

const weeks = [
  { week: '2026-11-01', expectedCents: 40000, actualCents: 10000 },
  { week: '2026-11-08', expectedCents: 0, actualCents: 0 },
  { week: '2026-11-15', expectedCents: 80000, actualCents: 0 },
];

/**
 * @param {number} count
 * @param {string} start a Sunday
 * @param {{ width?: number, height?: number }} [size]
 */
function runOf(count, start, size = {}) {
  const many = Array.from({ length: count }, (_, i) => ({
    week: addDays(start, i * 7),
    expectedCents: 100,
    actualCents: 0,
  }));
  return barChartModel({ weeks: many, ...size });
}

test('barChartModel gives each week a slot with a bar in it', () => {
  const model = barChartModel({ weeks, width: 372, height: 140 });
  // 372 less 72 of padding is 300, so each of three weeks gets 100.
  assert.deepEqual(model.plot, { x: 56, y: 12, width: 300, height: 88 });
  assert.deepEqual(
    model.yTicks.map((t) => [t.label, t.y]),
    [
      ['$0', 100],
      ['$200', 78],
      ['$400', 56],
      ['$600', 34],
      ['$800', 12],
    ],
  );
  assert.deepEqual(
    model.bars.map((b) => [b.label, b.x, b.width, b.expectedY, b.actualY]),
    [
      ['1', 78.5, 55, 56, 89],
      ['8', 178.5, 55, 100, 100],
      ['15', 278.5, 55, 12, 100],
    ],
  );
  assert.equal(model.bars[0].expectedHeight, 44);
  assert.equal(model.bars[0].actualHeight, 11);
  assert.equal(model.bars[0].expectedCents, 40000);
  // The month is named once, under its first bar, with the year.
  assert.deepEqual(model.monthTicks, [
    { month: '2026-11', x: 78.5, label: 'Nov 2026' },
  ]);
});

test('barChartModel with no weeks has an empty frame', () => {
  const model = barChartModel({ weeks: [] });
  assert.deepEqual(model.bars, []);
  assert.deepEqual(model.monthTicks, []);
  assert.equal(model.yTicks[model.yTicks.length - 1].label, '$1');
});

test('barChartModel numbers every nth week when the slots are narrow', () => {
  // 300 wide over fourteen weeks is 21.4 per slot, under the 22 a day
  // number needs, so every second bar is numbered.
  const model = runOf(14, '2026-11-01', { width: 372, height: 140 });
  assert.deepEqual(
    model.bars.map((b) => b.label),
    ['1', '', '15', '', '29', '', '13', '', '27', '', '10', '', '24', ''],
  );
  // January carries its year; the other months do not.
  assert.deepEqual(
    model.monthTicks.map((t) => t.label),
    ['Nov 2026', 'Dec', 'Jan 2027'],
  );
  const svg = /** @type {any} */ (renderBarChart(model, 'Cost by week'));
  // The y axis ticks share the class, so count past them.
  const ticks = svg.querySelectorAll('.chart__tick').length;
  assert.equal(ticks - model.yTicks.length - model.monthTicks.length, 7);
  assert.equal(svg.querySelectorAll('.chart__tick-mark').length, 14);
});

test('barChartModel gives a one bar month its name slot to the next month', () => {
  // Twelve weeks over 888 is 74 per slot. August has one bar, so its
  // name would run into September's; September takes the slot and the
  // year that August would have shown.
  const model = runOf(12, '2026-08-30');
  assert.deepEqual(model.monthTicks, [
    { month: '2026-09', x: 146.7, label: 'Sep 2026' },
    { month: '2026-10', x: 442.7, label: 'Oct' },
    { month: '2026-11', x: 738.7, label: 'Nov' },
  ]);
  // With room for both names, a one bar month keeps its own.
  const wide = runOf(3, '2026-08-30', { width: 372, height: 140 });
  assert.deepEqual(
    wide.monthTicks.map((t) => t.label),
    ['Aug 2026', 'Sep'],
  );
});

test('renderBarChart draws one expected bar per week and an actual bar where paid', () => {
  const model = barChartModel({ weeks, width: 372, height: 140 });
  const svg = /** @type {any} */ (renderBarChart(model, 'Cost by week'));
  assert.equal(svg.querySelector('title').textContent, 'Cost by week');
  const expected = svg.querySelectorAll('.chart__expected-bar');
  assert.equal(expected.length, 3);
  assert.equal(expected[1].getAttribute('data-week'), '2026-11-08');
  // The paid bar lies over the expected bar at the same width.
  const paid = svg.querySelectorAll('.chart__actual-bar');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].getAttribute('x'), '78.5');
  assert.equal(paid[0].getAttribute('width'), '55');
  assert.equal(paid[0].getAttribute('height'), '11');
  const days = svg
    .querySelectorAll('.chart__tick--week')
    .map((/** @type {any} */ t) => t.textContent);
  assert.deepEqual(days, ['1', '8', '15']);
  const months = svg.querySelectorAll('.chart__tick--month');
  assert.equal(months.length, 1);
  assert.equal(months[0].textContent, 'Nov 2026');
  assert.equal(months[0].getAttribute('x'), '78.5');
});
