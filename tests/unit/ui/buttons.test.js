import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  bareButton,
  button,
  chip,
  iconButton,
} from '../../../src/ui/buttons.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

test('button sets type, class, icon, title, and click', () => {
  let clicks = 0;
  const el = button({
    label: 'Save',
    variant: 'primary',
    icon: 'check',
    title: 'Save the item',
    onClick: () => clicks++,
  });
  assert.equal(el.type, 'button');
  assert.equal(el.className, 'btn btn--primary');
  assert.equal(el.title, 'Save the item');
  assert.equal(el.children[0].tagName, 'SVG');
  assert.equal(el.textContent, 'Save');
  el.click();
  assert.equal(clicks, 1);
});

test('button defaults and disabled state', () => {
  const el = button({ label: 'Plain', disabled: true });
  assert.equal(el.className, 'btn');
  assert.equal(el.disabled, true);
  const submit = button({ label: 'Go', type: 'submit' });
  assert.equal(submit.type, 'submit');
});

test('iconButton names itself after the label', () => {
  let clicks = 0;
  const el = iconButton({
    icon: 'trash',
    label: 'Delete',
    onClick: () => clicks++,
  });
  assert.equal(el.className, 'btn btn--icon');
  assert.equal(el.getAttribute('aria-label'), 'Delete');
  assert.equal(el.title, 'Delete');
  el.click();
  assert.equal(clicks, 1);
  const danger = iconButton({
    icon: 'trash',
    label: 'Delete',
    variant: 'danger',
  });
  assert.equal(danger.className, 'btn btn--icon btn--danger');
});

test('bareButton keeps the reset class and appends children', () => {
  const el = bareButton({
    label: 'Row',
    className: 'row-select',
    ariaLabel: 'Open row',
    children: ['!'],
  });
  assert.equal(el.className, 'btn-bare row-select');
  assert.equal(el.getAttribute('aria-label'), 'Open row');
  assert.equal(el.textContent, 'Row!');
  const plain = bareButton({ onClick: () => {} });
  assert.equal(plain.className, 'btn-bare');
  assert.equal(plain.textContent, '');
});

test('chip with and without a remove button', () => {
  let removed = 0;
  const el = chip('Plumber', { onRemove: () => removed++ });
  assert.equal(el.className, 'chip');
  const remove = el.children[0];
  assert.equal(remove.getAttribute('aria-label'), 'Remove Plumber');
  $(remove).click();
  assert.equal(removed, 1);
  assert.equal(chip('Tile').children.length, 0);
});
