import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { calendarView, WEEKDAYS } from '../../../src/app/calendarView.js';
import { mountSchedule } from '../../../src/app/schedule.js';
import { mountShell } from '../../../src/app/shell.js';
import { todayIso } from '../../../src/schedule/dates.js';
import { createPrefs, memoryStorage } from '../../../src/storage/prefs.js';
import { itemOf, setupSchedule } from './scheduleFixtures.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

// Four items in the second week of October 2026. Three share Oct 13, so
// the fourth falls past the lane limit on that day and the next.
const october = [
  itemOf('a', {
    title: 'Demo',
    startDate: '2026-10-12',
    endDate: '2026-10-14',
  }),
  itemOf('b', {
    title: 'Rough plumbing',
    startDate: '2026-10-13',
    endDate: '2026-10-13',
  }),
  itemOf('c', {
    title: 'Electrical',
    startDate: '2026-10-13',
    endDate: '2026-10-15',
  }),
  itemOf('d', {
    title: 'Inspection',
    startDate: '2026-10-13',
    endDate: '2026-10-14',
    complete: true,
  }),
  itemOf('e', {
    title: 'Drywall',
    startDate: '2026-10-29',
    endDate: '2026-11-04',
  }),
];

/** @param {typeof october} schedule */
async function setup(schedule) {
  const fx = setupSchedule({ schedule });
  await fx.ctx.openProject('p1');
  /** @type {string[]} */
  const asked = [];
  const view = calendarView({ ctx: fx.ctx, onMore: (d) => asked.push(d) });
  const el = $(view.render($(fx.ctx.payload)));
  return { ...fx, view, el, asked };
}

/** @param {any} root */
const weeks = (root) => root.querySelectorAll('.cal__week');
/** @param {any} root */
const titleOf = (root) => root.querySelector('.cal__title').textContent;

test('the grid opens on the first item when today has no work', async () => {
  const { el, view } = await setup(october);
  assert.equal(view.month, '2026-10');
  assert.equal(titleOf(el), 'October 2026');
  assert.deepEqual(
    el
      .querySelectorAll('.cal__weekday')
      .map((/** @type {any} */ w) => w.textContent),
    WEEKDAYS,
  );
  const rows = weeks(el);
  assert.equal(rows.length, 5);
  const first = rows[0].querySelectorAll('.cal__day');
  assert.equal(first.length, 7);
  assert.ok(first[0].classList.contains('cal__day--outside'));
  assert.ok(first[0].classList.contains('cal__day--weekend'));
  assert.equal(first[0].textContent, '27');
  assert.equal(first[4].textContent, 'Oct 1');
  assert.ok(!first[4].classList.contains('cal__day--outside'));
});

test('bars span their days, keep lanes, and overflow into a count', async () => {
  const { el, asked } = await setup(october);
  const week = weeks(el)[2];
  const bars = week.querySelectorAll('.cal-bar');
  assert.deepEqual(
    bars.map((/** @type {any} */ b) => [
      b.getAttribute('aria-label'),
      b.style.gridColumn,
      b.style.gridRow,
    ]),
    [
      ['Demo, Oct 12 to Oct 14', '2 / 5', '2'],
      ['Electrical, Oct 13 to Oct 15', '3 / 6', '3'],
      ['Inspection, Oct 13 to Oct 14', '3 / 5', '4'],
    ],
  );
  assert.ok(bars[2].classList.contains('cal-bar--complete'));
  assert.equal(bars[2].children[0].tagName, 'SVG');
  const more = week.querySelectorAll('.cal-more');
  assert.equal(more.length, 1);
  assert.equal(more[0].textContent, '+1 more');
  assert.equal(more[0].getAttribute('aria-label'), '1 more on Oct 13');
  assert.equal(more[0].style.gridColumn, '3');
  assert.equal(more[0].style.gridRow, '5');
  more[0].click();
  assert.deepEqual(asked, ['2026-10-13']);
});

test('a bar that crosses the week edge loses that rounded end', async () => {
  const { el } = await setup(october);
  const rows = weeks(el);
  const out = rows[4].querySelector('.cal-bar');
  assert.ok(out.classList.contains('cal-bar--after'));
  assert.ok(!out.classList.contains('cal-bar--before'));
  assert.equal(out.style.gridColumn, '5 / 8');
  const back = rows[5];
  assert.equal(back, undefined);
});

test('turning the month redraws in place and Today returns', async () => {
  const { el, view } = await setup(october);
  const [prev, , next, today] = el.querySelector('.cal__nav').children;
  assert.equal(prev.getAttribute('aria-label'), 'Previous month');
  assert.equal(next.getAttribute('aria-label'), 'Next month');
  next.click();
  assert.equal(view.month, '2026-11');
  assert.equal(titleOf(el), 'November 2026');
  const carried = weeks(el)[0].querySelector('.cal-bar');
  assert.ok(carried.classList.contains('cal-bar--before'));
  assert.equal(carried.style.gridColumn, '1 / 5');
  prev.click();
  prev.click();
  assert.equal(titleOf(el), 'September 2026');
  assert.equal(today.disabled, false);
  today.click();
  assert.equal(view.month, todayIso().slice(0, 7));
  assert.equal($(el.querySelector('.cal__nav').children[3]).disabled, true);
  assert.equal(el.querySelectorAll('.cal__day--today').length, 1);
});

test('a bar opens the editor for its item', async () => {
  const { el } = await setup(october);
  weeks(el)[2].querySelector('.cal-bar').click();
  const dialog = $(dom.body.children[0]);
  assert.equal(dialog.tagName, 'DIALOG');
  assert.match(dialog.textContent, /Demo/);
  dialog.close();
});

test('the schedule panel shows the calendar and the count opens the agenda', async () => {
  const fx = setupSchedule({ schedule: october });
  const prefs = fx.ctx.prefs;
  prefs.write('lastView', 'calendar');
  const shell = mountShell({
    sidebar: document.createElement('nav'),
    main: document.createElement('main'),
    prefs: createPrefs(memoryStorage()),
  });
  const panel = mountSchedule({ ctx: fx.ctx, shell });
  fx.ctx.on('payload', () => panel.show());
  await fx.ctx.openProject('p1');
  const cal = $(shell.body.children[0]);
  assert.equal(cal.className, 'cal');
  cal.querySelector('.cal-more').click();
  assert.equal(prefs.read('lastView'), 'agenda');
});
