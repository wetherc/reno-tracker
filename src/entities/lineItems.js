// Line items, which invoices and change orders both list. Each line
// names one schedule item or one material and an amount of base cost.
// A line error names its field as lines.<index>.<name>, so a form can
// mark the control on that line.
import { checkCents, checkText, fieldErrors, show } from './validate.js';

/** @typedef {import('../types.ts').LineItemInput} LineItemInput */
/** @typedef {import('../types.ts').NewLineItem} NewLineItem */
/** @typedef {import('./validate.js').FieldError} FieldError */

/** The most lines one invoice or change order takes. */
export const MAX_LINES = 100;

const LINE_CHECKS = {
  description: (/** @type {string} */ f, /** @type {unknown} */ v) =>
    checkText(f, v, { max: 200 }),
  amountCents: checkCents,
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} v */
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;

/**
 * The problems of one line. A line names exactly one row, so one of
 * scheduleItemId and materialItemId is an id and the other is null or
 * absent.
 * @param {unknown} line
 * @param {number} index
 * @param {string} verb what a line does to its row, such as "bill"
 * @returns {FieldError[]}
 */
function lineErrors(line, index, verb) {
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
      message: `${label} must ${verb} one schedule item or one material`,
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
 * The problems of a lines value: a list of one to MAX_LINES lines, each
 * of them sound.
 * @param {unknown} lines
 * @param {string} verb what a line does to its row, such as "bill"
 * @returns {FieldError[]}
 */
export function lineListErrors(lines, verb) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [{ field: 'lines', message: 'lines must list at least one line' }];
  }
  if (lines.length > MAX_LINES) {
    return [
      {
        field: 'lines',
        message: `lines must list at most ${MAX_LINES} lines, got ${lines.length}`,
      },
    ];
  }
  return lines.flatMap((line, i) => lineErrors(line, i, verb));
}

/**
 * One checked line with every field filled.
 * @param {LineItemInput} line
 * @returns {NewLineItem}
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
 * Keeps only the given keys of each row, so an unknown key cannot land
 * on a stored row.
 * @param {unknown} rows a checked list of objects
 * @param {string[]} keys
 * @returns {Record<string, unknown>[]}
 */
export function pickRows(rows, keys) {
  return /** @type {Record<string, unknown>[]} */ (rows).map((row) =>
    Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])),
  );
}

/**
 * @param {unknown} lines a checked list of lines
 * @returns {LineItemInput[]}
 */
export const pickLines = (lines) =>
  /** @type {LineItemInput[]} */ (
    pickRows(lines, [
      'scheduleItemId',
      'materialItemId',
      'description',
      'amountCents',
    ])
  );

/**
 * Checked lines with only known keys and every field filled.
 * @param {unknown} lines a checked list of lines
 * @returns {NewLineItem[]}
 */
export const cleanLines = (lines) => pickLines(lines).map(lineDefaults);

/**
 * @param {{ lines: { amountCents: number }[] }} doc
 * @returns {number} the sum of the lines, before markup
 */
export function lineSubtotal(doc) {
  return doc.lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/**
 * The name a document goes by in a message: "Invoice 1043 from Pinch
 * Plumbing", or "An invoice from Pinch Plumbing" with no number.
 * @param {string} noun the document kind with a capital, such as "Invoice"
 * @param {{ number: string, party: string }} doc
 * @returns {string}
 */
export function docName(noun, doc) {
  return doc.number
    ? `${noun} ${doc.number} from ${doc.party}`
    : `${/^[AEIOU]/.test(noun) ? 'An' : 'A'} ${noun.toLowerCase()} from ${doc.party}`;
}

/**
 * A name from docName in the middle of a sentence: "invoice 1043 from
 * Pinch Plumbing" or "an invoice from Pinch Plumbing".
 * @param {string} name
 * @returns {string}
 */
export const inSentence = (name) =>
  name.charAt(0).toLowerCase() + name.slice(1);

/** @typedef {{ lines: { amountCents: number }[], markupBasisPoints: number }} Priced */

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
 * The markup of each line, in line order. A document rounds its markup
 * once, on the sum of the lines. Each line takes the rounded markup of
 * the running sum through it less that of the lines before it, so the
 * shares add up to the document markup and each share is within a cent
 * of the exact rate.
 * @param {Priced} doc
 * @returns {number[]}
 */
export function lineMarkups(doc) {
  let base = 0;
  let before = 0;
  return doc.lines.map((line) => {
    base += line.amountCents;
    const through = markupOf(base, doc.markupBasisPoints);
    const share = through - before;
    before = through;
    return share;
  });
}

/**
 * @param {Priced} doc
 * @returns {number} the markup on the sum of the lines
 */
export const docMarkup = (doc) =>
  markupOf(lineSubtotal(doc), doc.markupBasisPoints);
