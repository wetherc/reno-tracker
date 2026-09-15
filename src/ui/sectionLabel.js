/**
 * An in-panel sub-heading: uppercase, tracked, muted.
 * @param {string} text
 * @param {{ tag?: 'h2' | 'h3' | 'h4' | 'span' }} [options]
 * @returns {HTMLElement}
 */
export function sectionLabel(text, { tag = 'h3' } = {}) {
  const el = document.createElement(tag);
  el.className = 'section-label';
  el.append(text);
  return el;
}
