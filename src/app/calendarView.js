// The calendar view: one month at a time as a stack of weeks. Every item
// that touches a week draws a bar across the days it covers, and a day
// with more bars than fit shows a count that opens the agenda there.
// Each day cell is a button that picks the day and lists its work under
// the grid. The arrow keys move between days, and only one day is in the
// tab order. A late item's bar paints in the danger colour with an
// alert icon.
import {
  formatDayLong,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  formatRange,
} from '../format/date.js';
import {
  itemsOnDay,
  MAX_LANES,
  monthGrid,
  startingMonth,
} from '../schedule/calendar.js';
import {
  addDays,
  addMonths,
  monthOf,
  todayIso,
  weekday,
} from '../schedule/dates.js';
import { bareButton, button, iconButton } from '../ui/buttons.js';
import { focusKey, keepFocus } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { isLate } from '../entities/scheduleItem.js';
import { dayListParts } from './calendarDay.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../schedule/calendar.js').CalendarBar} CalendarBar */
/** @typedef {import('../schedule/calendar.js').CalendarWeek} CalendarWeek */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * @param {{ ctx: AppContext, onMore: (date: string) => void }} deps
 *   onMore receives the day whose hidden bars a person asked to see
 * @returns {{ render(payload: ProjectPayload): HTMLElement, month: string | null, picked: string | null }}
 */
