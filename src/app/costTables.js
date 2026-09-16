// The tables of the costs section. The line items table lists every
// cost in the project, labor and materials together, and is the data
// behind the cumulative chart, with a line under it for the cost that
// is incurred but not yet invoiced. The week table is the visually
// hidden twin of the week chart.
import { formatDate, formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { bareButton } from '../ui/buttons.js';
import { dataTable } from '../ui/DataTable.js';
import { icon } from '../ui/icon.js';
import { openMaterialEditor } from './materialEditor.js';
import { openScheduleEditor } from './scheduleEditor.js';
import {
  costVariance,
  totalCostVariance,
  varianceCell,
} from './scheduleTable.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../costs/timeline.js').CostEvent} CostEvent */
/** @typedef {import('../costs/timeline.js').WeekTotal} WeekTotal */
/** @typedef {import('../ui/DataTable.js').SortState} SortState */
/** @typedef {import('../costs/summary.js').CostSummary} CostSummary */

const KIND = { schedule: 'Labor', material: 'Material' };

/**
 * @param {CostEvent} event
 * @returns {{ estimatedCents: number, actualCents: number | null }}
 */
const prices = (event) => ({
  estimatedCents: event.expectedCents,
  actualCents: event.actualCents,
});

/**
 * @param {string} a
 * @param {string} b
 */
const byText = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * Every cost in the project as one sortable table. The name opens the
 * editor of the schedule item or material behind the row.
 * @param {{
 *   ctx: AppContext,
 *   payload: ProjectPayload,
 *   events: CostEvent[],
 *   sort: SortState | null,
 *   onSort: (sort: SortState | null) => void,
 * }} config
 */
export function lineItemTable({ ctx, payload, events, sort, onSort }) {
  let expected = 0;
  let actual = 0;
  for (const event of events) {
    expected += event.expectedCents;
    actual += event.actualCents ?? 0;
  }

  /** @param {CostEvent} event */
  function open(event) {
    if (event.source === 'schedule') {
      const item = payload.schedule.find((s) => s.id === event.id);
      if (item) openScheduleEditor({ ctx, item });
    } else {
      const item = payload.materials.find((m) => m.id === event.id);
      if (item) openMaterialEditor({ ctx, item });
    }
  }

  return dataTable({
    caption: `Line items in ${payload.project.name}`,
    rows: events,
    rowKey: (event) => `${event.source}:${event.id}`,
    rowClass: (event) => (event.complete ? 'cost-row--complete' : ''),
    sort,
    onSort,
    footer: [
      '',
      'Total',
      '',
      '',
      formatCents(expected),
      formatCents(actual),
      varianceCell(totalCostVariance(events.map(prices))),
    ],
    columns: [
      {
        key: 'complete',
        label: 'Done',
        hideLabel: true,
        align: 'center',
        compare: (a, b) => Number(a.complete) - Number(b.complete),
        cell: (event) =>
          event.complete ? icon('check', { label: 'Done' }) : '',
      },
      {
        key: 'title',
        label: 'Item',
        compare: (a, b) => byText(a.title, b.title),
        cell: (event) =>
          bareButton({
            className: 'cost-item',
            label: event.title,
            onClick: () => open(event),
          }),
      },
      {
        key: 'kind',
        label: 'Kind',
        compare: (a, b) => byText(KIND[a.source], KIND[b.source]),
        cell: (event) => KIND[event.source],
      },
      {
        key: 'date',
        label: 'Lands',
        nowrap: true,
        compare: (a, b) => byText(a.date, b.date),
        cell: (event) => formatDayMonth(event.date),
      },
      {
        key: 'expected',
        label: 'Estimate',
        align: 'end',
        compare: (a, b) => a.expectedCents - b.expectedCents,
        cell: (event) => formatCents(event.expectedCents),
      },
      {
        key: 'actual',
        label: 'Actual',
        align: 'end',
        compare: (a, b) => (a.actualCents ?? -1) - (b.actualCents ?? -1),
        cell: (event) => formatCents(event.actualCents),
      },
      {
        key: 'variance',
        label: 'Vs estimate',
        align: 'end',
        compare: (a, b) =>
          (costVariance(prices(a)) ?? -Infinity) -
          (costVariance(prices(b)) ?? -Infinity),
        cell: (event) => varianceCell(costVariance(prices(event))),
      },
    ],
  });
}

/**
 * The cost that is incurred but not invoiced: the estimate on every
 * complete row with no actual price entered yet. Reads "1 finished row
 * with no actual yet" under the label so the rule is on the page.
 * @param {CostSummary} summary
 * @returns {HTMLElement}
 */
export function accruedLine(summary) {
  const el = document.createElement('div');
  el.className = 'fact-line fact-line--row cost-accrued';
  const text = document.createElement('div');
  text.className = 'fact-line';
  const label = document.createElement('span');
  label.className = 'fact-line__label';
  label.textContent = 'Incurred, not invoiced';
  const note = document.createElement('span');
  note.className = 'cost-accrued__note u-muted';
  const rows = summary.accruedCount === 1 ? 'row' : 'rows';
  note.textContent = `${summary.accruedCount} finished ${rows} with no actual yet`;
  text.append(label, note);
  const value = document.createElement('span');
  value.className = 'fact-line__value';
  value.textContent = formatCents(summary.accruedCents);
  el.append(text, value);
  return el;
}

/**
 * The hidden twin of the week chart.
 * @param {WeekTotal[]} weeks
 * @returns {HTMLTableElement}
 */
export function weekTable(weeks) {
  const el = document.createElement('table');
  el.className = 'sr-only';
  const cap = document.createElement('caption');
  cap.textContent = 'Cost by week';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const text of ['Week of', 'Expected', 'Actual']) {
    const th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = text;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const w of weeks) {
    const tr = document.createElement('tr');
    for (const text of [
      formatDate(w.week),
      formatCents(w.expectedCents),
      formatCents(w.actualCents),
    ]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    tbody.append(tr);
  }
  el.append(cap, thead, tbody);
  return el;
}
