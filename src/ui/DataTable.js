// A sortable table. Columns declare how to render a cell and, when they
// can be sorted, how to compare two rows. Header cells are buttons so a
// keyboard reaches them, and the active column announces aria-sort.
import { icon } from './icon.js';

/**
 * @template R
 * @typedef {{
 *   key: string,
 *   label: string,
 *   cell: (row: R) => Node | string,
 *   compare?: (a: R, b: R) => number,
 *   align?: 'start' | 'end' | 'center',
 *   hideLabel?: boolean,
 * }} Column hideLabel keeps the header text for screen readers only
 */

/** @typedef {{ key: string, dir: 'asc' | 'desc' }} SortState */

/**
 * @template R
 * @typedef {{
 *   el: HTMLTableElement,
 *   body: HTMLTableSectionElement,
 *   readonly sort: SortState | null,
 *   update(rows: R[]): void,
 * }} DataTableHandle
 */

/**
 * @template R
 * @param {{
 *   caption: string,
 *   columns: Column<R>[],
 *   rows: R[],
 *   rowKey: (row: R) => string,
 *   rowClass?: (row: R) => string,
 *   sort?: SortState | null,
 *   onSort?: (sort: SortState | null) => void,
 *   footer?: (Node | string)[],
 * }} config the caption is read to screen readers and hidden on screen;
 * footer is one cell per column, drawn as a totals row under the body
 * @returns {DataTableHandle<R>}
 */
export function dataTable({
  caption,
  columns,
  rows,
  rowKey,
  rowClass,
  sort = null,
  onSort,
  footer,
}) {
  const el = document.createElement('table');
  el.className = 'data-table';
  const captionEl = document.createElement('caption');
  captionEl.className = 'sr-only';
  captionEl.append(caption);
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const body = document.createElement('tbody');
  head.append(headRow);
  el.append(captionEl, head, body);
  if (footer) el.append(footerRow(columns, footer));

  /** @type {SortState | null} */
  let current = sort;
  let currentRows = rows;

  const headers = columns.map((column) => {
    const th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.className = cellClass('data-table__th', column);
    if (column.compare) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-bare data-table__sort';
      btn.append(labelNode(column), icon('chevron-down'));
      btn.addEventListener('click', () => toggleSort(column.key));
      th.append(btn);
    } else {
      th.append(labelNode(column));
    }
    headRow.append(th);
    return th;
  });

  /** @param {string} key */
  function toggleSort(key) {
    if (current?.key !== key) current = { key, dir: 'asc' };
    else if (current.dir === 'asc') current = { key, dir: 'desc' };
    else current = null;
    render();
    onSort?.(current);
  }

  function sorted() {
    if (!current) return currentRows;
    const column = columns.find((c) => c.key === current?.key);
    if (!column?.compare) return currentRows;
    const compare = column.compare;
    const sign = current.dir === 'asc' ? 1 : -1;
    return [...currentRows].sort((a, b) => sign * compare(a, b));
  }

  function render() {
    columns.forEach((column, i) => {
      const th = headers[i];
      if (!column.compare) return;
      const on = current?.key === column.key;
      th.classList.toggle('data-table__th--sorted', on);
      if (on) {
        th.setAttribute(
          'aria-sort',
          current?.dir === 'asc' ? 'ascending' : 'descending',
        );
        th.classList.toggle('data-table__th--desc', current?.dir === 'desc');
      } else {
        th.removeAttribute('aria-sort');
        th.classList.remove('data-table__th--desc');
      }
    });
    body.replaceChildren(
      ...sorted().map((row) => {
        const tr = document.createElement('tr');
        tr.className = 'data-table__row';
        tr.dataset.key = rowKey(row);
        const extra = rowClass?.(row);
        if (extra) tr.classList.add(extra);
        for (const column of columns) {
          const td = document.createElement('td');
          td.className = cellClass('data-table__td', column);
          td.append(column.cell(row));
          tr.append(td);
        }
        return tr;
      }),
    );
  }

  render();
  return {
    el,
    body,
    get sort() {
      return current;
    },
    update(rows) {
      currentRows = rows;
      render();
    },
  };
}

/**
 * @template R
 * @param {string} base
 * @param {Column<R>} column
 */
function cellClass(base, column) {
  const align = column.align ?? 'start';
  return align === 'start' ? base : `${base} ${base}--${align}`;
}

/**
 * @template R
 * @param {Column<R>[]} columns
 * @param {(Node | string)[]} cells
 * @returns {HTMLTableSectionElement}
 */
function footerRow(columns, cells) {
  const foot = document.createElement('tfoot');
  const tr = document.createElement('tr');
  tr.className = 'data-table__foot';
  columns.forEach((column, i) => {
    const td = document.createElement('td');
    td.className = cellClass('data-table__td', column);
    td.append(cells[i] ?? '');
    tr.append(td);
  });
  foot.append(tr);
  return foot;
}

/**
 * @template R
 * @param {Column<R>} column
 * @returns {HTMLSpanElement}
 */
function labelNode(column) {
  const span = document.createElement('span');
  if (column.hideLabel) span.className = 'sr-only';
  span.append(column.label);
  return span;
}
