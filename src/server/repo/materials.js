import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest, notFound } from '../errors.js';
import { getProject } from './projects.js';
import { checkUnbilled } from './invoices.js';
import { getScheduleItem, reorderRows } from './schedule.js';
import { setClause, toMaterialItem } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../../types.ts').MaterialItemInput} MaterialItemInput */

/**
 * @param {Database} db
 * @param {string} id
 * @returns {MaterialItem}
 */
export function getMaterialItem(db, id) {
  const row = statement(db, 'SELECT * FROM material_items WHERE id = ?').get(
    id,
  );
  if (!row) throw notFound('material item', id);
  return toMaterialItem(row);
}

/**
 * A linked schedule item must belong to the same project.
 * @param {Database} db
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
 * @param {Database} db
 * @param {string} projectId
 * @param {Required<MaterialItemInput>} input
 * @returns {MaterialItem}
 */
export function createMaterialItem(db, projectId, input) {
  return withTransaction(db, () => {
    getProject(db, projectId);
    checkLink(db, projectId, input.scheduleItemId);
    const id = randomUUID();
    statement(
      db,
      `INSERT INTO material_items
         (id, projectId, scheduleItemId, name, allowanceCents, estimatedCents,
          actualCents, markupBasisPoints, expectedDate, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT coalesce(max(sortOrder) + 1, 0) FROM material_items WHERE projectId = ?))`,
    ).run(
      id,
      projectId,
      input.scheduleItemId,
      input.name,
      input.allowanceCents,
      input.estimatedCents,
      input.actualCents,
      input.markupBasisPoints,
      input.expectedDate,
      projectId,
    );
    return getMaterialItem(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {MaterialItemInput} patch
 * @returns {MaterialItem}
 */
export function patchMaterialItem(db, id, patch) {
  return withTransaction(db, () => {
    const before = getMaterialItem(db, id);
    checkLink(db, before.projectId, patch.scheduleItemId);
    const { clause, values } = setClause(patch);
    if (clause) {
      statement(db, `UPDATE material_items SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    return getMaterialItem(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {boolean} complete
 * @returns {MaterialItem}
 */
export function setMaterialItemComplete(db, id, complete) {
  getMaterialItem(db, id);
  statement(db, 'UPDATE material_items SET complete = ? WHERE id = ?').run(
    Number(complete),
    id,
  );
  return getMaterialItem(db, id);
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteMaterialItem(db, id) {
  checkUnbilled(db, 'materialItemId', id, getMaterialItem(db, id).name);
  const result = statement(db, 'DELETE FROM material_items WHERE id = ?').run(
    id,
  );
  if (result.changes === 0) throw notFound('material item', id);
}

/**
 * @param {Database} db
 * @param {string} projectId
 * @param {string[]} ids
 */
export function reorderMaterials(db, projectId, ids) {
  getProject(db, projectId);
  reorderRows(db, 'material_items', projectId, ids);
}
