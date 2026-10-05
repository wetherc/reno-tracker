import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/open.js';
import { notFound } from '../errors.js';
import {
  checkLinks,
  getLines,
  insertLines,
  LINE_KINDS,
  linesByDoc,
  replaceLines,
} from './lines.js';
import { getProject } from './projects.js';
import { setClause, toChangeOrder } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../../types.ts').ChangeOrderInput} ChangeOrderInput */
/** @typedef {import('../../types.ts').NewChangeOrder} NewChangeOrder */

const KIND = LINE_KINDS.changeOrder;

/**
 * Every change order of a project with its lines, oldest issue day
 * first.
 * @param {Database} db
 * @param {string} projectId
 * @returns {ChangeOrder[]}
 */
export function listChangeOrders(db, projectId) {
  const lines = linesByDoc(db, KIND, projectId);
  return statement(
    db,
    'SELECT * FROM change_orders WHERE projectId = ? ORDER BY issuedDate, rowid',
  )
    .all(projectId)
    .map((row) => toChangeOrder(row, lines.get(String(row.id)) ?? []));
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {ChangeOrder}
 */
export function getChangeOrder(db, id) {
  const row = statement(db, 'SELECT * FROM change_orders WHERE id = ?').get(id);
  if (!row) throw notFound('change order', id);
  return toChangeOrder(row, getLines(db, KIND, id));
}

/**
 * Inserts one checked change order row. The caller inserts its lines.
 * @param {Database} db
 * @param {string} projectId
 * @param {NewChangeOrder} input
 * @returns {string} the new id
 */
export function insertChangeOrder(db, projectId, input) {
  const id = randomUUID();
  statement(
    db,
    `INSERT INTO change_orders
       (id, projectId, number, party, issuedDate, approved, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    input.number,
    input.party,
    input.issuedDate,
    Number(input.approved),
    input.description,
  );
  return id;
}

/**
 * @param {Database} db
 * @param {string} projectId
 * @param {NewChangeOrder} input
 * @returns {ChangeOrder}
 */
export function createChangeOrder(db, projectId, input) {
  return withTransaction(db, () => {
    getProject(db, projectId);
    checkLinks(db, KIND, projectId, input.lines);
    const id = insertChangeOrder(db, projectId, input);
    insertLines(db, KIND, id, input.lines);
    return getChangeOrder(db, id);
  });
}

/**
 * Writes the fields of the patch. Lines in the patch replace every line
 * of the change order.
 * @param {Database} db
 * @param {string} id
 * @param {Omit<ChangeOrderInput, 'lines'> & Partial<Pick<NewChangeOrder, 'lines'>>} patch
 * @returns {ChangeOrder}
 */
export function patchChangeOrder(db, id, { lines, ...fields }) {
  return withTransaction(db, () => {
    const before = getChangeOrder(db, id);
    const { clause, values } = setClause(fields);
    if (clause) {
      statement(db, `UPDATE change_orders SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    if (lines) replaceLines(db, KIND, before, lines);
    return getChangeOrder(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteChangeOrder(db, id) {
  const result = statement(db, 'DELETE FROM change_orders WHERE id = ?').run(
    id,
  );
  if (result.changes === 0) throw notFound('change order', id);
}
