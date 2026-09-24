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
 * "1234.5", "1234", and blank (zero). Returns null for anything else,
 * and for a number too long to hold exactly, because JSON writes
 * Infinity as null.
 * @param {string} text
 * @returns {number | null} whole cents
 */
export function parseMoney(text) {
  const clean = text.replace(/[$,\s]/g, '');
  if (clean === '') return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === '.' || clean === '-') {
    return null;
  }
  const cents = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
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
