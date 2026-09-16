import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { chartPicker } from '../../../src/app/chartPicker.js';

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
  const { layer, readout } = chartPicker({
    idle: 'Point at a mark',
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
      },
    ],
  });
  return { layer: $(layer), readout: $(readout), lit };
}

test('chartPicker lays one button per target and starts idle', () => {
  const { layer, readout } = setup();
  assert.equal(layer.getAttribute('role'), 'group');
  assert.equal(readout.getAttribute('role'), 'status');
  assert.equal(readout.textContent, 'Point at a mark');
  assert.equal(readout.className, 'chart-readout u-muted');
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

test('pointing at a target reads it out and lights its mark', () => {
  const { layer, readout, lit } = setup();
  const [dot, second] = layer.children;
  dot.dispatchEvent({ type: 'pointerenter' });
  assert.equal(readout.textContent, 'First');
  assert.equal(readout.className, 'chart-readout');
  assert.deepEqual(lit, ['a on']);
  dot.dispatchEvent({ type: 'pointerenter' });
  assert.deepEqual(lit, ['a on']);
  dot.dispatchEvent({ type: 'pointerleave' });
  assert.equal(readout.textContent, 'Point at a mark');
  assert.deepEqual(lit, ['a on', 'a off']);
  // A focused target stays picked when the pointer leaves it.
  second.focus();
  second.dispatchEvent({ type: 'focus' });
  second.dispatchEvent({ type: 'pointerleave' });
  assert.equal(readout.textContent, 'Second');
  second.dispatchEvent({ type: 'blur' });
  assert.equal(readout.textContent, 'Point at a mark');
});

test('the arrow keys move between targets and Home and End jump', () => {
  const { layer, readout, lit } = setup();
  const [first, second, third] = layer.children;
  first.focus();
  first.dispatchEvent({ type: 'focus' });
  /** @param {any} el @param {string} key */
  const press = (el, key) => el.dispatchEvent({ type: 'keydown', key });
  assert.equal(press(first, 'ArrowRight'), false);
  assert.equal(dom.activeElement, second);
  assert.equal(readout.textContent, 'Second');
  assert.equal(press(second, 'End'), false);
  assert.equal(dom.activeElement, third);
  assert.equal(readout.textContent, 'Third');
  assert.equal(press(third, 'ArrowRight'), true);
  assert.equal(dom.activeElement, third);
  assert.equal(press(third, 'Home'), false);
  assert.equal(dom.activeElement, first);
  assert.equal(press(first, 'ArrowLeft'), true);
  assert.equal(press(first, 'Enter'), true);
  assert.deepEqual(lit, ['a on', 'a off', 'c on', 'c off', 'a on']);
});
