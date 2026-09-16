// The table view of the schedule: one row per item, a checkbox per row
// that marks the work done, and a title that opens the editor.
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { spanDays } from '../schedule/dates.js';
import { bareButton } from '../ui/buttons.js';
import { dataTable } from '../ui/DataTable.js';
import { icon } from '../ui/icon.js';
import { completeToggle } from './completeToggle.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/**
 * Actual minus estimate, or null until an actual is entered. Schedule
 * items and materials both carry the two prices, so both tables use it.
 * @param {{ estimatedCents: number, actualCents: number | null }} item
 * @returns {number | null}
 */
export function costVariance(item) {
  return item.actualCents === null
    ? null
    : item.actualCents - item.estimatedCents;
}

/**
 * The sum of costVariance over the rows that have an actual, or null
 * when none does.
 * @param {{ estimatedCents: number, actualCents: number | null }[]} items
 * @returns {number | null}
 */
export function totalCostVariance(items) {
  let total = null;
  for (const item of items) {
    const v = costVariance(item);
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

/**
 * @param {number | null} cents
 * @returns {HTMLSpanElement}
 */
export function varianceCell(cents) {
  const el = document.createElement('span');
  if (cents === null) {
    el.className = 'u-muted';
    el.append('—');
    return el;
  }
  if (cents > 0) {
    el.className = 'variance--over';
    el.append(`+${formatCents(cents)}`);
  } else if (cents < 0) {
    el.className = 'variance--under';
    el.append(`−${formatCents(-cents)}`);
  } else {
    el.append(formatCents(0));
  }
  return el;
}

/**
 * Column totals. Days is the sum of every row's length, so overlapping
 * rows count twice. Actual sums only the rows that have a price entered.
 * @param {ScheduleItem[]} items
 */
export function scheduleTotals(items) {
  const totals = { days: 0, estimatedCents: 0, actualCents: 0 };
  for (const item of items) {
    totals.days += spanDays(item.startDate, item.endDate);
    totals.estimatedCents += item.estimatedCents;
    totals.actualCents += item.actualCents ?? 0;
  }
  return totals;
}

/**
 * @param {string} a
 * @param {string} b
 */
const byText = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * @param {{ ctx: AppContext }} deps
 * @returns {{ render(payload: ProjectPayload): HTMLElement }}
 */
export function scheduleTable({ ctx }) {
  // The sort a person picked outlives the rebuild after each write.
  /** @type {import('../ui/DataTable.js').SortState | null} */
  let sort = null;

  /** @param {ProjectPayload} payload */
  function noteCounts(payload) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const note of payload.notes) {
      counts.set(
        note.scheduleItemId,
        (counts.get(note.scheduleItemId) ?? 0) + 1,
      );
    }
    return counts;
  }

  /** @param {ProjectPayload} payload */
  function buildTable(payload) {
    const counts = noteCounts(payload);
    const totals = scheduleTotals(payload.schedule);
    return dataTable({
      caption: `Schedule for ${payload.project.name}`,
      rows: payload.schedule,
      rowKey: (item) => item.id,
      rowClass: (item) => (item.complete ? 'schedule-row--complete' : ''),
      sort,
      onSort: (next) => (sort = next),
      footer: [
        '',
        'Total',
        '',
        '',
        '',
        String(totals.days),
        formatCents(totals.estimatedCents),
        formatCents(totals.actualCents),
        varianceCell(totalCostVariance(payload.schedule)),
        '',
      ],
      columns: [
        {
          key: 'complete',
          label: 'Done',
          hideLabel: true,
          align: 'center',
          cell: (item) => completeToggle({ ctx, item }),
        },
        {
          key: 'title',
          label: 'Item',
          compare: (a, b) => byText(a.title, b.title),
          cell: (item) =>
            bareButton({
              className: 'schedule-title',
              children: item.complete
                ? [icon('check', { label: 'Complete' }), item.title]
                : [item.title],
              onClick: () => openScheduleEditor({ ctx, item }),
            }),
        },
        {
          key: 'party',
          label: 'Who',
          compare: (a, b) => byText(a.responsibleParty, b.responsibleParty),
          cell: (item) => item.responsibleParty || '—',
        },
        {
          key: 'start',
          label: 'Start',
          nowrap: true,
          compare: (a, b) => byText(a.startDate, b.startDate),
          cell: (item) => formatDayMonth(item.startDate),
        },
        {
          key: 'end',
          label: 'End',
          nowrap: true,
          compare: (a, b) => byText(a.endDate, b.endDate),
          cell: (item) => formatDayMonth(item.endDate),
        },
        {
          key: 'days',
          label: 'Days',
          align: 'end',
          compare: (a, b) => days(a) - days(b),
          cell: (item) => String(days(item)),
        },
        {
          key: 'estimate',
          label: 'Estimate',
          align: 'end',
          compare: (a, b) => a.estimatedCents - b.estimatedCents,
          cell: (item) => formatCents(item.estimatedCents),
        },
        {
          key: 'actual',
          label: 'Actual',
          align: 'end',
          compare: (a, b) => (a.actualCents ?? -1) - (b.actualCents ?? -1),
          cell: (item) => formatCents(item.actualCents),
        },
        {
          key: 'variance',
          label: 'Variance',
          align: 'end',
          compare: (a, b) =>
            (costVariance(a) ?? -Infinity) - (costVariance(b) ?? -Infinity),
          cell: (item) => varianceCell(costVariance(item)),
        },
        {
          key: 'notes',
          label: 'Notes',
          align: 'end',
          compare: (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0),
          cell: (item) => notesCell(item, counts.get(item.id) ?? 0),
        },
      ],
    });
  }

  /** @param {ScheduleItem} item */
  const days = (item) => spanDays(item.startDate, item.endDate);

  /** @param {ScheduleItem} item @param {number} count */
  function notesCell(item, count) {
    return bareButton({
      className: count === 0 ? 'u-num u-muted' : 'u-num',
      label: String(count),
      ariaLabel: `${count} notes on ${item.title}`,
      onClick: () => openScheduleEditor({ ctx, item, tab: 'notes' }),
    });
  }

  return {
    render: (payload) => buildTable(payload).el,
  };
}
