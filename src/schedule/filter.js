// The schedule filter. Every view of the schedule draws the items that
// pass it. Text matches when each word of it appears in the title, the
// description, or the responsible party, in any case. Party matches one
// name exactly. Status keeps every item, the open items, or the late
// items.
import { isLate } from '../entities/scheduleItem.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {'all' | 'open' | 'late'} StatusFilter */
/** @typedef {{ text: string, party: string, status: StatusFilter }} ScheduleFilter */

/** @type {StatusFilter[]} */
export const STATUSES = ['all', 'open', 'late'];

/** @type {ScheduleFilter} */
export const NO_FILTER = { text: '', party: '', status: 'all' };

/**
 * @param {string | null} value
 * @returns {StatusFilter} 'all' when the value names no status
 */
export function readStatus(value) {
  return STATUSES.find((s) => s === value) ?? 'all';
}

/**
 * @param {ScheduleFilter} filter
 * @returns {boolean} true when the filter can hide an item
 */
export function isFiltering({ text, party, status }) {
  return text.trim() !== '' || party !== '' || status !== 'all';
}

/**
 * @param {ScheduleItem[]} items
 * @returns {string[]} each responsible party once, in name order
 */
export function partiesOf(items) {
  const names = new Set(
    items.map((item) => item.responsibleParty).filter((name) => name !== ''),
  );
  return [...names].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  );
}

/**
 * Lowercases text and drops its accents, so "cafe" matches "Café".
 * @param {string} text
 */
const fold = (text) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * @param {ScheduleItem[]} items
 * @param {ScheduleFilter} filter
 * @param {string} today an ISO date, for the late status
 * @returns {ScheduleItem[]} the items that pass, in their input order
 */
export function filterSchedule(items, { text, party, status }, today) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (party !== '' && item.responsibleParty !== party) return false;
    if (status === 'open' && item.complete) return false;
    if (status === 'late' && !isLate(item, today)) return false;
    const haystack = fold(
      `${item.title}\n${item.description}\n${item.responsibleParty}`,
    );
    return words.every((word) => haystack.includes(word));
  });
}
