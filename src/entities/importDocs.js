// Checks a list of line documents in an export file: the invoices list,
// and any other list whose rows carry lines. A file with no list has no
// rows of that kind. A line that names a row the file does not list
// stops the import, because dropping that line would change the total
// of its document.
import { show } from './validate.js';

/** @typedef {import('./importFile.js').Fail} Fail */
/** @typedef {import('./validate.js').FieldError} FieldError */
/** @typedef {import('../types.ts').NewLineItem} NewLineItem */

/**
 * How to read one kind of line document.
 * @template {{ lines: NewLineItem[] }} T
 * @typedef {object} DocKind
 * @property {string} list the name of the list in the file, such as "invoices"
 * @property {readonly string[]} fields the keys a row may carry
 * @property {(fields: Record<string, unknown>) => FieldError | null} validate
 * @property {(fields: Record<string, unknown>) => T} defaults fills a checked row
 * @property {string} verb what a line does to its row, such as "bills"
 */

/**
 * @template {{ lines: NewLineItem[] }} T
 * @param {DocKind<T>} kind
 * @param {unknown} list the value of the list in the file
 * @param {{ items: Set<string>, materials: Set<string> }} known the row ids the file lists
 * @param {Fail} fail
 * @returns {T[]}
 */
export function checkDocs(kind, list, known, fail) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    return fail({ field: kind.list, message: `${kind.list} must be a list` });
  }
  return list.map((row, i) => {
    /** @param {string} message @returns {never} */
    const bad = (message) =>
      fail({
        field: kind.list,
        message: `${kind.list} row ${i + 1}: ${message}`,
      });
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return bad(`must be an object, got ${show(row)}`);
    }
    /** @type {Record<string, unknown>} */
    const fields = {};
    for (const key of kind.fields) {
      if (key in row) fields[key] = row[key];
    }
    const error = kind.validate(fields);
    if (error) bad(error.message);
    const doc = kind.defaults(fields);
    doc.lines.forEach((line, j) => {
      if (
        line.scheduleItemId !== null &&
        !known.items.has(line.scheduleItemId)
      ) {
        bad(
          `line ${j + 1} ${kind.verb} schedule item ${show(line.scheduleItemId)}, which the file does not list`,
        );
      }
      if (
        line.materialItemId !== null &&
        !known.materials.has(line.materialItemId)
      ) {
        bad(
          `line ${j + 1} ${kind.verb} material ${show(line.materialItemId)}, which the file does not list`,
        );
      }
    });
    return doc;
  });
}
