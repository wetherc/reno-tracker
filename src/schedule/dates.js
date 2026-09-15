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
