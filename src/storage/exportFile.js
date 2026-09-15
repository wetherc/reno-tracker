// Moves one project between the browser and a file on disk. Saving builds
// a JSON file in memory and clicks a hidden download link. Loading opens
// the file picker and reads the chosen file as text. Both take the
// document and URL objects as arguments so a test can hand in fakes.

/**
 * The file name a saved project gets: the project name as a slug plus
 * the day it was exported. "Kitchen remodel" on 2026-09-15 becomes
 * kitchen-remodel-2026-09-15.json.
 * @param {string} name
 * @param {string} exportedAt an ISO timestamp
 */
export function exportFileName(name, exportedAt) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'project'}-${exportedAt.slice(0, 10)}.json`;
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
