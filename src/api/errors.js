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

/** @type {import('./backend.js').Backend} */
let backendKind = 'server';

/**
 * Names the backend that the page uses, so describeFailure explains a
 * TypeError the right way. createBackend calls it.
 * @param {import('./backend.js').Backend} kind
 */
export function setFailureBackend(kind) {
  backendKind = kind;
}

/**
 * Text for a toast after a failed request. The server's own message is
 * used when there is one, because it names the field and the value. A
 * TypeError from fetch means the server did not answer. The browser
 * store makes no request, so a TypeError there is a fault in the page,
 * and its text names the browser store and the error.
 * @param {unknown} error
 * @returns {string}
 */
export function describeFailure(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return backendKind === 'local'
      ? `The browser store failed: ${error.message}. Reload the page and try again.`
      : 'Could not reach the server. Check that pnpm dev is running.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
