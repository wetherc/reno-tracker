import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, press } from '../domShim.js';
import { moveMessage } from '../../../src/app/ganttBar.js';
import {
  DAY_WIDTH,
  ganttView,
  ROW_HEIGHT,
} from '../../../src/app/ganttView.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import { mountShell } from '../../../src/app/shell.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

// Demo runs Thu Oct 1 to Sat Oct 3, so the grid starts Sun Sep 27.
const items = [
  itemOf('demo', {
    title: 'Demo',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    responsibleParty: 'Crew',
    sortOrder: 0,
  }),
  itemOf('plumb', {
    title: 'Rough plumbing',
    startDate: '2026-10-06',
    endDate: '2026-10-10',
    sortOrder: 2,
  }),
  itemOf('cabs', {
    title: 'Cabinets',
    startDate: '2026-10-08',
    endDate: '2026-10-17',
    complete: true,
    sortOrder: 1,
  }),
];
const dependencies = [
  { id: 'l1', projectId: 'p1', predecessorId: 'demo', successorId: 'plumb' },
  { id: 'l2', projectId: 'p1', predecessorId: 'plumb', successorId: 'cabs' },
];

/** @param {{ schedule?: typeof items, dependencies?: typeof dependencies }} [seed] */
async function setup({
  schedule = items,
  dependencies: links = dependencies,
} = {}) {
  const fx = setupSchedule({ schedule, dependencies: links });
  await fx.ctx.openProject('p1');
  const view = ganttView({ ctx: fx.ctx });
  const el = $(view.render($(fx.ctx.payload)));
  return { ...fx, view, el };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('rows follow the dependency order and the names sit beside them', async () => {
  const { el } = await setup();
  assert.equal(el.className, 'gantt');
  assert.equal(el.style['--gantt-day'], `${DAY_WIDTH}px`);
  assert.equal(el.style['--gantt-row'], `${ROW_HEIGHT}px`);
  const names = el.querySelectorAll('.gantt__name');
  assert.deepEqual(
    names.map((/** @type {any} */ n) => n.textContent),
    ['Demo', 'Rough plumbing', 'Cabinets'],
  );
  assert.equal(el.querySelector('.gantt__party').textContent, 'Crew');
  const labels = el.querySelectorAll('.gantt__label');
  assert.ok(labels[2].classList.contains('gantt__label--complete'));
  assert.equal(el.querySelector('.gantt__rows').style.height, '120px');
});

test('the scale names the months and the first day of every week', async () => {
  const { el } = await setup();
  const months = el.querySelectorAll('.gantt__month');
  assert.deepEqual(
    months.map((/** @type {any} */ m) => [
      m.textContent,
      m.style.left,
      m.style.width,
    ]),
    [
      ['Sep 2026', '0px', '112px'],
      ['Oct 2026', '112px', '476px'],
    ],
  );
  const weeks = el.querySelectorAll('.gantt__week');
  assert.equal(weeks.length, 3);
  assert.equal(weeks[0].textContent, 'Sep 27');
  assert.equal(weeks[1].style.left, '196px');
  assert.equal(el.querySelector('.gantt__chart').style.minWidth, '588px');
});

test('bars land on their days and a complete bar is marked', async () => {
  const { el } = await setup();
  const bars = el.querySelectorAll('.gantt-bar');
  assert.deepEqual(
    bars.map((/** @type {any} */ b) => [
      b.style.left,
      b.style.top,
      b.style.width,
    ]),
    [
      ['112px', '0px', '84px'],
      ['252px', '40px', '140px'],
      ['308px', '80px', '280px'],
    ],
  );
  const body = bars[0].querySelector('.gantt-bar__body');
  assert.equal(body.getAttribute('aria-label'), 'Demo, Oct 1 to Oct 3');
  assert.equal(body.getAttribute('data-focus'), 'demo:both');
  const [start, , end] = bars[0].children;
  assert.equal(start.getAttribute('aria-label'), 'Start of Demo, Oct 1');
  assert.equal(end.getAttribute('aria-label'), 'End of Demo, Oct 3');
  assert.ok(bars[2].classList.contains('gantt-bar--complete'));
  assert.equal(
    bars[2].querySelector('.gantt-bar__body').children[0].tagName,
    'SVG',
  );
});

test('connectors follow the links and a late start turns one red', async () => {
  const { el } = await setup();
  const svg = el.querySelector('.gantt__links');
  assert.equal(svg.getAttribute('width'), '588');
  assert.equal(svg.getAttribute('height'), '120');
  const links = svg.querySelectorAll('.gantt__link');
  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute('marker-end'), 'url(#gantt-arrow)');
  assert.equal(
    links[0].querySelector('title').textContent,
    'Rough plumbing waits on Demo',
  );
  assert.ok(links[1].classList.contains('gantt__link--conflict'));
  assert.equal(
    links[1].getAttribute('marker-end'),
    'url(#gantt-arrow-conflict)',
  );
  assert.equal(
    links[1].querySelector('title').textContent,
    'Cabinets waits on Rough plumbing but starts before it ends',
  );
  assert.equal(svg.querySelectorAll('marker').length, 2);
});

test('the today line is drawn only when today is on the grid', async () => {
  const { el } = await setup();
  assert.equal(el.querySelector('.gantt__today'), null);
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { el: current } = await setup({
    schedule: [itemOf('now', { startDate: iso, endDate: iso })],
    dependencies: [],
  });
  assert.ok(current.querySelector('.gantt__today'));
});

