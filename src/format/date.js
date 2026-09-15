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
