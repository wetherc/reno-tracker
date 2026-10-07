// Project rows and the whole-project payload, read from and written to a
// LocalDb. Deleting a project drops every row that belongs to it, which
// matches the ON DELETE CASCADE rules of the SQLite schema.
import { compareText } from './compareText.js';
import { badRequest, notFound } from './errors.js';
import { newId, now, removeRows } from './store.js';

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
      compareText(b.createdAt, a.createdAt) || compareText(a.name, b.name),
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
 * @param {import('../types.ts').NewProject} input
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
  removeRows(db, id);
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
        compareText(a.startDate, b.startDate) ||
        compareText(a.title, b.title),
    );
  const items = new Set(schedule.map((s) => s.id));
  return {
    project,
    schedule,
    dependencies: db.dependencies.filter((d) => d.projectId === id),
    notes: db.notes
      .filter((n) => items.has(n.scheduleItemId))
      .sort((a, b) => compareText(a.createdAt, b.createdAt)),
    materials: db.materials
      .filter((m) => m.projectId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || compareText(a.name, b.name)),
    invoices: db.invoices
      .filter((i) => i.projectId === id)
      .sort((a, b) => compareText(a.issuedDate, b.issuedDate)),
    changeOrders: db.changeOrders
      .filter((c) => c.projectId === id)
      .sort((a, b) => compareText(a.issuedDate, b.issuedDate)),
  };
}

/**
 * Every change row of a project, oldest first.
 * @param {LocalDb} db
 * @param {string} id
 * @returns {import('../types.ts').Variance[]}
 */
export function getProjectVariances(db, id) {
  const items = new Set(
    db.schedule.filter((s) => s.projectId === id).map((s) => s.id),
  );
  return db.variances
    .filter((v) => items.has(v.scheduleItemId))
    .sort((a, b) => compareText(a.loggedAt, b.loggedAt));
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
