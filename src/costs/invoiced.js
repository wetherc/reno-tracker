// Invoice lines set the actual cost of the rows they bill. A schedule
// item or material that some line bills costs the sum of its lines. A
// row that no line bills keeps the actual price typed on it. The client
// applies this once to each payload it fetches, so every table, chart,
// and total reads the billed sum as the row's actual price.

/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').Invoice} Invoice */

/**
 * @typedef {object} Billing
 * @property {number} cents the sum of the lines
 * @property {number} lines how many lines bill the row
 * @property {Invoice} first the invoice with the earliest issue day
 */

/**
 * The billing of every row that some line bills, by row id. Schedule
 * item and material ids are UUIDs, so one map serves both.
 * @param {Invoice[]} invoices
 * @returns {Map<string, Billing>}
 */
export function billings(invoices) {
  /** @type {Map<string, Billing>} */
  const byRow = new Map();
  const ordered = [...invoices].sort((a, b) =>
    a.issuedDate.localeCompare(b.issuedDate),
  );
  for (const invoice of ordered) {
    for (const line of invoice.lines) {
      const id = /** @type {string} */ (
        line.scheduleItemId ?? line.materialItemId
      );
      const seen = byRow.get(id);
      if (seen) {
        seen.cents += line.amountCents;
        seen.lines += 1;
      } else {
        byRow.set(id, { cents: line.amountCents, lines: 1, first: invoice });
      }
    }
  }
  return byRow;
}

/**
 * A copy of the payload where every billed row's actualCents is the
 * sum of its lines. Rows with no line are the same objects as before.
 * @param {ProjectPayload} payload
 * @returns {ProjectPayload}
 */
export function withInvoiceActuals(payload) {
  const byRow = billings(payload.invoices);
  if (byRow.size === 0) return payload;
  /**
   * @template {{ id: string, actualCents: number | null }} T
   * @param {T} row
   * @returns {T}
   */
  const billed = (row) => {
    const billing = byRow.get(row.id);
    return billing ? { ...row, actualCents: billing.cents } : row;
  };
  return {
    ...payload,
    schedule: payload.schedule.map(billed),
    materials: payload.materials.map(billed),
  };
}

/**
 * How a billed row's Actual reads in its editor.
 * @param {Billing} billing
 * @returns {string}
 */
export function billedHint(billing) {
  return billing.lines === 1
    ? 'The sum of 1 invoice line'
    : `The sum of ${billing.lines} invoice lines`;
}
