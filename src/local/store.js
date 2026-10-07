// The browser-side database. Each project and its rows sit in one JSON
// document under its own localStorage key, PROJECT_PREFIX plus the
// project id. The store parses every document once and keeps the rows of
// all projects in memory as one LocalDb, so a read parses nothing. A
// write stores only the document of the project it changed.
//
// Another tab can change a document at any time. A `storage` event from
// that tab drops the memory copy, and the next call parses every
// document again. Before each write the store also compares the stored
// text of the project with the text it last read or wrote. When the two
// differ, it reloads first, so a write never replaces a change it has
// not seen.
//
// A document under DB_KEY keeps many projects in one key. On load the
// store moves each of its projects to a key of its own, and removes
// DB_KEY when no project is left in it. A save or delete of a project
// also removes it from DB_KEY, so a deleted project that the browser
// refused to move does not come back on the next load.
//
// A stored document that does not parse, or whose lists and rows are not
// objects of the expected kind, is copied to a second key and then
// removed. The copy lets a person recover the text by hand from the
// browser's developer tools.
import { ApiError } from '../api/errors.js';
import { PREFIX } from '../storage/prefs.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').Dependency} Dependency */
/** @typedef {import('../types.ts').Variance} Variance */
/** @typedef {import('../types.ts').Note} Note */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../types.ts').Invoice} Invoice */
/** @typedef {import('../types.ts').ChangeOrder} ChangeOrder */
/** @typedef {import('../types.ts').LineItem} LineItem */
/** @typedef {import('../storage/prefs.js').StorageLike} StorageLike */

/**
 * @typedef {{
 *   projects: Project[],
 *   schedule: ScheduleItem[],
 *   dependencies: Dependency[],
 *   variances: Variance[],
 *   notes: Note[],
 *   materials: MaterialItem[],
 *   invoices: Invoice[],
 *   changeOrders: ChangeOrder[],
 * }} LocalDb
 */

/** @typedef {'project' | 'schedule' | 'notes' | 'dependencies' | 'materials' | 'invoices' | 'changeOrders'} RowKind */

/**
 * @typedef {{
 *   read(): LocalDb,
 *   change<T>(owner: (db: LocalDb) => string | null, fn: (db: LocalDb) => T): T,
 *   create<T>(fn: (db: LocalDb) => T, idOf: (result: T) => string): T,
 *   forget(key: string | null): void,
 * }} Store
 */

export const DB_KEY = PREFIX + 'db';
export const DAMAGED_KEY = PREFIX + 'db-damaged';
export const PROJECT_PREFIX = PREFIX + 'project:';

/** @returns {LocalDb} */
export function emptyDb() {
  return {
    projects: [],
    schedule: [],
    dependencies: [],
    variances: [],
    notes: [],
    materials: [],
    invoices: [],
    changeOrders: [],
  };
}

/**
 * The id of the project that owns a row, or null when no row has the id.
 * @param {LocalDb} db
 * @param {RowKind} kind
 * @param {string} id
 * @returns {string | null}
 */
export function projectOf(db, kind, id) {
  if (kind === 'project') {
    return db.projects.some((p) => p.id === id) ? id : null;
  }
  if (kind === 'notes') {
    const note = db.notes.find((n) => n.id === id);
    return note ? projectOf(db, 'schedule', note.scheduleItemId) : null;
  }
  return db[kind].find((r) => r.id === id)?.projectId ?? null;
}

/**
 * The rows of one project as a LocalDb of their own, or null when the
 * project is not in the database.
 * @param {LocalDb} db
 * @param {string} id
 * @returns {LocalDb | null}
 */
