// Cost over time. Every schedule item and material is one cost event
// that lands on one day. The rules for the day are:
//   a schedule item lands on its end date;
//   a material lands on its expected date, else on the start of the
//   schedule item it is for, else on the project start.
// "Expected" is the estimate. A material with no estimate uses its
// allowance instead, so a budget line with no quote yet still counts.
// Every approved change order line adds its amount to the expected cost
// of its row, so the change lands on the row's day, not on the day of
// the change order.
// "Invoiced" is the sum of the row's invoice lines, complete or not.
// A price typed on a row that no line bills is not invoiced. "Billed"
// is the invoiced sum where there is one, else the typed price, and
// the projected total uses it. The spent line reads the invoices
// themselves, so each invoice lands on its issue day, and the line at
// today matches the Spent tile.
// Every amount here adds the project manager's markup to the base cost
// that the row keeps. A billed row adds its share of the markup on its
// invoices, at each invoice's rate. Every other price adds the row's
// own rate, or the project rate when the row has none, so an estimate
// compares with the budget the same way an invoice does. The change
// order lines in an estimate add their share of the markup at each
// change order's rate instead of the row's.
import { invoiceName, invoiceTotal } from '../entities/invoice.js';
import { markupOf } from '../entities/lineItems.js';
import { addDays, startOfWeek } from '../schedule/dates.js';
import { approvedChanges } from './changed.js';
import { billings } from './invoiced.js';

/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @typedef {object} CostEvent
 * @property {string} id the schedule item or material id
 * @property {'schedule' | 'material'} source
 * @property {string} title
 * @property {string} date YYYY-MM-DD, the day the cost lands
 * @property {boolean} complete
 * @property {number} expectedCents the estimate, with markup
 * @property {number} expectedMarkupCents the markup part of expectedCents
 * @property {number | null} invoicedCents the invoice lines with markup, null when no line bills the row
 * @property {number | null} billedCents the invoiced or typed price with markup, complete or not
 * @property {number | null} billedMarkupCents the markup part of billedCents
 */

/** @typedef {{ date: string, cents: number }} SeriesPoint */

/**
 * @typedef {object} InvoiceEvent
 * @property {string} id the invoice id
 * @property {string} title the invoice name
 * @property {string} date YYYY-MM-DD, the issue day
 * @property {number} cents the invoice total, with markup
 */

/** @typedef {{ week: string, expectedCents: number, actualCents: number }} WeekTotal actualCents is the invoiced total */

/**
 * The expected cost of a material: the estimate when one is entered,
 * else the allowance, plus the material's approved change order lines.
 * A zero estimate means none was entered.
 * @param {Pick<MaterialItem, 'estimatedCents' | 'allowanceCents'>} item
 * @param {number} changeCents the sum of its approved change order lines
 * @returns {number}
 */
export function materialExpected(item, changeCents) {
  const base =
    item.estimatedCents > 0 ? item.estimatedCents : item.allowanceCents;
  return base + changeCents;
}

/**
 * The day a material's cost lands. An expected date wins, then the
 * start of the schedule item it is for, then the project start.
 * @param {MaterialItem} item
 * @param {ProjectPayload} payload
 * @returns {{ date: string, inferred: boolean }}
 */
export function landingDate(item, payload) {
  if (item.expectedDate) return { date: item.expectedDate, inferred: false };
  const linked = payload.schedule.find((s) => s.id === item.scheduleItemId);
  return {
    date: linked?.startDate ?? payload.project.startDate,
    inferred: true,
  };
}

/**
 * @typedef {Pick<CostEvent, 'complete' | 'expectedCents' | 'expectedMarkupCents' | 'invoicedCents' | 'billedCents' | 'billedMarkupCents'>} RowPrices
 */

/**
 * The price fields of one row, with markup. The editors call this on
 * the values a person types, so their totals match the costs panel.
 * @param {{ complete: boolean, actualCents: number | null, markupBasisPoints: number | null }} row
 * @param {number} expected the base estimate, without change orders
 * @param {number} projectRate the rate of a row with none of its own
 * @param {{ cents: number, markupCents: number }} [billing] the row's invoice lines, if any
 * @param {{ cents: number, markupCents: number }} [change] the row's approved change order lines, if any
 * @returns {RowPrices}
 */
