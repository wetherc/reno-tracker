import { randomUUID } from 'node:crypto';
import { notFound } from '../errors.js';
import { getScheduleItem } from './schedule.js';
import { now, toNote } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').Note} Note */

/**
 * @param {Database} db
 * @param {string} id
 * @returns {Note}
 */
export function getNote(db, id) {
  const row = statement(db, 'SELECT * FROM notes WHERE id = ?').get(id);
  if (!row) throw notFound('note', id);
  return toNote(row);
}

/**
 * @param {Database} db
 * @param {string} scheduleItemId
 * @param {string} body
 * @returns {Note}
 */
export function createNote(db, scheduleItemId, body) {
  getScheduleItem(db, scheduleItemId);
  const id = randomUUID();
  const at = now();
  statement(
    db,
    'INSERT INTO notes (id, scheduleItemId, body, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
  ).run(id, scheduleItemId, body, at, at);
  return getNote(db, id);
}

/**
 * @param {Database} db
 * @param {string} id
 * @param {string} body
 * @returns {Note}
 */
export function patchNote(db, id, body) {
  getNote(db, id);
  statement(db, 'UPDATE notes SET body = ?, updatedAt = ? WHERE id = ?').run(
    body,
    now(),
    id,
  );
  return getNote(db, id);
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteNote(db, id) {
  const result = statement(db, 'DELETE FROM notes WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('note', id);
}
