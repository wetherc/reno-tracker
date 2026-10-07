// A native <dialog> opened with showModal(), which traps focus and
// closes on Escape on its own. The builder adds the heading, the close
// button, focus restore, and an optional check before a close that the
// person asked for, so a form with unsaved edits can ask first.
import { iconButton } from './buttons.js';
import { currentKey, restoreFocus } from './focusKey.js';

let counter = 0;

// showModal() makes the rest of the page inert, so a toast in the page
// cannot be dismissed while a dialog is open. The toast region moves
// into the open dialog and goes back to its old place when it closes.
const TOASTS = 'toasts';

/**
 * @typedef {{
 *   el: HTMLDialogElement,
 *   body: HTMLDivElement,
 *   open(): void,
 *   close(): void,
 *   requestClose(): Promise<void>,
 * }} ModalHandle close shuts the dialog at once; requestClose runs
 * beforeClose first and shuts it only on true
 */

/**
 * @param {{
 *   title: string,
 *   body?: (Node | string)[],
 *   actions?: HTMLElement[],
 *   wide?: boolean,
 *   onClose?: () => void,
 *   beforeClose?: () => boolean | Promise<boolean>,
 * }} config wide fits a form beside a list; beforeClose runs when the
 * x button, Escape, or requestClose asks to close, and false keeps the
 * dialog open
 * @returns {ModalHandle}
 */
export function modal({
  title,
  body = [],
  actions = [],
  wide = false,
  onClose,
  beforeClose,
}) {
  const el = document.createElement('dialog');
  el.className = wide ? 'modal modal--wide' : 'modal';
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
    iconButton({ icon: 'x', label: 'Close', onClick: requestClose }),
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

  async function requestClose() {
    if (!beforeClose || (await beforeClose())) el.close();
  }

  // Escape fires cancel. With a check in place the close waits on it.
  el.addEventListener('cancel', (event) => {
    if (!beforeClose) return;
    event.preventDefault();
    requestClose();
  });

  // A save rebuilds the panel behind the dialog, so the control that
  // opened it may be gone by the time it closes. Its focus key then finds
  // the control that took its place.
  /** @type {Element | null} */
  let opener = null;
  /** @type {string | null} */
  let openerKey = null;
  /** @type {{ region: HTMLElement, parent: ParentNode } | null} */
  let moved = null;
  el.addEventListener('close', () => {
    if (moved?.region.parentNode === el) {
      moved.parent.append(moved.region);
    }
    moved = null;
    if (opener?.isConnected && 'focus' in opener) {
      /** @type {HTMLElement} */ (opener).focus();
    } else {
      // The closed dialog stays in the page until onClose removes it, and
      // the field that had focus in it still counts as focused.
      const active = /** @type {HTMLElement | null} */ (document.activeElement);
      if (active && el.contains(active)) active.blur();
      restoreFocus(openerKey);
    }
    opener = null;
    openerKey = null;
    onClose?.();
  });

  return {
    el,
    body: bodyEl,
    open() {
      opener = document.activeElement;
      openerKey = currentKey();
      el.showModal();
      const region = document.getElementById(TOASTS);
      if (region?.parentNode) {
        moved = { region, parent: region.parentNode };
        el.append(region);
      }
    },
    close() {
      el.close();
    },
    requestClose,
  };
}
