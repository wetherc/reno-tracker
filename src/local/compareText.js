// Text order for the browser store. SQLite compares TEXT with the BINARY
// collation, which orders UTF-8 bytes, and UTF-8 byte order is code point
// order. localeCompare follows the language of the browser instead, so
// rows with equal sort keys would come out in another order than on the
// server.

/**
 * Compares two strings by code point, as SQLite orders TEXT.
 * @param {string} a
 * @param {string} b
 * @returns {number} below zero when a comes first, zero when equal
 */
export function compareText(a, b) {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = /** @type {number} */ (a.codePointAt(i));
    const y = /** @type {number} */ (b.codePointAt(i));
    if (x !== y) return x < y ? -1 : 1;
    if (x > 0xffff) i++;
  }
  return a.length < b.length ? -1 : 1;
}
