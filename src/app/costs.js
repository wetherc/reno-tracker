// The costs section: seven summary tiles over two charts and the list
// of every line item. Budget less Projected is the headroom, and the
// Projected tile splits its total into base cost and markup, so the
// tiles add up. The tiles are also the legend. Budget, Committed,
// and Spent each show the mark of the line that draws them, so the
// chart needs no key of its own. The line items table is the data
// behind the cumulative chart, and the week chart has a visually
// hidden table twin.
import { barChartModel, renderBarChart } from '../charts/barChart.js';
import { lineChartModel, renderLineChart } from '../charts/lineChart.js';
import { progress } from '../costs/progress.js';
import { costSummary } from '../costs/summary.js';
import {
  byWeek,
  costEvents,
  cumulative,
  invoiceEvents,
} from '../costs/timeline.js';
import { formatDate } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { addDays, todayIso } from '../schedule/dates.js';
import { emptyState } from '../ui/emptyState.js';
import { chartPicker } from './chartPicker.js';
import { markerTip, weekTip } from './chartTips.js';
import { tableScroll } from '../ui/DataTable.js';
import { accruedLine, lineItemTable, weekTable } from './costTables.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../costs/summary.js').CostSummary} CostSummary */
/** @typedef {import('../costs/progress.js').Progress} Progress */
/** @typedef {import('../costs/timeline.js').CostEvent} CostEvent */
/** @typedef {import('../costs/timeline.js').InvoiceEvent} InvoiceEvent */
/** @typedef {import('../charts/lineChart.js').LineChartModel} LineChartModel */
/** @typedef {import('../charts/lineChart.js').Marker} Marker */
/** @typedef {import('../charts/barChart.js').BarChartModel} BarChartModel */
/** @typedef {import('../charts/barChart.js').Bar} Bar */
/** @typedef {import('./chartPicker.js').PickTarget} PickTarget */

/**
 * The days the cumulative chart spans: from the project start or the
 * first cost or invoice, whichever is earlier, to a week past the last
 * one. The
 * week gives the last step a flat run so it reads as a plateau and not
 * as a spike at the edge. Today does not stretch the axis, so a project
 * that finished months ago does not draw a long flat tail up to now.
 * @param {ProjectPayload} payload
 * @param {{ date: string }[]} dated the cost events and invoice events
 * @returns {{ start: string, end: string }}
 */
export function chartRange(payload, dated) {
  const dates = dated.map((e) => e.date).sort();
  const first = dates[0] ?? payload.project.startDate;
  const last = dates[dates.length - 1] ?? payload.project.startDate;
  const start =
    first < payload.project.startDate ? first : payload.project.startDate;
  const end = last > start ? last : start;
  return { start, end: addDays(end, 7) };
}

/**
 * @typedef {object} Tile
 * @property {string} label
 * @property {string} value
 * @property {string} [note] a second line under the value
 * @property {'budget' | 'expected' | 'actual'} [mark] the chart line it stands for
 * @property {boolean} [over] true paints the value in the danger colour
 */

/**
 * @param {CostSummary} summary
 * @param {Progress} progress
 * @returns {Tile[]}
 */
export function summaryTiles(summary, progress) {
  const over = summary.headroomCents < 0;
  return [
    {
      label: 'Budget',
      value: formatCents(summary.budgetCents),
      mark: 'budget',
    },
    {
      label: 'Committed',
      value: formatCents(summary.committedCents),
      note: 'every estimate, before invoices',
      mark: 'expected',
    },
    {
      label: 'Spent',
      value: formatCents(summary.spentCents),
      note: 'every invoice, paid or not',
      mark: 'actual',
    },
    {
      label: 'Projected',
      value: formatCents(summary.projectedCents),
      note:
        summary.markupCents > 0
          ? `${formatCents(summary.projectedCents - summary.markupCents)} base + ${formatCents(summary.markupCents)} markup`
          : 'invoiced price, else estimate',
    },
    {
      label: over ? 'Over budget' : 'Budget headroom',
      value: formatCents(Math.abs(summary.headroomCents)),
      note: 'budget minus projected',
      over,
    },
    {
      label: 'Work done',
      value: `${progress.percentWork}%`,
      note: `${progress.workdaysDone} of ${progress.workdaysAll} workdays done`,
    },
    {
      label: 'Materials bought',
      value: `${progress.percentMaterials}%`,
      note: materialsNote(progress),
    },
  ];
}

