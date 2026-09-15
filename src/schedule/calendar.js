// Month grid geometry. A month is a stack of Sunday-to-Saturday weeks.
// Each week places the items that touch it into lanes so that two bars
// never share a lane on the same day. Lanes past the limit are not drawn
// and each day counts how many bars it hides instead.
import {
  addDays,
  dayOffset,
  eachDay,
  monthBounds,
  monthOf,
  sharedDays,
  startOfWeek,
} from './dates.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @typedef {{
 *   item: ScheduleItem,
 *   startCol: number,
 *   endCol: number,
 *   lane: number,
 *   continuesBefore: boolean,
 *   continuesAfter: boolean,
 * }} CalendarBar
 */

/** @typedef {{ date: string, inMonth: boolean }} CalendarDay */

/**
 * @typedef {{
 *   start: string,
 *   days: CalendarDay[],
 *   bars: CalendarBar[],
 *   hidden: number[],
 * }} CalendarWeek hidden has one count per day column
 */

/**
 * @typedef {{
 *   yearMonth: string,
 *   start: string,
 *   end: string,
 *   weeks: CalendarWeek[],
 * }} MonthGrid
 */

export const MAX_LANES = 3;

/**
 * @param {string} yearMonth YYYY-MM
 * @param {ScheduleItem[]} items in the order ties should keep
 * @returns {MonthGrid}
 */
export function monthGrid(yearMonth, items) {
  const { start, end } = monthBounds(yearMonth);
  const gridEnd = addDays(startOfWeek(end), 6);
  /** @type {CalendarWeek[]} */
  const weeks = [];
  for (let ws = startOfWeek(start); ws <= gridEnd; ws = addDays(ws, 7)) {
    weeks.push(weekRow(ws, yearMonth, items));
  }
  return { yearMonth, start, end, weeks };
}

/**
 * @param {string} weekStart a Sunday
 * @param {string} yearMonth
 * @param {ScheduleItem[]} items
 * @returns {CalendarWeek}
 */
export function weekRow(weekStart, yearMonth, items) {
  const weekEnd = addDays(weekStart, 6);
  const week = { start: weekStart, end: weekEnd };
  const days = eachDay(weekStart, weekEnd).map((date) => ({
    date,
    inMonth: monthOf(date) === yearMonth,
  }));

  /** @type {Omit<CalendarBar, 'lane'>[]} */
  const spans = [];
  for (const item of items) {
    const shared = sharedDays(
      { start: item.startDate, end: item.endDate },
      week,
    );
    if (!shared) continue;
    spans.push({
      item,
      startCol: dayOffset(weekStart, shared.start),
      endCol: dayOffset(weekStart, shared.end),
      continuesBefore: item.startDate < weekStart,
      continuesAfter: item.endDate > weekEnd,
    });
  }
  // Earlier starts first, longer bars first among equals. The sort is
  // stable, so the caller's order breaks the remaining ties.
  spans.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);

  /** @type {number[]} last used column per lane */
  const laneEnds = [];
  /** @type {CalendarBar[]} */
  const bars = [];
  const hidden = days.map(() => 0);
  for (const span of spans) {
    let lane = laneEnds.findIndex((endCol) => endCol < span.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.endCol;
    if (lane < MAX_LANES) {
      bars.push({ ...span, lane });
    } else {
      for (let c = span.startCol; c <= span.endCol; c++) hidden[c]++;
    }
  }
  return { start: weekStart, days, bars, hidden };
}

/**
 * The month to open on. The month that contains today when any item
 * touches it, else the month of the earliest item, else the fallback.
 * @param {ScheduleItem[]} items
 * @param {string} today
 * @param {string} fallback a date, usually the project start
 * @returns {string} YYYY-MM
 */
export function startingMonth(items, today, fallback) {
  const thisMonth = monthBounds(monthOf(today));
  const live = items.some((item) =>
    sharedDays({ start: item.startDate, end: item.endDate }, thisMonth),
  );
  if (live) return monthOf(today);
  const starts = items.map((item) => item.startDate).sort();
  return monthOf(starts[0] ?? fallback);
}
