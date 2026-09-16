// The two progress numbers on the costs panel. Work done is the calendar
// days on complete schedule items over the days on every schedule item,
// so a two-week job counts more than a one-day one. Materials bought is
// a plain count of complete materials over all materials, and the count
// of those still waiting on an invoice (complete, no actual price) rides
// beside it. The two stay apart because a run of purchases says nothing
// about work on site.

import { spanDays } from '../schedule/dates.js';

/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */

/**
 * @typedef {object} Progress
 * @property {number} percentWork whole number, complete schedule days over all schedule days
 * @property {number} percentMaterials whole number, complete materials over all materials
 * @property {number} materialsBought complete materials
 * @property {number} materialsAll every material
 * @property {number} materialsUninvoiced complete materials with no actual price
 */

/**
 * @param {number} done
 * @param {number} total
 * @returns {number}
 */
const percent = (done, total) =>
  total === 0 ? 0 : Math.round((done / total) * 100);

/**
 * @param {Pick<ProjectPayload, 'schedule' | 'materials'>} payload
 * @returns {Progress}
 */
export function progress(payload) {
  let daysDone = 0;
  let daysAll = 0;
  for (const item of payload.schedule) {
    const days = spanDays(item.startDate, item.endDate);
    daysAll += days;
    if (item.complete) daysDone += days;
  }
  const bought = payload.materials.filter((m) => m.complete);
  return {
    percentWork: percent(daysDone, daysAll),
    percentMaterials: percent(bought.length, payload.materials.length),
    materialsBought: bought.length,
    materialsAll: payload.materials.length,
    materialsUninvoiced: bought.filter((m) => m.actualCents === null).length,
  };
}
