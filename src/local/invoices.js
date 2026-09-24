// Invoices in a LocalDb. Each invoice keeps its lines and payments. Every row a line
// bills must belong to the invoice's project, and a billed row cannot be
// deleted, the same as on the server.
import { invoiceName } from '../entities/invoice.js';
import { badRequest, conflict, notFound } from './errors.js';
import { getProject } from './projects.js';
import { newId } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').InvoiceInput} InvoiceInput */
/** @typedef {import('../types.ts').NewInvoice} NewInvoice */

/**
 * @param {LocalDb} db
 * @param {string} id
 * @returns {Invoice}
 */
export function getInvoice(db, id) {
  const invoice = db.invoices.find((i) => i.id === id);
  if (!invoice) throw notFound('invoice', id);
  return invoice;
}

/**
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {NewInvoice['lines']} lines
 * @returns {Invoice['lines']} the lines with fresh ids
 */
function linesFor(db, projectId, lines) {
  return lines.map((line, i) => {
    const row = line.scheduleItemId
      ? db.schedule.find((s) => s.id === line.scheduleItemId)
      : db.materials.find((m) => m.id === line.materialItemId);
    if (row?.projectId !== projectId) {
      const what = line.scheduleItemId ? 'schedule item' : 'material';
      throw badRequest(
        `line ${i + 1} bills a ${what} that is not in this project`,
        `lines.${i}.item`,
      );
    }
    return { id: newId(), ...line };
  });
}

/**
 * @param {NewInvoice['payments']} payments
 * @returns {Invoice['payments']} the payments with fresh ids
 */
export const withIds = (payments) =>
  payments.map((p) => ({ id: newId(), ...p }));

/**
 * @param {LocalDb} db
 * @param {string} projectId
 * @param {NewInvoice} input
 * @returns {Invoice}
 */
export function createInvoice(db, projectId, input) {
  getProject(db, projectId);
  /** @type {Invoice} */
  const invoice = {
    id: newId(),
    projectId,
    ...input,
    lines: linesFor(db, projectId, input.lines),
    payments: withIds(input.payments),
  };
  db.invoices.push(invoice);
  return invoice;
}

/**
 * Lines in the patch replace every line of the invoice, and payments
 * replace every payment.
 * @param {LocalDb} db
 * @param {string} id
 * @param {Omit<InvoiceInput, 'lines' | 'payments'> & Partial<Pick<NewInvoice, 'lines' | 'payments'>>} patch
 * @returns {Invoice}
 */
export function patchInvoice(db, id, { lines, payments, ...fields }) {
  const invoice = getInvoice(db, id);
  const next = lines ? linesFor(db, invoice.projectId, lines) : invoice.lines;
  Object.assign(invoice, fields, {
    lines: next,
    payments: payments ? withIds(payments) : invoice.payments,
  });
  return invoice;
}

/**
 * @param {LocalDb} db
 * @param {string} id
 */
export function deleteInvoice(db, id) {
  getInvoice(db, id);
  db.invoices = db.invoices.filter((i) => i.id !== id);
}

/**
 * Refuses to delete a schedule item or material that an invoice line
 * bills, because the delete would change that invoice's total.
 * @param {LocalDb} db
 * @param {'scheduleItemId' | 'materialItemId'} key
 * @param {string} id
 * @param {string} name the row's title or name
 */
export function checkUnbilled(db, key, id, name) {
  const invoice = db.invoices
    .filter((i) => i.lines.some((l) => l[key] === id))
    .sort((a, b) => a.issuedDate.localeCompare(b.issuedDate))[0];
  if (invoice) {
    throw conflict(
      `${invoiceName(invoice)} bills ${name}. Remove that line first.`,
    );
  }
}
