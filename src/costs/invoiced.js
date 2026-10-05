// Invoice lines set the actual cost of the rows they bill. A schedule
// item or material that some line bills costs the sum of its lines. A
// row that no line bills keeps the actual price typed on it. The client
// applies this once to each payload it fetches, so every table, chart,
// and total reads the billed sum as the row's actual price. That price
// is base cost. Each row's share of its invoices' markup is kept apart,
// and only the costs panel adds it.
import { lineMarkups } from '../entities/invoice.js';
import { formatCents } from '../format/money.js';
import { sumsByRow } from './lineSums.js';

/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').Invoice} Invoice */

/** @typedef {import('./lineSums.js').RowSum<Invoice>} Billing */

/**
 * The billing of every row that some invoice line bills, by row id.
 * Each row takes its share of the markup on its lines, at each
 * invoice's rate.
 * @param {Invoice[]} invoices
 * @returns {Map<string, Billing>}
 */
export const billings = (invoices) => sumsByRow(invoices, lineMarkups);

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
  const sum =
    billing.lines === 1
      ? 'The sum of 1 invoice line'
      : `The sum of ${billing.lines} invoice lines`;
  return billing.markupCents === 0
    ? sum
    : `${sum}, before ${formatCents(billing.markupCents)} markup`;
}
