import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  lineChartModel,
  renderLineChart,
  stepPath,
} from '../../../src/charts/lineChart.js';

installDom();

const input = {
  expected: [
    { date: '2026-10-11', cents: 20000 },
    { date: '2026-10-21', cents: 50000 },
  ],
  actual: [{ date: '2026-10-11', cents: 25000 }],
  budgetCents: 80000,
  start: '2026-10-01',
  end: '2026-11-20',
  today: '2026-10-31',
  width: 356,
  height: 140,
};

test('lineChartModel places the axes and lines on a fixed frame', () => {
  const model = lineChartModel(input);
  // 356 wide less 56 and 16 of padding is 284 for 50 days.
  assert.deepEqual(model.plot, { x: 56, y: 12, width: 284, height: 100 });
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
    model.xTicks.map((t) => [t.label, t.x]),
    [
      ['Oct 2026', 56],
      ['Nov', 232.1],
    ],
  );
  assert.equal(model.budgetY, 12);
  assert.equal(model.todayX, 226.4);
  // Flat from the start, one step at each landing day, flat to the end.
  assert.equal(model.expectedPath, 'M112.8 112H112.8V87H169.6V49.5H340');
  // The actual line stops at today.
  assert.equal(model.actualPath, 'M112.8 112H112.8V80.8H226.4');
});

test('lineChartModel keeps today off the axis when it is outside the range', () => {
  const before = lineChartModel({ ...input, today: '2026-09-01' });
  assert.equal(before.todayX, null);
  assert.equal(before.actualPath, 'M112.8 112H112.8V80.8H56');
  const after = lineChartModel({ ...input, today: '2027-01-01' });
  assert.equal(after.todayX, null);
  assert.equal(after.actualPath, 'M112.8 112H112.8V80.8H340');
});

test('lineChartModel with no points draws only the frame', () => {
  const model = lineChartModel({
    ...input,
    expected: [],
    actual: [],
    budgetCents: 0,
  });
  assert.equal(model.expectedPath, '');
  assert.equal(model.actualPath, '');
  assert.equal(model.yTicks[model.yTicks.length - 1].label, '$1');
  assert.equal(
    stepPath(
      [],
      () => 0,
      () => 0,
      0,
      0,
    ),
    '',
  );
});

test('lineChartModel labels January with its year', () => {
  const model = lineChartModel({
    ...input,
    start: '2026-12-15',
    end: '2027-02-10',
  });
  assert.deepEqual(
    model.xTicks.map((t) => t.label),
    ['Jan 2027', 'Feb'],
  );
});

test('renderLineChart draws a titled svg with grid, budget, today, and lines', () => {
  const model = lineChartModel(input);
  const svg = /** @type {any} */ (renderLineChart(model, 'Cost over time'));
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('viewBox'), '0 0 356 140');
  const title = svg.querySelector('title');
  assert.equal(title.textContent, 'Cost over time');
  assert.equal(svg.getAttribute('aria-labelledby'), title.id);
  assert.equal(svg.querySelectorAll('.chart__grid').length, 5);
  assert.equal(svg.querySelectorAll('.chart__tick').length, 7);
  assert.equal(svg.querySelector('.chart__budget').getAttribute('y1'), '12');
  assert.equal(svg.querySelector('.chart__today').getAttribute('x1'), '226.4');
  assert.equal(
    svg.querySelector('.chart__expected').getAttribute('d'),
    model.expectedPath,
  );
  assert.equal(
    svg.querySelector('.chart__actual').getAttribute('d'),
    model.actualPath,
  );
});

test('renderLineChart leaves out what the model does not have', () => {
  const model = lineChartModel({
    ...input,
    expected: [],
    actual: [],
    today: '2020-01-01',
  });
  const svg = /** @type {any} */ (renderLineChart(model, 'Empty'));
  assert.equal(svg.querySelector('.chart__today'), null);
  assert.equal(svg.querySelector('.chart__expected'), null);
  assert.equal(svg.querySelector('.chart__actual'), null);
});
