// The money numbers at the top of the costs panel. Committed is every
// estimate added up. Spent is every actual price on a complete row.
// Projected is the total the project is heading for. A complete row
// counts its actual price when one is entered. An open row counts the
// larger of its actual price and its estimate, because a first invoice
// on an open row is often a deposit or a part payment, and the rest of
// the estimate is still to come. A price above the estimate counts at
// once, so an overrun shows before the box is ticked. Headroom is the
// budget less the projected total, so it goes negative when the project
// is set to run over. Accrued is the estimate on every complete row that
// has no actual price yet: work done or goods received, but no invoice
// entered, so the money is owed but not counted in Spent. Every number
// includes the markup. Markup is the part of the projected total that is
// the project manager's margin, and the rest is base cost.

/** @typedef {import('./timeline.js').CostEvent} CostEvent */

/**
 * @typedef {object} CostSummary
 * @property {number} budgetCents
 * @property {number} committedCents every estimate added up
 * @property {number} spentCents every actual price on a complete row
 * @property {number} projectedCents billed price on a complete row, the larger of billed and estimate on an open one
 * @property {number} headroomCents budget less projected, negative when over
 * @property {number} accruedCents estimates on complete rows with no actual price
 * @property {number} accruedCount how many rows make up accruedCents
 * @property {number} markupCents the markup part of projectedCents
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
  let markupCents = 0;
  for (const event of events) {
    committedCents += event.expectedCents;
    if (event.actualCents !== null) spentCents += event.actualCents;
    const counted = projected(event);
    projectedCents += counted.cents;
    markupCents += counted.markupCents;
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
    markupCents,
  };
}

/**
 * The amount one row adds to the projected total, and its markup part.
 * @param {CostEvent} event
 * @returns {{ cents: number, markupCents: number }}
 */
function projected(event) {
  const { billedCents, billedMarkupCents } = event;
  if (
    billedCents === null ||
    billedMarkupCents === null ||
    (!event.complete && billedCents < event.expectedCents)
  ) {
    return {
      cents: event.expectedCents,
      markupCents: event.expectedMarkupCents,
    };
  }
  return { cents: billedCents, markupCents: billedMarkupCents };
}
