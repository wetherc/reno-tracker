// Basis points to percent text and back. One basis point is a
// hundredth of a percent, so 1500 is 15% and 1250 is 12.5%. The parse
// reads the digits as text and never multiplies a decimal, because a
// value such as 0.29 has no exact binary form and 0.29 * 100 is not 29.
import { MAX_BASIS_POINTS } from '../entities/validate.js';

/**
 * Text for an input's value: "15", "12.5", "7.25", with no percent sign.
 * @param {number} basisPoints
 * @returns {string}
 */
export function percentToInput(basisPoints) {
  const whole = Math.floor(basisPoints / 100);
  const part = basisPoints % 100;
  if (part === 0) return String(whole);
  return `${whole}.${String(part).padStart(2, '0').replace(/0$/, '')}`;
}

/**
 * @param {number} basisPoints
 * @returns {string} "15%", "12.5%"
 */
export function formatPercent(basisPoints) {
  return `${percentToInput(basisPoints)}%`;
}

/**
 * Reads text a person typed into a percent field. Accepts "15", "15%",
 * "12.5", "7.25", and blank (zero), up to 100. Spaces count only at
 * the ends and before the percent sign. Returns null for anything else.
 * @param {string} text
 * @returns {number | null} whole basis points
 */
export function parsePercent(text) {
  const clean = text.trim().replace(/\s*%$/, '');
  if (clean === '') return 0;
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  const basisPoints =
    Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return basisPoints <= MAX_BASIS_POINTS ? basisPoints : null;
}
