import { checkText } from '../../entities/validate.js';
import { createDependency, deleteDependency } from '../repo/dependencies.js';
import { asObject, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */

/**
 * @param {Router} router
 * @param {Database} db
 */
export function dependencyRoutes(router, db) {
  router.post('/api/projects/:id/dependencies', ({ params, body }) => {
    const input = asObject(body);
    for (const field of ['predecessorId', 'successorId']) {
      const error = checkText(field, input[field], { min: 1, max: 100 });
      rejectInvalid(error ? { field, message: error } : null);
    }
    return createDependency(db, params.id, {
      predecessorId: /** @type {string} */ (input.predecessorId),
      successorId: /** @type {string} */ (input.successorId),
    });
  });
  router.delete('/api/dependencies/:id', ({ params }) => {
    deleteDependency(db, params.id);
  });
}
