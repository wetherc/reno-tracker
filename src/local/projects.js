// Project rows and the whole-project payload, read from and written to a
// LocalDb. Deleting a project drops every row that belongs to it, which
// matches the ON DELETE CASCADE rules of the SQLite schema.
import { badRequest, notFound } from './errors.js';
import { newId, now } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ProjectInput} ProjectInput */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @param {LocalDb} db
 * @returns {Project[]} newest first, then by name
 */
export function listProjects(db) {
  return [...db.projects].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name),
  );
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {Project}
 */
export function getProject(db, id) {
  const project = db.projects.find((p) => p.id === id);
  if (!project) throw notFound('project', id);
  return project;
}

/**
 * @param {LocalDb} db
 * @param {Pick<Project, 'name' | 'budgetCents' | 'startDate'>} input
 * @returns {Project}
 */
export function createProject(db, input) {
  /** @type {Project} */
  const project = { id: newId(), ...input, createdAt: now() };
  db.projects.push(project);
  return project;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {ProjectInput} patch
 * @returns {Project}
 */
export function patchProject(db, id, patch) {
  const project = getProject(db, id);
  Object.assign(project, patch);
  return project;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteProject(db, id) {
  getProject(db, id);
  const items = new Set(
    db.schedule.filter((s) => s.projectId === id).map((s) => s.id),
  );
  db.projects = db.projects.filter((p) => p.id !== id);
  db.schedule = db.schedule.filter((s) => s.projectId !== id);
  db.dependencies = db.dependencies.filter((d) => d.projectId !== id);
  db.materials = db.materials.filter((m) => m.projectId !== id);
  db.variances = db.variances.filter((v) => !items.has(v.scheduleItemId));
  db.notes = db.notes.filter((n) => !items.has(n.scheduleItemId));
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {ProjectPayload}
 */
export function getProjectPayload(db, id) {
  const project = getProject(db, id);
  const schedule = db.schedule
    .filter((s) => s.projectId === id)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.startDate.localeCompare(b.startDate) ||
        a.title.localeCompare(b.title),
    );
  const items = new Set(schedule.map((s) => s.id));
  return {
    project,
    schedule,
    dependencies: db.dependencies.filter((d) => d.projectId === id),
    variances: db.variances
      .filter((v) => items.has(v.scheduleItemId))
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    notes: db.notes
      .filter((n) => items.has(n.scheduleItemId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    materials: db.materials
      .filter((m) => m.projectId === id)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
  };
}

/**
 * Writes sortOrder from the position of each id. Every id must belong to
 * the project, and every row of the project must be listed once.
 * @param {LocalDb} db
 * @param {'schedule' | 'materials'} kind
 * @param {string} projectId
 * @param {string[]} ids
 */
export function reorderRows(db, kind, projectId, ids) {
  getProject(db, projectId);
  const rows = db[kind].filter((r) => r.projectId === projectId);
  const existing = rows.map((r) => r.id).sort();
  const given = [...new Set(ids)].sort();
  if (given.length !== ids.length || given.join() !== existing.join()) {
    throw badRequest(
      'ids must list every item of the project exactly once',
      'ids',
    );
  }
  for (const row of rows) row.sortOrder = ids.indexOf(row.id);
}
