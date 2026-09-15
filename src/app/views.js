// The view switcher for the schedule section. One segmented switch picks
// how the same items are drawn, and the choice is kept between visits.
import { segSwitch } from '../ui/SegSwitch.js';

/** @typedef {'table' | 'calendar' | 'gantt' | 'agenda'} ViewId */
/** @typedef {import('../storage/prefs.js').Prefs} Prefs */

/** @type {{ id: ViewId, label: string, icon: string }[]} */
export const VIEWS = [
  { id: 'table', label: 'Table', icon: 'table' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'gantt', label: 'Gantt', icon: 'gantt' },
  { id: 'agenda', label: 'Agenda', icon: 'list' },
];

/**
 * @param {string | null} value
 * @returns {ViewId}
 */
export function readView(value) {
  return VIEWS.some((v) => v.id === value)
    ? /** @type {ViewId} */ (value)
    : 'table';
}

/**
 * @param {{ prefs: Prefs, onChange: (view: ViewId) => void }} deps
 */
export function mountViews({ prefs, onChange }) {
  let current = readView(prefs.read('lastView'));
  const sw = segSwitch({
    label: 'View',
    options: VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon })),
    value: current,
    onChange: (view) => {
      current = view;
      prefs.write('lastView', view);
      onChange(view);
    },
  });
  return {
    el: sw.el,
    get view() {
      return current;
    },
    /** @param {ViewId} view */
    set(view) {
      sw.set(view);
    },
  };
}
