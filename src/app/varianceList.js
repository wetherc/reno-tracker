// The change log of one schedule item, newest first. Each entry shows
// the field, the old value struck through, the new value, and the
// reason the person gave. Values are stored as text, so money and dates
// are formatted here by field.
import { formatDate, formatMoment } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { emptyState } from '../ui/emptyState.js';

/** @typedef {import('../types.ts').Variance} Variance */
/** @typedef {import('../types.ts').TrackedField} TrackedField */

/** @type {Record<TrackedField, string>} */
export const FIELD_LABELS = {
  title: 'Title',
  description: 'Description',
  startDate: 'Start',
  endDate: 'End',
  responsibleParty: 'Responsible party',
  estimatedCents: 'Estimate',
  actualCents: 'Actual',
};

/**
 * @param {TrackedField} field
 * @param {string | null} value the stored text
 * @returns {string}
 */
export function showValue(field, value) {
  if (value === null || value === '') return 'blank';
  if (field === 'estimatedCents' || field === 'actualCents') {
    return formatCents(Number(value));
  }
  if (field === 'startDate' || field === 'endDate') return formatDate(value);
  return value;
}

/**
 * @param {Variance[]} variances in any order
 * @returns {HTMLElement}
 */
export function varianceList(variances) {
  if (variances.length === 0) {
    return emptyState('No changes logged. Edits to this item will show here.');
  }
  const list = document.createElement('ol');
  list.className = 'variances';
  list.setAttribute('aria-label', 'Changes');
  const newestFirst = [...variances].sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt),
  );
  for (const v of newestFirst) {
    const li = document.createElement('li');
    li.className = 'variance-entry';
    const when = document.createElement('time');
    when.className = 'variance-entry__when';
    when.setAttribute('datetime', v.loggedAt);
    when.append(formatMoment(v.loggedAt));

    const change = document.createElement('p');
    change.className = 'variance-entry__change';
    const field = document.createElement('span');
    field.className = 'variance-entry__field';
    field.append(FIELD_LABELS[v.field] ?? v.field);
    const old = document.createElement('s');
    old.className = 'variance-entry__old';
    old.append(showValue(v.field, v.oldValue));
    const next = document.createElement('span');
    next.className = 'variance-entry__new';
    next.append(showValue(v.field, v.newValue));
    change.append(field, old, next);

    li.append(when, change);
    if (v.reason) {
      const reason = document.createElement('p');
      reason.className = 'variance-entry__reason';
      reason.append(v.reason);
      li.append(reason);
    }
    list.append(li);
  }
  return list;
}
