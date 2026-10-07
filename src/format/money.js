// Cents to display text and back. Every money string on screen comes
// from formatCents so a value never shows two ways.

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * @param {number | null | undefined} cents
 * @returns {string} "$1,234.56", or an em dash for a missing value
 */
export function formatCents(cents) {
  if (cents === null || cents === undefined) return '—';
  return USD.format(cents / 100);
}

/**
 * Reads text a person typed into a money field. Accepts "$1,234.56",
 * "1234.5", "1234", and blank (zero). A comma must split the whole
 * dollars into groups of three, so "1,50" is null and not 150 dollars.
 * Spaces count only at the ends. Returns null for anything else, and
 * for a number too long to hold exactly, because JSON writes Infinity
 * as null. "-0" reads as 0.
 * @param {string} text
 * @returns {number | null} whole cents
 */
export function parseMoney(text) {
  const trimmed = text.trim().replace(/^(-?)\$/, '$1');
  if (trimmed === '') return 0;
  const match = /^(-?)(\d{1,3}(?:,\d{3})+|\d*)(\.\d{0,2})?$/.exec(trimmed);
  if (!match || /^-?\.?$/.test(trimmed)) return null;
  const cents = Math.round(
    Number(`${match[2].replaceAll(',', '')}${match[3] ?? ''}`) * 100,
  );
  if (!Number.isSafeInteger(cents)) return null;
  return match[1] && cents !== 0 ? -cents : cents;
}

/**
 * Text for an input's value: no currency sign, two decimals.
 * @param {number | null | undefined} cents
 * @returns {string}
 */
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}
