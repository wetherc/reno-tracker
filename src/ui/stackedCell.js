// A table cell with an amount and a note in small muted type under it,
// such as a blended total over its margin.

/**
 * @param {string} main
 * @param {string} note
 * @returns {HTMLSpanElement}
 */
export function stackedCell(main, note) {
  const el = document.createElement('span');
  el.className = 'cell-stack';
  const small = document.createElement('span');
  small.className = 'cell-stack__note u-muted';
  small.textContent = note;
  el.append(main, small);
  return el;
}
