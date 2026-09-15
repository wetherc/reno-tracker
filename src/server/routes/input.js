// Helpers shared by route modules for reading a request body.
import { checkBoolean } from '../../entities/validate.js';
import { badRequest } from '../errors.js';

/**
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
export function asObject(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Body must be a JSON object');
  }
  return /** @type {Record<string, unknown>} */ (body);
}

/**
 * @param {{ field: string, message: string } | null} error
 */
export function rejectInvalid(error) {
  if (error) throw badRequest(error.message, error.field);
}

/**
 * Reads `{ complete: boolean }`.
 * @param {unknown} body
 * @returns {boolean}
 */
export function readComplete(body) {
  const input = asObject(body);
  rejectInvalid(
    checkBoolean('complete', input.complete)
      ? {
          field: 'complete',
          message: /** @type {string} */ (
            checkBoolean('complete', input.complete)
          ),
        }
      : null,
  );
  return /** @type {boolean} */ (input.complete);
}

/**
 * Keeps only the listed keys of a body so an unknown key cannot reach a
 * SET clause.
 * @template {string} K
 * @param {Record<string, unknown>} input
 * @param {readonly K[]} keys
 * @returns {Partial<Record<K, unknown>>}
 */
export function pick(input, keys) {
  /** @type {Partial<Record<K, unknown>>} */
  const out = {};
  for (const key of keys) if (key in input) out[key] = input[key];
  return out;
}
