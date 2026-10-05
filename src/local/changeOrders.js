// Change orders in a LocalDb. Each change order keeps its lines.
import { notFound } from './errors.js';
import { LINE_KINDS, linesFor } from './lines.js';
import { getProject } from './projects.js';
import { newId } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').ChangeOrderInput} ChangeOrderInput */
/** @typedef {import('../types.ts').NewChangeOrder} NewChangeOrder */

const KIND = LINE_KINDS.changeOrder;

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {ChangeOrder}
 */
export function getChangeOrder(db, id) {
  const order = db.changeOrders.find((c) => c.id === id);
  if (!order) throw notFound('change order', id);
  return order;
}

/**
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {NewChangeOrder} input
 * @returns {ChangeOrder}
 */
export function createChangeOrder(db, projectId, input) {
  getProject(db, projectId);
  /** @type {ChangeOrder} */
  const order = {
    id: newId(),
    projectId,
    ...input,
    lines: linesFor(db, KIND, projectId, input.lines),
  };
  db.changeOrders.push(order);
  return order;
}

/**
 * Lines in the patch replace every line of the change order.
 * @param {LocalDb} db
 * @param {string} id
 * @param {Omit<ChangeOrderInput, 'lines'> & Partial<Pick<NewChangeOrder, 'lines'>>} patch
 * @returns {ChangeOrder}
 */
export function patchChangeOrder(db, id, { lines, ...fields }) {
  const order = getChangeOrder(db, id);
  const next = lines ? linesFor(db, KIND, order.projectId, lines) : order.lines;
  Object.assign(order, fields, { lines: next });
  return order;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteChangeOrder(db, id) {
  getChangeOrder(db, id);
  db.changeOrders = db.changeOrders.filter((c) => c.id !== id);
}
