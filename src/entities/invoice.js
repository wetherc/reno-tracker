// An invoice is one bill from one party. Each of its lines bills one
// schedule item or one material, so the sum of the lines on a row is
// what that row cost before markup. The total adds the invoice's markup
// rate to the sum of the lines. An invoice may also list its payments. A line
// error names its field as lines.<index>.<name>, and a payment error as
// payments.<index>.<name>, so a form can mark the control on that row.
import {
  checkBasisPoints,
  checkCents,
  checkDate,
  checkText,
  fieldErrors,
  first,
  nullable,
  show,
} from './validate.js';

/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').InvoiceInput} InvoiceInput */
/** @typedef {import('../types.ts').InvoiceLineInput} InvoiceLineInput */
/** @typedef {import('../types.ts').NewInvoice} NewInvoice */
/** @typedef {import('../types.ts').PaymentInput} PaymentInput */
/** @typedef {import('./validate.js').FieldError} FieldError */

/** The most lines one invoice takes. */
export const MAX_LINES = 100;

/** The fields an invoice body may carry. */
export const INVOICE_FIELDS = /** @type {const} */ ([
  'number',
  'party',
  'issuedDate',
  'dueDate',
  'markupBasisPoints',
  'retainageCents',
  'lines',
  'payments',
]);

/** The most payments one invoice takes. */
export const MAX_PAYMENTS = 100;

const CHECKS = {
  number: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 100 }),
  party: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  issuedDate: checkDate,
  dueDate: nullable(checkDate),
  markupBasisPoints: checkBasisPoints,
  retainageCents: checkCents,
};

const LINE_CHECKS = {
  description: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 200 }),
  amountCents: checkCents,
};

const PAYMENT_CHECKS = {
  paidDate: checkDate,
  amountCents: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkCents(f, v) ?? (v === 0 ? `${f} must be more than zero` : null),
  note: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 200 }),
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} v */
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;

/**
 * The problems of one line. A line bills exactly one row, so one of
 * scheduleItemId and materialItemId is an id and the other is null or
 * absent.
 * @param {unknown} line
 * @param {number} index
 * @returns {FieldError[]}
 */
function lineErrors(line, index) {
  const at = `lines.${index}`;
  const label = `line ${index + 1}`;
  if (!isObject(line)) {
    return [
      { field: at, message: `${label} must be an object, got ${show(line)}` },
    ];
  }
  /** @type {FieldError[]} */
  const errors = [];
  const links = [line.scheduleItemId, line.materialItemId].filter(
    (v) => v !== null && v !== undefined,
  );
  if (links.length !== 1 || !links.every(isId)) {
    errors.push({
      field: `${at}.item`,
      message: `${label} must bill one schedule item or one material`,
    });
  }
  for (const e of fieldErrors(line, LINE_CHECKS, ['amountCents'])) {
    errors.push({
      field: `${at}.${e.field}`,
      message: `${label}: ${e.message}`,
    });
  }
  return errors;
}

/**
 * The problems of one payment.
 * @param {unknown} payment
 * @param {number} index
 * @returns {FieldError[]}
 */
function paymentErrors(payment, index) {
  const at = `payments.${index}`;
  const label = `payment ${index + 1}`;
  if (!isObject(payment)) {
    return [
      {
        field: at,
        message: `${label} must be an object, got ${show(payment)}`,
      },
    ];
  }
  return fieldErrors(payment, PAYMENT_CHECKS, ['paidDate', 'amountCents']).map(
    (e) => ({ field: `${at}.${e.field}`, message: `${label}: ${e.message}` }),
  );
}

/**
 * @param {unknown} payments
 * @returns {FieldError[]}
 */
function paymentListErrors(payments) {
  if (!Array.isArray(payments)) {
    return [{ field: 'payments', message: 'payments must be a list' }];
  }
  if (payments.length > MAX_PAYMENTS) {
    return [
      {
        field: 'payments',
        message: `payments must list at most ${MAX_PAYMENTS} payments, got ${payments.length}`,
      },
    ];
  }
  return payments.flatMap(paymentErrors);
}

