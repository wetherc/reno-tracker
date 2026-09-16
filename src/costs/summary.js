// The money numbers at the top of the costs panel. Committed is every
// estimate added up. Spent is every actual price on a complete row.
// Projected is the total the project is heading for: the actual price
// where one is known, the estimate everywhere else. Headroom is the
// budget less the projected total, so it goes negative when the project
// is set to run over. Accrued is the estimate on every complete row that
// has no actual price yet: work done or goods received, but no invoice
// entered, so the money is owed but not counted in Spent.

/** @typedef {import('./timeline.js').CostEvent} CostEvent */

/**
 * @typedef {object} CostSummary
 * @property {number} budgetCents
 * @property {number} committedCents every estimate added up
 * @property {number} spentCents every actual price on a complete row
 * @property {number} projectedCents actual where known, else estimate
 * @property {number} headroomCents budget less projected, negative when over
 * @property {number} accruedCents estimates on complete rows with no actual price
 * @property {number} accruedCount how many rows make up accruedCents
 */

/**
 * @param {CostEvent[]} events
 * @param {number} budgetCents
 * @returns {CostSummary}
 */
export function costSummary(events, budgetCents) {
  let committedCents = 0;
  let spentCents = 0;
  let projectedCents = 0;
  let accruedCents = 0;
  let accruedCount = 0;
  for (const event of events) {
    committedCents += event.expectedCents;
    if (event.actualCents !== null) spentCents += event.actualCents;
    projectedCents += event.actualCents ?? event.expectedCents;
    if (event.complete && event.actualCents === null) {
      accruedCents += event.expectedCents;
      accruedCount += 1;
    }
  }
  return {
    budgetCents,
    committedCents,
    spentCents,
    projectedCents,
    headroomCents: budgetCents - projectedCents,
    accruedCents,
    accruedCount,
  };
}
