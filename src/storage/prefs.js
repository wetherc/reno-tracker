// Per-browser preferences in localStorage under one key prefix. Values
// are plain strings. A blocked or missing storage falls back to memory so
// the app still runs, and the choice lasts for the page only.

export const PREFIX = 'reno-tracker:';

/**
 * @typedef {'theme' | 'lastProject' | 'lastView' | 'lastSection'
 *   | 'scheduleSort' | 'materialsSort' | 'invoicesSort' | 'changeOrdersSort'
 *   | 'scheduleStatus'} PrefKey
 */

/** @typedef {import('../ui/DataTable.js').SortState} SortState */

/**
 * @typedef {{
 *   read(key: PrefKey): string | null,
 *   write(key: PrefKey, value: string): void,
 *   clear(key: PrefKey): void,
 * }} Prefs
 */

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>} StorageLike
 */

/** @returns {StorageLike} */
export function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/**
 * @param {StorageLike} storage
 * @returns {Prefs}
 */
export function createPrefs(storage) {
  return {
    read(key) {
      try {
        return storage.getItem(PREFIX + key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        storage.setItem(PREFIX + key, value);
      } catch {
        // Quota or privacy mode. The value is lost on reload only.
      }
    },
    clear(key) {
      try {
        storage.removeItem(PREFIX + key);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/**
 * A table sort is kept as "key:dir", such as "start:desc".
 * @param {SortState} sort
 * @returns {string}
 */
export function sortText({ key, dir }) {
  return `${key}:${dir}`;
}

/**
 * @param {string | null} value text from sortText
 * @returns {SortState | null} null when the text is missing or unreadable
 */
export function readSort(value) {
  const match = /^([\w-]+):(asc|desc)$/.exec(value ?? '');
  if (!match) return null;
  return { key: match[1], dir: match[2] === 'asc' ? 'asc' : 'desc' };
}

/** @returns {StorageLike} localStorage when usable, else memory */
export function browserStorage() {
  try {
    const store = globalThis.localStorage;
    if (store) {
      store.getItem(PREFIX + 'probe');
      return store;
    }
  } catch {
    // Fall through to memory.
  }
  return memoryStorage();
}
