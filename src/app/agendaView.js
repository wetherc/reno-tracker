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
import { emptyState } from '../ui/emptyState.js';
import { icon } from '../ui/icon.js';
import { sectionLabel } from '../ui/sectionLabel.js';
import { completeToggle } from './completeToggle.js';
import { lateBadge } from './lateBadge.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */
/** @typedef {import('../schedule/agenda.js').AgendaDay} AgendaDay */

/**
 * @param {{ ctx: AppContext }} deps
 * @returns {{
 *   render(payload: ProjectPayload): HTMLElement,
 *   focus(date: string): void,
 *   hideComplete: boolean,
 * }} focus asks the next draw to scroll to the day that covers a date
 */
export function agendaView({ ctx }) {
  // Both choices outlive the rebuild after a write.
  let hideComplete = false;
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
      const days = agendaDays(payload.schedule, { hideComplete });
      root.replaceChildren(toolbar(days.length), ...dayList(days));
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

    /** @param {number} dayCount */
    function toolbar(dayCount) {
      const bar = document.createElement('div');
      bar.className = 'agenda__bar';
      const filter = document.createElement('label');
      filter.className = 'agenda__filter';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'check';
      box.checked = hideComplete;
      box.addEventListener('change', () => {
        hideComplete = box.checked;
        draw();
      });
      filter.append(box, 'Hide finished');
      bar.append(
        filter,
        button({
          label: 'Today',
          disabled: dayCount === 0,
          onClick: () => {
            pending = today;
            draw();
          },
        }),
      );
      return bar;
    }

    /** @param {AgendaDay[]} days */
    function dayList(days) {
      if (days.length === 0) {
        return [emptyState('Everything on the schedule is finished.')];
      }
      const list = document.createElement('ol');
      list.className = 'agenda__days';
      let month = '';
      let todayShown = false;
      for (const day of days) {
        if (!todayShown && day.date >= today) {
          todayShown = true;
          if (day.date !== today) list.append(todayLine());
        }
        if (monthOf(day.date) !== month) {
          month = monthOf(day.date);
          list.append(monthLine(month));
        }
        list.append(dayEntry(day));
      }
      if (!todayShown) list.append(todayLine());
      return [list];
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
        onClick: () => openScheduleEditor({ ctx, item }),
      });
      el.append(
        completeToggle({ ctx, item }),
        title,
        ...lateBadge(item, today),
      );
      const meta = document.createElement('span');
      meta.className = 'agenda-row__meta u-muted';
      const parts = [spanText(item, edge)];
      if (item.responsibleParty) parts.push(item.responsibleParty);
      meta.textContent = parts.join(' · ');
      el.append(meta);
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
    get hideComplete() {
      return hideComplete;
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
