/**
 * The "nothing here yet" paragraph. An action turns the empty state into
 * an invitation.
 * @param {string} text
 * @param {{ action?: HTMLElement }} [options]
 * @returns {HTMLParagraphElement}
 */
export function emptyState(text, { action } = {}) {
  const el = document.createElement('p');
  el.className = 'empty-state u-muted';
  el.append(text);
  if (action) {
    const br = document.createElement('br');
    el.append(br, action);
  }
  return el;
}
