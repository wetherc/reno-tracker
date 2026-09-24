import {
  checkBasisPoints,
  checkCents,
  checkDate,
  checkText,
  fieldErrors,
  first,
} from './validate.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */
/** @typedef {import('../types.ts').NewProject} NewProject */

/** The fields a project body may carry. */
export const PROJECT_FIELDS = /** @type {const} */ ([
  'name',
  'budgetCents',
  'markupBasisPoints',
  'startDate',
]);

/** The most characters a project name takes. */
export const PROJECT_NAME_MAX = 200;

const CHECKS = {
  name: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: PROJECT_NAME_MAX }),
  budgetCents: checkCents,
  markupBasisPoints: checkBasisPoints,
  startDate: checkDate,
};

export const PROJECT_REQUIRED = /** @type {const} */ (['name', 'startDate']);

/**
 * Fills a create body with defaults. The caller validates first.
 * @param {ProjectInput} input
 * @returns {NewProject}
 */
export function projectDefaults(input) {
  return {
    name: input.name ?? '',
    budgetCents: input.budgetCents ?? 0,
    markupBasisPoints: input.markupBasisPoints ?? 0,
    startDate: input.startDate ?? '',
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options] partial skips the required list
 * @returns {import('./validate.js').FieldError[]} every problem
 */
export function projectErrors(input, { partial = false } = {}) {
  return fieldErrors(input, CHECKS, partial ? [] : [...PROJECT_REQUIRED]);
}

/**
 * The first problem projectErrors finds, or null.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options]
 */
export const validateProject = (input, options) =>
  first(projectErrors(input, options));
