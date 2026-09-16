import {
  checkCents,
  checkDate,
  checkText,
  firstError,
  nullable,
} from './validate.js';

/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {import('../types.ts').TrackedField} TrackedField */
/** @typedef {import('../types.ts').VarianceKind} VarianceKind */

// Fields whose change writes a variance row, grouped by the kind of
// variance they log. `complete` and `sortOrder` are not tracked.
/** @type {Record<TrackedField, VarianceKind>} */
export const TRACKED_FIELDS = {
  title: 'scope',
  description: 'scope',
  startDate: 'dates',
  endDate: 'dates',
  responsibleParty: 'party',
  estimatedCents: 'cost',
  actualCents: 'cost',
};

const CHECKS = {
  title: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  description: checkText,
  startDate: checkDate,
  endDate: checkDate,
  responsibleParty: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 200 }),
  estimatedCents: checkCents,
  actualCents: nullable(checkCents),
};

export const SCHEDULE_ITEM_REQUIRED = /** @type {const} */ ([
  'title',
  'startDate',
  'endDate',
]);

/**
 * @param {ScheduleItemInput} input
 * @returns {Required<ScheduleItemInput>}
 */
export function scheduleItemDefaults(input) {
  return {
    title: input.title ?? '',
    description: input.description ?? '',
    startDate: input.startDate ?? '',
    endDate: input.endDate ?? input.startDate ?? '',
    responsibleParty: input.responsibleParty ?? '',
    estimatedCents: input.estimatedCents ?? 0,
    actualCents: input.actualCents ?? null,
  };
}

/**
 * Field checks plus the rule that an item ends on or after it starts.
 * For a patch, pass the current item so a one-sided date change is
 * checked against the date it keeps.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean, current?: Pick<ScheduleItem, 'startDate' | 'endDate'> }} [options]
 */
export function validateScheduleItem(input, { partial = false, current } = {}) {
  const error = firstError(
    input,
    CHECKS,
    partial ? [] : [...SCHEDULE_ITEM_REQUIRED],
  );
  if (error) return error;
  const start = /** @type {string | undefined} */ (
    input.startDate ?? current?.startDate
  );
  const end = /** @type {string | undefined} */ (
    input.endDate ?? current?.endDate
  );
  if (start && end && end < start) {
    return {
      field: 'endDate',
      message: `endDate ${end} is before startDate ${start}`,
    };
  }
  return null;
}

/**
 * True when the item is past its end date and not marked complete.
 * @param {Pick<ScheduleItem, 'endDate' | 'complete'>} item
 * @param {string} today an ISO date
 */
export function isLate(item, today) {
  return !item.complete && item.endDate < today;
}
