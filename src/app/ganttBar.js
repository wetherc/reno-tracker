// One gantt bar. The middle opens the editor on a click and moves the
// whole item on a drag. Each end is a handle that moves one date. Every
// part answers the arrow keys: one day per press, seven with Shift.
import { formatDayMonth, formatRange } from '../format/date.js';
import { dayOffset, spanDays } from '../schedule/dates.js';
import { daysDragged, moveDates } from '../schedule/gantt.js';
import { bareButton } from '../ui/buttons.js';
import { icon } from '../ui/icon.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../schedule/gantt.js').GanttRow} GanttRow */
/** @typedef {import('../schedule/gantt.js').DragEdge} DragEdge */
/** @typedef {{ startDate?: string, endDate?: string }} DatePatch */

/**
 * @typedef {{
 *   item: ScheduleItem,
 *   row: GanttRow,
 *   dayWidth: number,
 *   onOpen: (item: ScheduleItem) => void,
 *   onMove: (item: ScheduleItem, patch: DatePatch, edge: DragEdge) => void,
 *   onPreview: (text: string | null) => void,
 * }} GanttBarOptions onPreview receives the dates under the pointer during a drag, then null
 */

const ARROWS = { ArrowLeft: -1, ArrowRight: 1 };

// A bar shorter than this many days cannot hold its title, so the title
// sits to the right of it instead.
export const NARROW_DAYS = 3;

/**
 * The sentence a toast shows after a move. It names only the dates that
 * changed.
 * @param {ScheduleItem} item
 * @param {DatePatch} patch
 * @returns {string}
 */
export function moveMessage(item, patch) {
  const start = patch.startDate ?? item.startDate;
  const end = patch.endDate ?? item.endDate;
  if (patch.startDate && patch.endDate) {
    return `${item.title} now runs ${formatRange(start, end)}`;
  }
  if (patch.startDate)
    return `${item.title} now starts ${formatDayMonth(start)}`;
  return `${item.title} now ends ${formatDayMonth(end)}`;
}

/**
 * @param {GanttBarOptions} options
 * @returns {HTMLDivElement}
 */
export function ganttBar({ item, row, dayWidth, onOpen, onMove, onPreview }) {
  const el = document.createElement('div');
  el.className = item.complete ? 'gantt-bar gantt-bar--complete' : 'gantt-bar';
  el.style.left = `${row.x}px`;
  el.style.top = `${row.y}px`;
  el.style.width = `${row.width}px`;
  if (row.width < dayWidth * NARROW_DAYS) el.classList.add('gantt-bar--narrow');

  const range = formatRange(item.startDate, item.endDate);
  const body = bareButton({
    className: 'gantt-bar__body',
    ariaLabel: `${item.title}, ${range}`,
    children: item.complete
      ? [icon('check'), text('gantt-bar__title', item.title)]
      : [text('gantt-bar__title', item.title)],
  });
  const start = handle(
    'start',
    `Start of ${item.title}, ${formatDayMonth(item.startDate)}`,
  );
  const end = handle(
    'end',
    `End of ${item.title}, ${formatDayMonth(item.endDate)}`,
  );
  el.append(start, body, end);

  wire(start, 'start');
  wire(body, 'both');
  wire(end, 'end');

  // A drag that moved the bar must not also open the editor on release.
  let dragged = false;
  body.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    onOpen(item);
  });

  /**
   * @param {DragEdge} edge
   * @param {string} label
   */
  function handle(edge, label) {
    const btn = bareButton({
      className: `gantt-bar__handle gantt-bar__handle--${edge}`,
      ariaLabel: label,
    });
    btn.title = 'Drag, or press an arrow key';
    return btn;
  }

  /**
   * @param {HTMLButtonElement} part
   * @param {DragEdge} edge
   */
  function wire(part, edge) {
    part.setAttribute('data-focus', `${item.id}:${edge}`);
    part.setAttribute(
      'aria-keyshortcuts',
      'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight',
    );
    part.addEventListener('keydown', (event) => {
      const step = ARROWS[/** @type {keyof typeof ARROWS} */ (event.key)];
      if (!step) return;
      event.preventDefault();
      const patch = moveDates(item, step * (event.shiftKey ? 7 : 1), edge);
      if (Object.keys(patch).length > 0) onMove(item, patch, edge);
    });

    let originX = 0;
    let days = 0;
    part.addEventListener('pointerdown', (event) => {
      originX = event.clientX;
      days = 0;
      part.setPointerCapture(event.pointerId);
    });
    part.addEventListener('pointermove', (event) => {
      if (!part.hasPointerCapture(event.pointerId)) return;
      const next = daysDragged(event.clientX - originX, dayWidth);
      if (next === days) return;
      days = next;
      if (edge === 'both') dragged = dragged || days !== 0;
      el.classList.toggle('gantt-bar--dragging', days !== 0);
      const patch = moveDates(item, days, edge);
      const shown = {
        start: patch.startDate ?? item.startDate,
        end: patch.endDate ?? item.endDate,
      };
      el.style.left = `${row.x + dayOffset(item.startDate, shown.start) * dayWidth}px`;
      el.style.width = `${spanDays(shown.start, shown.end) * dayWidth}px`;
      onPreview(`${item.title}: ${formatRange(shown.start, shown.end)}`);
    });
    const settle = (/** @type {PointerEvent} */ event) => {
      if (!part.hasPointerCapture(event.pointerId)) return;
      part.releasePointerCapture(event.pointerId);
      el.classList.remove('gantt-bar--dragging');
      onPreview(null);
      const patch =
        event.type === 'pointerup' ? moveDates(item, days, edge) : {};
      if (Object.keys(patch).length > 0) onMove(item, patch, edge);
      else {
        el.style.left = `${row.x}px`;
        el.style.width = `${row.width}px`;
      }
      days = 0;
    };
    part.addEventListener('pointerup', settle);
    part.addEventListener('pointercancel', settle);
  }

  return el;
}

/** @param {string} className @param {string} value */
function text(className, value) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = value;
  return el;
}
