import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_MAX_ITEM_ID, MIN_ITEM_ID, loadConfig } from '../src/config.js';

test('defaults to the complete 1-2856 range', () => {
  const config = loadConfig({}, process.cwd());
  assert.equal(config.minItemId, MIN_ITEM_ID);
  assert.equal(config.maxItemId, DEFAULT_MAX_ITEM_ID);
  assert.equal(config.concurrency, 4);
});

test('MAX_ITEM_ID overrides the inclusive maximum', () => {
  const config = loadConfig({ MAX_ITEM_ID: '3000' }, process.cwd());
  assert.equal(config.maxItemId, 3000);
});

test('an empty workflow input falls back to the configured default', () => {
  const config = loadConfig({ MAX_ITEM_ID: '' }, process.cwd());
  assert.equal(config.maxItemId, DEFAULT_MAX_ITEM_ID);
});

test('rejects a maximum below the configured minimum', () => {
  assert.throws(
    () => loadConfig({ MIN_ITEM_ID: '10', MAX_ITEM_ID: '9' }, process.cwd()),
    /MAX_ITEM_ID must be an integer/,
  );
});
