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
import { setClause, toInvoice, toPayment } from './rows.js';
import { statement } from './statements.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../types.ts').Invoice} Invoice */
/** @typedef {import('../../types.ts').InvoiceInput} InvoiceInput */
/** @typedef {import('../../types.ts').NewInvoice} NewInvoice */

/**
 * Every invoice of a project with its lines and payments, oldest issue
 * day first.
 * @param {Database} db
 * @param {string} projectId
 * @returns {Invoice[]}
 */
export function listInvoices(db, projectId) {
  const lines = linesByDoc(db, LINE_KINDS.invoice, projectId);
  const payments = statement(
    db,
    `SELECT p.* FROM invoice_payments p
       JOIN invoices i ON i.id = p.invoiceId
       WHERE i.projectId = ? ORDER BY p.position`,
  ).all(projectId);
  return statement(
    db,
    'SELECT * FROM invoices WHERE projectId = ? ORDER BY issuedDate, rowid',
  )
    .all(projectId)
    .map((row) =>
      toInvoice(
        row,
        lines.get(String(row.id)) ?? [],
        payments.filter((p) => p.invoiceId === row.id).map(toPayment),
      ),
    );
}

/**
 * @param {Database} db
 * @param {string} id
 * @returns {Invoice}
 */
export function getInvoice(db, id) {
  const row = statement(db, 'SELECT * FROM invoices WHERE id = ?').get(id);
  if (!row) throw notFound('invoice', id);
  const lines = getLines(db, LINE_KINDS.invoice, id);
  const payments = statement(
    db,
    'SELECT * FROM invoice_payments WHERE invoiceId = ? ORDER BY position',
  )
    .all(id)
    .map(toPayment);
  return toInvoice(row, lines, payments);
}

/**
 * @param {Database} db
 * @param {string} invoiceId
 * @param {NewInvoice['payments']} payments
 */
export function insertPayments(db, invoiceId, payments) {
  const insert = statement(
    db,
    `INSERT INTO invoice_payments
       (id, invoiceId, position, paidDate, amountCents, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  payments.forEach((p, i) =>
    insert.run(randomUUID(), invoiceId, i, p.paidDate, p.amountCents, p.note),
  );
}

/**
 * @param {Database} db
 * @param {string} projectId
 * @param {NewInvoice} input
 * @returns {Invoice}
 */
export function createInvoice(db, projectId, input) {
  return withTransaction(db, () => {
    getProject(db, projectId);
    checkLinks(db, LINE_KINDS.invoice, projectId, input.lines);
    const id = randomUUID();
    statement(
      db,
      `INSERT INTO invoices
         (id, projectId, number, party, issuedDate, dueDate,
          markupBasisPoints, retainageCents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      input.number,
      input.party,
      input.issuedDate,
      input.dueDate,
      input.markupBasisPoints,
      input.retainageCents,
    );
    insertLines(db, LINE_KINDS.invoice, id, input.lines);
    insertPayments(db, id, input.payments);
    return getInvoice(db, id);
  });
}

/**
 * Writes the fields of the patch. Lines in the patch replace every line
 * of the invoice, and payments replace every payment.
 * @param {Database} db
 * @param {string} id
 * @param {Omit<InvoiceInput, 'lines' | 'payments'> & Partial<Pick<NewInvoice, 'lines' | 'payments'>>} patch
 * @returns {Invoice}
 */
export function patchInvoice(db, id, { lines, payments, ...fields }) {
  return withTransaction(db, () => {
    const before = getInvoice(db, id);
    const { clause, values } = setClause(fields);
    if (clause) {
      statement(db, `UPDATE invoices SET ${clause} WHERE id = ?`).run(
        ...values,
        id,
      );
    }
    if (lines) replaceLines(db, LINE_KINDS.invoice, before, lines);
    if (payments) {
      statement(db, 'DELETE FROM invoice_payments WHERE invoiceId = ?').run(id);
      insertPayments(db, id, payments);
    }
    return getInvoice(db, id);
  });
}

/**
 * @param {Database} db
 * @param {string} id
 */
export function deleteInvoice(db, id) {
  const result = statement(db, 'DELETE FROM invoices WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('invoice', id);
}
