import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress } from '../../../src/costs/progress.js';

/**
 * @param {string} startDate
 * @param {string} endDate
 * @param {boolean} complete
 */
const item = (startDate, endDate, complete) =>
  /** @type {any} */ ({ startDate, endDate, complete });

/**
 * @param {boolean} complete
 * @param {number | null} [actualCents]
 */
const material = (complete, actualCents = null) =>
  /** @type {any} */ ({ complete, actualCents });

test('progress weighs schedule items by their days and counts materials', () => {
  assert.deepEqual(
    progress({
      schedule: [
        item('2026-10-01', '2026-10-03', true),
        item('2026-10-06', '2026-10-12', false),
      ],
      materials: [material(true, 500), material(true), material(false)],
    }),
    {
      percentWork: 30,
      percentMaterials: 67,
      materialsBought: 2,
      materialsAll: 3,
      materialsUninvoiced: 1,
    },
  );
});

test('progress ignores bought materials when no work is done', () => {
  const result = progress({
    schedule: [item('2026-10-01', '2026-10-01', false)],
    materials: [material(true)],
  });
  assert.deepEqual(result, {
    percentWork: 0,
    percentMaterials: 100,
    materialsBought: 1,
    materialsAll: 1,
    materialsUninvoiced: 1,
  });
});

test('progress on an empty project is zero', () => {
  assert.deepEqual(progress({ schedule: [], materials: [] }), {
    percentWork: 0,
    percentMaterials: 0,
    materialsBought: 0,
    materialsAll: 0,
    materialsUninvoiced: 0,
  });
});