export function projectRows(db, id) {
  const project = db.projects.find((p) => p.id === id);
  if (!project) return null;
  const schedule = db.schedule.filter((s) => s.projectId === id);
  const items = new Set(schedule.map((s) => s.id));
  return {
    projects: [project],
    schedule,
    dependencies: db.dependencies.filter((d) => d.projectId === id),
    variances: db.variances.filter((v) => items.has(v.scheduleItemId)),
    notes: db.notes.filter((n) => items.has(n.scheduleItemId)),
    materials: db.materials.filter((m) => m.projectId === id),
    invoices: db.invoices.filter((i) => i.projectId === id),
    changeOrders: db.changeOrders.filter((c) => c.projectId === id),
  };
}

/**
 * Drops a project and every row that belongs to it.
 * @param {LocalDb} db
 * @param {string} id
 */
export function removeRows(db, id) {
  const items = new Set(
    db.schedule.filter((s) => s.projectId === id).map((s) => s.id),
  );
  db.projects = db.projects.filter((p) => p.id !== id);
  db.schedule = db.schedule.filter((s) => s.projectId !== id);
  db.dependencies = db.dependencies.filter((d) => d.projectId !== id);
  db.materials = db.materials.filter((m) => m.projectId !== id);
  db.invoices = db.invoices.filter((i) => i.projectId !== id);
  db.changeOrders = db.changeOrders.filter((c) => c.projectId !== id);
  db.variances = db.variances.filter((v) => !items.has(v.scheduleItemId));
  db.notes = db.notes.filter((n) => !items.has(n.scheduleItemId));
}

/**
 * @param {LocalDb} db
 * @param {LocalDb} rows
 */
function addRows(db, rows) {
  for (const key of /** @type {(keyof LocalDb)[]} */ (Object.keys(db))) {
    db[key].push(.../** @type {never[]} */ (rows[key]));
  }
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null} null when the text is not a JSON object
 */
function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value */
const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} list */
const isRowList = (list) => Array.isArray(list) && list.every(isObject);

/**
 * Whether each list of a stored document is a list of objects, each
 * project has a string id, each invoice and change order has a list of
 * line objects, and each invoice's payments, when present, are a list
 * of objects. normalize reads these fields, and a document without
 * them would make it throw a TypeError on every call.
 * @param {Record<string, unknown>} input
 * @returns {boolean}
 */
function wellFormed(input) {
  /** @param {string} key */
  const rows = (key) =>
    /** @type {Record<string, unknown>[]} */ (
      Array.isArray(input[key]) ? input[key] : []
    );
  if (!Object.keys(emptyDb()).every((key) => rows(key).every(isObject))) {
    return false;
  }
  return (
    rows('projects').every((p) => typeof p.id === 'string') &&
    rows('invoices').every(
      (i) =>
        isRowList(i.lines) &&
        (i.payments === undefined || isRowList(i.payments)),
    ) &&
    rows('changeOrders').every((c) => isRowList(c.lines))
  );
}

/**
 * @param {LineItem} line
 * @returns {LineItem}
 */
const withLineRate = (line) => ({
  ...line,
  markupBasisPoints: line.markupBasisPoints ?? null,
});

/**
 * Fills in any list the stored document lacks, the markup rate of a
 * project, schedule item, or material stored without one, and the markup
 * rate, retainage, and payments of an invoice stored without them. A row
 * with no rate takes the project rate. A change order stored with no
 * rate gets the rate of its project. A line stored with no rate takes
 * the rate of its document.
 * @param {Record<string, unknown>} input
 * @returns {LocalDb | null} null when the document is not well formed
 */
