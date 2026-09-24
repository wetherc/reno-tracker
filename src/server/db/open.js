// Opens the database, sets pragmas, and brings the schema up to date.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrate.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */

export const DEFAULT_DB_PATH = './data/reno.sqlite';

/**
 * @param {string} [path] file path, or ':memory:' for tests
 * @returns {Database}
 */
export function openDatabase(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

/**
 * Runs fn inside one transaction. A thrown error rolls back and rethrows.
 * SQLite has one transaction per connection, so a call inside an open
 * transaction runs fn in that transaction, and the outermost call
 * commits or rolls back.
 * @template T
 * @param {Database} db
 * @param {() => T} fn
 * @returns {T}
 */
export function withTransaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
