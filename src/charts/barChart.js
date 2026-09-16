// Cost by week. One bar per week for the expected cost, with the paid
// amount drawn over it at the same width, so a week paid in full covers
// its estimate and a week paid over it shows the overrun above. The x
// axis has the same two rows as the cumulative chart: the day number of
// each Sunday under its bar, and the month name under the first bar in
// each month. A long project has more weeks than the axis has room to
// number, so only every nth bar gets a day number.
import { formatMonthShort } from '../format/date.js';
import { formatAxisCents, linear, moneyAxis } from './axes.js';
import { chartFrame, svgEl } from './svg.js';

/** @typedef {import('../costs/timeline.js').WeekTotal} WeekTotal */

/**
 * @typedef {object} BarChartInput
 * @property {WeekTotal[]} weeks
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} Bar
 * @property {string} week YYYY-MM-DD, the Sunday the week starts on
 * @property {string} label the day number, or empty when the axis is too tight
 * @property {number} x
 * @property {number} width
 * @property {number} expectedY
 * @property {number} expectedHeight
 * @property {number} actualY
 * @property {number} actualHeight
 * @property {number} expectedCents
 * @property {number} actualCents
 */

/**
 * @typedef {object} BarChartModel
 * @property {number} width
 * @property {number} height
 * @property {{ x: number, y: number, width: number, height: number }} plot
 * @property {{ value: number, y: number, label: string }[]} yTicks
 * @property {Bar[]} bars
 * @property {{ month: string, x: number, label: string }[]} monthTicks one
 * per month that a bar starts in, at the left edge of that first bar
 */

const PAD = { top: 12, right: 16, bottom: 40, left: 56 };
const GAP_RATIO = 0.45;
/** Room a day number needs, in svg units. */
const LABEL_WIDTH = 22;
/** Room a month name with its year needs, in svg units. */
const MONTH_LABEL = 90;

/** @param {number} n */
const r = (n) => Math.round(n * 10) / 10;

/**
 * @param {BarChartInput} input
 * @returns {BarChartModel}
 */
export function barChartModel({ weeks, width = 960, height = 170 }) {
  const plot = {
    x: PAD.left,
    y: PAD.top,
    width: width - PAD.left - PAD.right,
    height: height - PAD.top - PAD.bottom,
  };
  const top = Math.max(
    0,
    ...weeks.map((w) => Math.max(w.expectedCents, w.actualCents)),
  );
  const axis = moneyAxis(top);
  const scaleY = linear(axis.max, plot.height);
  const floorY = plot.y + plot.height;
  const slot = weeks.length === 0 ? 0 : plot.width / weeks.length;
  const barWidth = slot * (1 - GAP_RATIO);
  const labelEvery =
    slot === 0 ? 1 : Math.max(1, Math.ceil(LABEL_WIDTH / slot));

  const bars = weeks.map((w, i) => {
    const expectedHeight = r(scaleY(w.expectedCents));
    const actualHeight = r(scaleY(w.actualCents));
    return {
      week: w.week,
      label: i % labelEvery === 0 ? String(Number(w.week.slice(8))) : '',
      x: r(plot.x + slot * i + (slot - barWidth) / 2),
      width: r(barWidth),
      expectedY: r(floorY - expectedHeight),
      expectedHeight,
      actualY: r(floorY - actualHeight),
      actualHeight,
      expectedCents: w.expectedCents,
      actualCents: w.actualCents,
    };
  });

  // A month with one bar, whose name would run into the next month's,
  // gives its place to that next month. The year the dropped month
  // would have shown moves to the survivor.
  /** @type {{ month: string, x: number, year: boolean, bars: number }[]} */
  const months = [];
  for (const bar of bars) {
    const month = bar.week.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) {
      last.bars += 1;
      continue;
    }
    const year = months.length === 0 || month.endsWith('-01');
    const next = { month, x: bar.x, year, bars: 1 };
    if (last && last.bars === 1 && bar.x - last.x < MONTH_LABEL) {
      next.year = year || last.year;
      months[months.length - 1] = next;
    } else {
      months.push(next);
    }
  }
  const monthTicks = months.map(({ month, x, year }) => ({
    month,
    x,
    label: formatMonthShort(month, { year }),
  }));

  return {
    width,
    height,
    plot,
    yTicks: axis.values.map((value) => ({
      value,
      y: r(floorY - scaleY(value)),
      label: formatAxisCents(value),
    })),
    bars,
    monthTicks,
  };
}

/**
 * @param {BarChartModel} model
 * @param {string} title read by a screen reader
 * @returns {SVGElement}
 */
export function renderBarChart(model, title) {
  const { svg } = chartFrame(model, title);
  const floor = model.plot.y + model.plot.height;
  for (const bar of model.bars) {
    svg.append(
      svgEl('rect', {
        class: 'chart__expected-bar',
        'data-week': bar.week,
        x: bar.x,
        y: bar.expectedY,
        width: bar.width,
        height: bar.expectedHeight,
      }),
    );
    if (bar.actualHeight > 0) {
      svg.append(
        svgEl('rect', {
          class: 'chart__actual-bar',
          x: bar.x,
          y: bar.actualY,
          width: bar.width,
          height: bar.actualHeight,
        }),
      );
    }
    const center = r(bar.x + bar.width / 2);
    svg.append(
      svgEl('line', {
        class: 'chart__tick-mark',
        x1: center,
        x2: center,
        y1: floor,
        y2: floor + 4,
      }),
    );
    if (bar.label) {
      svg.append(
        svgEl(
          'text',
          {
            class: 'chart__tick chart__tick--week',
            x: center,
            y: floor + 15,
            'text-anchor': 'middle',
          },
          bar.label,
        ),
      );
    }
  }
  for (const tick of model.monthTicks) {
    svg.append(
      svgEl(
        'text',
        { class: 'chart__tick chart__tick--month', x: tick.x, y: floor + 31 },
        tick.label,
      ),
    );
  }
  return svg;
}
