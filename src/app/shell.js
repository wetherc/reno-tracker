// The section nav in the sidebar and the one panel in the main column.
// Feature modules fill the panel for the current section.
import { bareButton } from '../ui/buttons.js';
import { icon } from '../ui/icon.js';

/** @typedef {'schedule' | 'materials' | 'costs'} SectionId */
/** @typedef {import('../storage/prefs.js').Prefs} Prefs */

/** @type {{ id: SectionId, label: string, icon: string }[]} */
export const SECTIONS = [
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'materials', label: 'Materials', icon: 'box' },
  { id: 'costs', label: 'Costs', icon: 'chart' },
];

/**
 * @param {string | null} value
 * @returns {SectionId}
 */
export function readSection(value) {
  return SECTIONS.some((s) => s.id === value)
    ? /** @type {SectionId} */ (value)
    : 'schedule';
}

/**
 * @param {{ sidebar: HTMLElement, main: HTMLElement, prefs: Prefs }} deps
 */
export function mountShell({ sidebar, main, prefs }) {
  let current = readSection(prefs.read('lastSection'));
  /** @type {Set<(section: SectionId) => void>} */
  const listeners = new Set();

  const nav = document.createElement('div');
  nav.className = 'nav';
  const buttons = SECTIONS.map((section) => {
    const btn = bareButton({
      className: 'row-select',
      children: [icon(section.icon), section.label],
      onClick: () => setSection(section.id),
    });
    nav.append(btn);
    return btn;
  });
  sidebar.replaceChildren(nav);

  const panel = document.createElement('section');
  panel.className = 'panel';
  const header = document.createElement('div');
  header.className = 'panel__header';
  const title = document.createElement('h1');
  title.className = 'panel__title';
  const tools = document.createElement('div');
  tools.className = 'panel__tools';
  header.append(title, tools);
  const body = document.createElement('div');
  body.className = 'panel__body';
  panel.append(header, body);
  main.replaceChildren(panel);

  /** @param {SectionId} id */
  function setSection(id) {
    const changed = id !== current;
    current = id;
    SECTIONS.forEach((section, i) => {
      const on = section.id === current;
      buttons[i].classList.toggle('row-select--current', on);
      if (on) buttons[i].setAttribute('aria-current', 'page');
      else buttons[i].removeAttribute('aria-current');
    });
    prefs.write('lastSection', current);
    if (changed) for (const fn of listeners) fn(current);
  }

  setSection(current);
  return {
    title,
    tools,
    body,
    get section() {
      return current;
    },
    setSection,
    /** @param {(section: SectionId) => void} fn */
    onSection(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** @param {string} text */
    setTitle(text) {
      title.textContent = text;
    },
    /** @param {...(Node | string)} nodes */
    setBody(...nodes) {
      body.replaceChildren(...nodes);
    },
  };
}
