// The one error type the client sees from the server, plus the text a
// person reads when a request fails.

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {import('../types.ts').ApiErrorBody} body
   */
  constructor(status, body) {
    super(body.error);
    this.name = 'ApiError';
    this.status = status;
    this.field = body.field;
  }
}

/**
 * Text for a toast after a failed request. The server's own message is
 * used when there is one, because it names the field and the value.
 * @param {unknown} error
 * @returns {string}
 */
export function describeFailure(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check that pnpm dev is running.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
