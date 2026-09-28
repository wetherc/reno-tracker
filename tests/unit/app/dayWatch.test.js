import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_MS, watchDay } from '../../../src/app/dayWatch.js';

/** A document, a clock, and a timer that the test drives by hand. */
function rig(start = new Date(2026, 8, 28, 23, 59)) {
  let clock = start;
  /** @type {(() => void) | null} */
  let tick = null;
  /** @type {number | null} */
  let period = null;
  const doc = new EventTarget();
  const fake = Object.assign(doc, { visibilityState: 'visible' });
  const calls = { change: 0, stopped: 0 };
  const stop = watchDay(/** @type {any} */ (fake), () => (calls.change += 1), {
    now: () => clock,
    every: (fn, ms) => {
      tick = fn;
      period = ms;
      return () => (calls.stopped += 1);
    },
  });
  return {
    calls,
    stop,
    period: () => period,
    /** @param {Date} next */
    setClock: (next) => (clock = next),
    tick: () => tick?.(),
    /** @param {'visible' | 'hidden'} state */
    show(state) {
      fake.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('checks the date once a minute', () => {
  assert.equal(rig().period(), CHECK_MS);
  assert.equal(CHECK_MS, 60_000);
});

test('stays quiet while the date is the same', () => {
  const r = rig();
  r.setClock(new Date(2026, 8, 28, 23, 59, 59));
  r.tick();
  assert.equal(r.calls.change, 0);
});

test('calls once when the local date moves past midnight', () => {
  const r = rig();
  r.setClock(new Date(2026, 8, 29, 0, 0, 30));
  r.tick();
  r.tick();
  assert.equal(r.calls.change, 1);
  r.setClock(new Date(2026, 8, 30, 0, 1));
  r.tick();
  assert.equal(r.calls.change, 2);
});

test('checks when the tab shows again, not when it hides', () => {
  const r = rig();
  r.setClock(new Date(2026, 8, 29, 7, 0));
  r.show('hidden');
  assert.equal(r.calls.change, 0);
  r.show('visible');
  assert.equal(r.calls.change, 1);
});

test('stop ends the timer and the visibility check', () => {
  const r = rig();
  r.stop();
  assert.equal(r.calls.stopped, 1);
  r.setClock(new Date(2026, 8, 29, 7, 0));
  r.show('visible');
  assert.equal(r.calls.change, 0);
});

test('uses the real clock and timer by default', () => {
  const doc = /** @type {any} */ (
    Object.assign(new EventTarget(), { visibilityState: 'visible' })
  );
  let changes = 0;
  const stop = watchDay(doc, () => (changes += 1));
  doc.dispatchEvent(new Event('visibilitychange'));
  stop();
  assert.equal(changes, 0);
});