function normalize(input) {
  if (!wellFormed(input)) return null;
  const db = emptyDb();
  for (const key of /** @type {(keyof LocalDb)[]} */ (Object.keys(db))) {
    if (Array.isArray(input[key])) {
      db[key] = /** @type {never} */ (input[key]);
    }
  }
  db.projects = db.projects.map((p) => ({
    ...p,
    markupBasisPoints: p.markupBasisPoints ?? 0,
  }));
  db.schedule = db.schedule.map((s) => ({
    ...s,
    markupBasisPoints: s.markupBasisPoints ?? null,
  }));
  db.materials = db.materials.map((m) => ({
    ...m,
    markupBasisPoints: m.markupBasisPoints ?? null,
  }));
  db.invoices = db.invoices.map((i) => ({
    ...i,
    markupBasisPoints: i.markupBasisPoints ?? 0,
    retainageCents: i.retainageCents ?? 0,
    lines: i.lines.map(withLineRate),
    payments: i.payments ?? [],
  }));
  const rates = new Map(db.projects.map((p) => [p.id, p.markupBasisPoints]));
  db.changeOrders = db.changeOrders.map((c) => ({
    ...c,
    markupBasisPoints: c.markupBasisPoints ?? rates.get(c.projectId) ?? 0,
    lines: c.lines.map(withLineRate),
  }));
  return db;
}

/**
 * The document of one project, or null when the text does not parse or
 * names a different project.
 * @param {string} text
 * @param {string} id
 * @returns {LocalDb | null}
 */
function parseProject(text, id) {
  const parsed = parseObject(text);
  if (!parsed) return null;
  const doc = normalize(parsed);
  if (!doc) return null;
  return doc.projects.length === 1 && doc.projects[0]?.id === id ? doc : null;
}

/**
 * Copies damaged text to a second key. A different damaged copy that is
 * already there is not replaced, and the store refuses to go on, so
 * neither copy is lost.
 * @param {StorageLike} storage
 * @param {string} text
 * @param {string} target
 */
function keepDamaged(storage, text, target) {
  /** @type {string | null} */
  let kept;
  try {
    kept = storage.getItem(target);
  } catch {
    throw new ApiError(507, {
      error:
        'The saved projects in this browser are damaged, and the browser refused to read the kept copy. Nothing was changed.',
    });
  }
  if (kept === text) return;
  if (kept !== null) {
    throw new ApiError(500, {
      error: `The saved projects in this browser are damaged, and an older damaged copy is already kept under ${target}. Nothing was changed.`,
    });
  }
  try {
    storage.setItem(target, text);
  } catch {
    throw new ApiError(507, {
      error:
        'The saved projects in this browser are damaged, and the browser refused to keep a copy. Nothing was changed.',
    });
  }
}

const refused = () =>
  new ApiError(507, {
    error:
      'The browser refused to store the change. Storage may be full or blocked.',
  });

/**
 * @param {StorageLike} storage
 * @returns {Store}
 */
