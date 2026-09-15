// Cost by month. One bar per calendar month for the expected cost, with
// a narrower bar inside it for what has been paid so far.
import { formatMonthShort } from '../format/date.js';
import { formatAxisCents, linear, moneyAxis } from './axes.js';
import { chartFrame, svgEl } from './svg.js';

/** @typedef {import('../costs/timeline.js').MonthTotal} MonthTotal */

/**
 * @typedef {object} BarChartInput
 * @property {MonthTotal[]} months
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} Bar
 * @property {string} month YYYY-MM
 * @property {string} label
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

/** @param {number} n */
const r = (n) => Math.round(n * 10) / 10;

/**
 * @param {BarChartInput} input
 * @returns {BarChartModel}
 */
export function barChartModel({ months, width = 720, height = 220 }) {
  const plot = {
    x: PAD.left,
    y: PAD.top,
    width: width - PAD.left - PAD.right,
    height: height - PAD.top - PAD.bottom,
  };
  const top = Math.max(
    0,
    ...months.map((m) => Math.max(m.expectedCents, m.actualCents)),
  );
  const axis = moneyAxis(top);
  const scaleY = linear(axis.max, plot.height);
  const floorY = plot.y + plot.height;
  const slot = months.length === 0 ? 0 : plot.width / months.length;
  const barWidth = slot * (1 - GAP_RATIO);

  return {
    width,
    height,
    plot,
    yTicks: axis.values.map((value) => ({
      value,
      y: r(floorY - scaleY(value)),
      label: formatAxisCents(value),
    })),
    bars: months.map((m, i) => {
      const expectedHeight = r(scaleY(m.expectedCents));
      const actualHeight = r(scaleY(m.actualCents));
      return {
        month: m.month,
        label: formatMonthShort(m.month, {
          year: i === 0 || m.month.endsWith('-01'),
        }),
        x: r(plot.x + slot * i + (slot - barWidth) / 2),
        width: r(barWidth),
        expectedY: r(floorY - expectedHeight),
        expectedHeight,
        actualY: r(floorY - actualHeight),
        actualHeight,
        expectedCents: m.expectedCents,
        actualCents: m.actualCents,
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
  return svg;
}
