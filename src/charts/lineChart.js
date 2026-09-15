// The cumulative cost chart. Two running totals over the life of the
// project, expected and actual, against the budget. A cost lands on one
// day, so each line is a staircase: flat until a cost lands, then a
// vertical step. The expected line runs to the end of the range. The
// actual line stops at today because nothing has been paid past it.
import { addMonths, monthBounds, monthOf } from '../schedule/dates.js';
import { formatMonthShort } from '../format/date.js';
import { dayScale, formatAxisCents, linear, moneyAxis } from './axes.js';
import { chartFrame, svgEl } from './svg.js';

/** @typedef {import('../costs/timeline.js').SeriesPoint} SeriesPoint */

/**
 * @typedef {object} LineChartInput
 * @property {SeriesPoint[]} expected
 * @property {SeriesPoint[]} actual
 * @property {number} budgetCents
 * @property {string} start first day on the axis
 * @property {string} end last day on the axis, on or after start
 * @property {string} today
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} LineChartModel
 * @property {number} width
 * @property {number} height
 * @property {{ x: number, y: number, width: number, height: number }} plot
 * @property {{ value: number, y: number, label: string }[]} yTicks
 * @property {{ month: string, x: number, label: string }[]} xTicks
 * @property {string} expectedPath SVG path data, empty when there are no points
 * @property {string} actualPath
 * @property {number} budgetY
 * @property {number | null} todayX null when today is off the axis
 */

const PAD = { top: 12, right: 16, bottom: 28, left: 56 };

/**
 * Path data for a staircase from the plot floor through the points,
 * held flat out to `untilX`.
 * @param {SeriesPoint[]} points
 * @param {(date: string) => number} x
 * @param {(cents: number) => number} y
 * @param {number} floorY
 * @param {number} untilX
 * @returns {string}
 */
export function stepPath(points, x, y, floorY, untilX) {
  if (points.length === 0) return '';
  const parts = [`M${r(x(points[0].date))} ${r(floorY)}`];
  for (const point of points) {
    parts.push(`H${r(x(point.date))}V${r(y(point.cents))}`);
  }
  parts.push(`H${r(untilX)}`);
  return parts.join('');
}

/** @param {number} n */
const r = (n) => Math.round(n * 10) / 10;

/**
 * @param {LineChartInput} input
 * @returns {LineChartModel}
 */
export function lineChartModel({
  expected,
  actual,
  budgetCents,
  start,
  end,
  today,
  width = 960,
  height = 280,
}) {
  const plot = {
    x: PAD.left,
    y: PAD.top,
    width: width - PAD.left - PAD.right,
    height: height - PAD.top - PAD.bottom,
  };
  const top = Math.max(
    budgetCents,
    expected[expected.length - 1]?.cents ?? 0,
    actual[actual.length - 1]?.cents ?? 0,
  );
  const axis = moneyAxis(top);
  const scaleY = linear(axis.max, plot.height);
  const y = (/** @type {number} */ cents) =>
    plot.y + plot.height - scaleY(cents);
  const scaleX = dayScale(start, end, plot.width);
  const x = (/** @type {string} */ date) => plot.x + scaleX(date);
  const floorY = plot.y + plot.height;
  const rightX = plot.x + plot.width;

  const inRange = today >= start && today <= end;
  const actualEnd = today < start ? plot.x : today > end ? rightX : x(today);

  /** @type {LineChartModel['xTicks']} */
  const xTicks = [];
  for (let m = monthOf(start); m <= monthOf(end); m = addMonths(m, 1)) {
    const first = monthBounds(m).start;
    if (first < start) continue;
    const firstTick = xTicks.length === 0;
    xTicks.push({
      month: m,
      x: r(x(first)),
      label: formatMonthShort(m, { year: firstTick || m.endsWith('-01') }),
    });
  }

  return {
    width,
    height,
    plot,
    yTicks: axis.values.map((value) => ({
      value,
      y: r(y(value)),
      label: formatAxisCents(value),
    })),
    xTicks,
    expectedPath: stepPath(expected, x, y, floorY, rightX),
    actualPath: stepPath(actual, x, y, floorY, actualEnd),
    budgetY: r(y(budgetCents)),
    todayX: inRange ? r(x(today)) : null,
  };
}

/**
 * @param {LineChartModel} model
 * @param {string} title read by a screen reader
 * @returns {SVGElement}
 */
export function renderLineChart(model, title) {
  const { svg } = chartFrame(model, title);
  const floor = model.plot.y + model.plot.height;
  for (const tick of model.xTicks) {
    svg.append(
      svgEl(
        'text',
        {
          class: 'chart__tick',
          x: tick.x,
          y: floor + 18,
          'text-anchor': 'middle',
        },
        tick.label,
      ),
    );
  }
  svg.append(
    svgEl('line', {
      class: 'chart__budget',
      x1: model.plot.x,
      x2: model.plot.x + model.plot.width,
      y1: model.budgetY,
      y2: model.budgetY,
    }),
  );
  if (model.todayX !== null) {
    svg.append(
      svgEl('line', {
        class: 'chart__today',
        x1: model.todayX,
        x2: model.todayX,
        y1: model.plot.y,
        y2: floor,
      }),
      svgEl(
        'text',
        {
          class: 'chart__tick chart__today-label',
          x: model.todayX + 4,
          y: model.plot.y + 4,
          'dominant-baseline': 'hanging',
        },
        'Today',
      ),
    );
  }
  if (model.expectedPath) {
    svg.append(
      svgEl('path', { class: 'chart__expected', d: model.expectedPath }),
    );
  }
  if (model.actualPath) {
    svg.append(svgEl('path', { class: 'chart__actual', d: model.actualPath }));
  }
  return svg;
}
