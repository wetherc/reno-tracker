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
  PROJECT_PREFIX,
  projectOf,
  projectRows,
  removeRows,
} from '../../../src/local/store.js';

/** @typedef {import('../../../src/local/store.js').LocalDb} LocalDb */

/** @param {string} id @param {string} [name] */
const projectOfId = (id, name = id) => ({
  id,
  name,
  budgetCents: 0,
  markupBasisPoints: 0,
  startDate: '2026-01-05',
  createdAt: '2026-01-01T00:00:00.000Z',
});

/** @param {string} id @param {string} projectId */
const itemOf = (id, projectId) => ({
  id,
  projectId,
  title: id,
  description: '',
  startDate: '2026-01-05',
  endDate: '2026-01-09',
  responsibleParty: '',
  estimatedCents: 0,
  actualCents: null,
  markupBasisPoints: null,
  complete: false,
  sortOrder: 0,
});

/** Two projects, each with two items, a note, a change row, a link, and a material. */
function twoProjects() {
  const db = emptyDb();
  for (const p of ['a', 'b']) {
    db.projects.push(projectOfId(p));
    db.schedule.push(itemOf(`${p}1`, p), itemOf(`${p}2`, p));
    db.notes.push({
      id: `${p}n`,
      scheduleItemId: `${p}1`,
      body: 'x',
      createdAt: '',
      updatedAt: '',
    });
    db.variances.push({
      id: `${p}v`,
      scheduleItemId: `${p}1`,
      kind: 'scope',
      field: 'title',
      oldValue: '',
      newValue: '',
      reason: '',
      loggedAt: '',
    });
    db.dependencies.push({
      id: `${p}d`,
      projectId: p,
      predecessorId: `${p}1`,
      successorId: `${p}2`,
    });
    db.materials.push({
      id: `${p}m`,
      projectId: p,
      scheduleItemId: null,
      name: 'Tile',
      allowanceCents: 0,
      estimatedCents: 0,
      actualCents: null,
      markupBasisPoints: null,
      complete: false,
      expectedDate: null,
      sortOrder: 0,
    });
    db.invoices.push({
      id: `${p}i`,
      projectId: p,
      number: '',
      party: 'Pinch',
      issuedDate: '2026-01-05',
      dueDate: null,
      markupBasisPoints: 0,
      retainageCents: 0,
      lines: [],
      payments: [],
    });
  }
  return db;
}

/**
 * Memory storage that counts calls and can refuse writes.
 * @param {{ refuse?: (key: string) => boolean }} [options]
 */
function spyStorage({ refuse = () => false } = {}) {
  const inner = memoryStorage();
  const calls = { get: 0, set: /** @type {string[]} */ ([]) };
  return {
    calls,
    inner,
    storage: {
      getItem: (/** @type {string} */ k) => {
        calls.get += 1;
        return inner.getItem(k);
      },
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
        if (refuse(k)) throw new Error('full');
        calls.set.push(k);
        inner.setItem(k, v);
      },
      removeItem: (/** @type {string} */ k) => inner.removeItem(k),
      key: (/** @type {number} */ i) => inner.key(i),
      get length() {
        return inner.length;
      },
    },
  };
}

/** @param {LocalDb} db @param {string} id */
const addProject = (db, id) => {
  db.projects.push(projectOfId(id));
  return id;
};

/** @param {string} id */
const same = (id) => id;

test('projectOf finds the project that owns a row of each kind', () => {
  const db = twoProjects();
  assert.equal(projectOf(db, 'project', 'b'), 'b');
  assert.equal(projectOf(db, 'project', 'z'), null);
  assert.equal(projectOf(db, 'schedule', 'b2'), 'b');
  assert.equal(projectOf(db, 'notes', 'an'), 'a');
  assert.equal(projectOf(db, 'notes', 'zz'), null);
  assert.equal(projectOf(db, 'dependencies', 'bd'), 'b');
  assert.equal(projectOf(db, 'materials', 'am'), 'a');
  assert.equal(projectOf(db, 'materials', 'zz'), null);
});

test('projectRows and removeRows split one project from the rest', () => {
  const db = twoProjects();
  const rows = /** @type {LocalDb} */ (projectRows(db, 'a'));
  assert.deepEqual(
    Object.values(rows).map((list) => list.length),
    [1, 2, 1, 1, 1, 1, 1],
  );
  assert.ok(
    Object.values(rows)
      .flat()
      .every((r) => !r.id.startsWith('b')),
  );
  assert.equal(projectRows(db, 'z'), null);
  removeRows(db, 'a');
  assert.deepEqual(db, projectRows(twoProjects(), 'b'));
});

test('an empty storage reads as an empty database', () => {
  assert.deepEqual(createStore(memoryStorage()).read(), emptyDb());
});

