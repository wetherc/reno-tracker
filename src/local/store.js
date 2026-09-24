// The browser-side database. Every row of every project sits in one JSON
// document under one localStorage key. The document is read before each
// operation and written after each change, so two tabs see each other's
// writes on their next action.
//
// A stored document that does not parse as a JSON object is copied to a
// second key before the store reads it as empty, because the next write
// replaces the stored text. The copy lets a person recover the text by
// hand from the browser's developer tools.
import { ApiError } from '../api/errors.js';
import { PREFIX } from '../storage/prefs.js';

/** @typedef {import('../types.ts').Project} Project */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../types.ts').Dependency} Dependency */
/** @typedef {import('../types.ts').Variance} Variance */
/** @typedef {import('../types.ts').Note} Note */
/** @typedef {import('../types.ts').MaterialItem} MaterialItem */
/** @typedef {import('../storage/prefs.js').StorageLike} StorageLike */

/**
 * @typedef {{
 *   projects: Project[],
 *   schedule: ScheduleItem[],
 *   dependencies: Dependency[],
 *   variances: Variance[],
 *   notes: Note[],
 *   materials: MaterialItem[],
 * }} LocalDb
 */

/** @typedef {{ read(): LocalDb, write(db: LocalDb): void }} Store */

export const DB_KEY = PREFIX + 'db';
export const DAMAGED_KEY = PREFIX + 'db-damaged';

/** @returns {LocalDb} */
export function emptyDb() {
  return {
    projects: [],
    schedule: [],
    dependencies: [],
    variances: [],
    notes: [],
    materials: [],
  };
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

/**
 * Copies damaged text to DAMAGED_KEY. A different damaged copy that is
 * already there is not replaced, and the store refuses to go on, so
 * neither copy is lost.
 * @param {StorageLike} storage
 * @param {string} text
 */
function keepDamaged(storage, text) {
  const kept = storage.getItem(DAMAGED_KEY);
  if (kept === text) return;
  if (kept !== null) {
    throw new ApiError(500, {
      error: `The saved projects in this browser are damaged, and an older damaged copy is already kept under ${DAMAGED_KEY}. Nothing was changed.`,
    });
  }
  try {
    storage.setItem(DAMAGED_KEY, text);
  } catch {
    throw new ApiError(507, {
      error:
        'The saved projects in this browser are damaged, and the browser refused to keep a copy. Nothing was changed.',
    });
  }
}

/**
 * Fills in any list the stored document lacks.
 * @param {Record<string, unknown>} input
 * @returns {LocalDb}
 */
function normalize(input) {
  const db = emptyDb();
  for (const key of /** @type {(keyof LocalDb)[]} */ (Object.keys(db))) {
    if (Array.isArray(input[key])) {
      db[key] = /** @type {never} */ (input[key]);
    }
  }
  return db;
}

/**
 * @param {StorageLike} storage
 * @returns {Store}
 */
export function createStore(storage) {
  return {
    read() {
      /** @type {string | null} */
      let text;
      try {
        text = storage.getItem(DB_KEY);
      } catch {
        return emptyDb();
      }
      if (!text) return emptyDb();
      const parsed = parseObject(text);
      if (parsed) return normalize(parsed);
      keepDamaged(storage, text);
      return emptyDb();
    },
    write(db) {
      try {
        storage.setItem(DB_KEY, JSON.stringify(db));
      } catch {
        throw new ApiError(507, {
          error:
            'The browser refused to store the change. Storage may be full or blocked.',
        });
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
