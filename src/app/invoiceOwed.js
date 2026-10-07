// The owed tiles over the invoices table, the status badge of one
// invoice, and the Mark paid button that records its open balance as
// one payment dated today.
import { balance, settlingPayments, status } from '../costs/owed.js';
import { invoiceNameInSentence } from '../entities/invoice.js';
import { formatDayMonth } from '../format/date.js';
import { formatCents } from '../format/money.js';
import { todayIso } from '../schedule/dates.js';
import { button } from '../ui/buttons.js';
import { focusKey } from '../ui/focusKey.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../costs/owed.js').Owed} Owed */

/**
 * @typedef {object} OwedTile
 * @property {string} label
 * @property {number} cents
 * @property {string} [note]
 * @property {boolean} [over] true paints the value in the danger colour
 */

/**
 * @param {number} n
 * @param {string} word
 */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The tiles to show. Owed is always there, and every other tile only
 * when it has money on it.
 * @param {Owed} owed
 * @returns {OwedTile[]}
 */
export function owedTiles(owed) {
  /** @type {OwedTile[]} */
  const tiles = [
    {
      label: 'Owed',
      cents: owed.owedCents,
      note:
        owed.openCount === 0
          ? 'Every invoice is paid'
          : `On ${count(owed.openCount, 'invoice')}`,
    },
    {
      label: 'Overdue',
      cents: owed.overdueCents,
      note: 'Past the due day',
      over: true,
    },
    {
      label: 'Due next',
      cents: owed.upcomingCents,
      note: owed.nextDue ? `First on ${formatDayMonth(owed.nextDue)}` : '',
    },
    { label: 'No due day', cents: owed.undatedCents },
    {
      label: 'Held back',
      cents: owed.heldCents,
      note: 'Retainage, paid when the work is done',
    },
    {
      label: 'Overpaid',
      cents: owed.creditCents,
      note: 'Paid past the invoice total',
    },
  ];
  return tiles.filter((t, i) => i === 0 || t.cents > 0);
}

/**
 * @param {Owed} owed
 * @returns {HTMLDListElement}
 */
export function renderOwed(owed) {
  const list = document.createElement('dl');
  list.className = 'invoice-owed';
  for (const tile of owedTiles(owed)) {
    const el = document.createElement('div');
    el.className = tile.over
      ? 'invoice-owed__tile invoice-owed__tile--over'
      : 'invoice-owed__tile';
    const label = document.createElement('dt');
    label.className = 'invoice-owed__label';
    label.textContent = tile.label;
    const value = document.createElement('dd');
    value.className = 'invoice-owed__value';
    value.textContent = formatCents(tile.cents);
    el.append(label, value);
    if (tile.note) {
      const note = document.createElement('dd');
      note.className = 'invoice-owed__note u-muted';
      note.textContent = tile.note;
      el.append(note);
    }
    list.append(el);
  }
  return list;
}

/** @type {Record<import('../costs/owed.js').StatusKind, [string, string]>} */
const BADGES = {
  paid: ['Paid', 'badge--success'],
  credit: ['Overpaid', 'badge--neutral'],
  overdue: ['Overdue', 'badge--danger'],
  due: ['Due', 'badge--neutral'],
  unpaid: ['Unpaid', 'badge--neutral'],
  held: ['Retainage held', 'badge--neutral'],
};

/**
 * @param {Invoice} invoice
 * @param {string} today
 * @returns {string} the badge text, for sorting
 */
export const statusText = (invoice, today) => BADGES[status(invoice, today)][0];

/**
 * @param {Invoice} invoice
 * @param {string} today
 * @returns {HTMLSpanElement}
 */
export function statusBadge(invoice, today) {
  const [text, modifier] = BADGES[status(invoice, today)];
  const el = document.createElement('span');
  el.className = `badge ${modifier}`;
  el.textContent = text;
  return el;
}

/**
 * The owed amount, with the retained part named under it.
 * @param {Invoice} invoice
 * @returns {Node | string}
 */
export function owedCell(invoice) {
  const b = balance(invoice);
  if (b.heldCents === 0) return formatCents(b.owedCents);
  const el = document.createElement('span');
  el.className = 'invoice-owed-cell';
  const held = document.createElement('span');
  held.className = 'invoice-owed-cell__held u-muted';
  held.textContent = `${formatCents(b.heldCents)} held`;
  el.append(formatCents(b.owedCents), held);
  return el;
}

/**
 * The Mark paid button, or nothing when the invoice owes nothing.
 * @param {AppContext} ctx
 * @param {Invoice} invoice
 * @returns {Node | string}
 */
export function payButton(ctx, invoice) {
  const { owedCents } = balance(invoice);
  if (owedCents === 0) return '';
  const name = invoiceNameInSentence(invoice);
  const el = button({
    label: 'Mark paid',
    onClick: async () => {
      el.disabled = true;
      const payments = [
        ...invoice.payments.map(({ id: _id, ...p }) => p),
        ...settlingPayments(owedCents, todayIso()),
      ];
      const outcome = await ctx.write(
        (api) => api.patchInvoice(invoice.id, { payments }),
        { done: `Recorded ${formatCents(owedCents)} paid on ${name}` },
      );
      if (!outcome.ok) el.disabled = false;
    },
  });
  el.setAttribute('aria-label', `Mark ${name} paid`);
  el.classList.add('invoice-pay');
  return focusKey(el, `${invoice.id}:pay`);
}
