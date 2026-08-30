import assert from 'node:assert/strict';
import test from 'node:test';

import { parseItemPage } from '../src/parser.js';

function escapedPage(item) {
  const payload = JSON.stringify({ initialItem: item, initialChartData: [] });
  const escapedPayload = JSON.stringify(payload).slice(1, -1);
  return `<html><body><script>self.__next_f.push([1,"${escapedPayload}"])</script></body></html>`;
}

const validItem = {
  id: 'internal-id',
  itemId: 1,
  gameId: 'baddies',
  itemName: 'Loveboard',
  value: 18000,
  tokenValue: 13000,
  rap: 10850,
  demand: 'High',
  trend: 'Raising',
};

test('extracts only the requested fields from an escaped Next.js payload', () => {
  const result = parseItemPage(escapedPage(validItem), 1);

  assert.deepEqual(result, {
    ok: true,
    item: {
      itemId: 1,
      itemName: 'Loveboard',
      value: 18000,
      tokenValue: 13000,
      rap: 10850,
      demand: 'High',
      trend: 'Raising',
    },
  });
});

test('preserves legitimate null value fields', () => {
  const result = parseItemPage(escapedPage({
    ...validItem,
    value: null,
    tokenValue: null,
    rap: null,
    demand: null,
    trend: null,
  }), 1);

  assert.equal(result.ok, true);
  assert.equal(result.item.value, null);
  assert.equal(result.item.tokenValue, null);
});

test('supports an unescaped initialItem representation', () => {
  const html = `<script type="application/json">${JSON.stringify({ initialItem: validItem })}</script>`;
  assert.equal(parseItemPage(html, 1).ok, true);
});

test('rejects a response with a mismatched item ID', () => {
  const result = parseItemPage(escapedPage(validItem), 2);
  assert.equal(result.ok, false);
  assert.match(result.reason, /itemId mismatch/);
});

test('rejects a page without item data', () => {
  assert.deepEqual(parseItemPage('<html><h1>Not an item</h1></html>', 1), {
    ok: false,
    reason: 'initialItem data not found',
  });
});
