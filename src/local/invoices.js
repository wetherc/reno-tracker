// Invoices in a LocalDb. Each invoice keeps its lines and payments.
import { notFound } from './errors.js';
import { LINE_KINDS, linesFor } from './lines.js';
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
    lines: linesFor(db, LINE_KINDS.invoice, projectId, input.lines),
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
  const next = lines
    ? linesFor(db, LINE_KINDS.invoice, invoice.projectId, lines)
    : invoice.lines;
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