test('arrow keys move a date and the toast says where it went', async () => {
  const { el, log, toasts } = await setup();
  const bar = el.querySelectorAll('.gantt-bar')[0];
  const [start, body, end] = bar.children;
  press(end, 'ArrowRight');
  await tick();
  assert.deepEqual(log, ['patch demo ']);
  assert.equal(toasts.at(-1), 'ok Demo now ends Oct 4');
  press(start, 'ArrowLeft', { shiftKey: true });
  await tick();
  assert.equal(toasts.at(-1), 'ok Demo now starts Sep 24');
  press(body, 'ArrowRight', { shiftKey: true });
  await tick();
  assert.equal(toasts.at(-1), 'ok Demo now runs Oct 8 to Oct 10');
  press(body, 'Enter');
  await tick();
  assert.equal(log.length, 3);
});

test('a start handle cannot pass the end and a no-op press saves nothing', async () => {
  const { el, log } = await setup({
    schedule: [
      itemOf('one', { startDate: '2026-10-01', endDate: '2026-10-01' }),
    ],
    dependencies: [],
  });
  const [start, , end] = el.querySelector('.gantt-bar').children;
  press(start, 'ArrowRight');
  press(end, 'ArrowLeft');
  await tick();
  assert.deepEqual(log, []);
});

test('the moved handle gets focus back after the rebuild', async () => {
  const fx = setupSchedule({ schedule: items, dependencies });
  const prefs = fx.ctx.prefs;
  prefs.write('lastView', 'gantt');
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountSchedule({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  const first = $(shell.body.children[0]);
  assert.equal(first.className, 'gantt');
  first.scrollLeft = 150;
  first.dispatchEvent({ type: 'scroll' });
  const end = first.querySelector('.gantt-bar').children[2];
  press(end, 'ArrowRight');
  await tick();
  const second = $(shell.body.children[0]);
  assert.notEqual(second, first);
  assert.equal(second.scrollLeft, 150);
  const focused = $(dom.activeElement);
  assert.equal(focused.getAttribute('data-focus'), 'demo:end');
  assert.equal(focused.getAttribute('aria-label'), 'End of Demo, Oct 4');
});

test('a drag previews the dates, saves on release, and does not open the editor', async () => {
  const { el, log, toasts } = await setup();
  const status = el.querySelector('.gantt__status');
  const bar = el.querySelectorAll('.gantt-bar')[1];
  const body = bar.children[1];
  body.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 100 });
  body.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 110 });
  assert.equal(status.textContent, '');
  body.dispatchEvent({
    type: 'pointermove',
    pointerId: 1,
    clientX: 100 + DAY_WIDTH * 2,
  });
  assert.equal(status.textContent, 'Rough plumbing: Oct 8 to Oct 12');
  assert.equal(bar.style.left, `${252 + DAY_WIDTH * 2}px`);
  assert.ok(bar.classList.contains('gantt-bar--dragging'));
  body.dispatchEvent({ type: 'pointermove', pointerId: 2, clientX: 900 });
  assert.equal(bar.style.left, `${252 + DAY_WIDTH * 2}px`);
  body.dispatchEvent({
    type: 'pointerup',
    pointerId: 1,
    clientX: 100 + DAY_WIDTH * 2,
  });
  body.click();
  await tick();
  assert.equal(status.textContent, '');
  assert.ok(!bar.classList.contains('gantt-bar--dragging'));
  assert.deepEqual(log, ['patch plumb ']);
  assert.equal(toasts.at(-1), 'ok Rough plumbing now runs Oct 8 to Oct 12');
  assert.equal(dom.body.children.length, 0);
});

test('a cancelled or unmoved drag puts the bar back and a click opens the editor', async () => {
  const { el, log } = await setup();
  const bar = el.querySelectorAll('.gantt-bar')[0];
  const [start, body] = bar.children;
  start.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 0 });
  start.dispatchEvent({
    type: 'pointermove',
    pointerId: 1,
    clientX: -DAY_WIDTH,
  });
  assert.equal(bar.style.left, `${112 - DAY_WIDTH}px`);
  assert.equal(bar.style.width, `${84 + DAY_WIDTH}px`);
  start.dispatchEvent({
    type: 'pointercancel',
    pointerId: 1,
    clientX: -DAY_WIDTH,
  });
  assert.equal(bar.style.left, '112px');
  assert.equal(bar.style.width, '84px');
  body.dispatchEvent({ type: 'pointerdown', pointerId: 3, clientX: 0 });
  body.dispatchEvent({ type: 'pointerup', pointerId: 3, clientX: 4 });
  body.click();
  await tick();
  assert.deepEqual(log, []);
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.tagName, 'DIALOG');
  assert.match(dialog.textContent, /Demo/);
  dialog.close();
});

test('the name opens the editor too', async () => {
  const { el } = await setup();
  el.querySelectorAll('.gantt__name')[1].click();
  const dialog = $(dom.body.children[0]);
  assert.match(dialog.textContent, /Rough plumbing/);
  dialog.close();
});

test('moveMessage names only the dates that changed', () => {
  const item = itemOf('a', {
    title: 'Tile',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  });
  assert.equal(
    moveMessage(item, { startDate: '2026-10-02' }),
    'Tile now starts Oct 2',
  );
  assert.equal(
    moveMessage(item, { endDate: '2026-10-05' }),
    'Tile now ends Oct 5',
  );
  assert.equal(
    moveMessage(item, { startDate: '2026-10-02', endDate: '2026-10-04' }),
    'Tile now runs Oct 2 to Oct 4',
  );
});

test('a bar under three days wide carries its title beside it', async () => {
  const { el } = await setup({
    schedule: [
      itemOf('inspect', {
        title: 'Inspection',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      }),
      items[0],
    ],
    dependencies: [],
  });
  const bars = el.querySelectorAll('.gantt-bar');
  assert.ok(bars[0].classList.contains('gantt-bar--narrow'));
  assert.ok(!bars[1].classList.contains('gantt-bar--narrow'));
});
