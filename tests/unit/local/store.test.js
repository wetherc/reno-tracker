import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../../../src/storage/prefs.js';
import {
  createStore,
  DAMAGED_KEY,
  DB_KEY,
  emptyDb,
  newId,
  now,
} from '../../../src/local/store.js';

test('an empty storage reads as an empty database', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.read(), emptyDb());
});

test('write then read round-trips the document under the prefixed key', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const db = emptyDb();
  db.projects.push({
    id: 'p1',
    name: 'Kitchen',
    budgetCents: 0,
    startDate: '2026-01-05',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  store.write(db);
  assert.equal(DB_KEY, 'reno-tracker:db');
  assert.ok(storage.getItem(DB_KEY)?.includes('Kitchen'));
  assert.deepEqual(store.read(), db);
});

test('a partial document reads as far as it can', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  storage.setItem(DB_KEY, '{"projects":[{"id":"p1"}],"notes":"x"}');
  const db = store.read();
  assert.deepEqual(db.projects, [{ id: 'p1' }]);
  assert.deepEqual(db.notes, []);
  assert.equal(storage.getItem(DAMAGED_KEY), null);
});

test('a damaged document is copied aside before it reads as empty', () => {
  for (const text of ['not json', '[1]', '42', 'null']) {
    const storage = memoryStorage();
    const store = createStore(storage);
    storage.setItem(DB_KEY, text);
    assert.deepEqual(store.read(), emptyDb());
    assert.deepEqual(store.read(), emptyDb());
    assert.equal(storage.getItem(DAMAGED_KEY), text);
    store.write(emptyDb());
    assert.equal(storage.getItem(DAMAGED_KEY), text);
  }
});

test('a second damaged document does not replace the first copy', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  storage.setItem(DAMAGED_KEY, 'first');
  storage.setItem(DB_KEY, 'second');
  assert.throws(() => store.read(), {
    name: 'ApiError',
    status: 500,
    message: /older damaged copy is already kept under reno-tracker:db-damaged/,
  });
  assert.equal(storage.getItem(DAMAGED_KEY), 'first');
  assert.equal(storage.getItem(DB_KEY), 'second');
});

test('a damaged document that cannot be copied stops the store', () => {
  const storage = memoryStorage();
  storage.setItem(DB_KEY, 'damaged');
  const store = createStore({
    getItem: (key) => storage.getItem(key),
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {},
  });
  assert.throws(() => store.read(), {
    name: 'ApiError',
    status: 507,
    message: /refused to keep a copy/,
  });
});

test('a blocked storage reads empty and reports a failed write', () => {
  const store = createStore({
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {},
  });
  assert.deepEqual(store.read(), emptyDb());
  assert.throws(() => store.write(emptyDb()), {
    name: 'ApiError',
    status: 507,
    message: /refused to store/,
  });
});

test('ids and timestamps come from the platform', () => {
  assert.match(newId(), /^[0-9a-f-]{36}$/);
  assert.match(now(), /^\d{4}-\d{2}-\d{2}T/);
});
