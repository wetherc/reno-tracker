// The schedule section. The panel header carries the view switch and the
// Add button. The body is drawn by whichever view is on.
import { button } from '../ui/buttons.js';
import { emptyState } from '../ui/emptyState.js';
import { calendarView } from './calendarView.js';
import { ganttView } from './ganttView.js';
import { openScheduleEditor } from './scheduleEditor.js';
import { scheduleTable } from './scheduleTable.js';
import { mountViews, VIEWS } from './views.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./shell.js').mountShell>} Shell */
/** @typedef {import('../types.ts').ProjectPayload} ProjectPayload */
/** @typedef {import('./views.js').ViewId} ViewId */

/**
 * @typedef {{
 *   render(payload: ProjectPayload): HTMLElement,
 *   focus?(date: string): void,
 * }} View focus asks a view to bring one day into sight
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
  const views = mountViews({ prefs: ctx.prefs, onChange: () => show() });

  /** @type {Partial<Record<ViewId, View>>} */
  const renderers = {
    table: scheduleTable({ ctx }),
    calendar: calendarView({ ctx, onMore: (date) => openAgenda(date) }),
    gantt: ganttView({ ctx }),
  };

  /** @param {string} date */
  function openAgenda(date) {
    renderers.agenda?.focus?.(date);
    views.set('agenda');
  }

  function show() {
    const payload = ctx.payload;
    if (!payload) return;
    shell.tools.replaceChildren(views.el, addButton);
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
    const view = renderers[views.view];
    if (!view) {
      const label = VIEWS.find((v) => v.id === views.view)?.label;
      shell.setBody(emptyState(`The ${label} view is not built yet.`));
      return;
    }
    shell.setBody(view.render(payload));
  }

  return { show };
}
