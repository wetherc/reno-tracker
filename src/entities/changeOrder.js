// A change order is an agreed change to the scope of the work. Each of
// its lines adds an amount of base cost to the estimate of one schedule
// item or one material. Only an approved change order adds to an
// estimate. The change order's own markup rate applies to its lines, so
// a contractor can price a change with a margin other than the project
// rate. A line error names its field as lines.<index>.<name>, so a
// form can mark the control on that line.
import {
  cleanLines,
  docMarkup,
  docName,
  inSentence,
  lineListErrors,
  lineSubtotal,
} from './lineItems.js';
import {
  checkBasisPoints,
  checkBoolean,
  checkDate,
  checkText,
  fieldErrors,
  first,
} from './validate.js';

/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').ChangeOrderInput} ChangeOrderInput */
/** @typedef {import('../types.ts').NewChangeOrder} NewChangeOrder */
/** @typedef {import('./validate.js').FieldError} FieldError */

/** The fields a change order body may carry. */
export const CHANGE_ORDER_FIELDS = /** @type {const} */ ([
  'number',
  'party',
  'issuedDate',
  'approved',
  'markupBasisPoints',
  'description',
  'lines',
]);

const CHECKS = {
  number: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 100 }),
  party: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { min: 1, max: 200 }),
  issuedDate: checkDate,
  approved: checkBoolean,
  markupBasisPoints: checkBasisPoints,
  description: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 1000 }),
};

/**
 * Field checks and every line.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options]
 * @returns {FieldError[]} every problem
 */
export function changeOrderErrors(input, { partial = false } = {}) {
  const errors = fieldErrors(
    input,
    CHECKS,
    partial ? [] : ['party', 'issuedDate'],
  );
  if ('lines' in input || !partial) {
    errors.push(...lineListErrors(input.lines, 'add to'));
  }
  return errors;
}

/**
 * The first problem changeOrderErrors finds, or null.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options]
 */
export const validateChangeOrder = (input, options) =>
  first(changeOrderErrors(input, options));

/**
 * A checked body with only known keys on its lines.
 * @param {Record<string, unknown>} body
 * @returns {Omit<ChangeOrderInput, 'lines'> & { lines?: NewChangeOrder['lines'] }}
 */
export function cleanChangeOrderInput(body) {
  const { lines, ...fields } = /** @type {ChangeOrderInput} */ (body);
  return { ...fields, ...(lines && { lines: cleanLines(lines) }) };
}

/**
 * Fills a checked create body with defaults. A new change order is
 * pending until a body says it is approved.
 * @param {ReturnType<typeof cleanChangeOrderInput>} input
 * @param {number} markupBasisPoints the rate of a body with none, which is the project's rate
 * @returns {NewChangeOrder}
 */
export function changeOrderDefaults(input, markupBasisPoints) {
  return {
    number: input.number ?? '',
    party: input.party ?? '',
    issuedDate: input.issuedDate ?? '',
    approved: input.approved ?? false,
    markupBasisPoints: input.markupBasisPoints ?? markupBasisPoints,
    description: input.description ?? '',
    lines: input.lines ?? [],
  };
}

/**
 * The name a change order goes by in a message: "Change order 7 from
 * Pinch Plumbing", or "A change order from Pinch Plumbing" with no
 * number.
 * @param {Pick<ChangeOrder, 'number' | 'party'>} order
 * @returns {string}
 */
export const changeOrderName = (order) => docName('Change order', order);

/**
 * A change order name in the middle of a sentence.
 * @param {Pick<ChangeOrder, 'number' | 'party'>} order
 * @returns {string}
 */
export const changeOrderNameInSentence = (order) =>
  inSentence(changeOrderName(order));

/**
 * @param {Pick<ChangeOrder, 'markupBasisPoints'> & { lines: { amountCents: number }[] }} order
 * @returns {number} the sum of the lines plus the markup
 */
export const changeOrderTotal = (order) =>
  lineSubtotal(order) + docMarkup(order);
