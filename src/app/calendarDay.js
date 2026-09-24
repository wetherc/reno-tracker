// The list under the calendar grid for the day a person picked. It names
// every item at work that day, so a phone, where the bars are too thin
// to read or tap, still reaches each item and its editor.
import { formatDayLong, formatRange } from '../format/date.js';
import { itemsOnDay } from '../schedule/calendar.js';
import { bareButton } from '../ui/buttons.js';
import { focusKey } from '../ui/focusKey.js';
import { icon } from '../ui/icon.js';
import { completeToggle } from './completeToggle.js';
import { lateBadge } from './lateBadge.js';
import { openScheduleEditor } from './scheduleEditor.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('../types.ts').ScheduleItem} ScheduleItem */

/**
 * @param {{ ctx: AppContext, items: ScheduleItem[], date: string | null, today: string }} config
 *   date is the picked day, or null before a pick
 * @returns {HTMLElement[]} the heading and the list, or a hint
 */
export function dayListParts({ ctx, items, date, today }) {
  if (date === null) {
    const hint = document.createElement('p');
    hint.className = 'cal-day__hint u-muted';
    hint.textContent = 'Pick a day to list its work.';
    return [hint];
  }
  const heading = document.createElement('h3');
  heading.className = 'cal-day__title';
  heading.textContent = formatDayLong(date);
  const on = itemsOnDay(items, date);
  if (on.length === 0) {
    const none = document.createElement('p');
    none.className = 'cal-day__hint u-muted';
    none.textContent = 'Nothing scheduled.';
    return [heading, none];
  }
  const list = document.createElement('ul');
  list.className = 'cal-day__list';
  list.append(...on.map((item) => row(ctx, item, today)));
  return [heading, list];
}

/**
 * @param {AppContext} ctx
 * @param {ScheduleItem} item
 * @param {string} today
 */
function row(ctx, item, today) {
  const li = document.createElement('li');
  li.className = item.complete
    ? 'cal-day__row cal-day__row--complete'
    : 'cal-day__row';
  const title = bareButton({
    className: 'cal-day__item',
    children: item.complete
      ? [icon('check', { label: 'Complete' }), item.title]
      : [item.title],
    onClick: () => openScheduleEditor({ ctx, item }),
  });
  focusKey(title, `${item.id}:day`);
  const range = document.createElement('span');
  range.className = 'cal-day__range u-muted';
  range.textContent = formatRange(item.startDate, item.endDate);
  li.append(
    completeToggle({ ctx, item }),
    title,
    ...lateBadge(item, today),
    range,
  );
  return li;
}
