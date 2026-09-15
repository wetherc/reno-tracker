import {
  materialItemDefaults,
  validateMaterialItem,
} from '../../entities/materialItem.js';
import {
  createMaterialItem,
  deleteMaterialItem,
  patchMaterialItem,
  setMaterialItemComplete,
} from '../repo/materials.js';
import { asObject, pick, readComplete, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */
/** @typedef {import('../../types.ts').MaterialItemInput} MaterialItemInput */

const FIELDS = /** @type {const} */ ([
  'scheduleItemId',
  'name',
  'allowanceCents',
  'estimatedCents',
  'actualCents',
  'expectedDate',
]);

/**
 * @param {Router} router
 * @param {Database} db
 */
export function materialRoutes(router, db) {
  router.post('/api/projects/:id/materials', ({ params, body }) => {
    const input = pick(asObject(body), FIELDS);
    rejectInvalid(validateMaterialItem(input));
    return createMaterialItem(
      db,
      params.id,
      materialItemDefaults(/** @type {MaterialItemInput} */ (input)),
    );
  });
  router.patch('/api/materials/:id', ({ params, body }) => {
    const input = pick(asObject(body), FIELDS);
    rejectInvalid(validateMaterialItem(input, { partial: true }));
    return patchMaterialItem(
      db,
      params.id,
      /** @type {MaterialItemInput} */ (input),
    );
  });
  router.delete('/api/materials/:id', ({ params }) => {
    deleteMaterialItem(db, params.id);
  });
  router.post('/api/materials/:id/complete', ({ params, body }) =>
    setMaterialItemComplete(db, params.id, readComplete(body)),
  );
}
