import { checkText } from '../../entities/validate.js';
import { createNote, deleteNote, patchNote } from '../repo/notes.js';
import { asObject, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */

/**
 * @param {unknown} body
 * @returns {string}
 */
function readBody(body) {
  const input = asObject(body);
  const error = checkText('body', input.body, { min: 1, max: 5000 });
  rejectInvalid(error ? { field: 'body', message: error } : null);
  return /** @type {string} */ (input.body);
}

/**
 * @param {Router} router
 * @param {Database} db
 */
export function noteRoutes(router, db) {
  router.post('/api/schedule/:id/notes', ({ params, body }) =>
    createNote(db, params.id, readBody(body)),
  );
  router.patch('/api/notes/:id', ({ params, body }) =>
    patchNote(db, params.id, readBody(body)),
  );
  router.delete('/api/notes/:id', ({ params }) => {
    deleteNote(db, params.id);
  });
}
