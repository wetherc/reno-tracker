// Checks the invoices list of an export file. A file with no list has no
// invoices. A line that bills a row the file does not list stops the
// import, because dropping that line would change the invoice total.
import { invoiceDefaults, pickLines, validateInvoice } from './invoice.js';
import { show } from './validate.js';

/** @typedef {import('../types.ts').ImportRows} ImportRows */
/** @typedef {import('./importFile.js').Fail} Fail */

/**
 * @param {unknown} list the invoices value of the file
 * @param {{ items: Set<string>, materials: Set<string> }} known the row ids the file lists
 * @param {Fail} fail
 * @returns {ImportRows['invoices']}
 */
export function checkInvoices(list, known, fail) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return fail({ field: 'invoices', message: 'invoices must be a list' });
  }
  return list.map((row, i) => {
    /** @param {string} message @returns {never} */
    const bad = (message) =>
      fail({ field: 'invoices', message: `invoices row ${i + 1}: ${message}` });
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return bad(`must be an object, got ${show(row)}`);
    }
    /** @type {Record<string, unknown>} */
    const fields = {};
    for (const key of ['number', 'party', 'issuedDate', 'dueDate', 'lines']) {
      if (key in row) fields[key] = row[key];
    }
    const error = validateInvoice(fields);
    if (error) bad(error.message);
    const invoice = invoiceDefaults({
      ...fields,
      lines: pickLines(fields.lines),
    });
    invoice.lines.forEach((line, j) => {
      if (
        line.scheduleItemId !== null &&
        !known.items.has(line.scheduleItemId)
      ) {
        bad(
          `line ${j + 1} bills schedule item ${show(line.scheduleItemId)}, which the file does not list`,
        );
      }
      if (
        line.materialItemId !== null &&
        !known.materials.has(line.materialItemId)
      ) {
        bad(
          `line ${j + 1} bills material ${show(line.materialItemId)}, which the file does not list`,
        );
      }
    });
    return invoice;
  });
}
