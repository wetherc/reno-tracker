import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../domShim.js';
import {
  changesPanel,
  showValue,
  varianceList,
} from '../../../src/app/varianceList.js';
import { ApiError } from '../../../src/api/errors.js';

installDom();

/** @param {unknown} el */
const $ = (el) => /** @type {any} */ (el);

/**
 * @param {string} id
 * @param {Partial<import('../../../src/types.ts').Variance>} extra
 * @returns {import('../../../src/types.ts').Variance}
 */
const v = (id, extra) => ({
  id,
  scheduleItemId: 'a',
  kind: 'dates',
  field: 'endDate',
  oldValue: '2026-10-03',
  newValue: '2026-10-08',
  reason: '',
  loggedAt: '2026-09-15T12:00:00Z',
  ...extra,
});

test('showValue formats by field', () => {
  assert.equal(showValue('estimatedCents', '125000'), '$1,250.00');
  assert.equal(showValue('markupBasisPoints', '2500'), '25%');
  assert.equal(showValue('markupBasisPoints', null), 'project rate');
  assert.equal(showValue('actualCents', null), 'blank');
  assert.equal(showValue('startDate', '2026-10-01'), 'Oct 1, 2026');
  assert.equal(showValue('title', 'Demo'), 'Demo');
  assert.equal(showValue('description', ''), 'blank');
});

test('an empty log shows an empty state', () => {
  const el = varianceList([]);
  assert.equal(el.className, 'empty-state u-muted');
});

test('entries are newest first with old, new, and reason', () => {
  const el = varianceList([
    v('1', { loggedAt: '2026-09-14T10:00:00Z' }),
    v('2', {
      loggedAt: '2026-09-15T10:00:00Z',
      kind: 'cost',
      field: 'actualCents',
      oldValue: null,
      newValue: '99900',
      reason: 'Final invoice',
    }),
  ]);
  assert.equal(el.tagName, 'OL');
  assert.equal(el.getAttribute('aria-label'), 'Changes');
  const [first, second] = $(el).children;
  assert.equal(first.children[0].tagName, 'TIME');
  assert.equal(
    first.children[0].getAttribute('datetime'),
    '2026-09-15T10:00:00Z',
  );
  const change = first.children[1];
  assert.equal(change.children[0].textContent, 'Raw actual');
  assert.equal(change.children[1].tagName, 'S');
  assert.equal(change.children[1].textContent, 'from blank');
  assert.equal(change.children[2].textContent, 'to $999.00');
  assert.equal(first.children[2].textContent, 'Final invoice');
  assert.equal(second.children.length, 2);
  assert.equal(second.children[1].children[0].textContent, 'End');
  assert.equal(second.children[1].children[2].textContent, 'to Oct 8, 2026');
});

test('changesPanel shows the fetched rows, drops an overtaken load, and names a failure', async () => {
  /** @type {((rows: any) => void)[]} */
  const waiting = [];
  /** @type {any} */
  const api = {
    listChanges: (/** @type {string} */ id) => {
      assert.equal(id, 'a');
      return new Promise((r) => waiting.push(r));
    },
  };
  const panel = changesPanel({ ctx: { api }, itemId: 'a' });
  const el = $(panel.el);
  const first = panel.load();
  assert.equal(el.textContent, 'Loading changes');
  const second = panel.load();
  waiting[1]([v('new', { loggedAt: '2026-09-16T12:00:00Z' })]);
  await second;
  waiting[0]([]);
  await first;
  assert.equal(el.querySelectorAll('.variance-entry').length, 1);

  api.listChanges = async () => {
    throw new ApiError(404, { error: 'No schedule item with id a' });
  };
  await panel.load();
  assert.equal(
    el.textContent,
    'The changes could not be loaded. No schedule item with id a',
  );
});
