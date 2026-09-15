import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { badRequest, notFound } from '../errors.js';
import { diffTrackedFields } from '../../entities/variance.js';
import { getProject } from './projects.js';
import { now, setClause, toScheduleItem } from './rows.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../../types.ts').ScheduleItemInput} ScheduleItemInput */

/**
 * @param {Database} db
 * @param {string} id
 * @returns {ScheduleItem}
 */
export function getScheduleItem(db, id) {
  const row = db.prepare('SELECT * FROM schedule_items WHERE id = ?').get(id);
  if (!row) throw notFound('schedule item', id);
  return toScheduleItem(row);
}

/**
 * New items go to the end of the list.
 * @param {Database} db
 * @param {string} projectId
 * @param {Required<ScheduleItemInput>} input
 * @returns {ScheduleItem}
 */
export function createScheduleItem(db, projectId, input) {
  getProject(db, projectId);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO schedule_items
       (id, projectId, title, description, startDate, endDate,
        responsibleParty, estimatedCents, actualCents, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
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
    projectId,
  );
  return getScheduleItem(db, id);
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
      db.prepare(`UPDATE schedule_items SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    const insert = db.prepare(
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
  db.prepare('UPDATE schedule_items SET complete = ? WHERE id = ?').run(
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
  const result = db.prepare('DELETE FROM schedule_items WHERE id = ?').run(id);
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
  const existing = db
    .prepare(`SELECT id FROM ${table} WHERE projectId = ? ORDER BY id`)
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
    const update = db.prepare(`UPDATE ${table} SET sortOrder = ? WHERE id = ?`);
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
