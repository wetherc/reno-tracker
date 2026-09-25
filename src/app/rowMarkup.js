// The markup parts of the schedule and material editors. Estimates and
// actual prices are raw cost, before markup. The rate field sets the
// row's own margin, and a blank field takes the project rate. The line
// under the form shows the raw cost, the margin, and the blended total
// that the costs panel counts for the row, and it follows each keystroke.
// The schedule and materials tables show the same two amounts per row.
import { projected } from '../costs/summary.js';
import { costEvents, rowPrices } from '../costs/timeline.js';
import { formatCents } from '../format/money.js';
import { formatPercent } from '../format/percent.js';
import { percentField } from '../ui/formFields.js';

/**
 * @typedef {object} RowCosts
 * @property {boolean} complete
 * @property {number} expected the raw estimate
 * @property {number | null} actualCents the raw actual price
 * @property {number | null} markupBasisPoints the row's rate, or null for the project rate
 * @property {number} projectRate
 * @property {{ cents: number, markupCents: number }} [billing] the row's invoice lines
 */

/**
 * True when a field holds no text. A price or rate field that reads as
 * null is blank, or it holds text that does not parse.
 * @param {{ input: { value: string } }} field
 */
export const isBlank = (field) => field.input.value.trim() === '';

/**
 * The amount the costs panel counts for one row, and its margin part.
 * @param {RowCosts} row
 * @returns {{ cents: number, markupCents: number }}
 */
export function rowProjection(row) {
  return projected(rowPrices(row, row.expected, row.projectRate, row.billing));
}

/**
 * @param {{ cents: number, markupCents: number }} projection
 * @returns {string}
 */
export function projectionText({ cents, markupCents }) {
  return `Projected ${formatCents(cents - markupCents)} raw + ${formatCents(markupCents)} margin = ${formatCents(cents)} blended`;
}

/**
 * The rate field of an editor. Its placeholder and hint name the
 * project rate that a blank field takes.
 * @param {{ id: string, label: string, basisPoints: number | null, projectRate: number }} config
 */
export function markupRateField({ id, label, basisPoints, projectRate }) {
  const field = percentField({
    id,
    label,
    basisPoints,
    blankIsNull: true,
    placeholder: formatPercent(projectRate).replace('%', ''),
  });
  const hint = document.createElement('p');
  hint.className = 'form__hint';
  hint.id = `${id}-hint`;
  hint.textContent = `Blank takes the project rate, ${formatPercent(projectRate)}`;
  field.input.setAttribute('aria-describedby', hint.id);
  field.el.append(hint);
  return field;
}

/**
 * The projection line under an editor's form. `update` reads the form
 * again, and a read that returns null clears the line, as when a price
 * does not parse.
 * @param {() => RowCosts | null} read
 * @returns {{ el: HTMLParagraphElement, update(): void }}
 */
export function projectionLine(read) {
  const el = document.createElement('p');
  el.className = 'editor__projection u-num';
  el.setAttribute('aria-live', 'polite');
  const update = () => {
    const row = read();
    el.textContent = row ? projectionText(rowProjection(row)) : '';
  };
  update();
  return { el, update };
}

/**
 * What the costs panel counts for every schedule item and material, by
 * row id. The tables read their Blended column from it.
 * @param {import('../types.ts').ProjectPayload} payload
 * @returns {Map<string, { cents: number, markupCents: number }>}
 */
export function projections(payload) {
  return new Map(costEvents(payload).map((e) => [e.id, projected(e)]));
}

/**
 * The blended total over its margin, for a table cell.
 * @param {{ cents: number, markupCents: number }} projection
 * @returns {HTMLSpanElement}
 */
export function blendedCell({ cents, markupCents }) {
  const el = document.createElement('span');
  el.className = 'blended';
  const margin = document.createElement('span');
  margin.className = 'blended__margin u-muted';
  margin.textContent = `${formatCents(markupCents)} margin`;
  el.append(formatCents(cents), margin);
  return el;
}

/**
 * The Blended column of a table, and its footer cell. Each cell shows
 * what the costs panel counts for the row, with its margin under it.
 * @template {{ id: string }} R
 * @param {Map<string, { cents: number, markupCents: number }>} byId
 * @param {R[]} rows
 * @returns {{ column: import('../ui/DataTable.js').Column<R>, footer: HTMLSpanElement }}
 */
export function blendedColumn(byId, rows) {
  const of = (/** @type {R} */ row) =>
    /** @type {{ cents: number, markupCents: number }} */ (byId.get(row.id));
  const total = { cents: 0, markupCents: 0 };
  for (const row of rows) {
    total.cents += of(row).cents;
    total.markupCents += of(row).markupCents;
  }
  return {
    column: {
      key: 'blended',
      label: 'Blended',
      align: 'end',
      compare: (a, b) => of(a).cents - of(b).cents,
      cell: (row) => blendedCell(of(row)),
    },
    footer: blendedCell(total),
  };
}
