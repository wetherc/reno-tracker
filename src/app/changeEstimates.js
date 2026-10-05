// The parts of the tables and editors that show approved change orders.
// A table's Estimate column shows the typed estimate plus the row's
// approved change order lines, with the change part under it. An
// editor keeps the typed estimate in its field and names the change
// part in a hint under it.
import { approvedChanges } from '../costs/changed.js';
import { formatCents } from '../format/money.js';
import { stackedCell } from '../ui/stackedCell.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../costs/changed.js').Changes} Changes */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */

/**
 * The approved change order lines of the open project, by row id.
 * @param {AppContext} ctx
 * @returns {Changes}
 */
export const changesOf = (ctx) =>
  approvedChanges(ctx.payload?.changeOrders ?? []);

/**
 * An estimate cell. With approved change orders it shows their part
 * under the estimate.
 * @param {number} cents the estimate with the change orders in it
 * @param {number} changeCents the change order part
 * @returns {Node | string}
 */
export function estimateCell(cents, changeCents) {
  if (changeCents === 0) return formatCents(cents);
  return stackedCell(
    formatCents(cents),
    `+${formatCents(changeCents)} change orders`,
  );
}

/**
 * @param {{ cents: number, markupCents: number, lines: number }} change
 * @returns {string}
 */
export function changeHintText({ cents, markupCents, lines }) {
  const what =
    lines === 1
      ? '1 approved change order line'
      : `${lines} approved change order lines`;
  const sum = `Plus ${formatCents(cents)} from ${what}`;
  return markupCents === 0
    ? sum
    : `${sum}, before ${formatCents(markupCents)} markup`;
}

/**
 * Puts the hint under an estimate field when the row has approved
 * change order lines.
 * @param {FieldHandle} field
 * @param {{ cents: number, markupCents: number, lines: number } | undefined} change
 */
export function addChangeHint(field, change) {
  if (!change) return;
  const hint = document.createElement('p');
  hint.className = 'form__hint';
  hint.id = `${field.input.id}-changes`;
  hint.textContent = changeHintText(change);
  field.input.setAttribute('aria-describedby', hint.id);
  field.el.append(hint);
}
