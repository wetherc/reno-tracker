// Agenda grouping. Every item appears under the day it starts and, when
// it runs longer than a day, again under the day it ends.

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @typedef {{
 *   date: string,
 *   starting: ScheduleItem[],
 *   finishing: ScheduleItem[],
 * }} AgendaDay
 */

/**
 * @param {ScheduleItem} a
 * @param {ScheduleItem} b
 */
const byOrder = (a, b) =>
  a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'en');

/**
 * @param {ScheduleItem[]} items
 * @param {{ hideComplete?: boolean }} [options]
 * @returns {AgendaDay[]} sorted by date
 */
export function agendaDays(items, { hideComplete = false } = {}) {
  /** @type {Map<string, AgendaDay>} */
  const days = new Map();
  /** @param {string} date */
  const dayOf = (date) => {
    let day = days.get(date);
    if (!day) {
      day = { date, starting: [], finishing: [] };
      days.set(date, day);
    }
    return day;
  };
  for (const item of items) {
    if (hideComplete && item.complete) continue;
    dayOf(item.startDate).starting.push(item);
    if (item.endDate !== item.startDate)
      dayOf(item.endDate).finishing.push(item);
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      starting: day.starting.sort(byOrder),
      finishing: day.finishing.sort(byOrder),
    }));
}

/**
 * The agenda day to scroll to for a calendar date. The latest day on or
 * before the date, because an item shown on that date started on or
 * before it. Falls back to the first day when the date is before all of
 * them.
 * @param {AgendaDay[]} days sorted by date
 * @param {string} date
 * @returns {AgendaDay | null}
 */
export function dayFor(days, date) {
  let found = null;
  for (const day of days) {
    if (day.date > date) break;
    found = day;
  }
  return found ?? days[0] ?? null;
}
