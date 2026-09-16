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
  assert.deepEqual(model.plot, { x: 56, y: 12, width: 284, height: 88 });
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
    model.xTicks.map((t) => [t.label, t.x]),
    [
      ['Oct 2026', 56],
      ['Nov', 232.1],
    ],
  );
  // One tick per Sunday, Oct 4 through Nov 15, labelled with the day.
  // 50 days over 284 units puts a week at 39.8, so every label fits.
  assert.deepEqual(
    model.weekTicks.map((t) => [t.date, t.label, t.x]),
    [
      ['2026-10-04', '4', 73],
      ['2026-10-11', '11', 112.8],
      ['2026-10-18', '18', 152.6],
      ['2026-10-25', '25', 192.3],
      ['2026-11-01', '1', 232.1],
      ['2026-11-08', '8', 271.8],
      ['2026-11-15', '15', 311.6],
    ],
  );
  assert.equal(model.budgetY, 12);
  assert.equal(model.todayX, 226.4);
  // Flat from the start, one step at each landing day, flat to the end.
  assert.equal(model.expectedPath, 'M112.8 100H112.8V78H169.6V45H340');
  // The actual line runs flat to the end after its last step.
  assert.equal(model.actualPath, 'M112.8 100H112.8V72.5H340');
});

test('lineChartModel thins the week labels when the weeks sit close', () => {
  // 364 days over 284 units puts a week at 5.5 units, so a 22 unit
  // label needs five weeks of room.
  const model = lineChartModel({
    ...input,
    start: '2026-01-04',
    end: '2027-01-03',
  });
  assert.equal(model.weekTicks.length, 53);
  assert.deepEqual(
    model.weekTicks.slice(0, 6).map((t) => t.label),
    ['4', '', '', '', '', '8'],
  );
  // A start that is a Sunday gets the first tick on the start itself.
  assert.equal(model.weekTicks[0].x, 56);
});

test('lineChartModel marks each day a cost lands on, on the expected line', () => {
  const model = lineChartModel(input);
  assert.deepEqual(model.markers, [
    {
      date: '2026-10-11',
      x: 112.8,
      y: 78,
      expectedCents: 20000,
      actualCents: 25000,
    },
    {
      date: '2026-10-21',
      x: 169.6,
      y: 45,
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

test('lineChartModel steps the actual line at a row that lands after today', () => {
  const model = lineChartModel({
    ...input,
    actual: [
      { date: '2026-10-11', cents: 25000 },
      { date: '2026-11-10', cents: 45000 },
    ],
  });
  assert.equal(model.actualPath, 'M112.8 100H112.8V72.5H283.2V50.5H340');
});

test('lineChartModel keeps today off the axis when it is outside the range', () => {
  const before = lineChartModel({ ...input, today: '2026-09-01' });
  assert.equal(before.todayX, null);
  assert.equal(before.actualPath, 'M112.8 100H112.8V72.5H340');
  const after = lineChartModel({ ...input, today: '2027-01-01' });
  assert.equal(after.todayX, null);
  assert.equal(after.actualPath, 'M112.8 100H112.8V72.5H340');
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
  // Five money lines and one month line, at Nov 1. The October line
  // sits on the y axis and is left out.
  assert.equal(svg.querySelectorAll('.chart__grid').length, 6);
  assert.equal(svg.querySelectorAll('.chart__grid--month').length, 1);
  // Five money labels, seven day numbers, two months, and Today.
  assert.equal(svg.querySelectorAll('.chart__tick').length, 15);
  assert.equal(svg.querySelectorAll('.chart__tick-mark').length, 7);
  assert.equal(svg.querySelectorAll('.chart__tick--week')[0].textContent, '4');
  assert.equal(
    svg.querySelectorAll('.chart__tick--month')[1].getAttribute('x'),
    '235.1',
  );
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
  const marks = svg.querySelectorAll('.chart__mark');
  assert.equal(marks.length, 2);
  assert.equal(marks[1].getAttribute('data-date'), '2026-10-21');
  const dot = marks[1].querySelector('.chart__marker');
  assert.equal(dot.getAttribute('cx'), '169.6');
  assert.equal(dot.getAttribute('cy'), '45');
  // The plumb line drops from the dot to the axis.
  const plumb = marks[1].querySelector('.chart__plumb');
  assert.deepEqual(
    ['x1', 'y1', 'y2'].map((a) => plumb.getAttribute(a)),
    ['169.6', '45', '100'],
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
  assert.equal(svg.querySelector('.chart__marker'), null);
  // A thinned week keeps its tick mark and drops only the label.
  const thin = /** @type {any} */ (
    renderLineChart(
      lineChartModel({ ...input, start: '2026-01-04', end: '2027-01-03' }),
      'Long',
    )
  );
  assert.equal(thin.querySelectorAll('.chart__tick-mark').length, 53);
  assert.equal(thin.querySelectorAll('.chart__tick--week').length, 11);
});
