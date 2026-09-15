#!/usr/bin/env node
// Fails when a stylesheet reads a custom property with a fallback value.
// A fallback such as `var(--border, #ccc)` hides a misspelled token name.
// Without one, the missing token renders as nothing and the typo shows.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK = /var\(--[a-z0-9-]+\s*,/g;

/**
 * @param {string} dir
 * @returns {string[]} absolute paths of every .css file under dir
 */
export function listStylesheets(dir) {
  /** @type {string[]} */
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listStylesheets(path));
    else if (entry.name.endsWith('.css')) found.push(path);
  }
  return found.sort();
}

/**
 * @typedef {{ file: string, line: number, text: string }} Fallback
 */

/**
 * @param {string} dir
 * @param {string} [root] path that reported file names are relative to
 * @returns {Fallback[]}
 */
export function findFallbacks(dir, root = dir) {
  /** @type {Fallback[]} */
  const hits = [];
  for (const file of listStylesheets(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, index) => {
      if (FALLBACK.test(text)) {
        hits.push({ file: relative(root, file), line: index + 1, text });
      }
      FALLBACK.lastIndex = 0;
    });
  }
  return hits;
}

/**
 * @param {Fallback[]} hits
 * @returns {string}
 */
export function report(hits) {
  if (hits.length === 0) return 'css tokens: no fallbacks found';
  const lines = hits.map((h) => `${h.file}:${h.line}: ${h.text.trim()}`);
  lines.push(
    `css tokens: ${hits.length} fallback${hits.length === 1 ? '' : 's'}. Remove the fallback so a missing token shows as a missing token.`,
  );
  return lines.join('\n');
}

/* node:coverage disable */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'styles';
  const hits = findFallbacks(dir, process.cwd());
  console.log(report(hits));
  process.exit(hits.length === 0 ? 0 : 1);
}
/* node:coverage enable */
