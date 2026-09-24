// Prepared statements, kept per database and SQL text. node:sqlite parses
// and plans the SQL on every prepare call, so each statement is prepared
// once and used again on later requests. The SQL texts are fixed strings
// or a set clause built from the tracked field names, so the cache stays
// small.

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('node:sqlite').StatementSync} StatementSync */

/** @type {WeakMap<Database, Map<string, StatementSync>>} */
const cache = new WeakMap();

/**
 * @param {Database} db
 * @param {string} sql
 * @returns {StatementSync}
 */
export function statement(db, sql) {
  let byText = cache.get(db);
  if (!byText) {
    byText = new Map();
    cache.set(db, byText);
  }
  let prepared = byText.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    byText.set(sql, prepared);
  }
  return prepared;
}
