import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  isBlank,
  blendedColumn,
  markupRateField,
  projectionText,
  projections,
  rowProjection,
} from '../../../src/app/rowMarkup.js';
import { invoiceOf, itemOf, materialOf } from './scheduleFixtures.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('rowProjection keeps the estimate on an open row billed below it', () => {
  const row = {
    complete: false,
    expected: 10_000,
    actualCents: null,
    markupBasisPoints: 2500,
    projectRate: 1000,
    billing: { cents: 4_000, markupCents: 800 },
  };
  assert.deepEqual(rowProjection(row), { cents: 12_500, markupCents: 2_500 });
  assert.deepEqual(rowProjection({ ...row, complete: true }), {
    cents: 4_800,
    markupCents: 800,
  });
  assert.deepEqual(
    rowProjection({ ...row, markupBasisPoints: null, billing: undefined }),
    { cents: 11_000, markupCents: 1_000 },
  );
});

test('projectionText names raw, margin, and blended', () => {
  assert.equal(
    projectionText({ cents: 12_500, markupCents: 2_500 }),
    'Projected $100.00 raw + $25.00 margin = $125.00 blended',
  );
});

test('markupRateField is blank for the project rate and says so', () => {
  const field = markupRateField({
    id: 'r',
    label: 'Markup (%)',
    basisPoints: null,
    projectRate: 1250,
  });
  assert.equal($(field.input).placeholder, '12.5');
  assert.equal(isBlank(field), true);
  assert.equal(field.basisPoints(), null);
  const hint = $(field.el).querySelector('.form__hint');
  assert.equal(hint.textContent, 'Blank takes the project rate, 12.5%');
  assert.equal(field.input.getAttribute('aria-describedby'), hint.id);
  $(field.input).value = ' 5 ';
  assert.equal(isBlank(field), false);
  assert.equal(field.basisPoints(), 500);
});

test('blendedColumn reads each row from projections and totals the footer', () => {
  const payload = /** @type {any} */ ({
    project: { startDate: '2026-10-01', markupBasisPoints: 1000 },
    schedule: [
      itemOf('a', { estimatedCents: 10_000 }),
      itemOf('b', { estimatedCents: 20_000, markupBasisPoints: 0 }),
    ],
    materials: [materialOf('m', { estimatedCents: 5_000 })],
    invoices: [
      invoiceOf('i', {
        markupBasisPoints: 2000,
        lines: [
          {
            id: 'l',
            scheduleItemId: null,
            materialItemId: 'm',
            description: '',
            amountCents: 6_000,
          },
        ],
      }),
    ],
    changeOrders: [],
  });
  const byId = projections(payload);
  assert.deepEqual(byId.get('m'), { cents: 7_200, markupCents: 1_200 });
  const { column, footer } = blendedColumn(byId, payload.schedule);
  const [a, b] = payload.schedule;
  const cell = $(column.cell(a));
  assert.equal(column.label, 'Blended');
  assert.equal(cell.className, 'cell-stack');
  assert.equal(cell.textContent, '$110.00$10.00 margin');
  assert.equal(cell.children[0].className, 'cell-stack__note u-muted');
  assert.equal(/** @type {any} */ (column.compare)(a, b) < 0, true);
  assert.equal($(footer).textContent, '$310.00$10.00 margin');
});
