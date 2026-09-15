// A heading button that shows or hides the content under it.
import { bareButton } from './buttons.js';
import { icon } from './icon.js';

let counter = 0;

/**
 * @typedef {{
 *   el: HTMLDivElement,
 *   content: HTMLDivElement,
 *   readonly open: boolean,
 *   setOpen(open: boolean): void,
 *   toggle(): void,
 * }} DisclosureHandle
 */

/**
 * @param {{ summary: string, content?: (Node | string)[], open?: boolean, onToggle?: (open: boolean) => void }} config
 * @returns {DisclosureHandle}
 */
export function disclosure({ summary, content = [], open = false, onToggle }) {
  const el = document.createElement('div');
  el.className = 'disclosure';
  const body = document.createElement('div');
  body.className = 'disclosure__content';
  body.id = `disclosure-${++counter}`;
  body.append(...content);
  const chevron = icon('chevron-down');
  chevron.classList.add('disclosure__chevron');
  const toggleBtn = bareButton({
    className: 'disclosure__toggle',
    children: [chevron, summary],
    onClick: () => toggle(),
  });
  toggleBtn.setAttribute('aria-controls', body.id);
  el.append(toggleBtn, body);
  let isOpen = open;

  /** @param {boolean} next */
  function setOpen(next) {
    isOpen = next;
    toggleBtn.setAttribute('aria-expanded', String(next));
    el.classList.toggle('disclosure--open', next);
    body.hidden = !next;
  }
  function toggle() {
    setOpen(!isOpen);
    onToggle?.(isOpen);
  }

  setOpen(open);
  return {
    el,
    content: body,
    get open() {
      return isOpen;
    },
    setOpen,
    toggle,
  };
}
