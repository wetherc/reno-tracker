// Scale and tick helpers shared by the charts. Every value is in cents
// and every position is in the SVG's own units.
import { dayOffset } from '../schedule/dates.js';

/** @typedef {{ value: number, position: number }} Tick */

/**
 * The smallest 1, 2, or 5 times a power of ten that is at least `rough`.
 * @param {number} rough a positive number
 * @returns {number}
 */
export function niceStep(rough) {
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5].find((u) => u * power >= rough) ?? 10;
  return unit * power;
}

/**
 * The top of a money axis and the tick values under it. The top is the
 * first nice step above the largest value, so the largest value never
 * touches the frame. A chart with nothing on it still gets a one dollar
 * axis so the frame draws.
 * @param {number} maxCents
 * @param {number} [count] how many steps to aim for
 * @returns {{ max: number, values: number[] }}
 */
export function moneyAxis(maxCents, count = 4) {
  const top = Math.max(maxCents, 100);
  const step = niceStep(top / count);
  const max = Math.ceil(top / step) * step;
  /** @type {number[]} */
  const values = [];
  for (let v = 0; v <= max; v += step) values.push(v);
  return { max, values };
}

/**
 * Maps a value from 0..max onto 0..length.
 * @param {number} max
 * @param {number} length
 * @returns {(value: number) => number}
 */
export function linear(max, length) {
  return (value) => (value / max) * length;
}

/**
 * Maps a date onto 0..length across a range. A one day range still
 * spans the full length so a single point has room.
 * @param {string} start YYYY-MM-DD
 * @param {string} end YYYY-MM-DD, on or after start
 * @param {number} length
 * @returns {(date: string) => number}
 */
export function dayScale(start, end, length) {
  const days = Math.max(dayOffset(start, end), 1);
  return (date) => (dayOffset(start, date) / days) * length;
}

/**
 * Number text rounded to at most one decimal and no trailing zero.
 * @param {number} n
 */
function short(n) {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Axis text for a money value: "$0", "$850", "$1.2k", "$45k", "$1.5M".
 * @param {number} cents
 * @returns {string}
 */
export function formatAxisCents(cents) {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${short(dollars / 1_000_000)}M`;
  if (dollars >= 1_000) return `$${short(dollars / 1_000)}k`;
  return `$${short(dollars)}`;
}