/**
 * Field checks, every line and payment, and the rule that an invoice is due on or
 * after the day it is issued. For a patch, pass the current invoice so a
 * one-sided date change is checked against the date it keeps.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean, current?: Pick<Invoice, 'issuedDate' | 'dueDate'> }} [options]
 * @returns {FieldError[]} every problem
 */
export function invoiceErrors(input, { partial = false, current } = {}) {
  const errors = fieldErrors(
    input,
    CHECKS,
    partial ? [] : ['party', 'issuedDate'],
  );
  if ('lines' in input || !partial) {
    const { lines } = input;
    if (!Array.isArray(lines) || lines.length === 0) {
      errors.push({
        field: 'lines',
        message: 'lines must list at least one line',
      });
    } else if (lines.length > MAX_LINES) {
      errors.push({
        field: 'lines',
        message: `lines must list at most ${MAX_LINES} lines, got ${lines.length}`,
      });
    } else {
      lines.forEach((line, i) => errors.push(...lineErrors(line, i)));
    }
  }
  if ('payments' in input) errors.push(...paymentListErrors(input.payments));
  if (errors.some((e) => e.field === 'issuedDate' || e.field === 'dueDate')) {
    return errors;
  }
  const issued = /** @type {string | undefined} */ (
    input.issuedDate ?? current?.issuedDate
  );
  const due = /** @type {string | null | undefined} */ (
    'dueDate' in input ? input.dueDate : current?.dueDate
  );
  if (issued && due && due < issued) {
    errors.push({
      field: 'dueDate',
      message: `dueDate ${due} is before issuedDate ${issued}`,
    });
  }
  return errors;
}

/**
 * The first problem invoiceErrors finds, or null.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean, current?: Pick<Invoice, 'issuedDate' | 'dueDate'> }} [options]
 */
export const validateInvoice = (input, options) =>
  first(invoiceErrors(input, options));

/**
 * One checked line with every field filled.
 * @param {InvoiceLineInput} line
 * @returns {NewInvoice['lines'][number]}
 */
export function lineDefaults(line) {
  return {
    scheduleItemId: line.scheduleItemId ?? null,
    materialItemId: line.materialItemId ?? null,
    description: line.description ?? '',
    amountCents: line.amountCents,
  };
}

/**
 * Checked payments with every field filled, oldest paid day first. Two
 * payments on one day keep their order.
 * @param {PaymentInput[]} payments
 * @returns {NewInvoice['payments']}
 */
export function paymentDefaults(payments) {
  return payments
    .map((p) => ({
      paidDate: p.paidDate,
      amountCents: p.amountCents,
      note: p.note ?? '',
    }))
    .sort((a, b) => a.paidDate.localeCompare(b.paidDate));
}

/**
 * Fills a checked create body with defaults.
 * @param {InvoiceInput} input
 * @param {number} [markupBasisPoints] the rate of a body with none, which is the project's rate on a create
 * @returns {NewInvoice}
 */
export function invoiceDefaults(input, markupBasisPoints = 0) {
  return {
    number: input.number ?? '',
    party: input.party ?? '',
    issuedDate: input.issuedDate ?? '',
    dueDate: input.dueDate ?? null,
    markupBasisPoints: input.markupBasisPoints ?? markupBasisPoints,
    retainageCents: input.retainageCents ?? 0,
    lines: (input.lines ?? []).map(lineDefaults),
    payments: paymentDefaults(input.payments ?? []),
  };
}

/**
 * Keeps only the given keys of each row, so an unknown key cannot land
 * on a stored row.
 * @param {unknown} rows a checked list of objects
 * @param {string[]} keys
 * @returns {Record<string, unknown>[]}
 */
function pickRows(rows, keys) {
  return /** @type {Record<string, unknown>[]} */ (rows).map((row) =>
    Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])),
  );
}

