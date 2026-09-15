// Errors the browser store throws. They are ApiError instances with the
// same status codes and messages the server sends, so the toasts and the
// field marks in the editors read the same in both modes.
import { ApiError } from '../api/errors.js';

/**
 * @param {string} message
 * @param {string} [field]
 */
export function badRequest(message, field) {
  return new ApiError(
    400,
    field ? { error: message, field } : { error: message },
  );
}

/**
 * @param {string} what entity name as the user knows it
 * @param {string} id
 */
export function notFound(what, id) {
  return new ApiError(404, { error: `No ${what} with id ${id}` });
}

/**
 * @param {string} message
 * @param {string} field
 */
export function conflict(message, field) {
  return new ApiError(409, { error: message, field });
}

/**
 * @param {{ field: string, message: string } | null} error
 */
export function rejectInvalid(error) {
  if (error) throw badRequest(error.message, error.field);
}

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
 * Keeps only the listed keys of an input so an unknown key cannot land
 * on a stored row.
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
