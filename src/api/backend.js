// Picks the data backend for the page. index.html names it in a meta tag:
// "server" talks to the Node server over /api, and "local" keeps every
// row in the browser's localStorage. The GitHub Pages build writes
// "local", because static hosting has no server.
import { createApi } from './client.js';
import { createLocalApi } from '../local/api.js';
import { setFailureBackend } from './errors.js';

/** @typedef {'server' | 'local'} Backend */

/**
 * @param {Pick<Document, 'querySelector'>} doc
 * @returns {Backend}
 */
export function readBackend(doc) {
  const meta = doc.querySelector('meta[name="reno-backend"]');
  return meta?.getAttribute('content') === 'local' ? 'local' : 'server';
}

/**
 * @param {Backend} backend
 * @param {import('../storage/prefs.js').StorageLike} storage
 * @param {Pick<EventTarget, 'addEventListener'>} [events] the window, for the local store
 * @returns {import('./client.js').Api}
 */
export function createBackend(backend, storage, events) {
  setFailureBackend(backend);
  return backend === 'local' ? createLocalApi(storage, events) : createApi();
}
