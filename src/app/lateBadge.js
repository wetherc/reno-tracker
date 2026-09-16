// The mark on a schedule item that is past its end date and still open.
// Every view that lists items draws it from here so the word and the
// colour match.
import { isLate } from '../entities/scheduleItem.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @param {ScheduleItem} item
 * @param {string} today an ISO date
 * @returns {HTMLSpanElement[]} one badge, or nothing when the item is on time
 */
export function lateBadge(item, today) {
  if (!isLate(item, today)) return [];
  const el = document.createElement('span');
  el.className = 'badge badge--danger';
  el.textContent = 'Late';
  return [el];
}
