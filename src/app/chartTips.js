// The callout that opens over a picked mark on a cost chart. A day on
// the cumulative chart lists the rows that land on it with their
// amounts, then the two running totals and the room left in the budget.
// A week on the bar chart shows its two totals. Each total wears the
// same mark as the tile and the line it stands for. The picker owns the
// box, so these builders return only its contents.
import { formatDate, formatWeekday } from '../format/date.js';
import { formatCents } from '../format/money.js';

/** @typedef {import('../charts/lineChart.js').Marker} Marker */
/** @typedef {import('../charts/barChart.js').Bar} Bar */
/** @typedef {import('../costs/timeline.js').CostEvent} CostEvent */

/** @typedef {{ label: string, value: string, mark?: 'budget' | 'expected' | 'actual', over?: boolean }} TipTotal */

/**
 * @param {Marker} marker
 * @param {CostEvent[]} landing the rows that land that day
 * @param {number} budgetCents
 * @returns {HTMLElement}
 */
export function markerTip(marker, landing, budgetCents) {
  const left = budgetCents - marker.expectedCents;
  return tip(
    `${formatWeekday(marker.date)}, ${formatDate(marker.date)}`,
    landing.map((event) => [event.title, formatCents(event.expectedCents)]),
    [
      {
        label: 'Expected so far',
        value: formatCents(marker.expectedCents),
        mark: 'expected',
      },
      {
        label: 'Paid so far',
        value:
          marker.actualCents === null
            ? 'nothing yet'
            : formatCents(marker.actualCents),
        mark: 'actual',
      },
      left >= 0
        ? { label: 'Budget left', value: formatCents(left), mark: 'budget' }
        : { label: 'Over budget', value: formatCents(-left), over: true },
    ],
  );
}

/**
 * @param {Bar} bar
 * @returns {HTMLElement}
 */
export function weekTip(bar) {
  return tip(
    `Week of ${formatDate(bar.week)}`,
    [],
    [
      { label: 'Estimate', value: formatCents(bar.expectedCents) },
      { label: 'Paid', value: formatCents(bar.actualCents), mark: 'actual' },
    ],
  );
}

/**
 * @param {string} heading
 * @param {[string, string][]} rows name and amount per line
 * @param {TipTotal[]} totals
 * @returns {HTMLElement}
 */
function tip(heading, rows, totals) {
  const root = document.createElement('div');
  root.className = 'chart-tip__body';
  const title = document.createElement('p');
  title.className = 'chart-tip__date';
  title.textContent = heading;
  root.append(title);
  if (rows.length) {
    const list = document.createElement('ul');
    list.className = 'chart-tip__rows';
    for (const [name, amount] of rows) {
      const li = document.createElement('li');
      li.className = 'chart-tip__row';
      li.append(
        span('chart-tip__name', name),
        span('chart-tip__amount', amount),
      );
      list.append(li);
    }
    root.append(list);
  }
  const dl = document.createElement('dl');
  dl.className = 'chart-tip__totals';
  for (const total of totals) {
    const dt = document.createElement('dt');
    dt.className = total.over
      ? 'chart-tip__label chart-tip__label--over'
      : 'chart-tip__label';
    if (total.mark) {
      const mark = document.createElement('span');
      mark.className = `cost-tile__mark cost-tile__mark--${total.mark}`;
      mark.setAttribute('aria-hidden', 'true');
      dt.append(mark);
    }
    dt.append(total.label);
    const dd = document.createElement('dd');
    dd.className = total.over
      ? 'chart-tip__amount chart-tip__amount--over'
      : 'chart-tip__amount';
    dd.textContent = total.value;
    dl.append(dt, dd);
  }
  root.append(dl);
  return root;
}

/**
 * @param {string} className
 * @param {string} text
 */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}
