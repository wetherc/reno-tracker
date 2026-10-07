// Field checks shared by every entity. Each check returns an error
// message naming the field and the offending value, or null when the
// value is fine. Routes turn the first message into a 400, and the forms
// show every message at once.
import { isIsoDate, MAX_DATE, MIN_DATE } from '../schedule/dates.js';

/**
 * The value as a message quotes it.
 * @param {unknown} value
 * @returns {string}
 */
export function show(value) {
  let text;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    return 'a value that cannot be shown';
  }
  return text.length > SHOW_MAX ? `${text.slice(0, SHOW_MAX)}...` : text;
}

// The most characters of a bad value that a message quotes, so a large
// value does not fill the message.
const SHOW_MAX = 60;

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
// stays exact. A markup multiplies a value by up to 10000 basis points
// first, so one line stays exact as a number, but lineItems.js sums the
// lines of a document as a BigInt. node:sqlite throws a RangeError when it reads an integer
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

// The largest rate one field takes, in basis points: 10000 is 100%.
export const MAX_BASIS_POINTS = 10_000;

/**
 * A rate in whole basis points, from zero to MAX_BASIS_POINTS. One basis
 * point is a hundredth of a percent, so 1500 is 15%.
 * @param {string} field
 * @param {unknown} value
 * @returns {string | null}
 */
export function checkBasisPoints(field, value) {
  if (
    !Number.isInteger(value) ||
    /** @type {number} */ (value) < 0 ||
    /** @type {number} */ (value) > MAX_BASIS_POINTS
  ) {
    return `${field} must be whole basis points from 0 to ${MAX_BASIS_POINTS}, got ${show(value)}`;
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
  if (value < MIN_DATE || value > MAX_DATE) {
    return `${field} must be from ${MIN_DATE} to ${MAX_DATE}, got ${show(value)}`;
  }
  return null;
}

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * True when each part of a matched time names a real moment: a day that
 * the month has, an hour under 24, and an offset from -12:00 to +14:00.
 * @param {RegExpExecArray} m
 * @returns {boolean}
 */
function realTime(m) {
  const [year, month, day, hour, minute, second = '0'] = m
    .slice(1, 7)
    .map((part) => (part === undefined ? undefined : Number(part)));
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const offset = m[7] ? Number(m[8]) * 60 + Number(m[9]) : 0;
  return (
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === day &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60 &&
    Number(m[9] ?? 0) < 60 &&
    offset <= (m[7] === '-' ? 12 * 60 : 14 * 60)
  );
}

/**
 * A full ISO 8601 time with a zone, as toISOString writes it. The day,
 * the time, and the offset must name a real moment.
 * @param {string} field
 * @param {unknown} value
 * @returns {string | null}
 */
export function checkTimestamp(field, value) {
  const match = typeof value === 'string' ? ISO_TIMESTAMP.exec(value) : null;
  if (!match || !realTime(match) || Number.isNaN(Date.parse(String(value)))) {
    return `${field} must be a time like 2026-03-14T09:30:00.000Z, got ${show(value)}`;
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
 * @returns {FieldError[]} one problem per bad field, in the order of checks
 */
export function fieldErrors(input, checks, required = []) {
  /** @type {FieldError[]} */
  const errors = [];
  for (const field of /** @type {F[]} */ (Object.keys(checks))) {
    const present = field in input;
    if (!present && !required.includes(field)) continue;
    const message = checks[field](field, input[field]);
    if (message) errors.push({ field, message });
  }
  return errors;
}

/**
 * @param {FieldError[]} errors
 * @returns {FieldError | null}
 */
export const first = (errors) => errors[0] ?? null;
