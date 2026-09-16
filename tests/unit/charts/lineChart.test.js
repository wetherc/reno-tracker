import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  lineChartModel,
  markersOf,
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

test('lineChartModel marks each day a cost lands on, on the expected line', () => {
  const model = lineChartModel(input);
  assert.deepEqual(model.markers, [
    {
      date: '2026-10-11',
      x: 112.8,
      y: 87,
      expectedCents: 20000,
      actualCents: 25000,
    },
    {
      date: '2026-10-21',
      x: 169.6,
      y: 49.5,
      expectedCents: 50000,
      actualCents: 25000,
    },
  ]);
});

test('markersOf reads a day in one series only from the other running total', () => {
  const id = (/** @type {any} */ v) => Number(String(v).slice(-2));
  const markers = markersOf(
    [{ date: '2026-10-11', cents: 100 }],
    [
      { date: '2026-10-05', cents: 40 },
      { date: '2026-10-20', cents: 90 },
    ],
    id,
    (cents) => cents,
  );
  assert.deepEqual(
    markers.map((m) => [m.date, m.x, m.expectedCents, m.actualCents]),
    [
      ['2026-10-05', 5, 0, 40],
      ['2026-10-11', 11, 100, 40],
      ['2026-10-20', 20, 100, 90],
    ],
  );
  assert.deepEqual(markersOf([], [], id, id), []);
});

test('lineChartModel runs the actual line past today to a step that lands later', () => {
  const model = lineChartModel({
    ...input,
    actual: [
      { date: '2026-10-11', cents: 25000 },
      { date: '2026-11-10', cents: 45000 },
    ],
  });
  // The line ends on Nov 10, not back at today (x 226.4).
  assert.equal(model.actualPath, 'M112.8 112H112.8V80.8H283.2V55.8H283.2');
});

test('lineChartModel keeps today off the axis when it is outside the range', () => {
  const before = lineChartModel({ ...input, today: '2026-09-01' });
  assert.equal(before.todayX, null);
  // The actual line still reaches its own last step.
  assert.equal(before.actualPath, 'M112.8 112H112.8V80.8H112.8');
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
  assert.equal(svg.querySelectorAll('.chart__tick').length, 8);
  assert.equal(svg.querySelector('.chart__today-label').textContent, 'Today');
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
  const dots = svg.querySelectorAll('.chart__marker');
  assert.equal(dots.length, 2);
  assert.equal(dots[1].getAttribute('data-date'), '2026-10-21');
  assert.equal(dots[1].getAttribute('cx'), '169.6');
  assert.equal(dots[1].getAttribute('cy'), '49.5');
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
  assert.equal(svg.querySelector('.chart__marker'), null);
});
