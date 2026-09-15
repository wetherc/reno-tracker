// Errors that a route turns into an HTTP response. Anything else that a
// handler throws becomes a 500 with the message kept out of the body.

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} [field] the request field the message is about
   */
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }

  /** @returns {import('../types.ts').ApiErrorBody} */
  toBody() {
    return this.field
      ? { error: this.message, field: this.field }
      : { error: this.message };
  }
}

/**
 * @param {string} message
 * @param {string} [field]
 */
export function badRequest(message, field) {
  return new HttpError(400, message, field);
}

/**
 * @param {string} what entity name as the user knows it
 * @param {string} id
 */
export function notFound(what, id) {
  return new HttpError(404, `No ${what} with id ${id}`);
}

/**
 * @param {string} message
 * @param {string} [field]
 */
export function conflict(message, field) {
  return new HttpError(409, message, field);
}
