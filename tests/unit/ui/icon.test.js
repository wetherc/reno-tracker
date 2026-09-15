import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { icon, ICON_PATHS } from '../../../src/ui/icon.js';

installDom();

test('icon builds a hidden svg with one path', () => {
  const svg = icon('check');
  assert.equal(svg.tagName, 'SVG');
  assert.equal(svg.getAttribute('class'), 'icon');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.children[0].getAttribute('d'), ICON_PATHS.check);
});

test('a labeled icon is announced as an image', () => {
  const svg = icon('alert', { label: 'Warning' });
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('aria-label'), 'Warning');
  assert.equal(svg.getAttribute('aria-hidden'), null);
});

test('an unknown icon name throws', () => {
  assert.throws(() => icon('nope'), /No icon named "nope"/);
});
