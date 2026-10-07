import { randomUUID } from 'node:crypto';
import { findCycle } from '../../schedule/graph.js';
import { conflict, notFound } from '../errors.js';
import { getScheduleItem, linkedItem } from './schedule.js';
import { toDependency } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').Dependency} Dependency */

/**
 * @param {Database} db
 * @param {string} projectId
 * @returns {Dependency[]}
 */
export function listDependencies(db, projectId) {
  return statement(
    db,
    'SELECT * FROM dependencies WHERE projectId = ? ORDER BY rowid',
  )
    .all(projectId)
    .map(toDependency);
}

/**
 * Both items must belong to the project. A loop is rejected with a
 * message that walks the loop by item title.
 * @param {Database} db
 * @param {string} projectId
 * @param {import('../../types.ts').DependencyInput} input
 * @returns {Dependency}
 */
export function createDependency(db, projectId, input) {
  const pred = linkedItem(db, projectId, input.predecessorId, 'predecessorId');
  const succ = linkedItem(db, projectId, input.successorId, 'successorId');
  const existing = listDependencies(db, projectId);
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
  const id = randomUUID();
  statement(
    db,
    'INSERT INTO dependencies (id, projectId, predecessorId, successorId) VALUES (?, ?, ?, ?)',
  ).run(id, projectId, pred.id, succ.id);
  return toDependency(
    /** @type {Record<string, unknown>} */ (
      statement(db, 'SELECT * FROM dependencies WHERE id = ?').get(id)
    ),
  );
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteDependency(db, id) {
  const result = statement(db, 'DELETE FROM dependencies WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('dependency', id);
}
