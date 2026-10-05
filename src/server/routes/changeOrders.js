import {
  CHANGE_ORDER_FIELDS,
  changeOrderDefaults,
  cleanChangeOrderInput,
  validateChangeOrder,
} from '../../entities/changeOrder.js';
import {
  createChangeOrder,
  deleteChangeOrder,
  patchChangeOrder,
} from '../repo/changeOrders.js';
import { getProject } from '../repo/projects.js';
import { asObject, pick, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */

/**
 * @param {Router} router
 * @param {Database} db
 */
export function changeOrderRoutes(router, db) {
  router.post('/api/projects/:id/change-orders', ({ params, body }) => {
    const input = pick(asObject(body), CHANGE_ORDER_FIELDS);
    rejectInvalid(validateChangeOrder(input));
    const { markupBasisPoints } = getProject(db, params.id);
    return createChangeOrder(
      db,
      params.id,
      changeOrderDefaults(cleanChangeOrderInput(input), markupBasisPoints),
    );
  });
  router.patch('/api/change-orders/:id', ({ params, body }) => {
    const input = pick(asObject(body), CHANGE_ORDER_FIELDS);
    rejectInvalid(validateChangeOrder(input, { partial: true }));
    return patchChangeOrder(db, params.id, cleanChangeOrderInput(input));
  });
  router.delete('/api/change-orders/:id', ({ params }) => {
    deleteChangeOrder(db, params.id);
  });
}
