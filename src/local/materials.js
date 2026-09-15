// Material rows in a LocalDb. A linked schedule item must belong to the
// same project.
import { badRequest, notFound } from './errors.js';
import { getProject } from './projects.js';
import { getScheduleItem, nextSortOrder } from './schedule.js';
import { newId } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').MaterialItemInput} MaterialItemInput */

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {MaterialItem}
 */
export function getMaterialItem(db, id) {
  const item = db.materials.find((m) => m.id === id);
  if (!item) throw notFound('material item', id);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {string | null | undefined} scheduleItemId
 */
function checkLink(db, projectId, scheduleItemId) {
  if (scheduleItemId === null || scheduleItemId === undefined) return;
  const item = getScheduleItem(db, scheduleItemId);
  if (item.projectId !== projectId) {
    throw badRequest(
      'scheduleItemId belongs to another project',
      'scheduleItemId',
    );
  }
}

/**
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {Required<MaterialItemInput>} input
 * @returns {MaterialItem}
 */
export function createMaterialItem(db, projectId, input) {
  getProject(db, projectId);
  checkLink(db, projectId, input.scheduleItemId);
  /** @type {MaterialItem} */
  const item = {
    id: newId(),
    projectId,
    ...input,
    complete: false,
    sortOrder: nextSortOrder(db, 'materials', projectId),
  };
  db.materials.push(item);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {MaterialItemInput} patch
 * @returns {MaterialItem}
 */
export function patchMaterialItem(db, id, patch) {
  const item = getMaterialItem(db, id);
  checkLink(db, item.projectId, patch.scheduleItemId);
  Object.assign(item, patch);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {boolean} complete
 * @returns {MaterialItem}
 */
export function setMaterialItemComplete(db, id, complete) {
  const item = getMaterialItem(db, id);
  item.complete = complete;
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteMaterialItem(db, id) {
  getMaterialItem(db, id);
  db.materials = db.materials.filter((m) => m.id !== id);
}
