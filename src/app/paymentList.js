// The Payments part of the invoice editor: the retainage the household
// keeps back, then one row per payment with its day, amount, and note.
// An invoice may have no payments. A readout under the rows follows the
// invoice total and the payments as they are typed.
import { MAX_PAYMENTS } from '../entities/invoice.js';
import { formatCents } from '../format/money.js';
import { todayIso } from '../schedule/dates.js';
import { button, iconButton } from '../ui/buttons.js';
import { dateField, moneyField, textField } from '../ui/formFields.js';

/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').PaymentInput} PaymentInput */
/** @typedef {import('../ui/formFields.js').FieldHandle} FieldHandle */
/** @typedef {import('../entities/validate.js').FieldError} FieldError */

export const PAYMENT_LABELS = {
  retainageCents: 'Retainage',
  paidDate: 'Paid on',
  note: 'Note',
};

/**
 * @typedef {{
 *   el: HTMLDivElement,
 *   title: HTMLHeadingElement,
 *   paid: FieldHandle,
 *   amount: ReturnType<typeof moneyField>,
 *   note: FieldHandle,
 * }} PaymentRow
 */

/**
 * The words under the payment rows.
 * @param {{ totalCents: number, paidCents: number, retainageCents: number }} sums
 * @returns {string}
 */
export function paidText({ totalCents, paidCents, retainageCents }) {
  const paid = `Paid ${formatCents(paidCents)} of ${formatCents(totalCents)}.`;
  const open = totalCents - paidCents;
  if (open < 0) return `${paid} ${formatCents(-open)} overpaid.`;
  if (open === 0) return `${paid} Nothing owed.`;
  const held = Math.min(retainageCents, open);
  return held === 0
    ? `${paid} ${formatCents(open)} owed.`
    : `${paid} ${formatCents(open)} owed, ${formatCents(held)} of it held back.`;
}

/**
 * @param {{ prefix: string, invoice?: Invoice, total: () => number }} config
 * total reads the invoice total from the line rows
 */
export function paymentList({ prefix, invoice, total }) {
  let counter = 0;
  const retainage = moneyField({
    id: `${prefix}-retainage`,
    label: PAYMENT_LABELS.retainageCents,
    cents: invoice?.retainageCents ?? 0,
    onInput: update,
  });
  const retainageHint = document.createElement('p');
  retainageHint.className = 'form__hint';
  retainageHint.id = `${prefix}-retainage-hint`;
  retainageHint.textContent = 'Kept back until the work is done';
  retainage.input.setAttribute('aria-describedby', retainageHint.id);
  retainage.el.classList.add('payment-list__retainage');
  retainage.el.append(retainageHint);

  /** @type {PaymentRow[]} */
  const rows = [];
  const list = document.createElement('div');
  list.className = 'payment-list__rows';
  const empty = document.createElement('p');
  empty.className = 'payment-list__empty u-muted';
  empty.textContent = 'No payments yet.';
  const readout = document.createElement('p');
  readout.className = 'payment-list__paid';
  readout.setAttribute('aria-live', 'polite');
  const add = button({
    label: 'Add payment',
    icon: 'plus',
    onClick: () => {
      const cents = Math.max(total() - retain() - paidSum(), 0);
      const row = paymentRow({ paidDate: todayIso(), amountCents: cents });
      row.amount.input.focus();
    },
  });

  const retain = () => retainage.cents() ?? 0;
  const paidSum = () =>
    rows.reduce((sum, r) => sum + (r.amount.cents() ?? 0), 0);

  /**
   * @param {PaymentInput} value
   * @returns {PaymentRow}
   */
  function paymentRow(value) {
    const n = ++counter;
    const el = document.createElement('div');
    el.className = 'payment';
    const title = document.createElement('h3');
    title.className = 'payment__title section-label';
    const paid = dateField({
      id: `${prefix}-pay-${n}-date`,
      label: PAYMENT_LABELS.paidDate,
      value: value.paidDate,
      required: true,
    });
    const amount = moneyField({
      id: `${prefix}-pay-${n}-amount`,
      label: 'Amount',
      cents: value.amountCents,
      onInput: update,
    });
    const note = textField({
      id: `${prefix}-pay-${n}-note`,
      label: PAYMENT_LABELS.note,
      value: value.note ?? '',
      placeholder: 'Deposit, check 1204',
    });
    note.el.classList.add('payment__note');
    const remove = iconButton({
      icon: 'trash',
      label: 'Remove payment',
      onClick: () => {
        rows.splice(rows.indexOf(row), 1);
        el.remove();
        renumber();
        add.focus();
      },
    });
    remove.classList.add('payment__remove');
    el.append(title, remove, paid.el, amount.el, note.el);
    /** @type {PaymentRow} */
    const row = { el, title, paid, amount, note };
    rows.push(row);
    list.append(el);
    renumber();
    return row;
  }

  function renumber() {
    rows.forEach((row, i) => {
      row.title.textContent = `Payment ${i + 1}`;
      const remove = /** @type {HTMLButtonElement} */ (row.el.children[1]);
      remove.setAttribute('aria-label', `Remove payment ${i + 1}`);
      remove.title = `Remove payment ${i + 1}`;
    });
    empty.hidden = rows.length > 0;
    add.disabled = rows.length >= MAX_PAYMENTS;
    update();
  }

  function update() {
    readout.textContent = paidText({
      totalCents: total(),
      paidCents: paidSum(),
      retainageCents: retain(),
    });
  }

  for (const p of invoice?.payments ?? []) paymentRow(p);

  const el = document.createElement('fieldset');
  el.className = 'payment-list form__wide';
  const legend = document.createElement('legend');
  legend.className = 'card__title';
  legend.textContent = 'Payments';
  const footer = document.createElement('div');
  footer.className = 'payment-list__footer';
  footer.append(add, readout);
  el.append(legend, retainage.el, empty, list, footer);
  renumber();

  return {
    el,
    update,
    /** @returns {Record<string, FieldHandle>} every field in form order */
    fields() {
      /** @type {Record<string, FieldHandle>} */
      const fields = { retainageCents: retainage };
      rows.forEach((row, i) => {
        fields[`payments.${i}.paidDate`] = row.paid;
        fields[`payments.${i}.amountCents`] = row.amount;
        fields[`payments.${i}.note`] = row.note;
      });
      return fields;
    },
    /**
     * The retainage and payments as typed. A value that is not money
     * adds a problem and reads as zero.
     * @param {FieldError[]} problems
     * @returns {{ retainageCents: number, payments: PaymentInput[] }}
     */
    read(problems) {
      const money = 'must be dollars and cents, like 1,250.00';
      const retainageCents = retainage.cents();
      if (retainageCents === null) {
        problems.push({
          field: 'retainageCents',
          message: `Retainage ${money}`,
        });
      }
      const payments = rows.map((row, i) => {
        const cents = row.amount.cents();
        if (cents === null) {
          problems.push({
            field: `payments.${i}.amountCents`,
            message: `Payment ${i + 1}: Amount ${money}`,
          });
        }
        return {
          paidDate: row.paid.input.value,
          amountCents: cents ?? 0,
          note: row.note.input.value.trim(),
        };
      });
      return { retainageCents: retainageCents ?? 0, payments };
    },
    /** @returns {string} the typed values, for the discard check */
    text() {
      return JSON.stringify([
        retainage.input.value,
        ...rows.map((r) => [
          r.paid.input.value,
          r.amount.input.value,
          r.note.input.value,
        ]),
      ]);
    },
  };
}
