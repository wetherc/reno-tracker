// One gantt bar. The middle opens the editor on a click and moves the
// whole item on a drag. Each end is a handle that moves one date. Every
// part answers the arrow keys: one day per press, seven with Shift. Key
// presses add up on the bar and save as one move KEY_DELAY ms after the
// last press, or when the part loses focus. Keys and drags are ignored
// while a save runs, and a failed save puts the bar back. The bar paints as one piece per run of workdays, with a gap over each
// weekend inside the item. The title sits in the widest piece when the
// whole name fits there, and beside the bar at full length when it does
// not. A late bar paints in the danger colour with an alert icon, and
// its label ends in "late".
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
 *   late?: boolean,
 *   startsEarly?: string[],
 *   row: GanttRow,
 *   dayWidth: number,
 *   chartWidth: number,
 *   onOpen: (item: ScheduleItem) => void,
 *   onMove: (item: ScheduleItem, patch: DatePatch, edge: DragEdge, refocus: boolean) => Promise<boolean>,
 *   onPreview: (text: string | null) => void,
 * }} GanttBarOptions late marks an open item past its end date. startsEarly names each predecessor that ends after this item starts. onMove saves and resolves true on success, and refocus asks for focus on the same part after the rebuild. onPreview receives the dates shown during a drag or a run of key presses, then null
 */

const ARROWS = { ArrowLeft: -1, ArrowRight: 1 };

/** The pause after the last arrow key press before the move saves. */
export const KEY_DELAY = 400;

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
  late = false,
  startsEarly = [],
  row,
  dayWidth,
  chartWidth,
  onOpen,
  onMove,
  onPreview,
}) {
  const el = document.createElement('div');
  el.className = item.complete
    ? 'gantt-bar gantt-bar--complete'
    : late
      ? 'gantt-bar gantt-bar--late'
      : 'gantt-bar';
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
    ariaLabel: [
      item.title,
      range,
      ...(late ? ['late'] : []),
      ...startsEarly.map((name) => `starts before ${name} ends`),
    ].join(', '),
    children: [
      ...(item.complete ? [icon('check')] : late ? [icon('alert')] : []),
      text('gantt-bar__title', item.title),
    ],
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
  // True from the start of a save until the rebuild replaces the bar, or
  // until a failed save puts it back.
  let busy = false;
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
    // Days of key presses not yet saved, and the timer that saves them.
    let pending = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @param {boolean} refocus */
    const flush = (refocus) => {
      const days = drop();
      // A drag that started its own save wins, because this item copy
      // has the dates from before that save.
      if (!busy) save(moveDates(item, days, edge), edge, refocus);
    };
    /** Cancels the key presses not yet saved, and returns their days. */
    const drop = () => {
      clearTimeout(timer);
      timer = undefined;
      const days = pending;
      pending = 0;
      onPreview(null);
      return days;
    };
    part.addEventListener('keydown', (event) => {
      const step = ARROWS[/** @type {keyof typeof ARROWS} */ (event.key)];
      if (!step) return;
      event.preventDefault();
      if (busy) return;
      const patch = moveDates(
        item,
        pending + step * (event.shiftKey ? 7 : 1),
        edge,
      );
      // A press past a limit does not count, so the next press the other
      // way moves the bar at once.
      pending = daysMoved(item, patch, edge);
      preview(patch);
      clearTimeout(timer);
      timer = setTimeout(
        () => flush(document.activeElement === part),
        KEY_DELAY,
      );
    });
    part.addEventListener('blur', () => {
      if (timer !== undefined) flush(false);
    });

    let originX = 0;
    let days = 0;
    part.addEventListener('pointerdown', (event) => {
      if (busy) return;
      // A drag replaces the key presses not yet saved on this part.
      drop();
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
      preview(moveDates(item, days, edge));
    });
    const settle = (/** @type {PointerEvent} */ event) => {
      if (!part.hasPointerCapture(event.pointerId)) return;
      part.releasePointerCapture(event.pointerId);
      el.classList.remove('gantt-bar--dragging');
      onPreview(null);
      const patch =
        event.type === 'pointerup' ? moveDates(item, days, edge) : {};
      save(patch, edge, true);
      days = 0;
    };
    part.addEventListener('pointerup', settle);
    part.addEventListener('pointercancel', settle);
  }

  /**
   * Draws the bar at the patched dates and announces them.
   * @param {DatePatch} patch
   */
  function preview(patch) {
    const start = patch.startDate ?? item.startDate;
    const end = patch.endDate ?? item.endDate;
    place(start, end);
    onPreview(`${item.title}: ${formatRange(start, end)}`);
  }

  /** @param {string} start @param {string} end */
  function place(start, end) {
    el.style.left = `${row.x + dayOffset(item.startDate, start) * dayWidth}px`;
    el.style.width = `${spanDays(start, end) * dayWidth}px`;
    drawPieces(el, paint, start, end, dayWidth);
    fitLabel(el, chartWidth);
  }

  /**
   * Saves a move, or puts the bar back when the patch is empty or the
   * save fails.
   * @param {DatePatch} patch
   * @param {DragEdge} edge
   * @param {boolean} refocus
   */
  function save(patch, edge, refocus) {
    const reset = () => place(item.startDate, item.endDate);
    if (Object.keys(patch).length === 0) return reset();
    busy = true;
    onMove(item, patch, edge, refocus).then((ok) => {
      if (ok) return;
      busy = false;
      reset();
    });
  }

  return el;
}

/**
 * The days a patch from moveDates moves the edge that the key or drag
 * controls.
 * @param {ScheduleItem} item
 * @param {DatePatch} patch
 * @param {DragEdge} edge
 * @returns {number}
 */
export function daysMoved(item, patch, edge) {
  return edge === 'end'
    ? dayOffset(item.endDate, patch.endDate ?? item.endDate)
    : dayOffset(item.startDate, patch.startDate ?? item.startDate);
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
  fitLabels([el], chartWidth);
}

/**
 * fitLabel for many bars at once. It clears every class first, then reads
 * every width, then sets every class, so the browser lays out the page
 * once rather than once per bar.
 * @param {Iterable<HTMLElement>} bars
 * @param {number} chartWidth
 */
export function fitLabels(bars, chartWidth) {
  const all = [...bars];
  for (const el of all) {
    el.classList.remove('gantt-bar--label-after', 'gantt-bar--label-before');
  }
  const places = all.map((el) => {
    const title = /** @type {HTMLElement} */ (
      el.querySelector('.gantt-bar__title')
    );
    const scroll = title.scrollWidth;
    const barLeft = parseFloat(el.style.left);
    return labelPlace({
      fits: scroll <= title.clientWidth,
      labelWidth: scroll + LABEL_GAP,
      barLeft,
      barRight: barLeft + parseFloat(el.style.width),
      chartWidth,
    });
  });
  all.forEach((el, i) => {
    if (places[i] !== 'inside')
      el.classList.add(`gantt-bar--label-${places[i]}`);
  });
}

/** @param {string} className @param {string} value */
function text(className, value) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = value;
  return el;
}
