import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { chartPicker, tipPlacement } from '../../../src/app/chartPicker.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

function setup() {
  /** @type {string[]} */
  const lit = [];
  /** @param {string} name */
  const highlight = (name) => (/** @type {boolean} */ on) => {
    lit.push(`${name} ${on ? 'on' : 'off'}`);
  };
  const layer = chartPicker({
    targets: [
      { text: 'First', left: 10, top: 20, highlight: highlight('a') },
      { text: 'Second', left: 50, top: 30 },
      {
        text: 'Third',
        left: 60,
        top: 5,
        width: 20,
        height: 80,
        highlight: highlight('c'),
        anchor: { left: 90, top: 40 },
        detail: () => {
          const el = document.createElement('p');
          el.textContent = 'Third in full';
          return el;
        },
      },
    ],
  });
  return { layer: $(layer), lit };
}

test('chartPicker lays one button per target', () => {
  const { layer } = setup();
  assert.equal(layer.getAttribute('role'), 'group');
  const [dot, , column] = layer.children;
  assert.equal(dot.className, 'btn-bare chart-picker__target');
  assert.equal(dot.getAttribute('aria-label'), 'First');
  assert.deepEqual([dot.style.left, dot.style.top], ['10%', '20%']);
  assert.equal(dot.style.width, undefined);
  assert.equal(
    column.className,
    'btn-bare chart-picker__target chart-picker__target--column',
  );
  assert.deepEqual(
    [
      column.style.left,
      column.style.top,
      column.style.width,
      column.style.height,
    ],
    ['60%', '5%', '20%', '80%'],
  );
});

test('pointing at a target lights its mark until the pointer leaves', () => {
  const { layer, lit } = setup();
  const [dot, , column] = layer.children;
  dot.dispatchEvent({ type: 'pointerenter' });
  assert.deepEqual(lit, ['a on']);
  dot.dispatchEvent({ type: 'pointerenter' });
  assert.deepEqual(lit, ['a on']);
  dot.dispatchEvent({ type: 'pointerleave' });
  assert.deepEqual(lit, ['a on', 'a off']);
  // A focused target stays picked when the pointer leaves it.
  column.focus();
  column.dispatchEvent({ type: 'focus' });
  column.dispatchEvent({ type: 'pointerleave' });
  assert.deepEqual(lit, ['a on', 'a off', 'c on']);
  column.dispatchEvent({ type: 'blur' });
  assert.deepEqual(lit, ['a on', 'a off', 'c on', 'c off']);
});

test('a target with a detail opens the callout at its anchor', () => {
  const { layer } = setup();
  const [dot, , column] = layer.children;
  const tip = layer.children[3];
  assert.equal(tip.hidden, true);
  assert.equal(tip.getAttribute('aria-hidden'), 'true');
  column.dispatchEvent({ type: 'pointerenter' });
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, 'Third in full');
  assert.deepEqual([tip.style.left, tip.style.top], ['90%', '40%']);
  assert.equal(tip.className, 'chart-tip chart-tip--above chart-tip--end');
  // A target with no detail closes it.
  dot.dispatchEvent({ type: 'pointerenter' });
  assert.equal(tip.hidden, true);
});

test('tipPlacement hangs the box from the side it is near', () => {
  assert.equal(
    tipPlacement({ left: 10 }, 'above'),
    'chart-tip chart-tip--above chart-tip--start',
  );
  assert.equal(
    tipPlacement({ left: 50 }, 'below'),
    'chart-tip chart-tip--below chart-tip--center',
  );
  assert.equal(
    tipPlacement({ left: 85 }, 'above'),
    'chart-tip chart-tip--above chart-tip--end',
  );
});

test('the arrow keys move between targets and Home and End jump', () => {
  const { layer, lit } = setup();
  const [first, second, third] = layer.children;
  first.focus();
  first.dispatchEvent({ type: 'focus' });
  /** @param {any} el @param {string} key */
  const press = (el, key) => el.dispatchEvent({ type: 'keydown', key });
  assert.equal(press(first, 'ArrowRight'), false);
  assert.equal(dom.activeElement, second);
  assert.equal(press(second, 'End'), false);
  assert.equal(dom.activeElement, third);
  assert.equal(press(third, 'ArrowRight'), true);
  assert.equal(dom.activeElement, third);
  assert.equal(press(third, 'Home'), false);
  assert.equal(dom.activeElement, first);
  assert.equal(press(first, 'ArrowLeft'), true);
  assert.equal(press(first, 'Enter'), true);
  assert.deepEqual(lit, ['a on', 'a off', 'c on', 'c off', 'a on']);
});
