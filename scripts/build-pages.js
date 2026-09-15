#!/usr/bin/env node
// Builds the static site for GitHub Pages. The output folder gets the
// page, the stylesheets, the client modules, and the icon, with the
// backend meta tag switched to "local" so the page keeps its data in the
// browser. Server code, tests, and tooling are left out. A .nojekyll file
// stops Pages from treating the folder as a Jekyll site.
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_META = '<meta name="reno-backend" content="server" />';
const LOCAL_META = '<meta name="reno-backend" content="local" />';

// Root files and folders that the page loads. Everything under src/ is
// copied except src/server.
const ROOT_FILES = ['style.css', 'favicon.svg'];
const FOLDERS = ['styles', 'src'];

/**
 * Rewrites index.html for static hosting.
 * @param {string} html
 * @returns {string}
 */
export function localizeIndex(html) {
  if (!html.includes(SERVER_META)) {
    throw new Error(`index.html has no ${SERVER_META} tag to switch`);
  }
  return html.replace(SERVER_META, LOCAL_META);
}

/**
 * @param {string} root the folder that holds index.html
 * @param {string} src an absolute path under root
 * @returns {boolean} whether the file belongs in the static site
 */
export function includeFile(root, src) {
  const parts = relative(root, src).split(sep);
  return !(parts[0] === 'src' && parts[1] === 'server');
}

/**
 * Empties `out` and writes the site into it.
 * @param {string} root the folder that holds index.html
 * @param {string} out the folder to write
 */
export function buildPages(root, out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'index.html'),
    localizeIndex(readFileSync(join(root, 'index.html'), 'utf8')),
  );
  for (const file of ROOT_FILES) cpSync(join(root, file), join(out, file));
  for (const folder of FOLDERS) {
    cpSync(join(root, folder), join(out, folder), {
      recursive: true,
      filter: (src) => includeFile(root, src),
    });
  }
  writeFileSync(join(out, '.nojekyll'), '');
}

/** @returns {string} the repository root */
export function repoRoot() {
  return join(import.meta.dirname, '..');
}

/* node:coverage disable */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? join(repoRoot(), 'dist');
  buildPages(repoRoot(), out);
  console.log(`pages: built ${relative(process.cwd(), out) || '.'}`);
}
/* node:coverage enable */