export function rowPrices(row, expected, projectRate, billing, change) {
  const rate = row.markupBasisPoints ?? projectRate;
  const changeCents = change?.cents ?? 0;
  const expectedMarkupCents =
    markupOf(expected, rate) + (change?.markupCents ?? 0);
  const base = billing ? billing.cents : row.actualCents;
  const billedMarkupCents = billing
    ? billing.markupCents
    : base === null
      ? null
      : markupOf(base, rate);
  const billedCents =
    base === null ? null : base + /** @type {number} */ (billedMarkupCents);
  return {
    complete: row.complete,
    expectedCents: expected + changeCents + expectedMarkupCents,
    expectedMarkupCents,
    invoicedCents: billing ? billedCents : null,
    billedCents,
    billedMarkupCents,
  };
}

/**
 * One event per schedule item and material, sorted by landing day.
 * Ties keep schedule items before materials, then follow sort order.
 * @param {ProjectPayload} payload
 * @returns {CostEvent[]}
 */
export function costEvents(payload) {
  const byRow = billings(payload.invoices);
  const changes = approvedChanges(payload.changeOrders);
  /**
   * @param {{ id: string, complete: boolean, actualCents: number | null, markupBasisPoints: number | null }} row
   * @param {number} expected the base estimate
   */
  const prices = (row, expected) =>
    rowPrices(
      row,
      expected,
      payload.project.markupBasisPoints,
      byRow.get(row.id),
      changes.get(row.id),
    );
  /** @type {CostEvent[]} */
  const events = [];
  for (const item of payload.schedule) {
    events.push({
      id: item.id,
      source: 'schedule',
      title: item.title,
      date: item.endDate,
      ...prices(item, item.estimatedCents),
    });
  }
  for (const item of payload.materials) {
    events.push({
      id: item.id,
      source: 'material',
      title: item.name,
      date: landingDate(item, payload).date,
      ...prices(item, materialExpected(item, 0)),
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Running total by day. One point per day that has a cost, in date
 * order. The costs must come in date order.
 * @param {SeriesPoint[]} costs
 * @returns {SeriesPoint[]}
 */
export function cumulative(costs) {
  /** @type {SeriesPoint[]} */
  const points = [];
  let total = 0;
  for (const { date, cents } of costs) {
    total += cents;
    const last = points[points.length - 1];
    if (last && last.date === date) last.cents = total;
    else points.push({ date, cents: total });
  }
  return points;
}

/**
 * One event per invoice, sorted by issue day.
 * @param {ProjectPayload} payload
 * @returns {InvoiceEvent[]}
 */
export function invoiceEvents(payload) {
  return payload.invoices
    .map((invoice) => ({
      id: invoice.id,
      title: invoiceName(invoice),
      date: invoice.issuedDate,
      cents: invoiceTotal(invoice),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Totals per week from the first week with a cost or an invoice to the
 * last, with a zero row for every empty week between them, so a bar
 * chart shows the gap instead of hiding it. The estimates land on the
 * week of their row, and the invoices on the week of their issue day.
 * A week starts on Sunday and is named by that Sunday.
 * @param {CostEvent[]} events
 * @param {InvoiceEvent[]} invoices
 * @returns {WeekTotal[]}
 */
export function byWeek(events, invoices) {
  const dates = [...events, ...invoices].map((e) => e.date).sort();
  if (dates.length === 0) return [];
  /** @type {Map<string, WeekTotal>} */
  const weeks = new Map();
  const first = startOfWeek(dates[0]);
  const last = startOfWeek(dates[dates.length - 1]);
  for (let w = first; w <= last; w = addDays(w, 7)) {
    weeks.set(w, { week: w, expectedCents: 0, actualCents: 0 });
  }
  /** @param {string} date */
  const week = (date) =>
    /** @type {WeekTotal} */ (weeks.get(startOfWeek(date)));
  for (const event of events)
    week(event.date).expectedCents += event.expectedCents;
  for (const invoice of invoices)
    week(invoice.date).actualCents += invoice.cents;
  return [...weeks.values()];
}
