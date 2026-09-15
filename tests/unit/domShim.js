// A tiny DOM for unit tests of the UI builders. It implements the calls
// the builders make and nothing more. Tests assert on attributes and
// structure, never on layout.

export class ShimElement {
  /**
   * @param {string} tagName
   * @param {string} [namespace]
   */
  constructor(tagName, namespace) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = namespace ?? 'http://www.w3.org/1999/xhtml';
    /** @type {Map<string, string>} */
    this.attributes = new Map();
    /** @type {(ShimElement | ShimText)[]} */
    this.childNodes = [];
    /** @type {ShimElement | null} */
    this.parentNode = null;
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** @type {Record<string, string>} */
    this.style = {};
    /** @type {Record<string, string>} */
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.value = '';
    this.checked = false;
    this.selected = false;
    /** @type {string | null} */
    this.returnValue = null;
    const self = this;
    this.classList = {
      /** @param {...string} names */
      add(...names) {
        const set = self.classSet();
        names.forEach((n) => set.add(n));
        self.writeClass(set);
      },
      /** @param {...string} names */
      remove(...names) {
        const set = self.classSet();
        names.forEach((n) => set.delete(n));
        self.writeClass(set);
      },
      /** @param {string} name @param {boolean} [force] */
      toggle(name, force) {
        const set = self.classSet();
        const on = force ?? !set.has(name);
        if (on) set.add(name);
        else set.delete(name);
        self.writeClass(set);
        return on;
      },
      /** @param {string} name */
      contains(name) {
        return self.classSet().has(name);
      },
    };
  }

  classSet() {
    return new Set(
      (this.attributes.get('class') ?? '').split(/\s+/).filter(Boolean),
    );
  }

  /** @param {Set<string>} set */
  writeClass(set) {
    this.attributes.set('class', [...set].join(' '));
  }

  get className() {
    return this.attributes.get('class') ?? '';
  }
  set className(value) {
    this.attributes.set('class', value);
  }
  get id() {
    return this.attributes.get('id') ?? '';
  }
  set id(value) {
    this.attributes.set('id', value);
  }
  get type() {
    return this.attributes.get('type') ?? '';
  }
  set type(value) {
    this.attributes.set('type', value);
  }
  get title() {
    return this.attributes.get('title') ?? '';
  }
  set title(value) {
    this.attributes.set('title', value);
  }
  get htmlFor() {
    return this.attributes.get('for') ?? '';
  }
  set htmlFor(value) {
    this.attributes.set('for', value);
  }
  get href() {
    return this.attributes.get('href') ?? '';
  }
  set href(value) {
    this.attributes.set('href', value);
  }
  get placeholder() {
    return this.attributes.get('placeholder') ?? '';
  }
  set placeholder(value) {
    this.attributes.set('placeholder', value);
  }
  get required() {
    return this.attributes.has('required');
  }
  set required(value) {
    if (value) this.attributes.set('required', '');
    else this.attributes.delete('required');
  }
  get download() {
    return this.attributes.get('download') ?? '';
  }
  set download(value) {
    this.attributes.set('download', value);
  }

  /** @param {string} name @param {string} value */
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  /** @param {string} name */
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  /** @param {string} name */
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  /** @param {string} name */
  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get children() {
    return this.childNodes.filter((n) => n instanceof ShimElement);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }

  /** @param {...(ShimElement | ShimText | string)} nodes */
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new ShimText(node) : node;
      child.remove();
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }
  /** @param {ShimElement | ShimText} node */
  appendChild(node) {
    this.append(node);
    return node;
  }
  /** @param {...(ShimElement | ShimText | string)} nodes */
  prepend(...nodes) {
    const rest = this.childNodes;
    this.childNodes = [];
    this.append(...nodes);
    this.childNodes.push(...rest);
  }
  /** @param {...(ShimElement | ShimText | string)} nodes */
  replaceChildren(...nodes) {
    this.childNodes.forEach((n) => (n.parentNode = null));
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  /**
   * @param {ShimElement} node
   * @returns {boolean}
   */
  contains(node) {
    if (node === this) return true;
    return this.children.some((c) => c.contains(node));
  }

  /** @returns {string} */
  get textContent() {
    return this.childNodes.map((n) => String(n.textContent)).join('');
  }
  set textContent(value) {
    this.replaceChildren(value === '' ? new ShimText('') : String(value));
  }

  /** @param {string} type @param {Function} fn */
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }
  /** @param {string} type @param {Function} fn */
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  /**
   * @param {{ type: string, [k: string]: unknown }} event
   * @returns {boolean} false when a listener called preventDefault
   */
  dispatchEvent(event) {
    let prevented = false;
    const full = {
      target: this,
      currentTarget: this,
      preventDefault: () => (prevented = true),
      stopPropagation: () => {},
      ...event,
    };
    if (!('target' in event)) full.target = this;
    for (const fn of this.listeners.get(event.type) ?? []) fn(full);
    return !prevented;
  }
  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click' });
  }
  focus() {
    shimDocument.activeElement = this;
  }
  blur() {
    if (shimDocument.activeElement === this) shimDocument.activeElement = null;
  }
  showModal() {
    this.open = true;
  }
  /** @param {string} [value] */
  close(value) {
    if (!this.open) return;
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent({ type: 'close' });
  }

  /**
   * Finds descendants by a simple selector: `tag`, `.class`, `#id`, or
   * `[attr="value"]`. One compound selector, no combinators.
   * @param {string} selector
   * @returns {ShimElement[]}
   */
  querySelectorAll(selector) {
    /** @type {ShimElement[]} */
    const out = [];
    const walk = (/** @type {ShimElement} */ el) => {
      for (const child of el.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  /** @param {string} selector */
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  /** @param {string} selector */
  matches(selector) {
    const m = /^([a-z]*)?(#[\w-]+)?((?:\.[\w-]+)*)(\[[^\]]+\])?$/i.exec(
      selector,
    );
    if (!m) throw new Error(`Shim cannot match "${selector}"`);
    const [, tag, id, classes, attr] = m;
    if (tag && tag.toUpperCase() !== this.tagName) return false;
    if (id && this.id !== id.slice(1)) return false;
    if (classes) {
      for (const c of classes.split('.').filter(Boolean)) {
        if (!this.classList.contains(c)) return false;
      }
    }
    if (attr) {
      const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(attr);
      if (!a) return false;
      if (!this.attributes.has(a[1])) return false;
      if (a[2] !== undefined && this.attributes.get(a[1]) !== a[2])
        return false;
    }
    return true;
  }
}

export class ShimText {
  /** @param {string} text */
  constructor(text) {
    this.textContent = text;
    /** @type {ShimElement | null} */
    this.parentNode = null;
  }
  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
}

const shimDocument = {
  /** @type {ShimElement | null} */
  activeElement: null,
  documentElement: new ShimElement('html'),
  body: new ShimElement('body'),
  /** @param {string} tag */
  createElement: (tag) => new ShimElement(tag),
  /** @param {string} ns @param {string} tag */
  createElementNS: (ns, tag) => new ShimElement(tag, ns),
  /** @param {string} text */
  createTextNode: (text) => new ShimText(text),
  /** @param {string} id */
  getElementById(id) {
    return shimDocument.body.querySelector(`#${id}`);
  },
};

/**
 * Installs the shim as globalThis.document and resets it. Call at the top
 * of every UI test file.
 */
export function installDom() {
  shimDocument.body = new ShimElement('body');
  shimDocument.documentElement = new ShimElement('html');
  shimDocument.documentElement.append(shimDocument.body);
  shimDocument.activeElement = null;
  Object.defineProperty(globalThis, 'document', {
    value: shimDocument,
    configurable: true,
    writable: true,
  });
  return shimDocument;
}

/**
 * Shorthand for firing a keyboard event.
 * @param {ShimElement} el
 * @param {string} key
 * @param {Record<string, unknown>} [extra]
 */
export function press(el, key, extra = {}) {
  return el.dispatchEvent({ type: 'keydown', key, ...extra });
}
