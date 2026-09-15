// System, light, or dark. The choice is written to data-theme on <html>
// and saved so src/boot.js can re-apply it before first paint.
import { segSwitch } from './SegSwitch.js';

/** @typedef {'system' | 'light' | 'dark'} Theme */
/** @typedef {import('../storage/prefs.js').Prefs} Prefs */

export const THEMES = /** @type {Theme[]} */ (['system', 'light', 'dark']);

/**
 * @param {string | null} value
 * @returns {Theme}
 */
export function readTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * @param {Element} root the <html> element
 * @param {Theme} theme
 */
export function applyTheme(root, theme) {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * @param {{ prefs: Prefs, root?: Element }} config
 * @returns {import('./SegSwitch.js').SegSwitchHandle<Theme>}
 */
export function themeToggle({ prefs, root = document.documentElement }) {
  const initial = readTheme(prefs.read('theme'));
  applyTheme(root, initial);
  return segSwitch({
    label: 'Theme',
    value: initial,
    options: [
      {
        value: 'system',
        label: 'Auto',
        icon: 'monitor',
        title: 'Follow the system theme',
      },
      { value: 'light', label: 'Light', icon: 'sun' },
      { value: 'dark', label: 'Dark', icon: 'moon' },
    ],
    onChange(theme) {
      applyTheme(root, theme);
      if (theme === 'system') prefs.clear('theme');
      else prefs.write('theme', theme);
    },
  });
}
