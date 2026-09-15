// Serves the client files under the project root. Only the paths the
// browser needs are visible; server code, the database, tests, and
// tooling stay hidden even though they sit in the same tree.
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

export const MIME = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});

// Files in the root that the browser may load. Every other root file,
// such as package.json, stays hidden. Directories under the root are
// visible unless listed in HIDDEN.
const ROOT_FILES = new Set(['index.html', 'style.css', 'favicon.svg']);
const HIDDEN = new Set([
  'data',
  'node_modules',
  'tests',
  'scripts',
  'coverage',
  'test-results',
  'playwright-report',
]);

/**
 * Maps a URL path to a file path under root, or returns null when the
 * request must not be served. `/` maps to index.html.
 * @param {string} root absolute directory
 * @param {string} urlPath
 * @returns {string | null}
 */
export function resolveFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = normalize(decoded === '/' ? '/index.html' : decoded).replace(
    /^[/\\]+/,
    '',
  );
  const segments = relative.split(/[/\\]/);
  if (segments.some((s) => s.startsWith('.'))) return null;
  if (HIDDEN.has(segments[0])) return null;
  if (segments.length === 1 && !ROOT_FILES.has(segments[0])) return null;
  if (segments[0] === 'src' && segments[1] === 'server') return null;
  if (!(extname(relative) in MIME)) return null;
  const file = resolve(root, relative);
  if (!file.startsWith(resolve(root) + sep)) return null;
  return file;
}

/**
 * @param {string} root
 * @returns {(req: IncomingMessage, res: ServerResponse) => void}
 */
export function serveStatic(root) {
  return (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const file = resolveFile(root, path);
    /** @type {import('node:fs').Stats | null} */
    let stats = null;
    if (file) {
      try {
        stats = statSync(file);
      } catch {
        stats = null;
      }
    }
    if (!file || !stats || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${path}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)],
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}

/** @returns {string} the repository root that holds index.html */
export function projectRoot() {
  return join(import.meta.dirname, '..', '..');
}