export function calendarView({ ctx, onMore }) {
  // The month a person is looking at and the day they picked outlive the
  // rebuild after a write.
  /** @type {string | null} */
  let month = null;
  /** @type {string | null} */
  let picked = null;

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const today = todayIso();
    month ??= startingMonth(payload.schedule, today, payload.project.startDate);
    const root = document.createElement('div');
    root.className = 'cal';
    const draw = () =>
      keepFocus(() => root.replaceChildren(...parts(payload, today)), root);
    /** @param {number} step */
    const turn = (step) => {
      month = addMonths(/** @type {string} */ (month), step);
      picked = null;
      draw();
    };
    const day = document.createElement('div');
    day.className = 'cal-day';
    day.setAttribute('aria-live', 'polite');
    /** @type {HTMLButtonElement[]} */
    let cells = [];

    /** @param {string} date */
    function pick(date) {
      picked = date;
      for (const cell of cells) {
        const on = cell.dataset.date === date;
        cell.classList.toggle('cal__day--picked', on);
        cell.setAttribute('aria-pressed', String(on));
      }
      day.replaceChildren(
        ...dayListParts({ ctx, items: payload.schedule, date, today }),
      );
    }

    /** @param {ProjectPayload} payload @param {string} today */
    function parts(payload, today) {
      const shown = /** @type {string} */ (month);
      const grid = monthGrid(shown, payload.schedule);
      const title = document.createElement('h2');
      title.className = 'cal__title';
      title.setAttribute('aria-live', 'polite');
      title.textContent = formatMonth(shown);
      const nav = document.createElement('div');
      nav.className = 'cal__nav';
      nav.append(
        focusKey(
          iconButton({
            icon: 'chevron-left',
            label: 'Previous month',
            onClick: () => turn(-1),
          }),
          'cal:prev',
        ),
        title,
        focusKey(
          iconButton({
            icon: 'chevron-right',
            label: 'Next month',
            onClick: () => turn(1),
          }),
          'cal:next',
        ),
        focusKey(
          button({
            label: 'Today',
            disabled: shown === monthOf(today),
            onClick: () => {
              month = monthOf(today);
              draw();
            },
          }),
          'cal:today',
        ),
      );
      const head = document.createElement('div');
      head.className = 'cal__weekdays';
      head.setAttribute('aria-hidden', 'true');
      head.append(...WEEKDAYS.map((name) => span('cal__weekday', name)));
      cells = [];
      const rows = grid.weeks.map((week) => weekRow(week, today));
      const dates = cells.map((c) => c.dataset.date);
      const tabbable =
        [picked, today].find((d) => d && dates.includes(d)) ?? `${shown}-01`;
      for (const cell of cells) {
        cell.tabIndex = cell.dataset.date === tabbable ? 0 : -1;
      }
      day.replaceChildren(
        ...dayListParts({
          ctx,
          items: payload.schedule,
          date: picked,
          today,
        }),
      );
      return [nav, head, ...rows, day];
    }

    /**
     * Moves focus and the tab stop to the day a key asks for, when that
     * day is on the grid.
     * @param {HTMLButtonElement} from
     * @param {KeyboardEvent} event
     */
    function stepDay(from, event) {
      const step = DAY_STEP[/** @type {keyof typeof DAY_STEP} */ (event.key)];
      if (!step) return;
      event.preventDefault();
      const date = addDays(/** @type {string} */ (from.dataset.date), step);
      const to = cells.find((c) => c.dataset.date === date);
      if (!to) return;
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    }

    /** @param {CalendarWeek} week @param {string} today */
    function weekRow(week, today) {
      const row = document.createElement('div');
      row.className = 'cal__week';
      week.days.forEach(({ date, inMonth }, col) => {
        const count = itemsOnDay(payload.schedule, date).length;
        const work = count === 1 ? '1 item' : `${count} items`;
        const cell = bareButton({
          className: 'cal__day',
          ariaLabel: `${formatDayLong(date)}, ${count ? work : 'nothing scheduled'}`,
          onClick: () => pick(date),
        });
        cell.dataset.date = date;
        focusKey(cell, `day:${date}`);
        cell.setAttribute('aria-pressed', String(date === picked));
        if (date === picked) cell.classList.add('cal__day--picked');
        if (!inMonth) cell.classList.add('cal__day--outside');
        if (date === today) cell.classList.add('cal__day--today');
        if (weekday(date) % 6 === 0) cell.classList.add('cal__day--weekend');
        cell.style.gridColumn = String(col + 1);
        cell.addEventListener('keydown', (event) => stepDay(cell, event));
        // The first of a month names the month, except on a phone, where
        // the cell is too narrow for it.
        const num = span('cal__num', String(Number(date.slice(8))));
        if (date.endsWith('-01')) {
          num.prepend(span('cal__num-month', formatMonthShort(monthOf(date))));
        }
        cell.append(num);
        cells.push(cell);
        row.append(cell);
      });
      for (const bar of week.bars) row.append(barButton(bar, today));
      week.hidden.forEach((count, col) => {
        if (count === 0) return;
        const date = week.days[col].date;
        const more = bareButton({
          className: 'cal-more',
          label: `+${count} more`,
          ariaLabel: `${count} more on ${formatDayMonth(date)}`,
          onClick: () => onMore(date),
        });
        more.style.gridColumn = String(col + 1);
        more.style.gridRow = String(MAX_LANES + 2);
        row.append(more);
      });
      return row;
    }

    /** @param {CalendarBar} bar @param {string} today */
    function barButton(bar, today) {
      const { item } = bar;
      const late = isLate(item, today);
      const range = formatRange(item.startDate, item.endDate);
      const el = bareButton({
        className: 'cal-bar',
        ariaLabel: `${item.title}, ${range}${late ? ', late' : ''}`,
        children: [
          ...(item.complete ? [icon('check')] : late ? [icon('alert')] : []),
          span('cal-bar__title', item.title),
        ],
        onClick: () => openScheduleEditor({ ctx, item }),
      });
      focusKey(el, `${item.id}:open`);
      if (item.complete) el.classList.add('cal-bar--complete');
      if (late) el.classList.add('cal-bar--late');
      if (bar.continuesBefore) el.classList.add('cal-bar--before');
      if (bar.continuesAfter) el.classList.add('cal-bar--after');
      el.style.gridColumn = `${bar.startCol + 1} / ${bar.endCol + 2}`;
      el.style.gridRow = String(bar.lane + 2);
      return el;
    }

    draw();
    return root;
  }

  return {
    render,
    get month() {
      return month;
    },
    get picked() {
      return picked;
    },
  };
}

/** @param {string} className @param {string} text */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}
