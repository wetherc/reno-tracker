// Hover and keyboard targets over a chart. Each target is a button laid
// over one point or one column of the svg, placed by percentages so it
// scales with the figure. Pointing at or focusing a target puts its text
// in the readout line under the chart and turns the matching mark on.
// The arrow keys move between targets, Home and End jump to the ends.
import { bareButton } from '../ui/buttons.js';

/**
 * @typedef {object} PickTarget
 * @property {string} text what the readout says for this target
 * @property {number} left percent of the figure width
 * @property {number} top percent of the figure height
 * @property {number} [width] percent; a target with a width is a column
 * @property {number} [height] percent
 * @property {(on: boolean) => void} [highlight] turns the chart mark on or off
 */

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
  layer.append(...buttons);
  return { layer, readout };
}
