// The two progress numbers on the costs panel. Work done counts each
// weekday that some schedule item covers once, and a day is done only when
// every item on it is complete. Summing days per item instead would count
// a day twice when two jobs overlap, and weekends inside a long job would
// weigh as much as days of work. An item that covers only weekend days
// adds nothing to either count. Materials bought is a plain count of
// complete materials over all materials. The count of those still
// waiting on an invoice (complete, and no invoice line bills it) rides
// beside it, so a price typed on a row does not count as invoiced. The
// two stay apart because a run of purchases says nothing about work on
// site.

import { eachDay, weekday } from '../schedule/dates.js';
import { billings } from './invoiced.js';

/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @typedef {object} Progress
 * @property {number} percentWork whole number, done workdays over all workdays
 * @property {number} workdaysDone weekdays where every item is complete
 * @property {number} workdaysAll weekdays that some schedule item covers
 * @property {number} percentMaterials whole number, complete materials over all materials
 * @property {number} materialsBought complete materials
 * @property {number} materialsAll every material
 * @property {number} materialsUninvoiced complete materials that no invoice line bills
 */

/**
 * @param {number} done
 * @param {number} total
 * @returns {number}
 */
const percent = (done, total) =>
  total === 0 ? 0 : Math.round((done / total) * 100);

/**
 * @param {Pick<ProjectPayload, 'schedule' | 'materials' | 'invoices'>} payload
 * @returns {Progress}
 */
export function progress(payload) {
  /** @type {Map<string, boolean>} day to whether every item on it is complete */
  const days = new Map();
  for (const item of payload.schedule) {
    for (const day of eachDay(item.startDate, item.endDate)) {
      if (weekday(day) % 6 === 0) continue;
      days.set(day, (days.get(day) ?? true) && item.complete);
    }
  }
  const done = [...days.values()].filter(Boolean).length;
  const bought = payload.materials.filter((m) => m.complete);
  const billed = billings(payload.invoices);
  return {
    percentWork: percent(done, days.size),
    workdaysDone: done,
    workdaysAll: days.size,
    percentMaterials: percent(bought.length, payload.materials.length),
    materialsBought: bought.length,
    materialsAll: payload.materials.length,
    materialsUninvoiced: bought.filter((m) => !billed.has(m.id)).length,
  };
}
