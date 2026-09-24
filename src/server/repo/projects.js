import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { notFound } from '../errors.js';
import {
  now,
  setClause,
  toDependency,
  toMaterialItem,
  toNote,
  toProject,
  toScheduleItem,
  toVariance,
} from './rows.js';
import { statement } from './statements.js';
import { listInvoices } from './invoices.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').Project} Project */
/** @typedef {import('../../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {Database} db
 * @returns {Project[]} newest first
 */
export function listProjects(db) {
  return statement(db, 'SELECT * FROM projects ORDER BY createdAt DESC, name')
    .all()
    .map(toProject);
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {Project}
 */
export function getProject(db, id) {
  const row = statement(db, 'SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) throw notFound('project', id);
  return toProject(row);
}

/**
 * @param {Database} db
 * @param {import('../../types.ts').NewProject} input
 * @returns {Project}
 */
export function createProject(db, input) {
  return withTransaction(db, () => {
    const id = randomUUID();
    statement(
      db,
      `INSERT INTO projects
         (id, name, budgetCents, markupBasisPoints, startDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.budgetCents,
      input.markupBasisPoints,
      input.startDate,
      now(),
    );
    return getProject(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {import('../../types.ts').ProjectInput} patch
 * @returns {Project}
 */
export function patchProject(db, id, patch) {
  return withTransaction(db, () => {
    getProject(db, id);
    const { clause, values } = setClause(patch);
    if (clause) {
      statement(db, `UPDATE projects SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    return getProject(db, id);
  });
}

/**
 * Cascades to every child row.
 * @param {Database} db
 * @param {string} id
 */
export function deleteProject(db, id) {
  const result = statement(db, 'DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('project', id);
}

/**
 * Every change row of a project, oldest first.
 * @param {Database} db
 * @param {string} id
 * @returns {import('../../types.ts').Variance[]}
 */
export function getProjectVariances(db, id) {
  return statement(
    db,
    `SELECT v.* FROM variances v
       JOIN schedule_items s ON s.id = v.scheduleItemId
       WHERE s.projectId = ? ORDER BY v.loggedAt, v.rowid`,
  )
    .all(id)
    .map(toVariance);
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {ProjectPayload}
 */
export function getProjectPayload(db, id) {
  const project = getProject(db, id);
  /** @param {string} sql */
  const rows = (sql) => statement(db, sql).all(id);
  return {
    project,
    schedule: rows(
      'SELECT * FROM schedule_items WHERE projectId = ? ORDER BY sortOrder, startDate, title',
    ).map(toScheduleItem),
    dependencies: rows(
      'SELECT * FROM dependencies WHERE projectId = ? ORDER BY rowid',
    ).map(toDependency),
    notes: rows(
      `SELECT n.* FROM notes n
       JOIN schedule_items s ON s.id = n.scheduleItemId
       WHERE s.projectId = ? ORDER BY n.createdAt, n.rowid`,
    ).map(toNote),
    materials: rows(
      'SELECT * FROM material_items WHERE projectId = ? ORDER BY sortOrder, name',
    ).map(toMaterialItem),
    invoices: listInvoices(db, id),
  };
}
