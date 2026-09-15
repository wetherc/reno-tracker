// Applies numbered SQL files in order. A file named `007-anything.sql` is
// migration 7. Each file runs inside its own transaction together with
// the schemaVersion update, so a failed migration leaves the version
// untouched and the next start retries it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {import('node:sqlite').DatabaseSync} DatabaseSync */

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const SCHEMA_PATH = join(HERE, 'schema.sql');
export const MIGRATIONS_DIR = join(HERE, 'migrations');

const FILE_NAME = /^(\d+)-.*\.sql$/;

/**
 * @typedef {{ version: number, file: string }} Migration
 */

/**
 * Lists migrations in a directory, sorted by version number.
 * @param {string} dir
 * @returns {Migration[]}
 */
export function listMigrations(dir) {
  return readdirSync(dir)
    .map((file) => {
      const match = FILE_NAME.exec(file);
      return match
        ? { version: Number(match[1]), file: join(dir, file) }
        : null;
    })
    .filter((m) => m !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * @param {DatabaseSync} db
 * @returns {number}
 */
export function schemaVersion(db) {
  const row = /** @type {{ value: string } | undefined} */ (
    db.prepare(`SELECT value FROM meta WHERE key = 'schemaVersion'`).get()
  );
  return row ? Number(row.value) : 0;
}

/**
 * Runs the bootstrap schema, then every migration above the stored
 * version. Returns the versions it applied, in order.
 * @param {DatabaseSync} db
 * @param {{ schemaPath?: string, migrationsDir?: string }} [paths]
 * @returns {number[]}
 */
export function migrate(db, paths = {}) {
  db.exec(readFileSync(paths.schemaPath ?? SCHEMA_PATH, 'utf8'));
  const current = schemaVersion(db);
  const setVersion = db.prepare(
    `UPDATE meta SET value = ? WHERE key = 'schemaVersion'`,
  );
  /** @type {number[]} */
  const applied = [];
  for (const m of listMigrations(paths.migrationsDir ?? MIGRATIONS_DIR)) {
    if (m.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(m.file, 'utf8'));
      setVersion.run(String(m.version));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    applied.push(m.version);
  }
  return applied;
}
