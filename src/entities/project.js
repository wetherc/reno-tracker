import { checkCents, checkDate, checkText, firstError } from './validate.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */

const CHECKS = {
  name: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  budgetCents: checkCents,
  startDate: checkDate,
};

export const PROJECT_REQUIRED = /** @type {const} */ (['name', 'startDate']);

/**
 * Fills a create body with defaults. The caller validates first.
 * @param {ProjectInput} input
 * @returns {Pick<Project, 'name' | 'budgetCents' | 'startDate'>}
 */
export function projectDefaults(input) {
  return {
    name: input.name ?? '',
    budgetCents: input.budgetCents ?? 0,
    startDate: input.startDate ?? '',
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options] partial skips the required list
 */
export function validateProject(input, { partial = false } = {}) {
  return firstError(input, CHECKS, partial ? [] : [...PROJECT_REQUIRED]);
}
