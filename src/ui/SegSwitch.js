// A segmented switch: one choice out of a few, shown as a row of buttons.
// It is a radio group to assistive tech. Arrow keys move the choice.
import { icon } from './icon.js';

/**
 * @template {string} V
 * @typedef {{ value: V, label: string, icon?: string, title?: string }} SegOption
 */

/**
 * @template {string} V
 * @typedef {{
 *   el: HTMLDivElement,
 *   readonly value: V,
 *   set(value: V, options?: { silent?: boolean }): void,
 * }} SegSwitchHandle
 */

/**
 * @template {string} V
 * @param {{ label: string, options: SegOption<V>[], value: V, onChange?: (value: V) => void }} config
 * @returns {SegSwitchHandle<V>}
 */
export function segSwitch({ label, options, value, onChange }) {
  const el = document.createElement('div');
  el.className = 'seg-switch';
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', label);
  let current = value;

  const buttons = options.map((option, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-switch__btn';
    btn.setAttribute('role', 'radio');
    if (option.title) btn.title = option.title;
    if (option.icon) btn.append(icon(option.icon));
    btn.append(option.label);
    btn.addEventListener('click', () => set(option.value));
    btn.addEventListener('keydown', (event) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = options[(index + step + options.length) % options.length];
      set(next.value);
      buttons[options.indexOf(next)].focus();
    });
    el.append(btn);
    return btn;
  });

  /** @param {V} next @param {{ silent?: boolean }} [options] */
  function set(next, { silent = false } = {}) {
    const changed = next !== current;
    current = next;
    options.forEach((option, i) => {
      const on = option.value === current;
      buttons[i].classList.toggle('seg-switch__btn--active', on);
      buttons[i].setAttribute('aria-checked', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
    });
    if (changed && !silent) onChange?.(current);
  }

  set(value, { silent: true });
  return {
    el,
    get value() {
      return current;
    },
    set,
  };
}
