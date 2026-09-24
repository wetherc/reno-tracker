// The parts of the schedule and material editors that follow invoices.
// A billed row's Actual is the sum of its invoice lines, so its editor
// shows that sum read only and leaves actualCents out of the save. A
// billed row cannot be deleted, so its Delete button says why at once
// instead of asking to confirm a delete the backend refuses.
import { billedHint, billings } from '../costs/invoiced.js';
import { invoiceName } from '../entities/invoice.js';
import { moneyField } from '../ui/formFields.js';

/** @typedef {import('./context.js').AppContext} AppContext */

/**
 * @param {AppContext} ctx
 * @param {string | undefined} id
 */
const billingOf = (ctx, id) =>
  id === undefined ? undefined : billings(ctx.payload?.invoices ?? []).get(id);

/**
 * The Actual field of an editor.
 * @param {{
 *   ctx: AppContext,
 *   id: string,
 *   label: string,
 *   rowId?: string,
 *   cents: number | null,
 *   placeholder: string,
 * }} config
 */
export function actualField({ ctx, id, label, rowId, cents, placeholder }) {
  const billing = billingOf(ctx, rowId);
  const field = moneyField({
    id,
    label,
    cents,
    placeholder,
    blankIsNull: true,
  });
  if (billing) {
    field.input.setAttribute('readonly', '');
    const hint = document.createElement('p');
    hint.className = 'form__hint';
    hint.id = `${id}-hint`;
    hint.textContent = billedHint(billing);
    field.input.setAttribute('aria-describedby', hint.id);
    field.el.append(hint);
  }
  return {
    field,
    // True when the editor opened on a billed row. Its field then stays
    // out of the checks and the discard guard.
    billed: billing !== undefined,
    // True when a save sends the typed price: the row was not billed
    // when the editor opened and is not billed now.
    sends: () => billing === undefined && billingOf(ctx, rowId) === undefined,
  };
}

/**
 * Toasts why a billed row cannot be deleted.
 * @param {AppContext} ctx
 * @param {string} rowId
 * @param {string} name the row's title or name
 * @returns {boolean} true when the row is billed and the delete stops
 */
export function refuseBilled(ctx, rowId, name) {
  const billing = billingOf(ctx, rowId);
  if (!billing) return false;
  ctx.toaster.failure(
    `${invoiceName(billing.first)} bills ${name}. Remove that line first.`,
  );
  return true;
}
