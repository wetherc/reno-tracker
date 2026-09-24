// Serves the client files under the project root. Only the paths the
// browser needs are visible; server code, the database, tests, and
// tooling stay hidden even though they sit in the same tree.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { requestTarget } from './router.js';

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

// The files in the root and the directories under it that the browser
// may load. Every other path, such as package.json or tests/, stays
// hidden. The checks compare lower-cased names, because APFS on macOS
// finds src/server/index.js under /SRC/Server/index.js.
const ROOT_FILES = new Set(['index.html', 'style.css', 'favicon.svg']);
const ROOT_DIRS = new Set(['styles', 'src']);

/**
 * @param {string[]} segments path parts under the root
 * @returns {boolean} true when the browser may load the path
 */
function isVisible(segments) {
  const names = segments.map((s) => s.toLowerCase());
  if (names.some((s) => s.startsWith('.'))) return false;
  if (names.length === 1) return ROOT_FILES.has(names[0]);
  if (!ROOT_DIRS.has(names[0])) return false;
  return !(names[0] === 'src' && names[1] === 'server');
}

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
  const path = normalize(decoded === '/' ? '/index.html' : decoded).replace(
    /^[/\\]+/,
    '',
  );
  if (!isVisible(path.split(/[/\\]/))) return null;
  if (!(extname(path) in MIME)) return null;
  const file = resolve(root, path);
  // A drive letter in the first segment can leave the root on Windows.
  /* node:coverage ignore next */
  if (!file.startsWith(resolve(root) + sep)) return null;
  return file;
}

/**
 * Follows symlinks and case folding to the file on disk, and checks that
 * path again. A symlink under src/ can point outside the root, and APFS
 * finds src/server under names such as src/ſerver that no lower-case
 * compare matches. `realpathSync.native` returns the name as stored.
 * @param {string} root
 * @param {string} file a path that resolveFile accepted
 * @returns {string | null} the real path, or null when it is hidden
 */
export function realFile(root, file) {
  let real;
  try {
    real = realpathSync.native(file);
  } catch {
    return null;
  }
  const path = relative(realpathSync.native(root), real);
  if (path.startsWith('..') || !isVisible(path.split(sep))) return null;
  return real;
}

/**
 * A weak validator from the size and the modification time. An edit
 * changes at least one of them, so the browser downloads the new file.
 * @param {import('node:fs').Stats} stats
 * @returns {string}
 */
export function entityTag(stats) {
  return `W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
}

/**
 * True when the browser's copy matches the file, so a 304 can replace
 * the body. If-None-Match wins over If-Modified-Since when both are
 * sent, as RFC 9110 requires.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {string} tag from entityTag
 * @param {Date} modified
 * @returns {boolean}
 */
export function isFresh(headers, tag, modified) {
  const match = headers['if-none-match'];
  if (match !== undefined) {
    const weak = (/** @type {string} */ t) => t.trim().replace(/^W\//, '');
    return match
      .split(',')
      .some((t) => t.trim() === '*' || weak(t) === weak(tag));
  }
  const since = Date.parse(headers['if-modified-since'] ?? '');
  // Last-Modified keeps whole seconds only.
  return (
    Number.isFinite(since) &&
    Math.floor(modified.getTime() / 1000) * 1000 <= since
  );
}

/**
 * @param {string} root
 * @returns {(req: IncomingMessage, res: ServerResponse) => void}
 */
export function serveStatic(root) {
  return (req, res) => {
    const { path } = requestTarget(req);
    const found = resolveFile(root, path);
    const file = found && realFile(root, found);
    const stats = file && statSync(file, { throwIfNoEntry: false });
    if (!file || !stats || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${path}`);
      return;
    }
    // no-cache makes the browser ask on every load, and the validators
    // let the answer be a 304 with no body when the file is unchanged.
    const tag = entityTag(stats);
    const validators = {
      'Cache-Control': 'no-cache',
      ETag: tag,
      'Last-Modified': stats.mtime.toUTCString(),
    };
    if (isFresh(req.headers, tag, stats.mtime)) {
      res.writeHead(304, validators).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)],
      'Content-Length': stats.size,
      ...validators,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    // The headers are out, so a read error such as EACCES can only cut
    // the response short.
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  };
}

/** @returns {string} the repository root that holds index.html */
export function projectRoot() {
  return join(import.meta.dirname, '..', '..');
}
