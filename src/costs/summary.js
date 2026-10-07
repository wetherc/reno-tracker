// The money numbers at the top of the costs panel. Committed is every
// estimate added up, and each estimate includes the row's approved
// change orders. Spent is every invoice total, paid or not, so it
// matches the sum of the invoices in the Invoices section.
// Projected is the total the project is heading for. A complete row
// counts its actual price when one is entered. An open row counts the
// larger of its actual price and its estimate, because a first invoice
// on an open row is often a deposit or a part payment, and the rest of
// the estimate is still to come. A price above the estimate counts at
// once, so an overrun shows before the box is ticked. The base part of
// an open row is the larger of the invoiced base and the estimated
// base, so it never shows less base than the invoices already bill,
// and the markup is the rest of the total. Headroom is the
// budget less the projected total, so it goes negative when the project
// is set to run over. Accrued is the projected amount of every complete
// row that no invoice line bills: work done or goods received, but no
// invoice entered, so the money is owed but not counted in Spent. It
// is the typed price when one is entered, else the estimate. Every number
// includes the markup. Markup is the part of the projected total that is
// the project manager's margin, and the rest is base cost.

/** @typedef {import('./timeline.js').CostEvent} CostEvent */

/**
 * @typedef {object} CostSummary
 * @property {number} budgetCents
 * @property {number} committedCents every estimate added up
 * @property {number} spentCents every invoice total, paid or not
 * @property {number} projectedCents billed price on a complete row, the larger of billed and estimate on an open one
 * @property {number} headroomCents budget less projected, negative when over
 * @property {number} accruedCents projected amounts of complete rows with no invoice line
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
    spentCents += event.invoicedCents ?? 0;
    const counted = projected(event);
    projectedCents += counted.cents;
    markupCents += counted.markupCents;
    if (event.complete && event.invoicedCents === null && counted.cents > 0) {
      accruedCents += counted.cents;
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
 * The tables and editors show the same amount per row.
 * @param {import('./timeline.js').RowPrices} event
 * @returns {{ cents: number, markupCents: number }}
 */
export function projected(event) {
  const { billedCents, billedMarkupCents } = event;
  if (billedCents === null || billedMarkupCents === null) {
    return {
      cents: event.expectedCents,
      markupCents: event.expectedMarkupCents,
    };
  }
  if (event.complete) {
    return { cents: billedCents, markupCents: billedMarkupCents };
  }
  const cents = Math.max(billedCents, event.expectedCents);
  const baseCents = Math.max(
    billedCents - billedMarkupCents,
    event.expectedCents - event.expectedMarkupCents,
  );
  return { cents, markupCents: cents - baseCents };
}
