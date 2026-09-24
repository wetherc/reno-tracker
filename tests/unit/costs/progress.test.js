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

test('progress counts weekdays on the schedule and counts materials', () => {
  // Thu to Sat is 2 weekdays; Tue to the next Mon is 5.
  assert.deepEqual(
    progress({
      schedule: [
        item('2026-10-01', '2026-10-03', true),
        item('2026-10-06', '2026-10-12', false),
      ],
      materials: [material(true, 500), material(true), material(false)],
    }),
    {
      percentWork: 29,
      workdaysDone: 2,
      workdaysAll: 7,
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
    workdaysDone: 0,
    workdaysAll: 1,
    percentMaterials: 100,
    materialsBought: 1,
    materialsAll: 1,
    materialsUninvoiced: 1,
  });
});

test('progress on an empty project is zero', () => {
  assert.deepEqual(progress({ schedule: [], materials: [] }), {
    percentWork: 0,
    workdaysDone: 0,
    workdaysAll: 0,
    percentMaterials: 0,
    materialsBought: 0,
    materialsAll: 0,
    materialsUninvoiced: 0,
  });
});

test('progress counts an overlapped day once and done only when every item on it is', () => {
  // Mon to Fri, with a complete job over Mon to Wed and an open one on Wed.
  const result = progress({
    schedule: [
      item('2026-10-05', '2026-10-07', true),
      item('2026-10-05', '2026-10-06', true),
      item('2026-10-07', '2026-10-09', false),
    ],
    materials: [],
  });
  assert.equal(result.workdaysDone, 2);
  assert.equal(result.workdaysAll, 5);
  assert.equal(result.percentWork, 40);
});

test('progress leaves out an item that covers only a weekend', () => {
  const result = progress({
    schedule: [
      item('2026-10-03', '2026-10-04', true),
      item('2026-10-05', '2026-10-05', false),
    ],
    materials: [],
  });
  assert.equal(result.workdaysDone, 0);
  assert.equal(result.workdaysAll, 1);
});
