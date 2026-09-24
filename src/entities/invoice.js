// An invoice is one bill from one party. Each of its lines bills one
// schedule item or one material, so the sum of the lines on a row is
// what that row cost. A line error names its field as lines.<index>.<name>
// so a form can mark the control on that line.
import {
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
/** @typedef {import('./validate.js').FieldError} FieldError */

/** The most lines one invoice takes. */
export const MAX_LINES = 100;

const CHECKS = {
  number: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 100 }),
  party: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  issuedDate: checkDate,
  dueDate: nullable(checkDate),
};

const LINE_CHECKS = {
  description: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 200 }),
  amountCents: checkCents,
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
 * Field checks, every line, and the rule that an invoice is due on or
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
 * Fills a checked create body with defaults.
 * @param {InvoiceInput} input
 * @returns {NewInvoice}
 */
export function invoiceDefaults(input) {
  return {
    number: input.number ?? '',
    party: input.party ?? '',
    issuedDate: input.issuedDate ?? '',
    dueDate: input.dueDate ?? null,
    lines: (input.lines ?? []).map(lineDefaults),
  };
}

/**
 * Keeps only the known keys of each line, so an unknown key cannot land
 * on a stored row.
 * @param {unknown} lines a checked list of lines
 * @returns {InvoiceLineInput[]}
 */
export function pickLines(lines) {
  return /** @type {Record<string, unknown>[]} */ (lines).map((line) => {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of [
      'scheduleItemId',
      'materialItemId',
      'description',
      'amountCents',
    ]) {
      if (key in line) out[key] = line[key];
    }
    return /** @type {InvoiceLineInput} */ (out);
  });
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
 * @param {Pick<Invoice, 'lines'>} invoice
 * @returns {number} the sum of the lines
 */
export function invoiceTotal(invoice) {
  return invoice.lines.reduce((sum, line) => sum + line.amountCents, 0);
}
