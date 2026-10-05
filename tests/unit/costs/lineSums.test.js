import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumsByRow } from '../../../src/costs/lineSums.js';

/**
 * @param {string} issuedDate
 * @param {[string | null, string | null, number][]} lines
 */
const doc = (issuedDate, lines) => ({
  issuedDate,
  lines: lines.map(([scheduleItemId, materialItemId, amountCents], i) => ({
    id: `l${i}`,
    scheduleItemId,
    materialItemId,
    description: '',
    amountCents,
    markupBasisPoints: null,
  })),
});

test('sumsByRow adds the lines per row with no markup by default', () => {
  const late = doc('2026-02-01', [['a', null, 100]]);
  const early = doc('2026-01-01', [
    ['a', null, 5],
    [null, 'm', 7],
  ]);
  const sums = sumsByRow([late, early]);
  assert.deepEqual(sums.get('a'), {
    cents: 105,
    markupCents: 0,
    lines: 2,
    first: early,
  });
  assert.deepEqual(sums.get('m'), {
    cents: 7,
    markupCents: 0,
    lines: 1,
    first: early,
  });
  const marked = sumsByRow([late], () => [10]);
  assert.equal(marked.get('a')?.markupCents, 10);
});
