import { themeToggle } from '../ui/ThemeToggle.js';

/**
 * @param {HTMLElement} container
 * @param {import('../storage/prefs.js').Prefs} prefs
 */
export function mountTheme(container, prefs) {
  container.replaceChildren(themeToggle({ prefs }).el);
}
