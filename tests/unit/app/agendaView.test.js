import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { agendaView, spanText } from '../../../src/app/agendaView.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import { mountShell } from '../../../src/app/shell.js';
import { addDays, todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

const today = todayIso();

// Three items around today: one finished last week, one that spans
// today, and one that starts next month.
const items = [
  itemOf('a', {
    title: 'Demo',
    startDate: addDays(today, -8),
    endDate: addDays(today, -6),
    complete: true,
    responsibleParty: 'Crew',
  }),
  itemOf('b', {
    title: 'Rough plumbing',
    startDate: addDays(today, -1),
    endDate: addDays(today, 1),
  }),
  itemOf('c', {
    title: 'Drywall',
    startDate: addDays(today, 40),
    endDate: addDays(today, 40),
  }),
];

/** @param {typeof items} schedule */
async function setup(schedule) {
  const fx = setupSchedule({ schedule });
  await fx.ctx.openProject('p1');
  const view = agendaView({ ctx: fx.ctx });
  const el = $(view.render($(fx.ctx.payload)));
  return { ...fx, view, el };
}

/** @param {any} root */
const filterBox = (root) => root.querySelector('.agenda__filter').children[0];
/** @param {any} root */
const todayButton = (root) => root.querySelector('.agenda__bar').children[1];
/** @param {any} root */
const entries = (root) =>
  /** @type {string[]} */ (
    root
      .querySelector('.agenda__days')
      .children.map((/** @type {any} */ li) => li.className)
  );

test('days list in order with month labels and a Today line', async () => {
  const { el } = await setup(items);
  const kinds = entries(el);
  assert.equal(kinds[0], 'agenda__month');
  assert.ok(kinds.includes('agenda__today'));
  const days = el.querySelectorAll('.agenda-day');
  assert.equal(days.length, 5);
  assert.ok(days[0].classList.contains('agenda-day--past'));
  assert.ok(
    days[days.length - 1].classList.contains('agenda-day--past') === false,
  );
  const todayIdx = kinds.indexOf('agenda__today');
  const before = kinds
    .slice(0, todayIdx)
    .filter((k) => k.startsWith('agenda-day'));
  assert.equal(before.length, 3);
  assert.ok(before.every((k) => k.includes('--past')));
  const line = el.querySelector('.agenda__today');
  assert.match(line.textContent, /^Today, /);
  assert.match(line.getAttribute('aria-label'), /^Today, \w+day, /);
});

test('a day names its starting and finishing items with their spans', async () => {
  const { el } = await setup(items);
  const days = el.querySelectorAll('.agenda-day');
  const heading = days[0].querySelector('.agenda-day__date');
  assert.equal(heading.getAttribute('tabindex'), '-1');
  assert.match(heading.getAttribute('aria-label'), /day, \w+ \d+, \d{4}$/);
  assert.equal(heading.children.length, 2);
  const rows = days[0].querySelectorAll('.agenda-row');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].classList.contains('agenda-row--complete'));
  assert.match(
    rows[0].querySelector('.agenda-row__meta').textContent,
    /^3 days, through \w{3} \d+ · Crew$/,
  );
  const finishing = days[1];
  assert.equal(
    finishing.querySelector('.section-label').textContent,
    'Finishing',
  );
  assert.match(
    finishing.querySelector('.agenda-row__meta').textContent,
    /^3 days, since \w{3} \d+ · Crew$/,
  );
  assert.equal(
    days[0].querySelector('.check').getAttribute('aria-label'),
    'Reopen Demo',
  );
});

test('a day with both edges labels the starting rows too', async () => {
  const { el } = await setup([
    itemOf('a', { title: 'A', startDate: '2026-10-01', endDate: '2026-10-03' }),
    itemOf('b', { title: 'B', startDate: '2026-10-03', endDate: '2026-10-03' }),
  ]);
  const day = el.querySelectorAll('.agenda-day')[1];
  assert.deepEqual(
    day
      .querySelectorAll('.section-label')
      .map((/** @type {any} */ l) => l.textContent),
    ['Starting', 'Finishing'],
  );
});

test('the filter hides finished items and says so when none are left', async () => {
  const { el, view } = await setup(items);
  const box = filterBox(el);
  box.checked = true;
  box.dispatchEvent({ type: 'change' });
  assert.equal(view.hideComplete, true);
  assert.equal(el.querySelectorAll('.agenda-day').length, 3);
  assert.equal(el.querySelectorAll('.agenda-row--complete').length, 0);
  const done = await setup([itemOf('a', { complete: true })]);
  const only = filterBox(done.el);
  only.checked = true;
  only.dispatchEvent({ type: 'change' });
  assert.equal(
    done.el.querySelector('.empty-state').textContent,
    'Everything on the schedule is finished.',
  );
  assert.equal(todayButton(done.el).disabled, true);
});

test('focus scrolls to the day that covers the date after the draw', async () => {
  const fx = setupSchedule({ schedule: items });
  await fx.ctx.openProject('p1');
  const view = agendaView({ ctx: fx.ctx });
  view.focus(today);
  const el = $(view.render($(fx.ctx.payload)));
  await Promise.resolve();
  const heading = el.querySelectorAll('.agenda-day__date')[2];
  assert.deepEqual(heading.scrolledInto, { block: 'start' });
  assert.equal(dom.activeElement, heading);
  // Today jumps again from a cold list.
  todayButton(el).click();
  await Promise.resolve();
  assert.deepEqual(el.querySelectorAll('.agenda-day__date')[2].scrolledInto, {
    block: 'start',
  });
});

test('focus with no matching day is dropped', async () => {
  const fx = setupSchedule({ schedule: [itemOf('a', { complete: true })] });
  await fx.ctx.openProject('p1');
  const view = agendaView({ ctx: fx.ctx });
  const el = $(view.render($(fx.ctx.payload)));
  filterBox(el).checked = true;
  filterBox(el).dispatchEvent({ type: 'change' });
  view.focus('2026-01-01');
  todayButton(el).click();
  assert.equal(
    el.querySelector('.empty-state').className,
    'empty-state u-muted',
  );
});

test('a title opens the editor and the checkbox marks the item done', async () => {
  const { el, log } = await setup(items);
  el.querySelectorAll('.agenda-row__title')[1].click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.tagName, 'DIALOG');
  assert.match(dialog.textContent, /Rough plumbing/);
  dialog.close();
  const box = el.querySelectorAll('.agenda-row')[2].children[0];
  box.checked = true;
  box.dispatchEvent({ type: 'change' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log, ['complete b true']);
});

test('spanText reads the far end from the row edge', () => {
  const one = itemOf('a', { startDate: '2026-10-01', endDate: '2026-10-01' });
  assert.equal(spanText(one, 'starting'), '1 day');
  assert.equal(spanText(one, 'finishing'), '1 day');
  const three = itemOf('b', { startDate: '2026-10-01', endDate: '2026-10-03' });
  assert.equal(spanText(three, 'starting'), '3 days, through Oct 3');
  assert.equal(spanText(three, 'finishing'), '3 days, since Oct 1');
});

test('the calendar count lands on that day in the agenda', async () => {
  const fx = setupSchedule({ schedule: items });
  fx.ctx.prefs.write('lastView', 'agenda');
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountSchedule({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  assert.equal($(shell.body.children[0]).className, 'agenda');
  assert.equal(
    $(shell.body.children[0]).querySelector('.agenda__today') !== null,
    true,
  );
});
