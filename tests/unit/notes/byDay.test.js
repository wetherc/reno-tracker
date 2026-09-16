import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDayOf, notesByDay } from '../../../src/notes/byDay.js';
import { itemOf } from '../app/scheduleFixtures.js';

/** @param {string} id @param {string} itemId @param {string} at */
const noteOf = (id, itemId, at) => ({
  id,
  scheduleItemId: itemId,
  body: id,
  createdAt: at,
  updatedAt: at,
});

test('localDayOf reads the day in the given zone', () => {
  const late = '2026-10-01T03:30:00Z';
  assert.equal(localDayOf(late, 'UTC'), '2026-10-01');
  assert.equal(localDayOf(late, 'America/New_York'), '2026-09-30');
  assert.equal(localDayOf(late, 'UTC'), '2026-10-01');
  assert.match(localDayOf(late), /^\d{4}-\d{2}-\d{2}$/);
});

test('notesByDay groups newest day first and newest note first', () => {
  const schedule = [itemOf('a'), itemOf('b')];
  const notes = [
    noteOf('n1', 'a', '2026-09-01T10:00:00Z'),
    noteOf('n2', 'b', '2026-09-03T09:00:00Z'),
    noteOf('n3', 'a', '2026-09-03T15:00:00Z'),
    noteOf('n4', 'b', '2026-09-02T23:30:00Z'),
  ];
  const days = notesByDay(notes, schedule, { timeZone: 'UTC' });
  assert.deepEqual(
    days.map((d) => [
      d.date,
      d.entries.map((e) => `${e.note.id}:${e.item.id}`),
    ]),
    [
      ['2026-09-03', ['n3:a', 'n2:b']],
      ['2026-09-02', ['n4:b']],
      ['2026-09-01', ['n1:a']],
    ],
  );
});

test('notesByDay drops a note whose item is gone and handles no notes', () => {
  const notes = [noteOf('n1', 'gone', '2026-09-01T10:00:00Z')];
  assert.deepEqual(notesByDay(notes, [itemOf('a')], { timeZone: 'UTC' }), []);
  assert.deepEqual(notesByDay([], [], { timeZone: 'UTC' }), []);
});
