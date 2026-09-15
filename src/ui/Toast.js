// Short messages after a write. Success and info toasts leave on their
// own; a failure stays until dismissed so it cannot be missed.
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

/**
 * @param {HTMLElement} region the aria-live container from index.html
 * @param {{ timeout?: number, setTimer?: typeof setTimeout }} [options]
 * @returns {Toaster}
 */
export function createToaster(
  region,
  { timeout = 5000, setTimer = setTimeout } = {},
) {
  /** @type {Toaster['show']} */
  function show(message, tone = 'info') {
    const el = document.createElement('div');
    el.className = tone === 'info' ? 'toast' : `toast toast--${tone}`;
    el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const text = document.createElement('span');
    text.className = 'toast__message';
    text.append(message);
    const dismiss = () => el.remove();
    el.append(
      text,
      bareButton({
        className: 'toast__dismiss',
        ariaLabel: 'Dismiss',
        children: [icon('x')],
        onClick: dismiss,
      }),
    );
    region.append(el);
    if (tone !== 'danger') setTimer(dismiss, timeout);
    return dismiss;
  }
  return {
    show,
    success: (message) => show(message, 'success'),
    failure: (message) => show(message, 'danger'),
  };
}
