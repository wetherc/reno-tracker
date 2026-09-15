// Turns the difference between two versions of a schedule item into
// variance rows. Values are stored as text so one column fits dates,
// money, and prose. Null stays null.
import { TRACKED_FIELDS } from './scheduleItem.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').Variance} Variance */
/** @typedef {import('../types.ts').TrackedField} TrackedField */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function toStored(value) {
  return value === null || value === undefined ? null : String(value);
}

/**
 * @typedef {Omit<Variance, 'id' | 'scheduleItemId' | 'loggedAt' | 'reason'>} VarianceDiff
 */

/**
 * @param {ScheduleItem} before
 * @param {Partial<ScheduleItem>} after only fields present are compared
 * @returns {VarianceDiff[]} in tracked-field order
 */
export function diffTrackedFields(before, after) {
  /** @type {VarianceDiff[]} */
  const out = [];
  for (const field of /** @type {TrackedField[]} */ (
    Object.keys(TRACKED_FIELDS)
  )) {
    if (!(field in after)) continue;
    const oldValue = toStored(before[field]);
    const newValue = toStored(after[field]);
    if (oldValue === newValue) continue;
    out.push({ kind: TRACKED_FIELDS[field], field, oldValue, newValue });
  }
  return out;
}
