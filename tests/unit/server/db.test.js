import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  listMigrations,
  migrate,
  schemaVersion,
  SCHEMA_PATH,
} from '../../../src/server/db/migrate.js';
import { openDatabase, withTransaction } from '../../../src/server/db/open.js';

const TABLES = [
  'meta',
  'projects',
  'schedule_items',
  'dependencies',
  'variances',
  'notes',
  'material_items',
];

/** @param {DatabaseSync} db */
function tableNames(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    )
    .all()
    .map((r) => r.name);
}

/** @param {(dir: string) => void} run */
function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'reno-db-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('openDatabase on :memory: creates every table and sets the version', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(tableNames(db), [...TABLES].sort());
  assert.equal(schemaVersion(db), 1);
  assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  db.close();
});

test('openDatabase creates the parent directory of a file path', () => {
  withTempDir((dir) => {
    const path = join(dir, 'nested', 'reno.sqlite');
    const db = openDatabase(path);
    assert.ok(existsSync(path));
    assert.equal(db.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
    db.close();
  });
});

test('migrate is idempotent', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(migrate(db), []);
  assert.equal(schemaVersion(db), 1);
  db.close();
});

test('migrate applies numbered files in order and skips applied ones', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '002-two.sql'), 'CREATE TABLE two (x);');
    writeFileSync(join(dir, '001-one.sql'), 'CREATE TABLE one (x);');
    writeFileSync(join(dir, 'README.md'), 'not a migration');
    writeFileSync(join(dir, '010-ten.sql'), 'CREATE TABLE ten (x);');
    assert.deepEqual(
      listMigrations(dir).map((m) => m.version),
      [1, 2, 10],
    );
    const db = new DatabaseSync(':memory:');
    const paths = { schemaPath: SCHEMA_PATH, migrationsDir: dir };
    assert.deepEqual(migrate(db, paths), [1, 2, 10]);
    assert.equal(schemaVersion(db), 10);
    assert.deepEqual(tableNames(db), ['meta', 'one', 'ten', 'two']);
    writeFileSync(join(dir, '011-eleven.sql'), 'CREATE TABLE eleven (x);');
    assert.deepEqual(migrate(db, paths), [11]);
    db.close();
  });
});

test('a failing migration rolls back and leaves the version unchanged', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '001-ok.sql'), 'CREATE TABLE ok (x);');
    writeFileSync(
      join(dir, '002-bad.sql'),
      'CREATE TABLE half (x); CREATE TABLE half (x);',
    );
    const db = new DatabaseSync(':memory:');
    const paths = { schemaPath: SCHEMA_PATH, migrationsDir: dir };
    assert.throws(() => migrate(db, paths), /already exists/);
    assert.equal(schemaVersion(db), 1);
    assert.deepEqual(tableNames(db), ['meta', 'ok']);
    db.close();
  });
});

test('withTransaction commits on success and rolls back on error', () => {
  const db = openDatabase(':memory:');
  const insert = db.prepare(
    `INSERT INTO projects (id, name, startDate, createdAt) VALUES (?, 'p', '2026-01-01', 'now')`,
  );
  const count = () => db.prepare('SELECT count(*) n FROM projects').get()?.n;
  assert.equal(
    withTransaction(db, () => {
      insert.run('a');
      return 'done';
    }),
    'done',
  );
  assert.throws(
    () =>
      withTransaction(db, () => {
        insert.run('b');
        throw new Error('stop');
      }),
    /stop/,
  );
  assert.equal(count(), 1);
  db.close();
});
