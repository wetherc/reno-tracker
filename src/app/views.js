// The view switcher for the schedule section. One segmented switch picks
// how the same items are drawn, and the choice is kept between visits.
// With no saved choice, a phone opens on the agenda, because the table
// needs a sideways scroll there and the agenda does not.
import { focusKey } from '../ui/focusKey.js';
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

/** The one breakpoint in styles/responsive.css. */
export const NARROW_QUERY = '(max-width: 68rem)';

/** @returns {boolean} true on a screen under the breakpoint */
export function isNarrow() {
  return globalThis.matchMedia?.(NARROW_QUERY).matches ?? false;
}

/**
 * @param {string | null} value
 * @param {ViewId} [fallback] the view when the value names none
 * @returns {ViewId}
 */
export function readView(value, fallback = 'table') {
  return VIEWS.some((v) => v.id === value)
    ? /** @type {ViewId} */ (value)
    : fallback;
}

/**
 * @param {{ prefs: Prefs, narrow?: boolean, onChange: (view: ViewId) => void }} deps
 *   narrow picks the agenda when no view is saved
 */
export function mountViews({ prefs, narrow = isNarrow(), onChange }) {
  let current = readView(prefs.read('lastView'), narrow ? 'agenda' : 'table');
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
  VIEWS.forEach((v, i) => focusKey(sw.el.children[i], `view:${v.id}`));
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
