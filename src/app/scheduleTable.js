// The table view of the schedule: one row per item, a checkbox per row
// that marks the work done, and a title that opens the editor.
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { spanDays } from '../schedule/dates.js';
import { bareButton } from '../ui/buttons.js';
import { dataTable } from '../ui/DataTable.js';
import { icon } from '../ui/icon.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/**
 * Actual minus estimate, or null until an actual is entered.
 * @param {ScheduleItem} item
 * @returns {number | null}
 */
export function costVariance(item) {
  return item.actualCents === null
    ? null
    : item.actualCents - item.estimatedCents;
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
    return dataTable({
      caption: `Schedule for ${payload.project.name}`,
      rows: payload.schedule,
      rowKey: (item) => item.id,
      rowClass: (item) => (item.complete ? 'schedule-row--complete' : ''),
      sort,
      onSort: (next) => (sort = next),
      columns: [
        {
          key: 'complete',
          label: 'Done',
          hideLabel: true,
          align: 'center',
          cell: (item) => completeToggle(item),
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
          compare: (a, b) => byText(a.startDate, b.startDate),
          cell: (item) => formatDayMonth(item.startDate),
        },
        {
          key: 'end',
          label: 'End',
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

  /** @param {ScheduleItem} item */
  function completeToggle(item) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'check';
    box.checked = item.complete;
    box.setAttribute(
      'aria-label',
      item.complete ? `Reopen ${item.title}` : `Mark ${item.title} complete`,
    );
    box.addEventListener('change', async () => {
      box.disabled = true;
      const next = box.checked;
      const outcome = await ctx.write(
        (api) => api.setScheduleComplete(item.id, next),
        {
          done: next
            ? `Marked ${item.title} complete`
            : `Reopened ${item.title}`,
        },
      );
      if (!outcome.ok) {
        box.checked = item.complete;
        box.disabled = false;
      }
    });
    return box;
  }

  /** @param {ScheduleItem} item @param {number} count */
  function notesCell(item, count) {
    return bareButton({
      className: 'u-num',
      label: String(count),
      ariaLabel: `${count} notes on ${item.title}`,
      onClick: () => openScheduleEditor({ ctx, item, tab: 'notes' }),
    });
  }

  return {
    render: (payload) => buildTable(payload).el,
  };
}
