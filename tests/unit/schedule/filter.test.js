import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterSchedule,
  isFiltering,
  NO_FILTER,
  partiesOf,
  readStatus,
} from '../../../src/schedule/filter.js';
import { itemOf } from '../app/scheduleFixtures.js';

const today = '2026-10-10';
const items = [
  itemOf('a', {
    title: 'Demo cabinets',
    responsibleParty: 'Crew',
    endDate: '2026-10-02',
    complete: true,
  }),
  itemOf('b', {
    title: 'Rough plumbing',
    description: 'Move the sink drain',
    responsibleParty: 'Pinch Plumbing',
    endDate: '2026-10-05',
  }),
  itemOf('c', { title: 'Tile', endDate: '2026-10-20' }),
];

/** @param {Partial<import('../../../src/schedule/filter.js').ScheduleFilter>} extra */
const ids = (extra) =>
  filterSchedule(items, { ...NO_FILTER, ...extra }, today).map((i) => i.id);

test('no filter keeps every item in order', () => {
  assert.deepEqual(ids({}), ['a', 'b', 'c']);
  assert.equal(isFiltering(NO_FILTER), false);
  assert.equal(isFiltering({ ...NO_FILTER, text: '   ' }), false);
});

test('text matches each word in title, description, or party', () => {
  assert.deepEqual(ids({ text: 'PLUMB' }), ['b']);
  assert.deepEqual(ids({ text: 'sink' }), ['b']);
  assert.deepEqual(ids({ text: 'crew' }), ['a']);
  assert.deepEqual(ids({ text: ' drain  rough ' }), ['b']);
  assert.deepEqual(ids({ text: 'drain tile' }), []);
  assert.equal(isFiltering({ ...NO_FILTER, text: 'x' }), true);
});

test('party matches one name exactly', () => {
  assert.deepEqual(ids({ party: 'Crew' }), ['a']);
  assert.deepEqual(ids({ party: 'Pinch' }), []);
  assert.equal(isFiltering({ ...NO_FILTER, party: 'Crew' }), true);
});

test('status keeps open or late items', () => {
  assert.deepEqual(ids({ status: 'open' }), ['b', 'c']);
  assert.deepEqual(ids({ status: 'late' }), ['b']);
  assert.deepEqual(ids({ status: 'late', text: 'tile' }), []);
  assert.equal(isFiltering({ ...NO_FILTER, status: 'open' }), true);
});

test('readStatus falls back to all', () => {
  assert.equal(readStatus('late'), 'late');
  assert.equal(readStatus('open'), 'open');
  assert.equal(readStatus('done'), 'all');
  assert.equal(readStatus(null), 'all');
});

test('partiesOf lists each named party once in name order', () => {
  assert.deepEqual(
    partiesOf([...items, itemOf('d', { responsibleParty: 'crew' })]),
    ['Crew', 'crew', 'Pinch Plumbing'],
  );
  assert.deepEqual(partiesOf([itemOf('e')]), []);
});
