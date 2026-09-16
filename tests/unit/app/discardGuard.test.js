import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import { discardGuard } from '../../../src/app/discardGuard.js';
import { textField } from '../../../src/ui/formFields.js';

const dom = installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('an untouched form closes at once', async () => {
  const name = textField({ id: 'n', label: 'Name', value: 'Kitchen' });
  const guard = discardGuard({ name });
  assert.equal(await guard(), true);
  assert.equal(dom.body.children.length, 0);
});

test('an edited form asks, and the answer decides', async () => {
  const name = textField({ id: 'n', label: 'Name', value: 'Kitchen' });
  const guard = discardGuard({ name });
  name.input.value = 'Pantry';
  const pending = guard();
  const ask = $(dom.body.children[0]);
  assert.equal(ask.children[0].children[0].textContent, 'Discard changes?');
  const [keep, discard] = ask.children[2].children;
  assert.equal(keep.textContent, 'Keep editing');
  assert.equal(discard.textContent, 'Discard');
  keep.click();
  assert.equal(await pending, false);
  const again = guard();
  $(dom.body.children[0]).children[2].children[1].click();
  assert.equal(await again, true);
  // Typing the old value back counts as no edit.
  name.input.value = 'Kitchen';
  assert.equal(await guard(), true);
});