test('each project lands under its own key and a read parses nothing', () => {
  const { storage, calls, inner } = spyStorage();
  const store = createStore(storage);
  store.create((db) => addProject(db, 'a'), same);
  store.create((db) => addProject(db, 'b'), same);
  assert.deepEqual(calls.set, [PROJECT_PREFIX + 'a', PROJECT_PREFIX + 'b']);
  assert.deepEqual(JSON.parse(String(inner.getItem(PROJECT_PREFIX + 'a'))), {
    ...emptyDb(),
    projects: [projectOfId('a')],
  });

  const gets = calls.get;
  store.read();
  store.read();
  assert.equal(calls.get, gets);

  store.change(
    (db) => projectOf(db, 'project', 'b'),
    (db) => {
      db.projects[1].name = 'Bath';
    },
  );
  assert.deepEqual(calls.set.slice(2), [PROJECT_PREFIX + 'b']);
  assert.equal(calls.get, gets + 1);
  assert.deepEqual(
    createStore(storage)
      .read()
      .projects.map((p) => p.name),
    ['a', 'Bath'],
  );

  store.change(
    () => 'a',
    (db) => removeRows(db, 'a'),
  );
  assert.equal(inner.getItem(PROJECT_PREFIX + 'a'), null);
  assert.deepEqual(
    createStore(storage)
      .read()
      .projects.map((p) => p.id),
    ['b'],
  );
});

test('a change to a row that does not exist runs without a write', () => {
  const { storage, calls } = spyStorage();
  const store = createStore(storage);
  assert.equal(
    store.change(
      () => null,
      () => 'ran',
    ),
    'ran',
  );
  assert.deepEqual(calls.set, []);
});

test('a failed change puts the project back as it was stored', () => {
  let full = false;
  const { storage } = spyStorage({ refuse: () => full });
  const store = createStore(storage);
  store.create((db) => addProject(db, 'a'), same);
  assert.throws(
    () =>
      store.change(
        () => 'a',
        (db) => {
          db.projects[0].name = 'Changed';
          throw new Error('check failed');
        },
      ),
    /check failed/,
  );
  assert.equal(store.read().projects[0].name, 'a');

  full = true;
  assert.throws(
    () =>
      store.change(
        () => 'a',
        (db) => {
          db.projects[0].name = 'Changed';
        },
      ),
    { name: 'ApiError', status: 507, message: /refused to store/ },
  );
  assert.equal(store.read().projects[0].name, 'a');
});

test('a failed create leaves nothing behind', () => {
  const { storage, inner } = spyStorage({ refuse: () => true });
  const store = createStore(storage);
  assert.throws(() => store.create((db) => addProject(db, 'a'), same), {
    status: 507,
  });
  assert.deepEqual(store.read(), emptyDb());
  assert.equal(inner.length, 0);
});

test('a change reloads first when another tab wrote the project', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const other = createStore(storage);
  store.create((db) => addProject(db, 'a'), same);
  other.change(
    () => 'a',
    (db) => {
      db.projects[0].name = 'Theirs';
    },
  );
  assert.equal(store.read().projects[0].name, 'a');
  const seen = store.change(
    (db) => projectOf(db, 'project', 'a'),
    (db) => db.projects[0].name,
  );
  assert.equal(seen, 'Theirs');
  assert.equal(store.read().projects[0].name, 'Theirs');
});

test('forget drops the memory copy for a store key only', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.read();
  storage.setItem(
    PROJECT_PREFIX + 'a',
    JSON.stringify({ projects: [projectOfId('a')] }),
  );
  store.forget('reno-tracker:theme');
  assert.equal(store.read().projects.length, 0);
  store.forget(PROJECT_PREFIX + 'a');
  assert.equal(store.read().projects.length, 1);
  storage.removeItem(PROJECT_PREFIX + 'a');
  store.forget(DB_KEY);
  assert.equal(store.read().projects.length, 0);
  storage.setItem(
    PROJECT_PREFIX + 'b',
    JSON.stringify({ projects: [projectOfId('b')] }),
  );
  store.forget(null);
  assert.equal(store.read().projects.length, 1);
});

test('a combined document moves to one key per project', () => {
  const storage = memoryStorage();
  const kept = { projects: [projectOfId('a', 'Mine')] };
  storage.setItem(PROJECT_PREFIX + 'a', JSON.stringify(kept));
  storage.setItem(DB_KEY, JSON.stringify(twoProjects()));
  const db = createStore(storage).read();
  assert.equal(storage.getItem(DB_KEY), null);
  assert.deepEqual(
    db.projects.map((p) => p.name),
    ['Mine', 'b'],
  );
  assert.equal(db.schedule.length, 2);
  assert.deepEqual(
    JSON.parse(String(storage.getItem(PROJECT_PREFIX + 'b'))),
    projectRows(twoProjects(), 'b'),
  );
  assert.equal(storage.getItem(PROJECT_PREFIX + 'a'), JSON.stringify(kept));
});

