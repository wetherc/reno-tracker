// Short messages after a write. Success and info toasts leave on their
// own; a failure stays until dismissed so it cannot be missed.
//
// At most MAX_TOASTS show at once, so a run of saves does not cover the
// page. A new toast past the limit pushes out the oldest one that leaves
// on its own, and the oldest failure only when every toast is a failure.
// A message that is already showing in the same tone is not added again:
// the toast moves to the end, counts the repeat, and starts its timer
// over.
import { bareButton } from './buttons.js';
import { icon } from './icon.js';

/** @typedef {'info' | 'success' | 'danger'} ToastTone */

/**
 * @typedef {{
 *   show(message: string, tone?: ToastTone): () => void,
 *   success(message: string): () => void,
 *   failure(message: string): () => void,
 * }} Toaster
 */

/** @typedef {{ el: HTMLDivElement, tone: ToastTone, count: HTMLSpanElement, seen: number, turn: number, dismiss: () => void }} Shown */

export const MAX_TOASTS = 3;

/**
 * @param {HTMLElement} region the aria-live container from index.html
 * @param {{ timeout?: number, setTimer?: typeof setTimeout }} [options]
 * @returns {Toaster}
 */
export function createToaster(
  region,
  { timeout = 5000, setTimer = setTimeout } = {},
) {
  /** @type {Map<string, Shown>} oldest first */
  const shown = new Map();

  /** @param {Shown} toast */
  function startTimer(toast) {
    if (toast.tone === 'danger') return;
    const turn = ++toast.turn;
    setTimer(() => {
      if (toast.turn === turn) toast.dismiss();
    }, timeout);
  }

  /** @type {Toaster['show']} */
  function show(message, tone = 'info') {
    const key = `${tone}:${message}`;
    const repeat = shown.get(key);
    if (repeat) {
      repeat.seen += 1;
      repeat.count.textContent = ` (${repeat.seen} times)`;
      shown.delete(key);
      shown.set(key, repeat);
      region.append(repeat.el);
      startTimer(repeat);
      return repeat.dismiss;
    }

    const el = document.createElement('div');
    el.className = tone === 'info' ? 'toast' : `toast toast--${tone}`;
    el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const text = document.createElement('span');
    text.className = 'toast__message';
    const count = document.createElement('span');
    count.className = 'toast__count';
    text.append(message, count);
    /** @type {Shown} */
    const toast = {
      el,
      tone,
      count,
      seen: 1,
      turn: 0,
      dismiss: () => {
        toast.turn += 1;
        el.remove();
        if (shown.get(key) === toast) shown.delete(key);
      },
    };
    el.append(
      text,
      bareButton({
        className: 'toast__dismiss',
        ariaLabel: 'Dismiss',
        children: [icon('x')],
        onClick: toast.dismiss,
      }),
    );
    shown.set(key, toast);
    region.append(el);
    startTimer(toast);
    while (shown.size > MAX_TOASTS) {
      const all = [...shown.values()];
      (all.find((t) => t.tone !== 'danger') ?? all[0]).dismiss();
    }
    return toast.dismiss;
  }

  return {
    show,
    success: (message) => show(message, 'success'),
    failure: (message) => show(message, 'danger'),
  };
}
