import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShimElement } from '../domShim.js';
import {
  exportFileName,
  parseExportFile,
  pickJsonFile,
  saveJson,
} from '../../../src/storage/exportFile.js';

function fakeDoc() {
  const body = new ShimElement('body');
  /** @type {ShimElement[]} */
  const made = [];
  return {
    body,
    made,
    /** @param {string} tag */
    createElement(tag) {
      const el = /** @type {any} */ (new ShimElement(tag));
      el.files = [];
      el.accept = '';
      made.push(el);
      return el;
    },
  };
}

test('exportFileName slugs the project name and adds the export day', () => {
  assert.equal(
    exportFileName('Kitchen remodel', '2026-09-15T10:00:00.000Z'),
    'kitchen-remodel-2026-09-15.json',
  );
  assert.equal(
    exportFileName('  Back Deck / Stairs!! ', '2027-01-02T00:00:00.000Z'),
    'back-deck-stairs-2027-01-02.json',
  );
  assert.equal(
    exportFileName('***', '2026-01-01T00:00:00.000Z'),
    'project-2026-01-01.json',
  );
});

test('saveJson clicks a hidden download link and revokes the URL', () => {
  const doc = fakeDoc();
  /** @type {string[]} */
  const log = [];
  /** @type {Blob} */
  let blob = new Blob([]);
  const urls = {
    /** @param {Blob} b */
    createObjectURL(b) {
      blob = b;
      log.push('create');
      return 'blob:fake';
    },
    /** @param {string} href */
    revokeObjectURL(href) {
      log.push(`revoke ${href}`);
    },
  };
  let clicked = false;
  const [link] = [doc.createElement('a')];
  doc.made.length = 0;
  doc.createElement = () => {
    link.addEventListener('click', () => {
      clicked = doc.body.children[0] === link;
    });
    return link;
  };
  saveJson('demo.json', { a: 1 }, { doc: /** @type {any} */ (doc), urls });
  assert.equal(link.href, 'blob:fake');
  assert.equal(link.download, 'demo.json');
  assert.equal(link.hidden, true);
  assert.equal(clicked, true);
  assert.equal(doc.body.children.length, 0);
  assert.deepEqual(log, ['create', 'revoke blob:fake']);
  assert.equal(blob.type, 'application/json');
  return blob.text().then((text) => assert.equal(text, '{\n  "a": 1\n}'));
});

test('pickJsonFile resolves to the chosen file and removes the input', async () => {
  const doc = fakeDoc();
  const pending = pickJsonFile({ doc: /** @type {any} */ (doc) });
  const input = /** @type {any} */ (doc.made[0]);
  assert.equal(input.type, 'file');
  assert.equal(input.accept, '.json,application/json');
  assert.equal(doc.body.children[0], input);
  const file = { name: 'x.json' };
  input.files = [file];
  input.dispatchEvent({ type: 'change' });
  assert.equal(await pending, file);
  assert.equal(doc.body.children.length, 0);
});

test('pickJsonFile resolves to null on cancel or an empty change', async () => {
  let doc = fakeDoc();
  let pending = pickJsonFile({ doc: /** @type {any} */ (doc) });
  doc.made[0].dispatchEvent({ type: 'cancel' });
  assert.equal(await pending, null);

  doc = fakeDoc();
  pending = pickJsonFile({ doc: /** @type {any} */ (doc) });
  /** @type {any} */ (doc.made[0]).files = undefined;
  doc.made[0].dispatchEvent({ type: 'change' });
  assert.equal(await pending, null);
});

test('parseExportFile returns the parsed file or names the bad file', () => {
  assert.deepEqual(parseExportFile('{"format":"reno-tracker/1"}', 'a.json'), {
    format: 'reno-tracker/1',
  });
  assert.throws(() => parseExportFile('nope', 'notes.txt'), {
    message: 'notes.txt is not a JSON file this app can read.',
  });
});
