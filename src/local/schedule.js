// Schedule items, their variance log, notes, and dependencies in a
// LocalDb. A patch writes one variance row per tracked field that
// changed, the same way the server does.
import { diffTrackedFields } from '../entities/variance.js';
import { findCycle } from '../schedule/graph.js';
import { badRequest, conflict, notFound } from './errors.js';
import { getProject } from './projects.js';
import { newId, now } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').ScheduleItemInput} ScheduleItemInput */
/** @typedef {import('../types.ts').Note} Note */
/** @typedef {import('../types.ts').Dependency} Dependency */

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {ScheduleItem}
 */
export function getScheduleItem(db, id) {
  const item = db.schedule.find((s) => s.id === id);
  if (!item) throw notFound('schedule item', id);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {'schedule' | 'materials'} kind
 * @param {string} projectId
 */
export function nextSortOrder(db, kind, projectId) {
  const orders = db[kind]
    .filter((r) => r.projectId === projectId)
    .map((r) => r.sortOrder);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/**
 * New items go to the end of the list.
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {Required<ScheduleItemInput>} input
 * @returns {ScheduleItem}
 */
export function createScheduleItem(db, projectId, input) {
  getProject(db, projectId);
  /** @type {ScheduleItem} */
  const item = {
    id: newId(),
    projectId,
    ...input,
    complete: false,
    sortOrder: nextSortOrder(db, 'schedule', projectId),
  };
  db.schedule.push(item);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {ScheduleItemInput} patch
 * @param {string} reason copied onto every variance row
 * @returns {ScheduleItem}
 */
export function patchScheduleItem(db, id, patch, reason) {
  const item = getScheduleItem(db, id);
  const changes = diffTrackedFields(item, patch);
  const loggedAt = now();
  for (const c of changes) {
    db.variances.push({
      id: newId(),
      scheduleItemId: id,
      reason,
      loggedAt,
      ...c,
    });
  }
  Object.assign(item, patch);
  return item;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {boolean} complete
 * @returns {ScheduleItem}
 */
export function setScheduleItemComplete(db, id, complete) {
  const item = getScheduleItem(db, id);
  item.complete = complete;
  return item;
}

/**
 * Drops the item with its variances, notes, and dependencies, and unlinks
 * any material that pointed at it.
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteScheduleItem(db, id) {
  getScheduleItem(db, id);
  db.schedule = db.schedule.filter((s) => s.id !== id);
  db.variances = db.variances.filter((v) => v.scheduleItemId !== id);
  db.notes = db.notes.filter((n) => n.scheduleItemId !== id);
  db.dependencies = db.dependencies.filter(
    (d) => d.predecessorId !== id && d.successorId !== id,
  );
  for (const m of db.materials) {
    if (m.scheduleItemId === id) m.scheduleItemId = null;
  }
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {Note}
 */
export function getNote(db, id) {
  const note = db.notes.find((n) => n.id === id);
  if (!note) throw notFound('note', id);
  return note;
}

/**
 * @param {LocalDb} db
 * @param {string} scheduleItemId
 * @param {string} body
 * @returns {Note}
 */
export function createNote(db, scheduleItemId, body) {
  getScheduleItem(db, scheduleItemId);
  const at = now();
  /** @type {Note} */
  const note = {
    id: newId(),
    scheduleItemId,
    body,
    createdAt: at,
    updatedAt: at,
  };
  db.notes.push(note);
  return note;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 * @param {string} body
 * @returns {Note}
 */
export function patchNote(db, id, body) {
  const note = getNote(db, id);
  note.body = body;
  note.updatedAt = now();
  return note;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteNote(db, id) {
  getNote(db, id);
  db.notes = db.notes.filter((n) => n.id !== id);
}

/**
 * Both items must belong to the project. A loop is rejected with a
 * message that walks the loop by item title.
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {import('../types.ts').DependencyInput} input
 * @returns {Dependency}
 */
export function createDependency(db, projectId, input) {
  const pred = getScheduleItem(db, input.predecessorId);
  const succ = getScheduleItem(db, input.successorId);
  if (pred.projectId !== projectId) {
    throw badRequest(
      'predecessorId belongs to another project',
      'predecessorId',
    );
  }
  if (succ.projectId !== projectId) {
    throw badRequest('successorId belongs to another project', 'successorId');
  }
  const existing = db.dependencies.filter((d) => d.projectId === projectId);
  if (
    existing.some(
      (d) => d.predecessorId === pred.id && d.successorId === succ.id,
    )
  ) {
    throw conflict(
      `${succ.title} already depends on ${pred.title}`,
      'predecessorId',
    );
  }
  const loop = findCycle(existing, input);
  if (loop) {
    const titles = loop.map((id) => getScheduleItem(db, id).title);
    throw conflict(
      `This dependency makes a loop: ${titles.join(' -> ')}`,
      'predecessorId',
    );
  }
  /** @type {Dependency} */
  const dep = {
    id: newId(),
    projectId,
    predecessorId: pred.id,
    successorId: succ.id,
  };
  db.dependencies.push(dep);
  return dep;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteDependency(db, id) {
  if (!db.dependencies.some((d) => d.id === id))
    throw notFound('dependency', id);
  db.dependencies = db.dependencies.filter((d) => d.id !== id);
}
