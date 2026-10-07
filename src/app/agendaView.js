// The agenda view: the schedule as a list of days. A day lists the items
// that start on it and, under a Finishing label, the items that end on
// it. Today is always marked, either on its own day or as a line between
// the day before and the day after, so the list reads from where the
// work is right now.
import {
  formatDayLong,
  formatDayMonth,
  formatMonth,
  formatWeekday,
} from '../format/date.js';
import { agendaDays, dayFor } from '../schedule/agenda.js';
import { monthOf, spanDays, todayIso } from '../schedule/dates.js';
import { bareButton, button } from '../ui/buttons.js';
import { focusKey, keepFocus } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { sectionLabel } from '../ui/sectionLabel.js';
import { completeToggle } from './completeToggle.js';
import { lateBadge } from './lateBadge.js';
import { openScheduleView } from './recordViews.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../schedule/agenda.js').AgendaDay} AgendaDay */

/**
 * @param {{ ctx: AppContext }} deps
 * @returns {{
 *   render(payload: ProjectPayload): HTMLElement,
 *   focus(date: string): void,
 * }} focus asks the next draw to scroll to the day that covers a date
 */
export function agendaView({ ctx }) {
  // The day to scroll to outlives the rebuild after a write.
  /** @type {string | null} */
  let pending = null;

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const today = todayIso();
    const root = document.createElement('div');
    root.className = 'agenda';
    /** @type {Map<string, HTMLElement>} */
    const headings = new Map();

    function draw() {
      headings.clear();
      const days = agendaDays(payload.schedule);
      keepFocus(() => root.replaceChildren(toolbar(), dayList(days)), root);
      if (pending === null) return;
      const day = dayFor(days, pending);
      pending = null;
      if (!day) return;
      const heading = /** @type {HTMLElement} */ (headings.get(day.date));
      // The root is attached after render returns, so the scroll waits.
      queueMicrotask(() => {
        heading.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      });
    }

    function toolbar() {
      const bar = document.createElement('div');
      bar.className = 'agenda__bar';
      const jump = button({
        label: 'Today',
        onClick: () => {
          pending = today;
          draw();
        },
      });
      bar.append(focusKey(jump, 'agenda:today'));
      return bar;
    }

    /** @param {AgendaDay[]} days */
    function dayList(days) {
      const list = document.createElement('ol');
      list.className = 'agenda__days';
      let month = '';
      let todayShown = false;
      /** @param {string} date opens a month group when date starts one */
      const enter = (date) => {
        if (monthOf(date) === month) return;
        month = monthOf(date);
        list.append(monthLine(month));
      };
      // After an earlier month group, the Today line opens the group of
      // today's month, so it does not read as part of the month before.
      const markToday = () => {
        todayShown = true;
        if (month) enter(today);
        list.append(todayLine());
      };
      for (const day of days) {
        if (!todayShown && day.date >= today) {
          if (day.date === today) todayShown = true;
          else markToday();
        }
        enter(day.date);
        list.append(dayEntry(day));
      }
      if (!todayShown) markToday();
      return list;
    }

    /** @param {string} month */
    function monthLine(month) {
      const li = document.createElement('li');
      li.className = 'agenda__month';
      li.append(sectionLabel(formatMonth(month), { tag: 'span' }));
      return li;
    }

    function todayLine() {
      const li = document.createElement('li');
      li.className = 'agenda__today';
      li.setAttribute('aria-label', `Today, ${formatDayLong(today)}`);
      li.append(span('agenda__today-text', `Today, ${formatDayMonth(today)}`));
      return li;
    }

    /** @param {AgendaDay} day */
    function dayEntry(day) {
      const li = document.createElement('li');
      li.className = 'agenda-day';
      if (day.date < today) li.classList.add('agenda-day--past');
      if (day.date === today) li.classList.add('agenda-day--today');
      const heading = document.createElement('h2');
      heading.className = 'agenda-day__date';
      heading.setAttribute('tabindex', '-1');
      heading.setAttribute('aria-label', formatDayLong(day.date));
      heading.append(
        span('agenda-day__weekday', formatWeekday(day.date)),
        span('agenda-day__num', String(Number(day.date.slice(8)))),
      );
      headings.set(day.date, heading);
      const body = document.createElement('div');
      body.className = 'agenda-day__body';
      const both = day.starting.length > 0 && day.finishing.length > 0;
      if (both) body.append(sectionLabel('Starting'));
      body.append(...day.starting.map((item) => row(item, 'starting')));
      if (day.finishing.length > 0) body.append(sectionLabel('Finishing'));
      body.append(...day.finishing.map((item) => row(item, 'finishing')));
      li.append(heading, body);
      return li;
    }

    /** @param {ScheduleItem} item @param {'starting' | 'finishing'} edge */
    function row(item, edge) {
      const el = document.createElement('div');
      el.className = 'agenda-row';
      if (item.complete) el.classList.add('agenda-row--complete');
      const title = bareButton({
        className: 'agenda-row__title',
        children: item.complete
          ? [icon('check', { label: 'Complete' }), item.title]
          : [item.title],
        onClick: () => openScheduleView({ ctx, item }),
      });
      focusKey(title, `${item.id}:open`);
      // The toggle takes the first column, and the title stacks over
      // the meta line in the second, so a long title wraps beside the
      // toggle instead of pushing it onto a line of its own.
      const main = document.createElement('div');
      main.className = 'agenda-row__main';
      const meta = document.createElement('span');
      meta.className = 'agenda-row__meta u-muted';
      const parts = [spanText(item, edge)];
      if (item.responsibleParty) parts.push(item.responsibleParty);
      meta.textContent = parts.join(' · ');
      main.append(title, ...lateBadge(item, today), meta);
      el.append(completeToggle({ ctx, item }), main);
      return el;
    }

    draw();
    return root;
  }

  return {
    render,
    /** @param {string} date */
    focus(date) {
      pending = date;
    },
  };
}

/**
 * The length of an item and the far end of it, read from the day the
 * row sits under.
 * @param {ScheduleItem} item
 * @param {'starting' | 'finishing'} edge
 * @returns {string} "3 days, through Oct 14" or "3 days, since Oct 12"
 */
export function spanText(item, edge) {
  const days = spanDays(item.startDate, item.endDate);
  const length = days === 1 ? '1 day' : `${days} days`;
  if (days === 1) return length;
  return edge === 'starting'
    ? `${length}, through ${formatDayMonth(item.endDate)}`
    : `${length}, since ${formatDayMonth(item.startDate)}`;
}

/** @param {string} className @param {string} text */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}
