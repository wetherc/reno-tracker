import {
  invoiceDefaults,
  lineDefaults,
  pickLines,
  validateInvoice,
} from '../../entities/invoice.js';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  patchInvoice,
} from '../repo/invoices.js';
import { asObject, pick, rejectInvalid } from './input.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../router.js').Router} Router */
/** @typedef {import('../../types.ts').InvoiceInput} InvoiceInput */

export const INVOICE_FIELDS = /** @type {const} */ ([
  'number',
  'party',
  'issuedDate',
  'dueDate',
  'lines',
]);

/**
 * @param {Router} router
 * @param {Database} db
 */
export function invoiceRoutes(router, db) {
  router.post('/api/projects/:id/invoices', ({ params, body }) => {
    const input = pick(asObject(body), INVOICE_FIELDS);
    rejectInvalid(validateInvoice(input));
    input.lines = pickLines(input.lines);
    return createInvoice(
      db,
      params.id,
      invoiceDefaults(/** @type {InvoiceInput} */ (input)),
    );
  });
  router.patch('/api/invoices/:id', ({ params, body }) => {
    const input = pick(asObject(body), INVOICE_FIELDS);
    const current = getInvoice(db, params.id);
    rejectInvalid(validateInvoice(input, { partial: true, current }));
    const { lines, ...fields } = /** @type {InvoiceInput} */ (input);
    return patchInvoice(db, params.id, {
      ...fields,
      ...(lines && { lines: pickLines(lines).map(lineDefaults) }),
    });
  });
  router.delete('/api/invoices/:id', ({ params }) => {
    deleteInvoice(db, params.id);
  });
}
