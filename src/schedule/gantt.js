// Gantt geometry. Rows run in date order, with a predecessor always above
// its successors. Bars are placed on a day grid that covers whole weeks,
// and each dependency becomes one connector path from the end of its
// predecessor to the start of its successor.
import { addDays, dayOffset, spanDays, startOfWeek } from './dates.js';
import { topologicalOrder } from './graph.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').Dependency} Dependency */

/**
 * @typedef {{ item: ScheduleItem, y: number, x: number, width: number }} GanttRow
 */

/**
 * @typedef {{
 *   dependency: Dependency,
 *   d: string,
 *   conflict: boolean,
 * }} GanttConnector conflict is true when the successor starts before the predecessor ends
 */

/** @typedef {{ label: string, x: number, width: number }} GanttMonth */

/**
 * @typedef {{
 *   start: string,
 *   end: string,
 *   days: number,
 *   dayWidth: number,
 *   rowHeight: number,
 *   width: number,
 *   height: number,
 *   rows: GanttRow[],
 *   connectors: GanttConnector[],
 *   months: GanttMonth[],
 *   weeks: { date: string, x: number }[],
 *   todayX: number | null,
 * }} GanttLayout
 */

/**
 * @typedef {{
 *   items: ScheduleItem[],
 *   dependencies: Dependency[],
 *   today: string,
 *   dayWidth?: number,
 *   rowHeight?: number,
 * }} GanttOptions
 */

const ELBOW = 8;

const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Earlier start first, then earlier end, then the table order. Without the
 * date keys a row lands where its item was created, so an item added last
 * sits at the bottom even when it starts first.
 * @param {ScheduleItem} a
 * @param {ScheduleItem} b
 * @returns {number}
 */
function byDate(a, b) {
  return (
    a.startDate.localeCompare(b.startDate) ||
    a.endDate.localeCompare(b.endDate) ||
    a.sortOrder - b.sortOrder
  );
}

/**
 * @param {GanttOptions} options
 * @returns {GanttLayout}
 */
export function ganttLayout({
  items,
  dependencies,
  today,
  dayWidth = 28,
  rowHeight = 40,
}) {
  const sorted = [...items].sort(byDate);
  const byId = new Map(sorted.map((item) => [item.id, item]));
  const order = topologicalOrder(
    sorted.map((item) => item.id),
    dependencies,
  );
  const starts = sorted.map((i) => i.startDate).sort();
  const ends = sorted.map((i) => i.endDate).sort();
  const start = startOfWeek(starts[0] ?? today);
  const end = addDays(startOfWeek(ends[ends.length - 1] ?? today), 6);
  const days = spanDays(start, end);

  /** @type {GanttRow[]} */
  const rows = order.map((id, index) => {
    const item = /** @type {ScheduleItem} */ (byId.get(id));
    return {
      item,
      y: index * rowHeight,
      x: dayOffset(start, item.startDate) * dayWidth,
      width: spanDays(item.startDate, item.endDate) * dayWidth,
    };
  });
  const rowById = new Map(rows.map((row) => [row.item.id, row]));

  /** @type {GanttConnector[]} */
  const connectors = [];
  for (const dependency of dependencies) {
    const from = rowById.get(dependency.predecessorId);
    const to = rowById.get(dependency.successorId);
    if (!from || !to) continue;
    connectors.push({
      dependency,
      d: connectorPath(from, to, rowHeight),
      conflict: to.item.startDate <= from.item.endDate,
    });
  }

  /** @type {GanttMonth[]} */
  const months = [];
  for (let i = 0; i < days; i++) {
    const label = MONTH.format(new Date(`${addDays(start, i)}T00:00:00Z`));
    const last = months[months.length - 1];
    if (last && last.label === label) last.width += dayWidth;
    else months.push({ label, x: i * dayWidth, width: dayWidth });
  }

  const weeks = [];
  for (let i = 0; i < days; i += 7) {
    weeks.push({ date: addDays(start, i), x: i * dayWidth });
  }

  const todayOffset = dayOffset(start, today);
  const todayX =
    todayOffset >= 0 && todayOffset < days
      ? todayOffset * dayWidth + dayWidth / 2
      : null;

  return {
    start,
    end,
    days,
    dayWidth,
    rowHeight,
    width: days * dayWidth,
    height: rows.length * rowHeight,
    rows,
    connectors,
    months,
    weeks,
    todayX,
  };
}

/**
 * An SVG path from the right edge of one bar to the left edge of another.
 * When the successor starts to the right there is one elbow. When it
 * starts under or before the predecessor's end, the path steps down along
 * the row boundary and comes back so the arrow still enters from the left.
 * @param {GanttRow} from
 * @param {GanttRow} to
 * @param {number} rowHeight
 * @returns {string}
 */
export function connectorPath(from, to, rowHeight) {
  const x1 = from.x + from.width;
  const y1 = from.y + rowHeight / 2;
  const x2 = to.x;
  const y2 = to.y + rowHeight / 2;
  if (x2 >= x1 + ELBOW * 2) {
    const mid = x1 + ELBOW;
    return `M${x1} ${y1}H${mid}V${y2}H${x2}`;
  }
  const step = to.y > from.y ? to.y : to.y + rowHeight;
  return `M${x1} ${y1}H${x1 + ELBOW}V${step}H${x2 - ELBOW}V${y2}H${x2}`;
}

/** @typedef {'start' | 'end' | 'both'} DragEdge */

/**
 * The date fields that change when one edge of a bar, or the whole bar,
 * moves by a number of days. A single edge never crosses the other one,
 * so an item keeps at least one day. Unchanged fields are left out.
 * @param {ScheduleItem} item
 * @param {number} days
 * @param {DragEdge} edge
 * @returns {{ startDate?: string, endDate?: string }}
 */
export function moveDates(item, days, edge) {
  /** @type {{ startDate?: string, endDate?: string }} */
  const patch = {};
  if (days === 0) return patch;
  if (edge === 'both') {
    patch.startDate = addDays(item.startDate, days);
    patch.endDate = addDays(item.endDate, days);
    return patch;
  }
  if (edge === 'start') {
    const moved = addDays(item.startDate, days);
    const next = moved > item.endDate ? item.endDate : moved;
    if (next !== item.startDate) patch.startDate = next;
    return patch;
  }
  const moved = addDays(item.endDate, days);
  const next = moved < item.startDate ? item.startDate : moved;
  if (next !== item.endDate) patch.endDate = next;
  return patch;
}

/**
 * Whole days a pointer has dragged.
 * @param {number} dx pixels
 * @param {number} dayWidth
 * @returns {number}
 */
export function daysDragged(dx, dayWidth) {
  return Math.round(dx / dayWidth);
}
