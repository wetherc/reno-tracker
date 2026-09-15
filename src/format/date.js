// Display text for dates and timestamps. A YYYY-MM-DD date is formatted
// in UTC so the calendar day never shifts with the local zone. A full
// timestamp is shown in local time because it records a moment.

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const DAY_SHORT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const MOMENT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * @param {string | null | undefined} iso YYYY-MM-DD
 * @returns {string} "Oct 1, 2026", or an em dash for a missing date
 */
export function formatDate(iso) {
  if (!iso) return '—';
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} "Oct 1", for a column where the year is known
 */
export function formatDayMonth(iso) {
  return DAY_SHORT.format(new Date(`${iso}T00:00:00Z`));
}

/**
 * @param {string} iso full ISO 8601 timestamp
 * @returns {string} "Oct 1, 2026, 3:04 PM" in local time
 */
export function formatMoment(iso) {
  return MOMENT.format(new Date(iso));
}

const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * @param {string} yearMonth YYYY-MM
 * @returns {string} "October 2026"
 */
export function formatMonth(yearMonth) {
  return MONTH.format(new Date(`${yearMonth}-01T00:00:00Z`));
}

/**
 * @param {string} start YYYY-MM-DD
 * @param {string} end YYYY-MM-DD
 * @returns {string} "Oct 13 to Oct 15", or the one day when both match
 */
export function formatRange(start, end) {
  if (start === end) return formatDayMonth(start);
  return `${formatDayMonth(start)} to ${formatDayMonth(end)}`;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} "Tue"
 */
export function formatWeekday(iso) {
  return WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
}

const DAY_LONG = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} "Tuesday, October 13, 2026", for an accessible name
 */
export function formatDayLong(iso) {
  return DAY_LONG.format(new Date(`${iso}T00:00:00Z`));
}

const MONTH_SHORT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

/**
 * @param {string} yearMonth YYYY-MM
 * @param {{ year?: boolean }} [options] year adds " 2026"
 * @returns {string} "Oct", or "Oct 2026" with the year
 */
export function formatMonthShort(yearMonth, { year = false } = {}) {
  const text = MONTH_SHORT.format(new Date(`${yearMonth}-01T00:00:00Z`));
  return year ? `${text} ${yearMonth.slice(0, 4)}` : text;
}
