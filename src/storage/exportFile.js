// Moves one project between the browser and a file on disk. Saving builds
// a JSON file in memory and clicks a hidden download link. Loading opens
// the file picker and reads the chosen file as text. Both take the
// document and URL objects as arguments so a test can hand in fakes.
import { PROJECT_NAME_MAX } from '../entities/project.js';
import { formatDayMonth } from '../format/date.js';

/**
 * The file name a saved project gets: the project name as a slug plus
 * the day it was exported. "Kitchen remodel" on 2026-09-15 becomes
 * kitchen-remodel-2026-09-15.json. The caller passes the local day from
 * todayIso, because the UTC day of exportedAt is already tomorrow on a
 * US evening.
 * @param {string} name
 * @param {string} day YYYY-MM-DD
 */
export function exportFileName(name, day) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'project'}-${day}.json`;
}

/**
 * The name a loaded project gets. A name that no project has stays as it
 * is. A taken name gets the day of the load, plus a count when that name
 * is taken too, so the picker never lists two rows with the same text.
 * "Kitchen remodel" loaded on 2026-09-24 becomes "Kitchen remodel (loaded
 * Sep 24)", then "Kitchen remodel (loaded Sep 24, 2)". Names compare
 * without case. The name is cut short to keep the suffix inside the
 * length limit.
 * @param {string} name
 * @param {string[]} taken the names of every project
 * @param {string} day YYYY-MM-DD, the local day of the load
 */
export function loadedName(name, taken, day) {
  const seen = new Set(taken.map((t) => t.toLocaleLowerCase()));
  /** @param {string} n */
  const free = (n) => !seen.has(n.toLocaleLowerCase());
  if (free(name)) return name;
  const when = formatDayMonth(day);
  /** @param {number} count */
  const mark = (count) => {
    const suffix =
      count === 1 ? ` (loaded ${when})` : ` (loaded ${when}, ${count})`;
    return name.slice(0, PROJECT_NAME_MAX - suffix.length).trimEnd() + suffix;
  };
  let count = 1;
  while (!free(mark(count))) count += 1;
  return mark(count);
}

/**
 * @typedef {{
 *   doc?: Pick<Document, 'createElement' | 'body'>,
 *   urls?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
 * }} FileDeps
 */

/**
 * Hands the browser a JSON file to save under the given name.
 * @param {string} fileName
 * @param {unknown} data
 * @param {FileDeps} [deps]
 */
export function saveJson(fileName, data, { doc = document, urls = URL } = {}) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const href = urls.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = href;
  link.download = fileName;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  urls.revokeObjectURL(href);
}

/**
 * Opens the file picker for one JSON file. Resolves to the file, or to
 * null when the picker closes without a choice.
 * @param {FileDeps} [deps]
 * @returns {Promise<File | null>}
 */
export function pickJsonFile({ doc = document } = {}) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    /** @param {File | null} file */
    const done = (file) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    doc.body.append(input);
    input.click();
  });
}

/**
 * Parses the text of a picked file. The server checks the contents; this
 * only turns unreadable text into a message a person can act on.
 * @param {string} text
 * @param {string} fileName
 * @returns {import('../types.ts').ExportFile}
 */
export function parseExportFile(text, fileName) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${fileName} is not a JSON file this app can read.`);
  }
}