/**
 * @param {unknown} lines a checked list of lines
 * @returns {InvoiceLineInput[]}
 */
export const pickLines = (lines) =>
  /** @type {InvoiceLineInput[]} */ (
    pickRows(lines, [
      'scheduleItemId',
      'materialItemId',
      'description',
      'amountCents',
    ])
  );

/**
 * @param {unknown} payments a checked list of payments
 * @returns {PaymentInput[]}
 */
export const pickPayments = (payments) =>
  /** @type {PaymentInput[]} */ (
    pickRows(payments, ['paidDate', 'amountCents', 'note'])
  );

/**
 * A checked body with only known keys on its lines and payments, and
 * the payments filled and in paid-day order.
 * @param {Record<string, unknown>} body
 * @returns {Omit<InvoiceInput, 'lines' | 'payments'> & { lines?: NewInvoice['lines'], payments?: NewInvoice['payments'] }}
 */
export function cleanInvoiceInput(body) {
  const { lines, payments, ...fields } = /** @type {InvoiceInput} */ (body);
  return {
    ...fields,
    ...(lines && { lines: pickLines(lines).map(lineDefaults) }),
    ...(payments && { payments: paymentDefaults(pickPayments(payments)) }),
  };
}

/**
 * The name an invoice goes by in a message: "Invoice 1043 from Pinch
 * Plumbing", or "An invoice from Pinch Plumbing" with no number.
 * @param {Pick<Invoice, 'number' | 'party'>} invoice
 * @returns {string}
 */
export function invoiceName(invoice) {
  return invoice.number
    ? `Invoice ${invoice.number} from ${invoice.party}`
    : `An invoice from ${invoice.party}`;
}

/**
 * An invoice name in the middle of a sentence: "invoice 1043 from Pinch
 * Plumbing" or "an invoice from Pinch Plumbing".
 * @param {Pick<Invoice, 'number' | 'party'>} invoice
 * @returns {string}
 */
export function invoiceNameInSentence(invoice) {
  const name = invoiceName(invoice);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * @param {Pick<Invoice, 'payments'>} invoice
 * @returns {number} the sum of the payments
 */
export function invoicePaid(invoice) {
  return invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
}

/**
 * A rate applied to an amount, rounded to whole cents.
 * @param {number} cents
 * @param {number} basisPoints
 * @returns {number}
 */
export function markupOf(cents, basisPoints) {
  return Math.round((cents * basisPoints) / 10_000);
}

/**
 * The markup of each line, in line order. The invoice rounds its markup
 * once, on the sum of the lines. Each line takes the rounded markup of
 * the running sum through it less that of the lines before it, so the
 * shares add up to the invoice markup and each share is within a cent
 * of the exact rate.
 * @param {Pick<Invoice, 'lines' | 'markupBasisPoints'>} invoice
 * @returns {number[]}
 */
export function lineMarkups(invoice) {
  let base = 0;
  let before = 0;
  return invoice.lines.map((line) => {
    base += line.amountCents;
    const through = markupOf(base, invoice.markupBasisPoints);
    const share = through - before;
    before = through;
    return share;
  });
}

/**
 * @param {Pick<Invoice, 'lines'>} invoice
 * @returns {number} the sum of the lines, before markup
 */
export function invoiceSubtotal(invoice) {
  return invoice.lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/**
 * @param {Pick<Invoice, 'lines' | 'markupBasisPoints'>} invoice
 * @returns {number} the markup on the sum of the lines
 */
export function invoiceMarkup(invoice) {
  return markupOf(invoiceSubtotal(invoice), invoice.markupBasisPoints);
}

/**
 * @param {Pick<Invoice, 'lines' | 'markupBasisPoints'>} invoice
 * @returns {number} the sum of the lines plus the markup
 */
export function invoiceTotal(invoice) {
  return invoiceSubtotal(invoice) + invoiceMarkup(invoice);
}
