// One gantt bar. The middle opens the editor on a click and moves the
// whole item on a drag. Each end is a handle that moves one date. Every
// part answers the arrow keys: one day per press, seven with Shift. The
// bar paints as one piece per run of workdays, with a gap over each
// weekend inside the item. The title sits in the widest piece when the
// whole name fits there, and beside the bar at full length when it does
// not.
import { formatDayMonth, formatRange } from '../format/date.js';
import { dayOffset, spanDays } from '../schedule/dates.js';
import {
  daysDragged,
  labelPlace,
  moveDates,
  workPieces,
} from '../schedule/gantt.js';
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
 *   chartWidth: number,
 *   onOpen: (item: ScheduleItem) => void,
 *   onMove: (item: ScheduleItem, patch: DatePatch, edge: DragEdge) => void,
 *   onPreview: (text: string | null) => void,
 * }} GanttBarOptions onPreview receives the dates under the pointer during a drag, then null
 */

const ARROWS = { ArrowLeft: -1, ArrowRight: 1 };

// The space between a bar and a title beside it: the title's margin plus
// its side padding in gantt.css.
const LABEL_GAP = 8;

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
export function ganttBar({
  item,
  row,
  dayWidth,
  chartWidth,
  onOpen,
  onMove,
  onPreview,
}) {
  const el = document.createElement('div');
  el.className = item.complete ? 'gantt-bar gantt-bar--complete' : 'gantt-bar';
  el.style.left = `${row.x}px`;
  el.style.top = `${row.y}px`;
  el.style.width = `${row.width}px`;
  const paint = document.createElement('div');
  paint.className = 'gantt-bar__pieces';
  paint.setAttribute('aria-hidden', 'true');
  drawPieces(el, paint, item.startDate, item.endDate, dayWidth);

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
  el.append(start, body, end, paint);

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
      drawPieces(el, paint, shown.start, shown.end, dayWidth);
      fitLabel(el, chartWidth);
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
        drawPieces(el, paint, item.startDate, item.endDate, dayWidth);
        fitLabel(el, chartWidth);
      }
      days = 0;
    };
    part.addEventListener('pointerup', settle);
    part.addEventListener('pointercancel', settle);
  }

  return el;
}

/**
 * Fills the pieces layer for the dates shown and moves the title into the
 * widest piece. The label insets are distances from the bar's two edges.
 * @param {HTMLDivElement} el
 * @param {HTMLDivElement} paint
 * @param {string} start
 * @param {string} end
 * @param {number} dayWidth
 */
function drawPieces(el, paint, start, end, dayWidth) {
  const pieces = workPieces(start, end);
  paint.replaceChildren(
    ...pieces.map((piece) => {
      const part = document.createElement('div');
      part.className = 'gantt-bar__piece';
      part.style.left = `${piece.offset * dayWidth}px`;
      part.style.width = `${piece.days * dayWidth}px`;
      return part;
    }),
  );
  const widest = pieces.reduce((a, b) => (b.days > a.days ? b : a));
  const total = spanDays(start, end);
  el.style.setProperty('--gantt-label-start', `${widest.offset * dayWidth}px`);
  el.style.setProperty(
    '--gantt-label-end',
    `${(total - widest.offset - widest.days) * dayWidth}px`,
  );
}

/**
 * Measures the title in the widest piece and moves it beside the bar when
 * the whole name does not fit. It needs the bar in the page, because an
 * element outside the page has no width to measure.
 * @param {HTMLElement} el a bar from ganttBar
 * @param {number} chartWidth
 */
export function fitLabel(el, chartWidth) {
  const title = /** @type {HTMLElement} */ (
    el.querySelector('.gantt-bar__title')
  );
  el.classList.remove('gantt-bar--label-after', 'gantt-bar--label-before');
  const barLeft = parseFloat(el.style.left);
  const place = labelPlace({
    fits: title.scrollWidth <= title.clientWidth,
    labelWidth: title.scrollWidth + LABEL_GAP,
    barLeft,
    barRight: barLeft + parseFloat(el.style.width),
    chartWidth,
  });
  if (place !== 'inside') el.classList.add(`gantt-bar--label-${place}`);
}

/** @param {string} className @param {string} value */
function text(className, value) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = value;
  return el;
}
