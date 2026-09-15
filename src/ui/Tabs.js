// A tab strip over a stack of panels. Only the selected panel is shown.
// Arrow keys, Home, and End move between tabs.

/**
 * @typedef {{ id: string, label: string, panel: HTMLElement }} TabItem
 */

/**
 * @typedef {{
 *   el: HTMLDivElement,
 *   readonly current: string,
 *   select(id: string): void,
 * }} TabsHandle
 */

/**
 * @param {{ id: string, items: TabItem[], selected?: string, onChange?: (id: string) => void }} config
 * @returns {TabsHandle}
 */
export function tabs({ id, items, selected = items[0]?.id, onChange }) {
  const el = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'tabs';
  list.setAttribute('role', 'tablist');
  el.append(list);
  let current = selected;

  const buttons = items.map((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabs__tab';
    btn.id = `${id}-tab-${item.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `${id}-panel-${item.id}`);
    btn.append(item.label);
    btn.addEventListener('click', () => select(item.id));
    btn.addEventListener('keydown', (event) => {
      /** @type {number | null} */
      let target = null;
      if (event.key === 'ArrowRight') target = (index + 1) % items.length;
      else if (event.key === 'ArrowLeft') {
        target = (index - 1 + items.length) % items.length;
      } else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = items.length - 1;
      if (target === null) return;
      event.preventDefault();
      select(items[target].id);
      buttons[target].focus();
    });
    list.append(btn);

    item.panel.id = `${id}-panel-${item.id}`;
    item.panel.classList.add('tabs__panel');
    item.panel.setAttribute('role', 'tabpanel');
    item.panel.setAttribute('aria-labelledby', btn.id);
    item.panel.tabIndex = 0;
    el.append(item.panel);
    return btn;
  });

  /** @param {string} next */
  function select(next) {
    const changed = next !== current;
    current = next;
    items.forEach((item, i) => {
      const on = item.id === current;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      item.panel.hidden = !on;
    });
    if (changed) onChange?.(current);
  }

  select(current);
  return {
    el,
    get current() {
      return current;
    },
    select,
  };
}
