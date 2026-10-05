// The lines of invoices and of any other document with lines, in a
// LocalDb. Every row a line names must belong to the document's
// project, and a row that a line names cannot be deleted, the same as
// on the server.
import { invoiceName } from '../entities/invoice.js';
import { badRequest, conflict } from './errors.js';
import { newId } from './store.js';

/** @typedef {import('./store.js').LocalDb} LocalDb */
/** @typedef {import('../types.ts').LineItem} LineItem */
/** @typedef {import('../types.ts').NewLineItem} NewLineItem */

/**
 * @typedef {object} LineKind
 * @property {'invoices'} list the LocalDb list of the documents
 * @property {string} verb what a line does to its row, such as "bills"
 * @property {(doc: { number: string, party: string }) => string} name the name of a document in a message
 */

/** @type {Record<'invoice', LineKind>} */
export const LINE_KINDS = {
  invoice: { list: 'invoices', verb: 'bills', name: invoiceName },
};

/**
 * Checks that every row a line names is in the project.
 * @param {LocalDb} db
 * @param {LineKind} kind
 * @param {string} projectId
 * @param {NewLineItem[]} lines
 * @returns {LineItem[]} the lines with fresh ids
 */
export function linesFor(db, kind, projectId, lines) {
  return lines.map((line, i) => {
    const row = line.scheduleItemId
      ? db.schedule.find((s) => s.id === line.scheduleItemId)
      : db.materials.find((m) => m.id === line.materialItemId);
    if (row?.projectId !== projectId) {
      const what = line.scheduleItemId ? 'schedule item' : 'material';
      throw badRequest(
        `line ${i + 1} ${kind.verb} a ${what} that is not in this project`,
        `lines.${i}.item`,
      );
    }
    return { id: newId(), ...line };
  });
}

/**
 * Refuses to delete a schedule item or material that a line names,
 * because the delete would change the total of that line's document.
 * The earliest document of the first kind in LINE_KINDS that names the
 * row goes in the message.
 * @param {LocalDb} db
 * @param {'scheduleItemId' | 'materialItemId'} key
 * @param {string} id
 * @param {string} name the row's title or name
 */
export function checkUnlinked(db, key, id, name) {
  for (const kind of Object.values(LINE_KINDS)) {
    const doc = db[kind.list]
      .filter((d) => d.lines.some((l) => l[key] === id))
      .sort((a, b) => a.issuedDate.localeCompare(b.issuedDate))[0];
    if (doc) {
      throw conflict(
        `${kind.name(doc)} ${kind.verb} ${name}. Remove that line first.`,
      );
    }
  }
}
