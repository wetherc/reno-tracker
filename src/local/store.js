// The browser-side database. Every row of every project sits in one JSON
// document under one localStorage key. The document is read before each
// operation and written after each change, so two tabs see each other's
// writes on their next action.
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
 * Fills in any list the stored document lacks, so a document from an
 * older build still reads.
 * @param {unknown} parsed
 * @returns {LocalDb}
 */
function normalize(parsed) {
  const db = emptyDb();
  if (typeof parsed !== 'object' || parsed === null) return db;
  const input = /** @type {Record<string, unknown>} */ (parsed);
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
      try {
        const text = storage.getItem(DB_KEY);
        return text ? normalize(JSON.parse(text)) : emptyDb();
      } catch {
        return emptyDb();
      }
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
