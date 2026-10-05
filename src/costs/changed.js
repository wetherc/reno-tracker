// Approved change orders raise the estimate of the rows their lines
// name. A row's estimate is the one typed on it plus the sum of its
// approved change order lines, and every estimate the page counts reads
// that sum through costEvents and the tables. A pending change order
// adds nothing. Each row also takes its share of the markup on those
// lines, at each change order's own rate. The typed estimate stays as stored, so an editor saves
// it back unchanged.
import { lineMarkups } from '../entities/lineItems.js';
import { sumsByRow } from './lineSums.js';

/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {Map<string, import('./lineSums.js').RowSum<ChangeOrder>>} Changes */

/**
 * The approved change order lines of every row, by row id.
 * @param {ChangeOrder[]} changeOrders
 * @returns {Changes}
 */
export const approvedChanges = (changeOrders) =>
  sumsByRow(
    changeOrders.filter((c) => c.approved),
    lineMarkups,
  );

/**
 * @param {Changes} changes
 * @param {string} id a schedule item or material id
 * @returns {number} the sum of the row's approved change order lines
 */
export const addedCents = (changes, id) => changes.get(id)?.cents ?? 0;
