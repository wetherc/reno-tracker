// The costs section: five summary tiles over two charts. The tiles are
// also the legend. Budget, Committed, and Spent each carry the mark of
// the line that draws them, so the chart needs no key of its own. Each
// chart has a visually hidden table twin with the same numbers.
import { barChartModel, renderBarChart } from '../charts/barChart.js';
import { lineChartModel, renderLineChart } from '../charts/lineChart.js';
import { costSummary } from '../costs/summary.js';
import { byMonth, costEvents, cumulative } from '../costs/timeline.js';
import { formatDate, formatMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { addDays, todayIso } from '../schedule/dates.js';
import { emptyState } from '../ui/emptyState.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../costs/summary.js').CostSummary} CostSummary */
/** @typedef {import('../costs/timeline.js').CostEvent} CostEvent */
/** @typedef {import('../costs/timeline.js').MonthTotal} MonthTotal */

/**
 * The days the cumulative chart spans: from the project start or the
 * first cost, whichever is earlier, to a week past the last cost or
 * today, whichever is later. The week gives the last step a flat run so
 * it reads as a plateau and not as a spike at the edge.
 * @param {ProjectPayload} payload
 * @param {CostEvent[]} events
 * @param {string} today
 * @returns {{ start: string, end: string }}
 */
export function chartRange(payload, events, today) {
  const dates = events.map((e) => e.date);
  const first = dates[0] ?? payload.project.startDate;
  const last = dates[dates.length - 1] ?? payload.project.startDate;
  const start =
    first < payload.project.startDate ? first : payload.project.startDate;
  const end = [last, today, start].sort()[2];
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
 * @returns {Tile[]}
 */
export function summaryTiles(summary) {
  const over = summary.remainingCents < 0;
  return [
    {
      label: 'Budget',
      value: formatCents(summary.budgetCents),
      mark: 'budget',
    },
    {
      label: 'Committed',
      value: formatCents(summary.committedCents),
      note: 'every estimate',
      mark: 'expected',
    },
    {
      label: 'Spent',
      value: formatCents(summary.spentCents),
      note: 'paid on finished rows',
      mark: 'actual',
    },
    {
      label: over ? 'Over budget' : 'Remaining',
      value: formatCents(Math.abs(summary.remainingCents)),
      note: `${formatCents(summary.projectedCents)} projected`,
      over,
    },
    {
      label: 'Complete',
      value: `${summary.percentComplete}%`,
      note: 'of schedule and materials',
    },
  ];
}

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the tiles and charts
 */
export function mountCosts({ ctx, shell }) {
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
    const months = byMonth(events);
    const range = chartRange(payload, events, today);
    const line = lineChartModel({
      expected: cumulative(events, 'expectedCents'),
      actual: cumulative(events, 'actualCents'),
      budgetCents: payload.project.budgetCents,
      today,
      ...range,
    });
    const bars = barChartModel({ months });

    const root = document.createElement('div');
    root.className = 'costs';
    root.append(
      tiles(summary),
      chartCard(
        'Cost over time',
        renderLineChart(line, `Cumulative cost of ${payload.project.name}`),
        eventTable(events),
      ),
      chartCard(
        'Cost by month',
        renderBarChart(bars, `Cost of ${payload.project.name} by month`),
        monthTable(months),
      ),
    );
    shell.setBody(root);
  }

  return { show };
}

/** @param {CostSummary} summary */
function tiles(summary) {
  const list = document.createElement('dl');
  list.className = 'cost-tiles';
  for (const tile of summaryTiles(summary)) {
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
 * @param {string} heading
 * @param {SVGElement} svg
 * @param {HTMLTableElement} table the hidden twin
 */
function chartCard(heading, svg, table) {
  const card = document.createElement('section');
  card.className = 'card cost-card';
  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = heading;
  const figure = document.createElement('figure');
  figure.className = 'cost-figure';
  figure.append(svg);
  table.className = 'sr-only';
  card.append(title, figure, table);
  return card;
}

/**
 * @param {string} caption
 * @param {string[]} head
 * @param {(string | number)[][]} rows
 */
function table(caption, head, rows) {
  const el = document.createElement('table');
  const cap = document.createElement('caption');
  cap.textContent = caption;
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const text of head) {
    const th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = text;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = String(cell);
      tr.append(td);
    }
    tbody.append(tr);
  }
  el.append(cap, thead, tbody);
  return el;
}

/** @param {CostEvent[]} events */
function eventTable(events) {
  let expected = 0;
  let actual = 0;
  return table(
    'Each cost by the day it lands, with running totals',
    ['Day', 'Cost', 'Expected', 'Actual', 'Expected so far', 'Actual so far'],
    events.map((e) => {
      expected += e.expectedCents;
      actual += e.actualCents ?? 0;
      return [
        formatDate(e.date),
        e.title,
        formatCents(e.expectedCents),
        formatCents(e.actualCents),
        formatCents(expected),
        formatCents(actual),
      ];
    }),
  );
}

/** @param {MonthTotal[]} months */
function monthTable(months) {
  return table(
    'Cost by month',
    ['Month', 'Expected', 'Actual'],
    months.map((m) => [
      formatMonth(m.month),
      formatCents(m.expectedCents),
      formatCents(m.actualCents),
    ]),
  );
}
