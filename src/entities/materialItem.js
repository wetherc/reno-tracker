import {
  checkCents,
  checkDate,
  checkText,
  firstError,
  nullable,
} from './validate.js';

/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */

const CHECKS = {
  name: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  scheduleItemId: nullable((f, v) => checkText(f, v, { min: 1, max: 100 })),
  allowanceCents: checkCents,
  estimatedCents: checkCents,
  actualCents: nullable(checkCents),
  expectedDate: nullable(checkDate),
};

export const MATERIAL_ITEM_REQUIRED = /** @type {const} */ (['name']);

/**
 * @param {MaterialItemInput} input
 * @returns {Required<MaterialItemInput>}
 */
export function materialItemDefaults(input) {
  return {
    name: input.name ?? '',
    scheduleItemId: input.scheduleItemId ?? null,
    allowanceCents: input.allowanceCents ?? 0,
    estimatedCents: input.estimatedCents ?? 0,
    actualCents: input.actualCents ?? null,
    expectedDate: input.expectedDate ?? null,
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options]
 */
export function validateMaterialItem(input, { partial = false } = {}) {
  return firstError(input, CHECKS, partial ? [] : [...MATERIAL_ITEM_REQUIRED]);
}
