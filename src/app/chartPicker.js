// Hover and keyboard targets over a chart. Each target is a button laid
// over one point or one column of the svg, placed by percentages so it
// scales with the figure. Pointing at or focusing a target puts its text
// in the readout line under the chart and turns the matching mark on.
// The arrow keys move between targets, Home and End jump to the ends.
// A target with a detail also opens a callout box beside its anchor. The
// box sits above the anchor and flips below it near the top of the
// figure, and it hangs from its left or right edge near the sides so
// it never leaves the figure.
import { bareButton } from '../ui/buttons.js';

/**
 * @typedef {object} PickTarget
 * @property {string} text what the readout says for this target
 * @property {number} left percent of the figure width
 * @property {number} top percent of the figure height
 * @property {number} [width] percent; a target with a width is a column
 * @property {number} [height] percent
 * @property {(on: boolean) => void} [highlight] turns the chart mark on or off
 * @property {() => HTMLElement} [detail] builds the callout contents
 * @property {{ left: number, top: number }} [anchor] where the callout
 * points, in percent; the target's own left and top when absent
 */

/** Anchors inside this percent of a side hang the callout from that side. */
const SIDE = 18;

/**
 * The classes that place a callout for an anchor.
 * @param {{ left: number }} anchor percent
 * @param {'above' | 'below'} vertical
 * @returns {string}
 */
export function tipPlacement({ left }, vertical) {
  const side = left < SIDE ? 'start' : left > 100 - SIDE ? 'end' : 'center';
  return `chart-tip chart-tip--${vertical} chart-tip--${side}`;
}

/**
 * Whether the element sits inside the frame top to bottom. True when
 * the DOM cannot measure, so a test without layout keeps the default.
 * @param {HTMLElement} el
 * @param {HTMLElement} frame
 */
function fitsIn(el, frame) {
  if (typeof el.getBoundingClientRect !== 'function') return true;
  const box = el.getBoundingClientRect();
  const bound = frame.getBoundingClientRect();
  return box.top >= bound.top && box.bottom <= bound.bottom;
}

const STEP = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * @param {{ targets: PickTarget[], idle: string }} config idle is the
 * readout text while nothing is picked
 * @returns {{ layer: HTMLDivElement, readout: HTMLParagraphElement }}
 */
export function chartPicker({ targets, idle }) {
  const readout = document.createElement('p');
  readout.className = 'chart-readout u-muted';
  readout.setAttribute('role', 'status');
  readout.textContent = idle;

  const layer = document.createElement('div');
  layer.className = 'chart-picker';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Points on the chart');

  // The button's aria-label already says everything the box shows.
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;

  /** @type {PickTarget | null} */
  let picked = null;

  /** @param {PickTarget | null} target */
  function pick(target) {
    if (picked === target) return;
    picked?.highlight?.(false);
    picked = target;
    picked?.highlight?.(true);
    readout.textContent = target ? target.text : idle;
    readout.classList.toggle('u-muted', target === null);
    readout.classList.toggle('chart-readout--picked', target !== null);
    tip.hidden = !target?.detail;
    if (!target?.detail) return;
    const anchor = target.anchor ?? { left: target.left, top: target.top };
    tip.style.left = `${anchor.left}%`;
    tip.style.top = `${anchor.top}%`;
    tip.replaceChildren(target.detail());
    // Above the anchor, unless only below fits inside the figure. The
    // scroll box around the figure clips whatever hangs past it.
    tip.className = tipPlacement(anchor, 'above');
    if (fitsIn(tip, layer)) return;
    tip.className = tipPlacement(anchor, 'below');
    if (!fitsIn(tip, layer)) tip.className = tipPlacement(anchor, 'above');
  }

  const buttons = targets.map((target, i) => {
    const column = target.width !== undefined;
    const el = bareButton({
      className: column
        ? 'chart-picker__target chart-picker__target--column'
        : 'chart-picker__target',
      ariaLabel: target.text,
    });
    el.style.left = `${target.left}%`;
    el.style.top = `${target.top}%`;
    if (column) {
      el.style.width = `${target.width}%`;
      el.style.height = `${target.height ?? 0}%`;
    }
    el.addEventListener('pointerenter', () => pick(target));
    el.addEventListener('pointerleave', () => {
      if (document.activeElement !== el) pick(null);
    });
    el.addEventListener('focus', () => pick(target));
    el.addEventListener('blur', () => pick(null));
    el.addEventListener('keydown', (event) => {
      const step = STEP[/** @type {keyof typeof STEP} */ (event.key)];
      const to =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : step
              ? i + step
              : -1;
      if (to < 0 || to >= buttons.length) return;
      event.preventDefault();
      // A plain focus() scrolls the page to a target that sits at the
      // viewport edge, the pointer then leaves the target it was on, and
      // pointerleave clears the pick. The next target is always beside a
      // visible one, so the focus moves without a scroll.
      buttons[to].focus({ preventScroll: true });
      pick(targets[to]);
    });
    return el;
  });
  layer.append(...buttons, tip);
  return { layer, readout };
}
