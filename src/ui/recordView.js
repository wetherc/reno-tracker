// A read-only dialog for one saved record. It lists key facts as label
// and value rows, plus any tables the caller adds, and offers an Edit
// button that opens the editor. The body draws again each time the data
// changes, and the dialog closes when the record is gone.
import { button } from './buttons.js';
import { modal } from './Modal.js';

/** @typedef {[label: string, value: Node | string]} Fact */

/**
 * A list of label and value rows.
 * @param {Fact[]} facts
 * @returns {HTMLDListElement}
 */
export function factList(facts) {
  const list = document.createElement('dl');
  list.className = 'record-view__facts';
  for (const [label, value] of facts) {
    const row = document.createElement('div');
    row.className = 'fact-line fact-line--row record-view__fact';
    const term = document.createElement('dt');
    term.className = 'fact-line__label';
    term.append(label);
    const detail = document.createElement('dd');
    detail.className = 'fact-line__value';
    detail.append(value);
    row.append(term, detail);
    list.append(row);
  }
  return list;
}

/**
 * @template T
 * @param {{
 *   title: (record: T) => string,
 *   find: () => T | null,
 *   render: (record: T) => Node[],
 *   subscribe: (redraw: () => void) => () => void,
 *   onEdit: (record: T) => void,
 *   actions?: (record: T, close: () => void) => HTMLElement[],
 * }} config find returns null once the record is gone; actions adds
 * buttons before Edit
 * @returns {import('./Modal.js').ModalHandle | null} null when the
 * record is already gone
 */
export function openRecordView({
  title,
  find,
  render,
  subscribe,
  onEdit,
  actions,
}) {
  let record = find();
  if (record === null) return null;
  const footer = document.createElement('div');
  footer.className = 'record-view__actions';
  const dialog = modal({
    title: title(record),
    body: [],
    actions: [footer],
    onClose: () => {
      unsubscribe();
      dialog.el.remove();
    },
  });
  dialog.el.classList.add('record-view');
  const heading = /** @type {HTMLElement} */ (
    dialog.el.querySelector('.modal__title')
  );

  /** @param {T} current */
  function draw(current) {
    heading.textContent = title(current);
    dialog.body.replaceChildren(...render(current));
    const close = () => dialog.close();
    footer.replaceChildren(
      ...(actions?.(current, close) ?? []),
      button({
        label: 'Edit',
        icon: 'pencil',
        variant: 'primary',
        onClick: () => {
          close();
          onEdit(current);
        },
      }),
    );
  }

  const unsubscribe = subscribe(() => {
    record = find();
    if (record === null) dialog.close();
    else draw(record);
  });
  draw(record);
  document.body.append(dialog.el);
  dialog.open();
  return dialog;
}
