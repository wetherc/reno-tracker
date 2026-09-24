import {
  cleanInvoiceInput,
  INVOICE_FIELDS,
  invoiceDefaults,
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

/**
 * @param {Router} router
 * @param {Database} db
 */
export function invoiceRoutes(router, db) {
  router.post('/api/projects/:id/invoices', ({ params, body }) => {
    const input = pick(asObject(body), INVOICE_FIELDS);
    rejectInvalid(validateInvoice(input));
    return createInvoice(
      db,
      params.id,
      invoiceDefaults(cleanInvoiceInput(input)),
    );
  });
  router.patch('/api/invoices/:id', ({ params, body }) => {
    const input = pick(asObject(body), INVOICE_FIELDS);
    const current = getInvoice(db, params.id);
    rejectInvalid(validateInvoice(input, { partial: true, current }));
    return patchInvoice(db, params.id, cleanInvoiceInput(input));
  });
  router.delete('/api/invoices/:id', ({ params }) => {
    deleteInvoice(db, params.id);
  });
}
