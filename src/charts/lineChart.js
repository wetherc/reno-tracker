// The cumulative cost chart. Two running totals over the life of the
// project, expected and actual, against the budget. A cost lands on one
// day, so each line is a staircase: flat until a cost lands, then a
// vertical step. Both lines run flat to the end of the range after
// their last step, so the three lines end at the same edge. Today is a
// vertical marker only. The x axis has two rows: a tick with the day
// number on every Sunday, and the month name under the first day of
// each month, so a step can be read against a week and not only a month.
import {
  addDays,
  addMonths,
  monthBounds,
  monthOf,
  startOfWeek,
} from '../schedule/dates.js';
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
 * @typedef {object} Marker one day that a cost lands on
 * @property {string} date
 * @property {number} x
 * @property {number} y on the expected line
 * @property {number} expectedCents running total that day
 * @property {number | null} actualCents running total, null before any actual
 */

/**
 * @typedef {object} LineChartModel
 * @property {number} width
 * @property {number} height
 * @property {{ x: number, y: number, width: number, height: number }} plot
 * @property {{ value: number, y: number, label: string }[]} yTicks
 * @property {{ month: string, x: number, label: string }[]} xTicks one per
 * month start on the axis
 * @property {{ date: string, x: number, label: string }[]} weekTicks one per
 * Sunday on the axis; the label is empty where the weeks sit too close
 * @property {string} expectedPath SVG path data, empty when there are no points
 * @property {string} actualPath
 * @property {number} budgetY
 * @property {number | null} todayX null when today is off the axis
 * @property {Marker[]} markers one per day in either series, in date order
 */

const PAD = { top: 12, right: 16, bottom: 40, left: 56 };
/** Room a day number needs, in svg units. */
const WEEK_LABEL = 22;

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
 * The running total of a series on a day: the last point on or before it.
 * @param {SeriesPoint[]} points
 * @param {string} date
 * @returns {number | null} null before the first point
 */
function totalOn(points, date) {
  let total = null;
  for (const point of points) {
    if (point.date > date) break;
    total = point.cents;
  }
  return total;
}

/**
 * One marker per day that appears in either series.
 * @param {SeriesPoint[]} expected
 * @param {SeriesPoint[]} actual
 * @param {(date: string) => number} x
 * @param {(cents: number) => number} y
 * @returns {Marker[]}
 */
export function markersOf(expected, actual, x, y) {
  const dates = [...new Set([...expected, ...actual].map((p) => p.date))];
  return dates.sort().map((date) => {
    const expectedCents = totalOn(expected, date) ?? 0;
    return {
      date,
      x: r(x(date)),
      y: r(y(expectedCents)),
      expectedCents,
      actualCents: totalOn(actual, date),
    };
  });
}

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
  height = 220,
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

  /** @type {LineChartModel['weekTicks']} */
  const weekTicks = [];
  const sunday = startOfWeek(start);
  const slot = scaleX(addDays(start, 7));
  const every = Math.max(1, Math.ceil(WEEK_LABEL / slot));
  for (let d = sunday < start ? addDays(sunday, 7) : sunday; d <= end;) {
    const i = weekTicks.length;
    weekTicks.push({
      date: d,
      x: r(x(d)),
      label: i % every === 0 ? String(Number(d.slice(8))) : '',
    });
    d = addDays(d, 7);
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
    weekTicks,
    expectedPath: stepPath(expected, x, y, floorY, rightX),
    actualPath: stepPath(actual, x, y, floorY, rightX),
    budgetY: r(y(budgetCents)),
    todayX: inRange ? r(x(today)) : null,
    markers: markersOf(expected, actual, x, y),
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
  for (const tick of model.weekTicks) {
    svg.append(
      svgEl('line', {
        class: 'chart__tick-mark',
        x1: tick.x,
        x2: tick.x,
        y1: floor,
        y2: floor + 4,
      }),
    );
    if (!tick.label) continue;
    svg.append(
      svgEl(
        'text',
        {
          class: 'chart__tick chart__tick--week',
          x: tick.x,
          y: floor + 15,
          'text-anchor': 'middle',
        },
        tick.label,
      ),
    );
  }
  for (const tick of model.xTicks) {
    if (tick.x > model.plot.x) {
      svg.append(
        svgEl('line', {
          class: 'chart__grid chart__grid--month',
          x1: tick.x,
          x2: tick.x,
          y1: model.plot.y,
          y2: floor + 6,
        }),
      );
    }
    svg.append(
      svgEl(
        'text',
        {
          class: 'chart__tick chart__tick--month',
          x: tick.x + 3,
          y: floor + 31,
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
  // Each mark is a dot on the expected line and a plumb line down to
  // the axis. The line is drawn only while the mark is picked, so the
  // day can be read against the week ticks.
  for (const marker of model.markers) {
    svg.append(
      svgEl(
        'g',
        { class: 'chart__mark', 'data-date': marker.date },
        svgEl('line', {
          class: 'chart__plumb',
          x1: marker.x,
          x2: marker.x,
          y1: marker.y,
          y2: floor,
        }),
        svgEl('circle', {
          class: 'chart__marker',
          cx: marker.x,
          cy: marker.y,
          r: 3,
        }),
      ),
    );
  }
  return svg;
}
