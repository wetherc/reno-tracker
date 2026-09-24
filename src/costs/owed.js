// What the household still owes on each invoice, and when. The open
// balance is the total less every payment. Retainage is kept back from
// the open balance until a payment covers it, so it is owed but not
// due. The rest is due on the invoice's due day. An invoice with no due
// day is unpaid but never overdue. A balance below zero is a credit
// with that party, and it does not lower what other invoices owe.
import { invoicePaid, invoiceTotal } from '../entities/invoice.js';

/** @typedef {import('../types.ts').Invoice} Invoice */

/**
 * @typedef {object} Balance
 * @property {number} totalCents the sum of the lines
 * @property {number} paidCents the sum of the payments
 * @property {number} owedCents the open balance, zero or more
 * @property {number} heldCents the part of owedCents kept back as retainage
 * @property {number} dueCents the part of owedCents that is due
 * @property {number} creditCents how much the payments pass the total
 */

/**
 * @param {Invoice} invoice
 * @returns {Balance}
 */
export function balance(invoice) {
  const totalCents = invoiceTotal(invoice);
  const paidCents = invoicePaid(invoice);
  const open = totalCents - paidCents;
  const owedCents = Math.max(open, 0);
  const heldCents = Math.min(invoice.retainageCents, owedCents);
  return {
    totalCents,
    paidCents,
    owedCents,
    heldCents,
    dueCents: owedCents - heldCents,
    creditCents: Math.max(-open, 0),
  };
}

/** @typedef {'paid' | 'credit' | 'overdue' | 'due' | 'unpaid' | 'held'} StatusKind */

/**
 * Where an invoice stands on a given day.
 * @param {Invoice} invoice
 * @param {string} today YYYY-MM-DD
 * @returns {StatusKind}
 */
export function status(invoice, today) {
  const b = balance(invoice);
  if (b.creditCents > 0) return 'credit';
  if (b.owedCents === 0) return 'paid';
  if (b.dueCents === 0) return 'held';
  if (invoice.dueDate === null) return 'unpaid';
  return invoice.dueDate < today ? 'overdue' : 'due';
}

/**
 * @typedef {object} Owed
 * @property {number} owedCents every open balance added up
 * @property {number} overdueCents due before today
 * @property {number} upcomingCents due today or later
 * @property {string | null} nextDue the earliest due day of upcomingCents
 * @property {number} undatedCents due, on invoices with no due day
 * @property {number} heldCents kept back as retainage
 * @property {number} creditCents paid past the total
 * @property {number} openCount how many invoices owe something
 */

/**
 * The money still owed across invoices, split by when it is due.
 * @param {Invoice[]} invoices
 * @param {string} today YYYY-MM-DD
 * @returns {Owed}
 */
export function owedSummary(invoices, today) {
  /** @type {Owed} */
  const owed = {
    owedCents: 0,
    overdueCents: 0,
    upcomingCents: 0,
    nextDue: null,
    undatedCents: 0,
    heldCents: 0,
    creditCents: 0,
    openCount: 0,
  };
  for (const invoice of invoices) {
    const b = balance(invoice);
    owed.owedCents += b.owedCents;
    owed.heldCents += b.heldCents;
    owed.creditCents += b.creditCents;
    if (b.owedCents > 0) owed.openCount += 1;
    if (b.dueCents === 0) continue;
    const due = invoice.dueDate;
    if (due === null) {
      owed.undatedCents += b.dueCents;
    } else if (due < today) {
      owed.overdueCents += b.dueCents;
    } else {
      owed.upcomingCents += b.dueCents;
      if (owed.nextDue === null || due < owed.nextDue) owed.nextDue = due;
    }
  }
  return owed;
}
