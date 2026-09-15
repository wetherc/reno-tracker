import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { dataTable } from '../../../src/ui/DataTable.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/** @typedef {{ id: string, name: string, cost: number }} Row */

/** @type {Row[]} */
const rows = [
  { id: 'b', name: 'Tile', cost: 300 },
  { id: 'a', name: 'Paint', cost: 100 },
  { id: 'c', name: 'Sink', cost: 200 },
];

/** @param {Partial<Parameters<typeof dataTable<Row>>[0]>} [extra] */
function build(extra = {}) {
  return dataTable({
    caption: 'Materials',
    rows,
    rowKey: (r) => r.id,
    columns: [
      { key: 'name', label: 'Name', cell: (r) => r.name },
      {
        key: 'cost',
        label: 'Cost',
        align: 'end',
        cell: (r) => String(r.cost),
        compare: (a, b) => a.cost - b.cost,
      },
      { key: 'x', label: 'Actions', hideLabel: true, cell: () => 'x' },
    ],
    ...extra,
  });
}

/** @param {ReturnType<typeof build>} table */
const names = (table) =>
  $(table.body).children.map(
    (/** @type {any} */ tr) => tr.children[0].textContent,
  );

test('renders caption, headers, and one row per item', () => {
  const table = build();
  assert.equal(table.el.tagName, 'TABLE');
  assert.equal(table.el.className, 'data-table');
  const caption = table.el.children[0];
  assert.equal(caption.tagName, 'CAPTION');
  assert.equal(caption.className, 'sr-only');
  assert.equal(caption.textContent, 'Materials');
  const [name, cost, actions] = $(table.el.children[1]).children[0].children;
  assert.equal(name.getAttribute('scope'), 'col');
  assert.equal(name.className, 'data-table__th');
  assert.equal(name.children.length, 1);
  assert.equal(name.children[0].tagName, 'SPAN');
  assert.equal(cost.className, 'data-table__th data-table__th--end');
  assert.equal(cost.children[0].tagName, 'BUTTON');
  assert.equal(cost.getAttribute('aria-sort'), null);
  assert.equal(actions.children[0].className, 'sr-only');
  assert.deepEqual(names(table), ['Tile', 'Paint', 'Sink']);
  const first = table.body.children[0];
  assert.equal($(first).dataset.key, 'b');
  assert.equal(first.className, 'data-table__row');
  assert.equal(
    $(first).children[1].className,
    'data-table__td data-table__td--end',
  );
});

test('clicking a sortable header cycles asc, desc, off', () => {
  /** @type {unknown[]} */
  const seen = [];
  const table = build({ onSort: (s) => seen.push(s) });
  const cost = $(table.el.children[1]).children[0].children[1];
  const btn = cost.children[0];
  btn.click();
  assert.deepEqual(names(table), ['Paint', 'Sink', 'Tile']);
  assert.equal(cost.getAttribute('aria-sort'), 'ascending');
  assert.equal(cost.classList.contains('data-table__th--sorted'), true);
  btn.click();
  assert.deepEqual(names(table), ['Tile', 'Sink', 'Paint']);
  assert.equal(cost.getAttribute('aria-sort'), 'descending');
  assert.equal(cost.classList.contains('data-table__th--desc'), true);
  btn.click();
  assert.deepEqual(names(table), ['Tile', 'Paint', 'Sink']);
  assert.equal(cost.getAttribute('aria-sort'), null);
  assert.equal(cost.classList.contains('data-table__th--desc'), false);
  assert.deepEqual(seen, [
    { key: 'cost', dir: 'asc' },
    { key: 'cost', dir: 'desc' },
    null,
  ]);
});

test('an initial sort applies and update keeps it', () => {
  const table = build({
    sort: { key: 'cost', dir: 'desc' },
    rowClass: (r) => (r.cost > 150 ? 'is-big' : ''),
  });
  assert.deepEqual(names(table), ['Tile', 'Sink', 'Paint']);
  assert.equal(table.body.children[0].classList.contains('is-big'), true);
  assert.equal(table.body.children[2].classList.contains('is-big'), false);
  table.update([{ id: 'z', name: 'Zinc', cost: 5 }, ...rows]);
  assert.deepEqual(names(table), ['Tile', 'Sink', 'Paint', 'Zinc']);
  assert.deepEqual(table.sort, { key: 'cost', dir: 'desc' });
});

test('a sort key with no compare leaves the order alone', () => {
  const table = build({ sort: { key: 'name', dir: 'asc' } });
  assert.deepEqual(names(table), ['Tile', 'Paint', 'Sink']);
});

test('a footer draws one totals cell per column under the body', () => {
  const table = build({ footer: ['Total', '600'] });
  const foot = $(table.el.children[3]);
  assert.equal(foot.tagName, 'TFOOT');
  const row = foot.children[0];
  assert.equal(row.className, 'data-table__foot');
  assert.deepEqual(
    row.children.map((/** @type {any} */ td) => td.textContent),
    ['Total', '600', ''],
  );
  assert.equal(row.children[1].className, 'data-table__td data-table__td--end');
  assert.equal(build().el.children.length, 3);
});
