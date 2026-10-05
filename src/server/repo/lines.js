// The line tables of invoices and of any other document with lines.
// Each line names one schedule item or one material. Its link to that
// row has no ON DELETE action, so checkUnlinked refuses a delete of a
// row that a line names before SQLite does.
import { randomUUID } from 'node:crypto';
import { badRequest, conflict } from '../errors.js';
import { changeOrderName } from '../../entities/changeOrder.js';
import { invoiceName } from '../../entities/invoice.js';
import { toLineItem } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').LineItem} LineItem */
/** @typedef {import('../../types.ts').NewLineItem} NewLineItem */

/**
 * @typedef {object} LineKind
 * @property {string} docs the table of the documents
 * @property {string} lines the table of their lines
 * @property {string} parent the column of a line that names its document
 * @property {string} verb what a line does to its row, such as "bills"
 * @property {(doc: { number: string, party: string }) => string} name the name of a document in a message
 */

/** @type {Record<'invoice' | 'changeOrder', LineKind>} */
export const LINE_KINDS = {
  invoice: {
    docs: 'invoices',
    lines: 'invoice_lines',
    parent: 'invoiceId',
    verb: 'bills',
    name: invoiceName,
  },
  changeOrder: {
    docs: 'change_orders',
    lines: 'change_order_lines',
    parent: 'changeOrderId',
    verb: 'adds to',
    name: changeOrderName,
  },
};

/**
 * The lines of every document of one project, by document id, each list
 * in line order.
 * @param {Database} db
 * @param {LineKind} kind
 * @param {string} projectId
 * @returns {Map<string, LineItem[]>}
 */
export function linesByDoc(db, kind, projectId) {
  /** @type {Map<string, LineItem[]>} */
  const byDoc = new Map();
  const rows = statement(
    db,
    `SELECT l.* FROM ${kind.lines} l
       JOIN ${kind.docs} d ON d.id = l.${kind.parent}
       WHERE d.projectId = ? ORDER BY l.position`,
  ).all(projectId);
  for (const row of rows) {
    const id = String(row[kind.parent]);
    byDoc.set(id, [...(byDoc.get(id) ?? []), toLineItem(row)]);
  }
  return byDoc;
}

/**
 * @param {Database} db
 * @param {LineKind} kind
 * @param {string} docId
 * @returns {LineItem[]} in line order
 */
export function getLines(db, kind, docId) {
  return statement(
    db,
    `SELECT * FROM ${kind.lines} WHERE ${kind.parent} = ? ORDER BY position`,
  )
    .all(docId)
    .map(toLineItem);
}

/**
 * Every row a line names must belong to the document's project.
 * @param {Database} db
 * @param {LineKind} kind
 * @param {string} projectId
 * @param {NewLineItem[]} lines
 */
export function checkLinks(db, kind, projectId, lines) {
  lines.forEach((line, i) => {
    const [table, what] = line.scheduleItemId
      ? ['schedule_items', 'schedule item']
      : ['material_items', 'material'];
    const id = line.scheduleItemId ?? line.materialItemId;
    const row = statement(
      db,
      `SELECT projectId FROM ${table} WHERE id = ?`,
    ).get(id);
    if (!row || row.projectId !== projectId) {
      throw badRequest(
        `line ${i + 1} ${kind.verb} a ${what} that is not in this project`,
        `lines.${i}.item`,
      );
    }
  });
}

/**
 * Inserts lines with fresh ids, in the order given. The caller maps
 * the row links first.
 * @param {Database} db
 * @param {LineKind} kind
 * @param {string} docId
 * @param {NewLineItem[]} lines
 */
export function insertLines(db, kind, docId, lines) {
  const insert = statement(
    db,
    `INSERT INTO ${kind.lines}
       (id, ${kind.parent}, position, scheduleItemId, materialItemId, description, amountCents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, i) =>
    insert.run(
      randomUUID(),
      docId,
      i,
      line.scheduleItemId,
      line.materialItemId,
      line.description,
      line.amountCents,
    ),
  );
}

/**
 * Checks the links of the lines, then puts them in place of every line
 * of the document.
 * @param {Database} db
 * @param {LineKind} kind
 * @param {{ id: string, projectId: string }} doc
 * @param {NewLineItem[]} lines
 */
export function replaceLines(db, kind, doc, lines) {
  checkLinks(db, kind, doc.projectId, lines);
  statement(db, `DELETE FROM ${kind.lines} WHERE ${kind.parent} = ?`).run(
    doc.id,
  );
  insertLines(db, kind, doc.id, lines);
}

/**
 * Refuses to delete a schedule item or material that a line names,
 * because the delete would change the total of that line's document.
 * The earliest document of the first kind in LINE_KINDS that names the
 * row goes in the message.
 * @param {Database} db
 * @param {'scheduleItemId' | 'materialItemId'} column
 * @param {string} id
 * @param {string} name the row's title or name
 */
export function checkUnlinked(db, column, id, name) {
  for (const kind of Object.values(LINE_KINDS)) {
    const row = statement(
      db,
      `SELECT d.number, d.party FROM ${kind.lines} l
         JOIN ${kind.docs} d ON d.id = l.${kind.parent}
         WHERE l.${column} = ? ORDER BY d.issuedDate, d.rowid LIMIT 1`,
    ).get(id);
    if (row) {
      const doc = { number: String(row.number), party: String(row.party) };
      throw conflict(
        `${kind.name(doc)} ${kind.verb} ${name}. Remove that line first.`,
      );
    }
  }
}
