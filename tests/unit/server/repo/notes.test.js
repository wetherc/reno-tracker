import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNote,
  deleteNote,
  getNote,
  patchNote,
} from '../../../../src/server/repo/notes.js';
import { addItem, freshDb, ISO_TIMESTAMP } from './fixtures.js';

test('notes are created, edited, and deleted', () => {
  const { db, project } = freshDb();
  const item = addItem(db, project.id, 'Demo');
  const note = createNote(db, item.id, 'Call the plumber');
  assert.match(note.createdAt, ISO_TIMESTAMP);
  assert.equal(note.createdAt, note.updatedAt);
  db.prepare(`UPDATE notes SET updatedAt = '2020-01-01T00:00:00.000Z'`).run();
  const edited = patchNote(db, note.id, 'Called the plumber');
  assert.equal(edited.body, 'Called the plumber');
  assert.notEqual(edited.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.deepEqual(getNote(db, note.id), edited);
  deleteNote(db, note.id);
  assert.throws(() => getNote(db, note.id), {
    status: 404,
    message: `No note with id ${note.id}`,
  });
  assert.throws(() => deleteNote(db, note.id), { status: 404 });
  assert.throws(() => patchNote(db, note.id, 'x'), { status: 404 });
  assert.throws(() => createNote(db, 'nope', 'x'), { status: 404 });
});
