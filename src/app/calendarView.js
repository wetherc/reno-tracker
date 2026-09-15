// The calendar view: one month at a time as a stack of weeks. Every item
// that touches a week draws a bar across the days it covers, and a day
// with more bars than fit shows a count that opens the agenda there.
import { formatDayMonth, formatMonth, formatRange } from '../format/date.js';
import { MAX_LANES, monthGrid, startingMonth } from '../schedule/calendar.js';
import { addMonths, monthOf, todayIso, weekday } from '../schedule/dates.js';
import { bareButton, button, iconButton } from '../ui/buttons.js';
import { icon } from '../ui/icon.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('../schedule/calendar.js').CalendarBar} CalendarBar */
/** @typedef {import('../schedule/calendar.js').CalendarWeek} CalendarWeek */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @param {{ ctx: AppContext, onMore: (date: string) => void }} deps
 *   onMore receives the day whose hidden bars a person asked to see
 * @returns {{ render(payload: ProjectPayload): HTMLElement, month: string | null }}
 */
export function calendarView({ ctx, onMore }) {
  // The month a person is looking at outlives the rebuild after a write.
  /** @type {string | null} */
  let month = null;

  /** @param {ProjectPayload} payload */
  function render(payload) {
    const today = todayIso();
    month ??= startingMonth(payload.schedule, today, payload.project.startDate);
    const root = document.createElement('div');
    root.className = 'cal';
    const draw = () => root.replaceChildren(...parts(payload, today));
    /** @param {number} step */
    const turn = (step) => {
      month = addMonths(/** @type {string} */ (month), step);
      draw();
    };

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
        iconButton({
          icon: 'chevron-left',
          label: 'Previous month',
          onClick: () => turn(-1),
        }),
        title,
        iconButton({
          icon: 'chevron-right',
          label: 'Next month',
          onClick: () => turn(1),
        }),
        button({
          label: 'Today',
          disabled: shown === monthOf(today),
          onClick: () => {
            month = monthOf(today);
            draw();
          },
        }),
      );
      const head = document.createElement('div');
      head.className = 'cal__weekdays';
      head.setAttribute('aria-hidden', 'true');
      head.append(...WEEKDAYS.map((name) => span('cal__weekday', name)));
      return [nav, head, ...grid.weeks.map((week) => weekRow(week, today))];
    }

    /** @param {CalendarWeek} week @param {string} today */
    function weekRow(week, today) {
      const row = document.createElement('div');
      row.className = 'cal__week';
      week.days.forEach((day, col) => {
        const cell = document.createElement('div');
        cell.className = 'cal__day';
        if (!day.inMonth) cell.classList.add('cal__day--outside');
        if (day.date === today) cell.classList.add('cal__day--today');
        if (weekday(day.date) % 6 === 0)
          cell.classList.add('cal__day--weekend');
        cell.style.gridColumn = String(col + 1);
        const num = day.date.endsWith('-01')
          ? formatDayMonth(day.date)
          : String(Number(day.date.slice(8)));
        cell.append(span('cal__num', num));
        row.append(cell);
      });
      for (const bar of week.bars) row.append(barButton(bar));
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

    /** @param {CalendarBar} bar */
    function barButton(bar) {
      const { item } = bar;
      const el = bareButton({
        className: 'cal-bar',
        ariaLabel: `${item.title}, ${formatRange(item.startDate, item.endDate)}`,
        children: item.complete
          ? [icon('check'), span('cal-bar__title', item.title)]
          : [span('cal-bar__title', item.title)],
        onClick: () => openScheduleEditor({ ctx, item }),
      });
      if (item.complete) el.classList.add('cal-bar--complete');
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
  };
}

/** @param {string} className @param {string} text */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}
