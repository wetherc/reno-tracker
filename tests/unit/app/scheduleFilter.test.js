import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import { mountShell } from '../../../src/app/shell.js';
import { addDays, todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

const today = todayIso();
const items = [
  itemOf('a', {
    title: 'Demo',
    responsibleParty: 'Crew',
    startDate: addDays(today, 8),
    endDate: addDays(today, 9),
    complete: true,
  }),
  itemOf('b', {
    title: 'Rough plumbing',
    responsibleParty: 'Pinch Plumbing',
    startDate: addDays(today, -4),
    endDate: addDays(today, -1),
  }),
  itemOf('c', {
    title: 'Tile',
    startDate: addDays(today, 3),
    endDate: addDays(today, 5),
  }),
];

/** @param {Record<string, string>} [saved] prefs written before the mount */
async function setup(saved = {}) {
  const fx = setupSchedule({ schedule: items });
  for (const [key, value] of Object.entries(saved)) {
    fx.ctx.prefs.write(/** @type {any} */ (key), value);
  }
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountSchedule({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  const bar = $(shell.body.children[0]);
  return {
    ...fx,
    shell,
    panel,
    bar,
    search: bar.querySelector('input'),
    party: bar.querySelector('select'),
    status: bar.querySelector('.seg-switch'),
    count: bar.querySelector('.schedule-filter__count'),
    /** @returns {string[]} the titles the table shows */
    titles: () =>
      $(shell.body.children[1])
        .querySelectorAll('.schedule-title')
        .map((/** @type {any} */ b) => b.textContent),
  };
}

test('the bar sits over the view and hides nothing at first', async () => {
  const { bar, party, count, titles } = await setup();
  assert.equal(bar.className, 'schedule-filter');
  assert.equal(bar.getAttribute('role'), 'search');
  assert.deepEqual(
    party.children.map((/** @type {any} */ o) => o.textContent),
    ['Anyone', 'Crew', 'Pinch Plumbing'],
  );
  assert.deepEqual(titles(), ['Rough plumbing', 'Tile', 'Demo']);
  assert.equal(count.children[0].textContent, '');
  assert.equal(count.children[1].hidden, true);
});

test('typing filters the view and keeps the search box in place', async () => {
  const { shell, search, count, titles } = await setup();
  search.focus();
  search.value = 'plumb';
  search.dispatchEvent({ type: 'input' });
  assert.deepEqual(titles(), ['Rough plumbing']);
  assert.equal(shell.body.children[0].querySelector('input'), search);
  assert.equal(dom.activeElement, search);
  assert.equal(count.children[0].textContent, '1 of 3 items');
  assert.equal(count.children[1].hidden, false);
});

test('party and status narrow the items, and the status is saved', async () => {
  const { ctx, party, status, titles } = await setup();
  party.value = 'Crew';
  party.dispatchEvent({ type: 'change' });
  assert.deepEqual(titles(), ['Demo']);
  party.value = '';
  party.dispatchEvent({ type: 'change' });
  status.children[1].click();
  assert.deepEqual(titles(), ['Rough plumbing', 'Tile']);
  status.children[2].click();
  assert.deepEqual(titles(), ['Rough plumbing']);
  assert.equal(ctx.prefs.read('scheduleStatus'), 'late');
  const again = await setup({ scheduleStatus: 'open' });
  assert.deepEqual(again.titles(), ['Rough plumbing', 'Tile']);
  assert.equal(again.status.children[1].getAttribute('aria-checked'), 'true');
});

test('no match offers Clear, which drops every choice', async () => {
  const { ctx, shell, search, party, status, count, titles } = await setup();
  status.children[2].click();
  search.value = 'tile';
  search.dispatchEvent({ type: 'input' });
  const empty = $(shell.body.children[1]).children[0];
  assert.equal(empty.className, 'empty-state u-muted');
  assert.match(empty.textContent, /No items match the filter/);
  empty.children[1].click();
  assert.equal(search.value, '');
  assert.equal(party.value, '');
  assert.equal(status.children[0].getAttribute('aria-checked'), 'true');
  assert.equal(ctx.prefs.read('scheduleStatus'), 'all');
  assert.equal(dom.activeElement, search);
  assert.deepEqual(titles(), ['Rough plumbing', 'Tile', 'Demo']);
  search.value = 'demo';
  search.dispatchEvent({ type: 'input' });
  count.children[1].click();
  assert.equal(titles().length, 3);
});

test('a party no item names any more falls back to anyone', async () => {
  const { ctx, party, titles } = await setup();
  party.value = 'Crew';
  party.dispatchEvent({ type: 'change' });
  await ctx.write((api) =>
    api.patchScheduleItem('a', { responsibleParty: 'Mo' }),
  );
  assert.equal(party.value, '');
  assert.deepEqual(titles(), ['Rough plumbing', 'Tile', 'Demo']);
});

test('another project drops the text and party but keeps the status', async () => {
  const { ctx, search, party, status, titles } = await setup();
  search.value = 'tile';
  search.dispatchEvent({ type: 'input' });
  party.value = 'Crew';
  party.dispatchEvent({ type: 'change' });
  status.children[1].click();
  const get = ctx.api.getProject;
  ctx.api.getProject = async (/** @type {string} */ id) => {
    const payload = await get(id);
    return { ...payload, project: { ...payload.project, id: 'p2' } };
  };
  await ctx.openProject('p2');
  assert.equal(search.value, '');
  assert.equal(party.value, '');
  assert.deepEqual(titles(), ['Rough plumbing', 'Tile']);
});

test('another section takes the body, and the bar comes back', async () => {
  const { shell, panel, bar } = await setup();
  shell.setBody(document.createElement('p'));
  panel.show();
  assert.equal(shell.body.children[0], bar);
});