/**
 * "3 of 8 bought", plus how many of those still wait on an invoice.
 * @param {Progress} progress
 * @returns {string}
 */
export function materialsNote(progress) {
  const bought = `${progress.materialsBought} of ${progress.materialsAll} bought`;
  const open = progress.materialsUninvoiced;
  if (open === 0) return bought;
  return `${bought}, ${open} not yet invoiced`;
}

/**
 * The label for one day on the cumulative chart: the day, what landed
 * on it, both running totals, and where that leaves the budget.
 * @param {Marker} marker
 * @param {string[]} titles the rows that land and the invoices issued that day
 * @param {number} budgetCents
 * @returns {string}
 */
export function describeMarker(marker, titles, budgetCents) {
  const left = budgetCents - marker.expectedCents;
  const budget =
    left >= 0
      ? `${formatCents(left)} of budget left`
      : `${formatCents(-left)} over budget`;
  const actual =
    marker.actualCents === null
      ? 'nothing invoiced yet'
      : `${formatCents(marker.actualCents)} invoiced so far`;
  return [
    formatDate(marker.date),
    titles.join(', '),
    `${formatCents(marker.expectedCents)} expected so far`,
    actual,
    budget,
  ].join(' · ');
}

/**
 * The label for one week on the bar chart.
 * @param {Bar} bar
 * @returns {string}
 */
export function describeWeek(bar) {
  return [
    `Week of ${formatDate(bar.week)}`,
    `${formatCents(bar.expectedCents)} expected`,
    `${formatCents(bar.actualCents)} invoiced`,
  ].join(' · ');
}

/**
 * One target per marker on the cumulative chart, placed on the dot.
 * @param {LineChartModel} model
 * @param {CostEvent[]} events
 * @param {InvoiceEvent[]} invoices
 * @param {number} budgetCents
 * @param {SVGElement} svg
 * @returns {PickTarget[]}
 */
export function markerTargets(model, events, invoices, budgetCents, svg) {
  return model.markers.map((marker) => {
    const landing = events.filter((e) => e.date === marker.date);
    const issued = invoices.filter((e) => e.date === marker.date);
    return {
      text: describeMarker(
        marker,
        [...landing, ...issued].map((e) => e.title),
        budgetCents,
      ),
      left: pct(marker.x, model.width),
      top: pct(marker.y, model.height),
      highlight: toggler(
        svg,
        `[data-date="${marker.date}"]`,
        'chart__mark--active',
      ),
      detail: () => markerTip(marker, landing, issued, budgetCents),
    };
  });
}

/**
 * One target per week on the bar chart, covering the whole column.
 * @param {BarChartModel} model
 * @param {SVGElement} svg
 * @returns {PickTarget[]}
 */
export function weekTargets(model, svg) {
  const slot = model.bars.length ? model.plot.width / model.bars.length : 0;
  return model.bars.map((bar, i) => ({
    text: describeWeek(bar),
    left: pct(model.plot.x + slot * i, model.width),
    top: pct(model.plot.y, model.height),
    width: pct(slot, model.width),
    height: pct(model.plot.height, model.height),
    anchor: {
      left: pct(bar.x + bar.width / 2, model.width),
      top: pct(bar.expectedY, model.height),
    },
    highlight: toggler(
      svg,
      `[data-week="${bar.week}"]`,
      'chart__expected-bar--active',
    ),
    detail: () => weekTip(bar),
  }));
}

/** @param {number} part @param {number} whole */
const pct = (part, whole) => Math.round((part / whole) * 10000) / 100;

/**
 * @param {SVGElement} svg
 * @param {string} selector
 * @param {string} className
 * @returns {(on: boolean) => void}
 */
const toggler = (svg, selector, className) => (on) =>
  svg.querySelector(selector)?.classList.toggle(className, on);

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the tiles and charts
 */
