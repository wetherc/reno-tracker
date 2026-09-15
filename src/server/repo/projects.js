import { randomUUID } from 'node:crypto';
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

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').Project} Project */
/** @typedef {import('../../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {Database} db
 * @returns {Project[]} newest first
 */
export function listProjects(db) {
  return db
    .prepare('SELECT * FROM projects ORDER BY createdAt DESC, name')
    .all()
    .map(toProject);
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {Project}
 */
export function getProject(db, id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) throw notFound('project', id);
  return toProject(row);
}

/**
 * @param {Database} db
 * @param {Pick<Project, 'name' | 'budgetCents' | 'startDate'>} input
 * @returns {Project}
 */
export function createProject(db, input) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO projects (id, name, budgetCents, startDate, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.budgetCents, input.startDate, now());
  return getProject(db, id);
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {import('../../types.ts').ProjectInput} patch
 * @returns {Project}
 */
export function patchProject(db, id, patch) {
  getProject(db, id);
  const { clause, values } = setClause(patch);
  if (clause) {
    db.prepare(`UPDATE projects SET ${clause} WHERE id = ?`).run(...values, id);
  }
  return getProject(db, id);
}

/**
 * Cascades to every child row.
 * @param {Database} db
 * @param {string} id
 */
export function deleteProject(db, id) {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('project', id);
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {ProjectPayload}
 */
export function getProjectPayload(db, id) {
  const project = getProject(db, id);
  /** @param {string} sql */
  const rows = (sql) => db.prepare(sql).all(id);
  return {
    project,
    schedule: rows(
      'SELECT * FROM schedule_items WHERE projectId = ? ORDER BY sortOrder, startDate, title',
    ).map(toScheduleItem),
    dependencies: rows(
      'SELECT * FROM dependencies WHERE projectId = ? ORDER BY rowid',
    ).map(toDependency),
    variances: rows(
      `SELECT v.* FROM variances v
       JOIN schedule_items s ON s.id = v.scheduleItemId
       WHERE s.projectId = ? ORDER BY v.loggedAt, v.rowid`,
    ).map(toVariance),
    notes: rows(
      `SELECT n.* FROM notes n
       JOIN schedule_items s ON s.id = n.scheduleItemId
       WHERE s.projectId = ? ORDER BY n.createdAt, n.rowid`,
    ).map(toNote),
    materials: rows(
      'SELECT * FROM material_items WHERE projectId = ? ORDER BY sortOrder, name',
    ).map(toMaterialItem),
  };
}
