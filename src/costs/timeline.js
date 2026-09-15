// Cost over time. Every schedule item and material is one cost event
// that lands on one day. The rules for the day are:
//   a schedule item lands on its end date;
//   a material lands on its expected date, else on the start of the
//   schedule item it is for, else on the project start.
// "Expected" is the estimate. "Actual" is the actual price, and only a
// row marked complete counts toward it.
import { addMonths, monthOf } from '../schedule/dates.js';

/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @typedef {object} CostEvent
 * @property {string} id the schedule item or material id
 * @property {'schedule' | 'material'} source
 * @property {string} title
 * @property {string} date YYYY-MM-DD, the day the cost lands
 * @property {boolean} complete
 * @property {number} expectedCents the estimate
 * @property {number | null} actualCents the price paid, once the row is complete
 */

/** @typedef {{ date: string, cents: number }} SeriesPoint */

/** @typedef {{ month: string, expectedCents: number, actualCents: number }} MonthTotal */

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
 * One event per schedule item and material, sorted by landing day.
 * Ties keep schedule items before materials, then follow sort order.
 * @param {ProjectPayload} payload
 * @returns {CostEvent[]}
 */
export function costEvents(payload) {
  /** @type {CostEvent[]} */
  const events = [];
  for (const item of payload.schedule) {
    events.push({
      id: item.id,
      source: 'schedule',
      title: item.title,
      date: item.endDate,
      complete: item.complete,
      expectedCents: item.estimatedCents,
      actualCents: item.complete ? item.actualCents : null,
    });
  }
  for (const item of payload.materials) {
    events.push({
      id: item.id,
      source: 'material',
      title: item.name,
      date: landingDate(item, payload).date,
      complete: item.complete,
      expectedCents: item.estimatedCents,
      actualCents: item.complete ? item.actualCents : null,
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
 * Totals per calendar month from the first month with a cost to the
 * last, with a zero row for every empty month between them, so a bar
 * chart shows the gap instead of hiding it.
 * @param {CostEvent[]} events
 * @returns {MonthTotal[]}
 */
export function byMonth(events) {
  if (events.length === 0) return [];
  /** @type {Map<string, MonthTotal>} */
  const months = new Map();
  const first = monthOf(events[0].date);
  const last = monthOf(events[events.length - 1].date);
  for (let m = first; m <= last; m = addMonths(m, 1)) {
    months.set(m, { month: m, expectedCents: 0, actualCents: 0 });
  }
  for (const event of events) {
    const row = /** @type {MonthTotal} */ (months.get(monthOf(event.date)));
    row.expectedCents += event.expectedCents;
    row.actualCents += event.actualCents ?? 0;
  }
  return [...months.values()];
}