export function mountCosts({ ctx, shell }) {
  // The sort a person picked outlives the rebuild after each write.
  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = null;

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    shell.tools.replaceChildren();
    const events = costEvents(payload);
    if (events.length === 0) {
      shell.setBody(
        emptyState(
          `No costs in ${payload.project.name} yet. Schedule items and materials show up here as soon as they have an estimate.`,
        ),
      );
      return;
    }
    const today = todayIso();
    const summary = costSummary(events, payload.project.budgetCents);
    const invoices = invoiceEvents(payload);
    const weeks = byWeek(events, invoices);
    const range = chartRange(payload, [...events, ...invoices]);
    const line = lineChartModel({
      expected: cumulative(
        events.map((e) => ({ date: e.date, cents: e.expectedCents })),
      ),
      actual: cumulative(invoices),
      budgetCents: payload.project.budgetCents,
      today,
      ...range,
    });
    const bars = barChartModel({ weeks });

    const root = document.createElement('div');
    root.className = 'costs';
    const items = lineItemTable({
      ctx,
      payload,
      events,
      sort,
      onSort: (next) => (sort = next),
    });
    const lineSvg = renderLineChart(
      line,
      `Cumulative cost of ${payload.project.name}`,
    );
    const barSvg = renderBarChart(
      bars,
      `Cost of ${payload.project.name} by week`,
    );
    root.append(
      tiles(summary, progress(payload)),
      chartCard(
        'Cost over time',
        lineSvg,
        markerTargets(
          line,
          events,
          invoices,
          payload.project.budgetCents,
          lineSvg,
        ),
      ),
      chartCard(
        'Cost by week',
        barSvg,
        weekTargets(bars, barSvg),
        weekTable(weeks),
        weekLegend(),
      ),
      listCard('Line items', items.el, accruedLine(summary), summary),
    );
    shell.setBody(root);
  }

  return { show };
}

/**
 * @param {CostSummary} summary
 * @param {Progress} progress
 */
function tiles(summary, progress) {
  const list = document.createElement('dl');
  list.className = 'cost-tiles';
  for (const tile of summaryTiles(summary, progress)) {
    const el = document.createElement('div');
    el.className = tile.over ? 'cost-tile cost-tile--over' : 'cost-tile';
    const label = document.createElement('dt');
    label.className = 'cost-tile__label';
    if (tile.mark) {
      const mark = document.createElement('span');
      mark.className = `cost-tile__mark cost-tile__mark--${tile.mark}`;
      mark.setAttribute('aria-hidden', 'true');
      label.append(mark);
    }
    label.append(tile.label);
    const value = document.createElement('dd');
    value.className = 'cost-tile__value';
    value.textContent = tile.value;
    el.append(label, value);
    if (tile.note) {
      const note = document.createElement('dd');
      note.className = 'cost-tile__note u-muted';
      note.textContent = tile.note;
      el.append(note);
    }
    list.append(el);
  }
  return list;
}

/**
 * The key for the week chart. The tiles are the key for the line chart,
 * but the week bars use a fill of their own, so they name it here.
 * @returns {HTMLUListElement}
 */
function weekLegend() {
  const list = document.createElement('ul');
  list.className = 'chart-legend';
  list.setAttribute('aria-label', 'Key');
  for (const [kind, text] of [
    ['expected', 'Estimate'],
    ['actual', 'Invoiced'],
  ]) {
    const li = document.createElement('li');
    li.className = 'chart-legend__item';
    const swatch = document.createElement('span');
    swatch.className = `chart-legend__swatch chart-legend__swatch--${kind}`;
    swatch.setAttribute('aria-hidden', 'true');
    li.append(swatch, text);
    list.append(li);
  }
  return list;
}

/**
 * @param {string} heading
 * @param {SVGElement} svg
 * @param {PickTarget[]} targets
 * @param {HTMLTableElement} [twin] a visually hidden table with the numbers
 * @param {HTMLElement} [legend] a key drawn between the heading and the chart
 */
function chartCard(heading, svg, targets, twin, legend) {
  const card = document.createElement('section');
  card.className = 'card cost-card';
  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = heading;
  const figure = document.createElement('figure');
  figure.className = 'cost-figure';
  figure.append(svg, chartPicker({ targets }));
  const scroll = document.createElement('div');
  scroll.className = 'cost-scroll';
  scroll.append(figure);
  card.append(title);
  if (legend) card.append(legend);
  card.append(scroll);
  if (twin) card.append(twin);
  return card;
}

/**
 * @param {string} heading
 * @param {HTMLTableElement} table
 * @param {HTMLElement} line a line under the table
 * @param {CostSummary} summary
 */
function listCard(heading, table, line, summary) {
  const card = document.createElement('section');
  card.className = 'card cost-card cost-card--list';
  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = heading;
  card.append(title, tableScroll(table), line);
  if (summary.markupCents > 0) {
    const note = document.createElement('p');
    note.className = 'cost-markup-note u-muted';
    note.textContent =
      'Every amount here includes the markup. The schedule and materials tables show base cost, and their Blended column matches the one here.';
    card.append(note);
  }
  return card;
}
