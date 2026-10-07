import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest, notFound } from '../errors.js';
import { diffTrackedFields } from '../../entities/variance.js';
import { getProject } from './projects.js';
import { checkUnlinked } from './lines.js';
import { now, setClause, toScheduleItem, toVariance } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../../types.ts').ScheduleItemInput} ScheduleItemInput */

/**
 * @param {Database} db
 * @param {string} id
 * @returns {ScheduleItem}
 */
export function getScheduleItem(db, id) {
  const row = statement(db, 'SELECT * FROM schedule_items WHERE id = ?').get(
    id,
  );
  if (!row) throw notFound('schedule item', id);
  return toScheduleItem(row);
}

/**
 * The item that a link field names. A missing item or an item in another
 * project answers 400 with the field set, because the fault is in the
 * body rather than in the path.
 * @param {Database} db
 * @param {string} projectId
 * @param {string} id
 * @param {string} field
 * @returns {ScheduleItem}
 */
export function linkedItem(db, projectId, id, field) {
  const row = statement(db, 'SELECT * FROM schedule_items WHERE id = ?').get(
    id,
  );
  if (!row) throw badRequest(`${field} names no schedule item`, field);
  const item = toScheduleItem(row);
  if (item.projectId !== projectId) {
    throw badRequest(`${field} belongs to another project`, field);
  }
  return item;
}

/**
 * The change rows of one item, oldest first.
 * @param {Database} db
 * @param {string} id
 * @returns {import('../../types.ts').Variance[]}
 */
export function listChanges(db, id) {
  getScheduleItem(db, id);
  return statement(
    db,
    'SELECT * FROM variances WHERE scheduleItemId = ? ORDER BY loggedAt, rowid',
  )
    .all(id)
    .map(toVariance);
}

/**
 * New items go to the end of the list. The insert and the read back run
 * in one transaction, so a row that fails to read is not kept.
 * @param {Database} db
 * @param {string} projectId
 * @param {Required<ScheduleItemInput>} input
 * @returns {ScheduleItem}
 */
export function createScheduleItem(db, projectId, input) {
  return withTransaction(db, () => {
    getProject(db, projectId);
    const id = randomUUID();
    statement(
      db,
      `INSERT INTO schedule_items
         (id, projectId, title, description, startDate, endDate,
          responsibleParty, estimatedCents, actualCents, markupBasisPoints,
          sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT coalesce(max(sortOrder) + 1, 0) FROM schedule_items WHERE projectId = ?))`,
    ).run(
      id,
      projectId,
      input.title,
      input.description,
      input.startDate,
      input.endDate,
      input.responsibleParty,
      input.estimatedCents,
      input.actualCents,
      input.markupBasisPoints,
      projectId,
    );
    return getScheduleItem(db, id);
  });
}

/**
 * Writes the patch and one variance row per tracked field that changed,
 * in one transaction. The reason is copied onto every row.
 * @param {Database} db
 * @param {string} id
 * @param {ScheduleItemInput} patch
 * @param {string} [reason]
 * @returns {ScheduleItem}
 */
export function patchScheduleItem(db, id, patch, reason = '') {
  return withTransaction(db, () => {
    const before = getScheduleItem(db, id);
    const changes = diffTrackedFields(before, patch);
    const { clause, values } = setClause(patch);
    if (clause) {
      statement(db, `UPDATE schedule_items SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    const insert = statement(
      db,
      `INSERT INTO variances (id, scheduleItemId, kind, field, oldValue, newValue, reason, loggedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const at = now();
    for (const c of changes) {
      insert.run(
        randomUUID(),
        id,
        c.kind,
        c.field,
        c.oldValue,
        c.newValue,
        reason,
        at,
      );
    }
    return getScheduleItem(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {boolean} complete
 * @returns {ScheduleItem}
 */
export function setScheduleItemComplete(db, id, complete) {
  getScheduleItem(db, id);
  statement(db, 'UPDATE schedule_items SET complete = ? WHERE id = ?').run(
    Number(complete),
    id,
  );
  return getScheduleItem(db, id);
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteScheduleItem(db, id) {
  checkUnlinked(db, 'scheduleItemId', id, getScheduleItem(db, id).title);
  const result = statement(db, 'DELETE FROM schedule_items WHERE id = ?').run(
    id,
  );
  if (result.changes === 0) throw notFound('schedule item', id);
}

/**
 * Writes sortOrder from the position of each id. Every id must belong to
 * the project, and every item of the project must be listed once.
 * @param {Database} db
 * @param {string} table
 * @param {string} projectId
 * @param {string[]} ids
 */
export function reorderRows(db, table, projectId, ids) {
  const existing = statement(
    db,
    `SELECT id FROM ${table} WHERE projectId = ? ORDER BY id`,
  )
    .all(projectId)
    .map((r) => String(r.id));
  const given = [...new Set(ids)].sort();
  if (given.length !== ids.length || given.join() !== existing.join()) {
    throw badRequest(
      'ids must list every item of the project exactly once',
      'ids',
    );
  }
  withTransaction(db, () => {
    const update = statement(
      db,
      `UPDATE ${table} SET sortOrder = ? WHERE id = ?`,
    );
    ids.forEach((id, i) => update.run(i, id));
  });
}

/**
 * @param {Database} db
 * @param {string} projectId
 * @param {string[]} ids
 */
export function reorderSchedule(db, projectId, ids) {
  getProject(db, projectId);
  reorderRows(db, 'schedule_items', projectId, ids);
}
