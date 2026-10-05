// The sum of the lines that name each row, over a list of documents
// with lines: invoices, or any other document whose lines name schedule
// items and materials.

/** @typedef {import('../types.ts').LineItem} LineItem */

/**
 * @template {{ issuedDate: string, lines: LineItem[] }} D
 * @typedef {object} RowSum
 * @property {number} cents the sum of the lines
 * @property {number} markupCents the row's share of the markup on those lines
 * @property {number} lines how many lines name the row
 * @property {D} first the document with the earliest issue day
 */

/**
 * The sum of every row that some line names, by row id. Schedule item
 * and material ids are UUIDs, so one map serves both.
 * @template {{ issuedDate: string, lines: LineItem[] }} D
 * @param {D[]} docs
 * @param {(doc: D) => number[]} [markups] the markup of each line of a document, none when left out
 * @returns {Map<string, RowSum<D>>}
 */
export function sumsByRow(docs, markups) {
  /** @type {Map<string, RowSum<D>>} */
  const byRow = new Map();
  const ordered = [...docs].sort((a, b) =>
    a.issuedDate.localeCompare(b.issuedDate),
  );
  for (const doc of ordered) {
    const shares = markups?.(doc);
    doc.lines.forEach((line, i) => {
      const id = /** @type {string} */ (
        line.scheduleItemId ?? line.materialItemId
      );
      const markupCents = shares?.[i] ?? 0;
      const seen = byRow.get(id);
      if (seen) {
        seen.cents += line.amountCents;
        seen.markupCents += markupCents;
        seen.lines += 1;
      } else {
        byRow.set(id, {
          cents: line.amountCents,
          markupCents,
          lines: 1,
          first: doc,
        });
      }
    });
  }
  return byRow;
}
