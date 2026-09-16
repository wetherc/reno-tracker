// Cost by week. One bar per week for the expected cost, with a narrower
// bar inside it for what has been paid so far. A long project has more
// weeks than the axis has room to name, so only every nth bar gets a
// label, spaced so two labels never overlap.
import { formatDayMonth } from '../format/date.js';
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
 * @property {string} label the start day, or empty when the axis is too tight
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
 */

const PAD = { top: 12, right: 16, bottom: 28, left: 56 };
const GAP_RATIO = 0.3;
/** Room one label needs, in svg units. */
const LABEL_WIDTH = 52;

/** @param {number} n */
const r = (n) => Math.round(n * 10) / 10;

/**
 * @param {BarChartInput} input
 * @returns {BarChartModel}
 */
export function barChartModel({ weeks, width = 960, height = 220 }) {
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

  return {
    width,
    height,
    plot,
    yTicks: axis.values.map((value) => ({
      value,
      y: r(floorY - scaleY(value)),
      label: formatAxisCents(value),
    })),
    bars: weeks.map((w, i) => {
      const expectedHeight = r(scaleY(w.expectedCents));
      const actualHeight = r(scaleY(w.actualCents));
      return {
        week: w.week,
        label: i % labelEvery === 0 ? formatDayMonth(w.week) : '',
        x: r(plot.x + slot * i + (slot - barWidth) / 2),
        width: r(barWidth),
        expectedY: r(floorY - expectedHeight),
        expectedHeight,
        actualY: r(floorY - actualHeight),
        actualHeight,
        expectedCents: w.expectedCents,
        actualCents: w.actualCents,
      };
    }),
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
      const inset = bar.width / 4;
      svg.append(
        svgEl('rect', {
          class: 'chart__actual-bar',
          x: r(bar.x + inset),
          y: bar.actualY,
          width: r(bar.width - inset * 2),
          height: bar.actualHeight,
        }),
      );
    }
    if (bar.label) {
      svg.append(
        svgEl(
          'text',
          {
            class: 'chart__tick',
            x: r(bar.x + bar.width / 2),
            y: floor + 18,
            'text-anchor': 'middle',
          },
          bar.label,
        ),
      );
    }
  }
  return svg;
}
