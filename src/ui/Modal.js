// A native <dialog> opened with showModal(), which traps focus and
// closes on Escape on its own. The builder adds the heading, the close
// button, and focus restore.
import { iconButton } from './buttons.js';

let counter = 0;

/**
 * @typedef {{
 *   el: HTMLDialogElement,
 *   body: HTMLDivElement,
 *   open(): void,
 *   close(): void,
 * }} ModalHandle
 */

/**
 * @param {{ title: string, body?: (Node | string)[], actions?: HTMLElement[], onClose?: () => void }} config
 * @returns {ModalHandle}
 */
export function modal({ title, body = [], actions = [], onClose }) {
  const el = document.createElement('dialog');
  el.className = 'modal';
  const titleId = `modal-title-${++counter}`;
  el.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'modal__header';
  const heading = document.createElement('h2');
  heading.className = 'modal__title';
  heading.id = titleId;
  heading.append(title);
  header.append(
    heading,
    iconButton({ icon: 'x', label: 'Close', onClick: () => el.close() }),
  );

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal__body';
  bodyEl.append(...body);
  el.append(header, bodyEl);

  if (actions.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'modal__actions';
    footer.append(...actions);
    el.append(footer);
  }

  /** @type {Element | null} */
  let opener = null;
  el.addEventListener('close', () => {
    if (opener && 'focus' in opener) {
      /** @type {HTMLElement} */ (opener).focus();
    }
    opener = null;
    onClose?.();
  });

  return {
    el,
    body: bodyEl,
    open() {
      opener = document.activeElement;
      el.showModal();
    },
    close() {
      el.close();
    },
  };
}
