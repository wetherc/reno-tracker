import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountShell, readSection, SECTIONS } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('readSection falls back to schedule', () => {
  assert.equal(readSection('costs'), 'costs');
  assert.equal(readSection('bogus'), 'schedule');
  assert.equal(readSection(null), 'schedule');
});

test('mountShell builds the nav and panel and tracks the section', () => {
  const prefs = createPrefs(memoryStorage());
  prefs.write('lastSection', 'materials');
  const sidebar = document.createElement('nav');
  const main = document.createElement('main');
  const shell = mountShell({ sidebar, main, prefs });
  const nav = sidebar.children[0];
  assert.equal(nav.className, 'nav');
  assert.equal(nav.children.length, SECTIONS.length);
  const [schedule, materials] = nav.children;
  assert.equal(materials.textContent, 'Materials');
  assert.equal(materials.className, 'btn-bare row-select row-select--current');
  assert.equal(materials.getAttribute('aria-current'), 'page');
  assert.equal(schedule.getAttribute('aria-current'), null);
  assert.equal(shell.section, 'materials');

  const panel = main.children[0];
  assert.equal(panel.className, 'panel');
  const [header, body] = panel.children;
  assert.equal(header.children[0], shell.title);
  assert.equal(header.children[1], shell.tools);
  assert.equal(body, shell.body);

  /** @type {string[]} */
  const seen = [];
  const off = shell.onSection((s) => seen.push(s));
  $(schedule).click();
  assert.equal(shell.section, 'schedule');
  assert.equal(prefs.read('lastSection'), 'schedule');
  assert.equal(schedule.classList.contains('row-select--current'), true);
  assert.equal(materials.getAttribute('aria-current'), null);
  $(schedule).click();
  off();
  shell.setSection('costs');
  assert.deepEqual(seen, ['schedule']);

  shell.setTitle('Schedule');
  assert.equal(shell.title.textContent, 'Schedule');
  shell.setBody('one', document.createElement('p'));
  assert.equal(shell.body.childNodes.length, 2);
});
