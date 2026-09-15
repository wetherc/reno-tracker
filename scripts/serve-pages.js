#!/usr/bin/env node
// Builds the static site and serves it the way GitHub Pages does: files
// only, no /api. Used by the Playwright pages spec and for a local check
// of the deployed page. PAGES_PORT picks the port, default 3118.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { serveStatic } from '../src/server/static.js';
import { buildPages, repoRoot } from './build-pages.js';

const HOST = '127.0.0.1';
const port = Number(process.env.PAGES_PORT ?? 3118);
const out = join(repoRoot(), 'dist');

buildPages(repoRoot(), out);
const server = createServer(serveStatic(out));
server.listen(port, HOST, () => {
  console.log(`pages: serving ${out} on http://${HOST}:${port}`);
});

/** @param {string} signal */
function shutdown(signal) {
  console.log(`${signal}: closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
