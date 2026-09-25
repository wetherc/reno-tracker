// Cost over time. Every schedule item and material is one cost event
// that lands on one day. The rules for the day are:
//   a schedule item lands on its end date;
//   a material lands on its expected date, else on the start of the
//   schedule item it is for, else on the project start.
// "Expected" is the estimate. A material with no estimate uses its
// allowance instead, so a budget line with no quote yet still counts.
// "Actual" is the actual price, and only a row marked complete counts
// toward it. "Billed" is the actual price on any row, complete or not,
// and the projected total uses it.
// Every amount here adds the project manager's markup to the base cost
// that the row keeps. A billed row adds its share of the markup on its
// invoices, at each invoice's rate. Every other price adds the row's
// own rate, or the project rate when the row has none, so an estimate
// compares with the budget the same way an invoice does.
import { markupOf } from '../entities/invoice.js';
import { addDays, startOfWeek } from '../schedule/dates.js';
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
 * @property {number | null} actualCents the price paid with markup, once the row is complete
 * @property {number | null} billedCents the price entered with markup, complete or not
 * @property {number | null} billedMarkupCents the markup part of billedCents
 */

/** @typedef {{ date: string, cents: number }} SeriesPoint */

/** @typedef {{ week: string, expectedCents: number, actualCents: number }} WeekTotal */

/**
 * The expected cost of a material: the estimate when one is entered,
 * else the allowance. A zero estimate means none was entered.
 * @param {Pick<MaterialItem, 'estimatedCents' | 'allowanceCents'>} item
 * @returns {number}
 */
export function materialExpected(item) {
  return item.estimatedCents > 0 ? item.estimatedCents : item.allowanceCents;
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
 * @typedef {Pick<CostEvent, 'complete' | 'expectedCents' | 'expectedMarkupCents' | 'actualCents' | 'billedCents' | 'billedMarkupCents'>} RowPrices
 */

/**
 * The price fields of one row, with markup. The editors call this on
 * the values a person types, so their totals match the costs panel.
 * @param {{ complete: boolean, actualCents: number | null, markupBasisPoints: number | null }} row
 * @param {number} expected the base estimate
 * @param {number} projectRate the rate of a row with none of its own
 * @param {{ cents: number, markupCents: number }} [billing] the row's invoice lines, if any
 * @returns {RowPrices}
 */
export function rowPrices(row, expected, projectRate, billing) {
  const rate = row.markupBasisPoints ?? projectRate;
  const expectedMarkupCents = markupOf(expected, rate);
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
    expectedCents: expected + expectedMarkupCents,
    expectedMarkupCents,
    actualCents: row.complete ? billedCents : null,
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
      ...prices(item, materialExpected(item)),
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Running total by day. One point per day that has a cost, in date
 * order. An event with no value for the key adds nothing and makes no
 * point.
 * @param {CostEvent[]} events
 * @param {'expectedCents' | 'actualCents'} key
 * @returns {SeriesPoint[]}
 */
export function cumulative(events, key) {
  /** @type {SeriesPoint[]} */
  const points = [];
  let total = 0;
  for (const event of events) {
    const cents = event[key];
    if (cents === null) continue;
    total += cents;
    const last = points[points.length - 1];
    if (last && last.date === event.date) last.cents = total;
    else points.push({ date: event.date, cents: total });
  }
  return points;
}

/**
 * Totals per week from the first week with a cost to the last, with a
 * zero row for every empty week between them, so a bar chart shows the
 * gap instead of hiding it. A week starts on Sunday and is named by
 * that Sunday.
 * @param {CostEvent[]} events
 * @returns {WeekTotal[]}
 */
export function byWeek(events) {
  if (events.length === 0) return [];
  /** @type {Map<string, WeekTotal>} */
  const weeks = new Map();
  const first = startOfWeek(events[0].date);
  const last = startOfWeek(events[events.length - 1].date);
  for (let w = first; w <= last; w = addDays(w, 7)) {
    weeks.set(w, { week: w, expectedCents: 0, actualCents: 0 });
  }
  for (const event of events) {
    const row = /** @type {WeekTotal} */ (weeks.get(startOfWeek(event.date)));
    row.expectedCents += event.expectedCents;
    row.actualCents += event.actualCents ?? 0;
  }
  return [...weeks.values()];
}
