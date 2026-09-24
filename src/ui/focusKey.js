// Keeps keyboard focus in place when a write rebuilds the panel. A
// control that a rebuild replaces carries a data-focus key that names it
// by row and role, such as "<item id>:complete". The key of the focused
// control is read before the rebuild, and its match takes focus after.
// Without this, each save drops focus onto <body> and a keyboard user
// starts again at the top of the page.
//
// A checkbox disabled during its write, or a button that Safari does not
// focus on click, leaves focus on <body> before the rebuild starts. The
// last key that took focus or a pointer press stands in for it then.

export const HOME = 'home';

/** @type {string | null} */
let last = null;

/**
 * @template {Element} E
 * @param {E} el
 * @param {string} key unique among the controls a rebuild draws
 * @returns {E}
 */
export function focusKey(el, key) {
  el.setAttribute('data-focus', key);
  return el;
}

/**
 * @param {unknown} node
 * @returns {string | null}
 */
function keyOf(node) {
  const el = /** @type {Element | null | undefined} */ (node)?.closest?.(
    '[data-focus]',
  );
  return el?.getAttribute('data-focus') ?? null;
}

/** True when nothing in the page holds focus. */
function lost() {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/**
 * Notes the key of each control that takes focus or a pointer press.
 * @param {Pick<Document, 'addEventListener' | 'removeEventListener'>} doc
 * @returns {() => void} stops the tracking
 */
export function trackFocus(doc) {
  last = null;
  /** @param {Event} event */
  const note = (event) => {
    last = keyOf(event.target);
  };
  doc.addEventListener('focusin', note);
  doc.addEventListener('pointerdown', note);
  return () => {
    doc.removeEventListener('focusin', note);
    doc.removeEventListener('pointerdown', note);
  };
}

/** @returns {string | null} the key of the control that has focus now */
export function currentKey() {
  return keyOf(document.activeElement) ?? (lost() ? last : null);
}

/**
 * Focuses the control with the key when focus is lost. The root is
 * searched first, because a dialog can show a control with the same key
 * as one in the panel behind it. A rebuild inside a rebuild can move the
 * control out of the root, so the page is searched next. When the
 * control is gone, as after a delete, the control keyed HOME takes focus.
 * @param {string | null} key
 * @param {ParentNode} [root]
 * @returns {boolean} true when a control took focus
 */
export function restoreFocus(key, root = document) {
  if (!key || !lost()) return false;
  const selector = `[data-focus="${key}"]`;
  const match = /** @type {HTMLElement | null} */ (
    root.querySelector(selector) ??
      document.querySelector(selector) ??
      document.querySelector(`[data-focus="${HOME}"]`)
  );
  if (!match) return false;
  match.focus();
  return true;
}

/**
 * Runs a rebuild and puts focus back on the control it replaced.
 * @param {() => void} rebuild
 * @param {ParentNode} [root] where the replaced control lives
 */
export function keepFocus(rebuild, root = document) {
  const key = currentKey();
  rebuild();
  restoreFocus(key, root);
}
