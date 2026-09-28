// Tells the page when the local date changes, so every view that marks
// today, late items, or overdue invoices draws again without a reload.
import { todayIso } from '../schedule/dates.js';

/** The time between two checks of the date. */
export const CHECK_MS = 60_000;

/**
 * @typedef {{
 *   now?: () => Date,
 *   every?: (fn: () => void, ms: number) => () => void,
 * }} DayWatchDeps
 */

/** @type {NonNullable<DayWatchDeps['every']>} */
function repeat(fn, ms) {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

/**
 * Calls onChange once each time the local date moves. The date is
 * checked every minute and each time the tab shows again, because a
 * sleeping laptop fires no timer until it wakes.
 * @param {Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>} doc
 * @param {() => void} onChange
 * @param {DayWatchDeps} [deps]
 * @returns {() => void} stop
 */
export function watchDay(doc, onChange, deps = {}) {
  const now = deps.now ?? (() => new Date());
  const every = deps.every ?? repeat;
  let day = todayIso(now());

  function check() {
    const next = todayIso(now());
    if (next === day) return;
    day = next;
    onChange();
  }
  function onVisible() {
    if (doc.visibilityState === 'visible') check();
  }

  const stopTimer = every(check, CHECK_MS);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    stopTimer();
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