test('a partial combined document reads as far as it can', () => {
  const storage = memoryStorage();
  storage.setItem(DB_KEY, '{"projects":[{"id":"p1"}],"notes":"x"}');
  const db = createStore(storage).read();
  assert.deepEqual(db.projects, [{ id: 'p1', markupBasisPoints: 0 }]);
  assert.deepEqual(db.notes, []);
  assert.equal(storage.getItem(DAMAGED_KEY), null);
});

test('a project the browser refuses to move stays in the combined document', () => {
  const { storage, inner } = spyStorage({
    refuse: (key) => key === PROJECT_PREFIX + 'b',
  });
  inner.setItem(DB_KEY, JSON.stringify(twoProjects()));
  const store = createStore(storage);
  assert.deepEqual(
    store.read().projects.map((p) => p.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    JSON.parse(String(inner.getItem(DB_KEY))),
    projectRows(twoProjects(), 'b'),
  );
  assert.throws(
    () =>
      store.change(
        () => 'b',
        (db) => {
          db.projects[1].name = 'Changed';
        },
      ),
    { status: 507 },
  );
  assert.deepEqual(
    store.read().projects.map((p) => p.name),
    ['a', 'b'],
  );
});

test('a combined document that cannot shrink keeps its text', () => {
  const { storage, inner } = spyStorage({
    refuse: (key) => key === PROJECT_PREFIX + 'b' || key === DB_KEY,
  });
  const text = JSON.stringify(twoProjects());
  inner.setItem(DB_KEY, text);
  createStore(storage).read();
  assert.equal(inner.getItem(DB_KEY), text);
});

test('a damaged combined document is copied aside and removed', () => {
  for (const text of ['not json', '[1]', '42', 'null']) {
    const storage = memoryStorage();
    storage.setItem(DB_KEY, text);
    assert.deepEqual(createStore(storage).read(), emptyDb());
    assert.equal(storage.getItem(DAMAGED_KEY), text);
    assert.equal(storage.getItem(DB_KEY), null);
  }
});

test('a damaged project document is copied aside and removed', () => {
  for (const text of ['not json', '{"projects":[{"id":"other"}]}', '{}']) {
    const storage = memoryStorage();
    storage.setItem(PROJECT_PREFIX + 'a', text);
    assert.deepEqual(createStore(storage).read(), emptyDb());
    assert.equal(storage.getItem(`${DAMAGED_KEY}:a`), text);
    assert.equal(storage.getItem(PROJECT_PREFIX + 'a'), null);
  }
  const storage = memoryStorage();
  storage.setItem(`${DAMAGED_KEY}:a`, 'same');
  storage.setItem(PROJECT_PREFIX + 'a', 'same');
  createStore(storage).read();
  assert.equal(storage.getItem(PROJECT_PREFIX + 'a'), null);
});

test('a second damaged document does not replace the first copy', () => {
  const storage = memoryStorage();
  storage.setItem(DAMAGED_KEY, 'first');
  storage.setItem(DB_KEY, 'second');
  assert.throws(() => createStore(storage).read(), {
    name: 'ApiError',
    status: 500,
    message: /older damaged copy is already kept under reno-tracker:db-damaged/,
  });
  assert.equal(storage.getItem(DAMAGED_KEY), 'first');
  assert.equal(storage.getItem(DB_KEY), 'second');
});

test('a damaged document that cannot be copied stops the store', () => {
  const { storage, inner } = spyStorage({ refuse: () => true });
  inner.setItem(DB_KEY, 'damaged');
  assert.throws(() => createStore(storage).read(), {
    name: 'ApiError',
    status: 507,
    message: /refused to keep a copy/,
  });
  assert.equal(inner.getItem(DB_KEY), 'damaged');
});

test('a blocked storage reads empty and reports a failed write', () => {
  const blocked = () => {
    throw new Error('blocked');
  };
  const store = createStore({
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
    key: blocked,
    get length() {
      return blocked();
    },
  });
  assert.deepEqual(store.read(), emptyDb());
  assert.throws(() => store.create((db) => addProject(db, 'a'), same), {
    name: 'ApiError',
    status: 507,
    message: /refused to store/,
  });
});

test('ids and timestamps come from the platform', () => {
  assert.match(newId(), /^[0-9a-f-]{36}$/);
  assert.match(now(), /^\d{4}-\d{2}-\d{2}T/);
});

test('an invoice stored with no markup, retainage, or payments reads with none', () => {
  const storage = memoryStorage();
  const invoice = {
    id: 'i',
    projectId: 'a',
    number: '',
    party: 'Pinch',
    issuedDate: '2026-01-05',
    dueDate: null,
    lines: [],
  };
  storage.setItem(
    PROJECT_PREFIX + 'a',
    JSON.stringify({ projects: [projectOfId('a')], invoices: [invoice] }),
  );
  assert.deepEqual(createStore(storage).read().invoices, [
    { ...invoice, markupBasisPoints: 0, retainageCents: 0, payments: [] },
  ]);
});
