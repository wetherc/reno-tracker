// The schedule section. The panel header has the view switch and the
// Add button. The body shows the filter bar over whichever view is on,
// and the view draws only the items that pass the filter.
import { todayIso } from '../schedule/dates.js';
import { filterSchedule } from '../schedule/filter.js';
import { button } from '../ui/buttons.js';
import { emptyState } from '../ui/emptyState.js';
import { focusKey, keepFocus } from '../ui/focusKey.js';
import { agendaView } from './agendaView.js';
import { calendarView } from './calendarView.js';
import { ganttView } from './ganttView.js';
import { openScheduleEditor } from './scheduleEditor.js';
import { mountScheduleFilter } from './scheduleFilter.js';
import { scheduleTable } from './scheduleTable.js';
import { mountViews } from './views.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('./views.js').ViewId} ViewId */

/**
 * @typedef {{
 *   render(payload: ProjectPayload): HTMLElement,
 *   focus?(date: string): void,
 *   reset?(): void,
 * }} View focus asks a view to bring one day into sight, and reset
 *   drops the place a person was at when another project opens
 */

/**
 * @param {{ ctx: AppContext, shell: Shell }} deps
 * @returns {{ show(): void }} show fills the panel with the schedule
 */
export function mountSchedule({ ctx, shell }) {
  const addButton = button({
    label: 'Add item',
    icon: 'plus',
    variant: 'primary',
    onClick: () => openScheduleEditor({ ctx }),
  });
  focusKey(addButton, 'add-item');
  const views = mountViews({
    prefs: ctx.prefs,
    onChange: () => keepFocus(show, shell.el),
  });

  const filter = mountScheduleFilter({
    prefs: ctx.prefs,
    onChange: () => keepFocus(show, shell.el),
  });
  const slot = document.createElement('div');
  slot.className = 'schedule-view';
  /** @type {string | null} */
  let projectId = null;

  /** @type {Record<ViewId, View>} */
  const renderers = {
    table: scheduleTable({ ctx }),
    calendar: calendarView({ ctx, onMore: (date) => openAgenda(date) }),
    gantt: ganttView({ ctx }),
    agenda: agendaView({ ctx }),
  };

  /** @param {string} date */
  function openAgenda(date) {
    renderers.agenda.focus?.(date);
    views.visit('agenda');
  }

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    shell.tools.replaceChildren(views.el, addButton);
    if (payload.project.id !== projectId) {
      projectId = payload.project.id;
      filter.reset();
      for (const view of Object.values(renderers)) view.reset?.();
    }
    if (payload.schedule.length === 0) {
      shell.setBody(
        emptyState(`Nothing scheduled for ${payload.project.name} yet.`, {
          action: button({
            label: 'Add the first item',
            icon: 'plus',
            variant: 'primary',
            onClick: () => openScheduleEditor({ ctx }),
          }),
        }),
      );
      return;
    }
    filter.update(payload.schedule);
    const schedule = filterSchedule(
      payload.schedule,
      filter.filter,
      todayIso(),
    );
    filter.setCount(schedule.length, payload.schedule.length);
    // The bar is moved only when another section took the body, so a
    // redraw while a person types leaves the search box in place.
    if (filter.el.parentNode !== shell.body) shell.setBody(filter.el, slot);
    slot.replaceChildren(
      schedule.length === 0
        ? emptyState('No items match the filter.', {
            action: focusKey(
              button({ label: 'Clear filter', onClick: filter.clear }),
              'filter:clear-empty',
            ),
          })
        : renderers[views.view].render({ ...payload, schedule }),
    );
  }

  return { show };
}
