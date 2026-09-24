// Field checks shared by every entity. Each check returns an error
// message naming the field and the offending value, or null when the
// value is fine. Routes turn the first message into a 400.
import { isIsoDate } from '../schedule/dates.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function show(value) {
  return JSON.stringify(value) ?? String(value);
}

/**
 * @param {string} field
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [limits]
 * @returns {string | null}
 */
export function checkText(field, value, { min = 0, max = 2000 } = {}) {
  if (typeof value !== 'string') {
    return `${field} must be text, got ${show(value)}`;
  }
  if (value.trim().length < min) return `${field} cannot be blank`;
  if (value.length > max) return `${field} is over ${max} characters`;
  return null;
}

// The largest money value one field takes: one billion dollars. A sum of
// 90,000 such values stays below Number.MAX_SAFE_INTEGER, so every total
// stays exact. node:sqlite throws a RangeError when it reads an integer
// above that limit, so a larger stored value would make its project
// unreadable.
export const MAX_CENTS = 100_000_000_000;

/**
 * Whole cents, from zero to MAX_CENTS.
 * @param {string} field
 * @param {unknown} value
 * @returns {string | null}
 */
export function checkCents(field, value) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 0) {
    return `${field} must be whole cents, zero or more, got ${show(value)}`;
  }
  if (/** @type {number} */ (value) > MAX_CENTS) {
    return `${field} must be at most ${MAX_CENTS} cents, got ${show(value)}`;
  }
  return null;
}

/**
 * @param {string} field
 * @param {unknown} value
 * @returns {string | null}
 */
export function checkDate(field, value) {
  if (!isIsoDate(value)) {
    return `${field} must be a date like 2026-03-14, got ${show(value)}`;
  }
  return null;
}

/**
 * Accepts null as well as a valid value.
 * @param {(field: string, value: unknown) => string | null} check
 * @returns {(field: string, value: unknown) => string | null}
 */
export function nullable(check) {
  return (field, value) => (value === null ? null : check(field, value));
}

/**
 * @param {string} field
 * @param {unknown} value
 * @returns {string | null}
 */
export function checkBoolean(field, value) {
  return typeof value === 'boolean'
    ? null
    : `${field} must be true or false, got ${show(value)}`;
}

/**
 * @typedef {{ field: string, message: string }} FieldError
 */

/**
 * Runs each check against the matching field of `input`. A field that is
 * absent from `input` is skipped unless it is listed in `required`.
 * @template {string} F
 * @param {Record<string, unknown>} input
 * @param {Record<F, (field: string, value: unknown) => string | null>} checks
 * @param {F[]} [required]
 * @returns {FieldError | null} the first problem found
 */
export function firstError(input, checks, required = []) {
  for (const field of /** @type {F[]} */ (Object.keys(checks))) {
    const present = field in input;
    if (!present && !required.includes(field)) continue;
    const message = checks[field](field, input[field]);
    if (message) return { field, message };
  }
  return null;
}