export function createStore(storage) {
  /** @type {LocalDb | null} */
  let cache = null;
  /** @type {Map<string, string>} the stored text of each project, as last read or written */
  const texts = new Map();
  /** Whether the last load left projects in DB_KEY. */
  let combinedLeft = false;

  /** @param {string} key */
  function get(key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  /** @returns {string[]} */
  function projectKeys() {
    /** @type {string[]} */
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(PROJECT_PREFIX)) keys.push(key);
      }
    } catch {
      // A blocked storage lists nothing.
    }
    return keys;
  }

  /** @param {string} key */
  function remove(key) {
    try {
      storage.removeItem(key);
    } catch {
      // The key keeps its text, and the next load reads it again.
    }
  }

  /**
   * Removes one project from the DB_KEY document. A project that the
   * browser refused to move keeps its rows there, and without this step
   * a deleted project would come back on the next load.
   * @param {string} id
   */
  function dropFromCombined(id) {
    if (!combinedLeft) return;
    const text = storage.getItem(DB_KEY);
    if (!text) return;
    const parsed = parseObject(text);
    const combined = parsed && normalize(parsed);
    if (!combined?.projects.some((p) => p.id === id)) return;
    removeRows(combined, id);
    if (combined.projects.length === 0) storage.removeItem(DB_KEY);
    else storage.setItem(DB_KEY, JSON.stringify(combined));
  }

  /**
   * Stores one project from the memory copy, or removes its key when
   * the project is gone. Either way the project leaves the DB_KEY
   * document.
   * @param {string} id
   */
  function save(id) {
    const rows = projectRows(/** @type {LocalDb} */ (cache), id);
    try {
      if (rows) {
        const text = JSON.stringify(rows);
        storage.setItem(PROJECT_PREFIX + id, text);
        texts.set(id, text);
      } else {
        storage.removeItem(PROJECT_PREFIX + id);
        texts.delete(id);
      }
      dropFromCombined(id);
    } catch {
      throw refused();
    }
  }

  /**
   * Puts one project in the memory copy back to its stored text. A
   * project with no key of its own drops the whole copy instead.
   * @param {string} id
   */
  function restore(id) {
    const text = texts.get(id);
    if (text === undefined) {
      cache = null;
      return;
    }
    const db = /** @type {LocalDb} */ (cache);
    removeRows(db, id);
    addRows(db, /** @type {LocalDb} */ (parseProject(text, id)));
  }

  /**
   * Moves each project of the DB_KEY document that has no key of its own
   * into one. A project the browser refuses to store stays in DB_KEY,
   * and the memory copy still lists it.
   * @param {LocalDb} db
   */
  function moveCombined(db) {
    const text = get(DB_KEY);
    if (!text) return;
    const parsed = parseObject(text);
    const combined = parsed && normalize(parsed);
    if (!combined) {
      keepDamaged(storage, text, DAMAGED_KEY);
      remove(DB_KEY);
      return;
    }
    const left = emptyDb();
    for (const project of combined.projects) {
      if (texts.has(project.id)) continue;
      const rows = /** @type {LocalDb} */ (projectRows(combined, project.id));
      addRows(db, rows);
      try {
        const doc = JSON.stringify(rows);
        storage.setItem(PROJECT_PREFIX + project.id, doc);
        texts.set(project.id, doc);
      } catch {
        addRows(left, rows);
      }
    }
    combinedLeft = left.projects.length > 0;
    try {
      if (combinedLeft) storage.setItem(DB_KEY, JSON.stringify(left));
      else storage.removeItem(DB_KEY);
    } catch {
      combinedLeft = true;
      // DB_KEY keeps its text, and the next load moves it again.
    }
  }

  /** @returns {LocalDb} */
  function load() {
    if (cache) return cache;
    const db = emptyDb();
    texts.clear();
    combinedLeft = false;
    for (const key of projectKeys()) {
      const text = get(key);
      if (text === null) continue;
      const id = key.slice(PROJECT_PREFIX.length);
      const rows = parseProject(text, id);
      if (rows) {
        addRows(db, rows);
        texts.set(id, text);
      } else {
        keepDamaged(storage, text, `${DAMAGED_KEY}:${id}`);
        remove(key);
      }
    }
    moveCombined(db);
    cache = db;
    return db;
  }

  return {
    read: load,

    change(owner, fn) {
      let db = load();
      let id = owner(db);
      if (
        id !== null &&
        (get(PROJECT_PREFIX + id) ?? undefined) !== texts.get(id)
      ) {
        cache = null;
        db = load();
        id = owner(db);
      }
      // With no owner the call names a row that does not exist, and fn
      // throws its not-found error.
      if (id === null) return fn(db);
      try {
        const result = fn(db);
        save(id);
        return result;
      } catch (error) {
        restore(id);
        throw error;
      }
    },

    create(fn, idOf) {
      const db = load();
      try {
        const result = fn(db);
        save(idOf(result));
        return result;
      } catch (error) {
        cache = null;
        throw error;
      }
    },

    forget(key) {
      if (key === null || key === DB_KEY || key.startsWith(PROJECT_PREFIX)) {
        cache = null;
      }
    },
  };
}

/** @returns {string} */
export function newId() {
  return crypto.randomUUID();
}

/** @returns {string} */
export function now() {
  return new Date().toISOString();
}
