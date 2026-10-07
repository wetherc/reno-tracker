// The table view of the schedule: one row per item, a checkbox per row
// that marks the work done, and a title that opens the editor. Estimate
// and Actual are raw cost. Estimate adds the row's approved change
// orders. Blended is what the costs panel counts for the row, with its
// margin.
import { addedCents, approvedChanges } from '../costs/changed.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { spanDays, todayIso } from '../schedule/dates.js';
import { readSort, sortText } from '../storage/prefs.js';
import { bareButton } from '../ui/buttons.js';
import { byText, dataTable, tableScroll } from '../ui/DataTable.js';
import { focusKey } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { estimateCell } from './changeEstimates.js';
import { completeToggle } from './completeToggle.js';
import { lateBadge } from './lateBadge.js';
import { blendedColumn, projections } from './rowMarkup.js';
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
 * The two prices of an item, with its estimate raised by its approved
 * change orders. The row itself keeps the typed estimate, because the
 * editor opens on it and saves it back.
 * @param {ScheduleItem} item
 * @param {import('../costs/changed.js').Changes} changes
 * @returns {{ estimatedCents: number, actualCents: number | null }}
 */
export function revisedPrices(item, changes) {
  return {
    estimatedCents: item.estimatedCents + addedCents(changes, item.id),
    actualCents: item.actualCents,
  };
}

/**
 * Column totals. Days is the sum of every row's length, so overlapping
 * rows count twice. Estimate adds each row's approved change orders.
 * Actual sums only the rows that have a price entered.
 * @param {ScheduleItem[]} items
 * @param {import('../costs/changed.js').Changes} changes
 */
export function scheduleTotals(items, changes) {
  const totals = { days: 0, estimatedCents: 0, actualCents: 0 };
  for (const item of items) {
    totals.days += spanDays(item.startDate, item.endDate);
    totals.estimatedCents += revisedPrices(item, changes).estimatedCents;
    totals.actualCents += item.actualCents ?? 0;
  }
  return totals;
}

/**
 * @param {{ ctx: AppContext }} deps
 * @returns {{ render(payload: ProjectPayload): HTMLElement }}
 */
export function scheduleTable({ ctx }) {
  // The table opens in date order. The sort a person picks outlives the
  // rebuild after each write, and prefs keep it for the next visit.
  /** @type {import('../ui/DataTable.js').SortState} */
  let sort = readSort(ctx.prefs.read('scheduleSort')) ?? {
    key: 'start',
    dir: 'asc',
  };

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
    const changes = approvedChanges(payload.changeOrders);
    /** @param {ScheduleItem} item */
    const revised = (item) => revisedPrices(item, changes);
    const totals = scheduleTotals(payload.schedule, changes);
    const today = todayIso();
    const blended = blendedColumn(projections(payload), payload.schedule);
    return dataTable({
      caption: `Schedule for ${payload.project.name}`,
      rows: payload.schedule,
      rowKey: (item) => item.id,
      rowClass: (item) => (item.complete ? 'schedule-row--complete' : ''),
      sort,
      onSort: (next) => {
        sort = next;
        ctx.prefs.write('scheduleSort', sortText(next));
      },
      footer: [
        '',
        'Total',
        '',
        '',
        '',
        String(totals.days),
        formatCents(totals.estimatedCents),
        formatCents(totals.actualCents),
        varianceCell(totalCostVariance(payload.schedule.map(revised))),
        blended.footer,
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
          cell: (item) => titleCell(item, today),
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
          compare: (a, b) =>
            revised(a).estimatedCents - revised(b).estimatedCents,
          cell: (item) =>
            estimateCell(
              revised(item).estimatedCents,
              addedCents(changes, item.id),
            ),
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
            (costVariance(revised(a)) ?? -Infinity) -
            (costVariance(revised(b)) ?? -Infinity),
          cell: (item) => varianceCell(costVariance(revised(item))),
        },
        blended.column,
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

  /**
   * The title opens the editor. A late item gets its badge beside it.
   * @param {ScheduleItem} item @param {string} today
   */
  function titleCell(item, today) {
    const el = document.createElement('span');
    el.className = 'schedule-title-cell';
    el.append(
      focusKey(
        bareButton({
          className: 'schedule-title',
          children: item.complete
            ? [icon('check', { label: 'Complete' }), item.title]
            : [item.title],
          onClick: () => openScheduleEditor({ ctx, item }),
        }),
        `${item.id}:open`,
      ),
      ...lateBadge(item, today),
    );
    return el;
  }

  /** @param {ScheduleItem} item */
  const days = (item) => spanDays(item.startDate, item.endDate);

  /**
   * The note count opens the editor on its Notes tab. The button is at
   * least 32px square, over the 24px target size in WCAG 2.5.8.
   * @param {ScheduleItem} item @param {number} count
   */
  function notesCell(item, count) {
    const el = bareButton({
      className:
        count === 0 ? 'schedule-notes u-num u-muted' : 'schedule-notes u-num',
      children: [icon('note'), String(count)],
      ariaLabel: `${count} ${count === 1 ? 'note' : 'notes'} on ${item.title}`,
      onClick: () => openScheduleEditor({ ctx, item, tab: 'notes' }),
    });
    return focusKey(el, `${item.id}:notes`);
  }

  return {
    render: (payload) => tableScroll(buildTable(payload).el),
  };
}
