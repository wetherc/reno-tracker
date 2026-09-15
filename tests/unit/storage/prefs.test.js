import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  browserStorage,
  createPrefs,
  memoryStorage,
  PREFIX,
} from '../../../src/storage/prefs.js';

test('prefs read, write, and clear under the prefix', () => {
  const store = memoryStorage();
  const prefs = createPrefs(store);
  assert.equal(prefs.read('theme'), null);
  prefs.write('theme', 'dark');
  assert.equal(store.getItem(PREFIX + 'theme'), 'dark');
  assert.equal(prefs.read('theme'), 'dark');
  prefs.clear('theme');
  assert.equal(prefs.read('theme'), null);
});

test('prefs swallow storage errors', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  const prefs = createPrefs(broken);
  assert.equal(prefs.read('lastView'), null);
  prefs.write('lastView', 'gantt');
  prefs.clear('lastView');
});

test('browserStorage falls back to memory without localStorage', () => {
  const store = browserStorage();
  store.setItem('a', '1');
  assert.equal(store.getItem('a'), '1');
  store.removeItem('a');
  assert.equal(store.getItem('a'), null);
});

test('browserStorage uses localStorage when it is present', () => {
  const fake = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
  });
  try {
    assert.equal(browserStorage(), fake);
  } finally {
    // @ts-ignore test cleanup
    delete globalThis.localStorage;
  }
});

test('browserStorage falls back when localStorage throws', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('denied');
    },
    configurable: true,
  });
  try {
    const store = browserStorage();
    store.setItem('x', 'y');
    assert.equal(store.getItem('x'), 'y');
  } finally {
    // @ts-ignore test cleanup
    delete globalThis.localStorage;
  }
});
