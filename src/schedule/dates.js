// Date helpers. Every date is a YYYY-MM-DD string and all math runs on
// UTC midnight so a daylight saving change cannot move a day.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True when the string is a real calendar date written as YYYY-MM-DD.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * @param {string} iso
 * @returns {Date} UTC midnight
 */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} iso
 * @param {number} days may be negative
 * @returns {string}
 */
export function addDays(iso, days) {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/**
 * Whole days from start to end, inclusive of both. A one-day item spans 1.
 * @param {string} start
 * @param {string} end
 * @returns {number}
 */
export function spanDays(start, end) {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Today's calendar date where the person sits, not in UTC. A form that
 * opens late in the evening must not default to tomorrow.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Free days between one item's end and another item's start. Zero when
 * the second starts the day after the first ends. Negative when the two
 * overlap, by the number of shared days.
 * @param {string} end
 * @param {string} start
 * @returns {number}
 */
export function gapDays(end, start) {
  return spanDays(end, start) - 2;
}

/**
 * @param {string} iso
 * @returns {string} YYYY-MM
 */
export function monthOf(iso) {
  return iso.slice(0, 7);
}

/**
 * First and last day of a month.
 * @param {string} yearMonth YYYY-MM
 * @returns {{ start: string, end: string }}
 */
export function monthBounds(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return {
    start: toIsoDate(new Date(Date.UTC(y, m - 1, 1))),
    end: toIsoDate(new Date(Date.UTC(y, m, 0))),
  };
}

/**
 * @param {string} yearMonth YYYY-MM
 * @param {number} months may be negative
 * @returns {string} YYYY-MM
 */
export function addMonths(yearMonth, months) {
  const [y, m] = yearMonth.split('-').map(Number);
  return monthOf(toIsoDate(new Date(Date.UTC(y, m - 1 + months, 1))));
}

/**
 * @param {string} iso
 * @returns {number} 0 for Sunday through 6 for Saturday
 */
export function weekday(iso) {
  return parseDate(iso).getUTCDay();
}

/**
 * The Sunday on or before the date.
 * @param {string} iso
 * @returns {string}
 */
export function startOfWeek(iso) {
  return addDays(iso, -weekday(iso));
}

/**
 * Signed days from one date to another. Zero for the same day, negative
 * when `iso` is earlier than `from`.
 * @param {string} from
 * @param {string} iso
 * @returns {number}
 */
export function dayOffset(from, iso) {
  return spanDays(from, iso) - 1;
}

/**
 * Every day from start to end, inclusive.
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function eachDay(start, end) {
  /** @type {string[]} */
  const out = [];
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day);
  return out;
}

/** @typedef {{ start: string, end: string }} DateRange */

/**
 * The days two ranges share, or null when they do not touch.
 * @param {DateRange} a
 * @param {DateRange} b
 * @returns {DateRange | null}
 */
export function sharedDays(a, b) {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start <= end ? { start, end } : null;
}
