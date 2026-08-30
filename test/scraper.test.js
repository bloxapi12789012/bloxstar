import assert from 'node:assert/strict';
import test from 'node:test';

import { requestItem, scrapeRange } from '../src/scraper.js';

const baseConfig = {
  minItemId: 1,
  maxItemId: 4,
  concurrency: 4,
  requestDelayMs: 0,
  jitterMs: 0,
  requestTimeoutMs: 1_000,
  maxRetries: 2,
  retryBaseDelayMs: 1,
  maxRetryDelayMs: 100,
  progressEvery: 0,
  baseUrl: 'https://example.test/item',
  userAgent: 'test-agent',
};

function itemPage(itemId, value = itemId * 100) {
  const payload = JSON.stringify({
    initialItem: {
      itemId,
      gameId: 'baddies',
      itemName: `Item ${itemId}`,
      value,
      tokenValue: value,
      rap: value,
      demand: 'Normal',
      trend: 'Stable',
    },
    initialChartData: [],
  });
  const escapedPayload = JSON.stringify(payload).slice(1, -1);
  return `<script>"${escapedPayload}"</script>`;
}

function response(status, body = '') {
  return new Response(body, { status, statusText: status === 404 ? 'Not Found' : undefined });
}

const silentLogger = { log() {}, warn() {}, error() {} };
const noSleep = async () => {};

test('404 is classified as nonexistent and is not retried', async () => {
  let calls = 0;
  const result = await requestItem(9, baseConfig, {
    fetchImpl: async () => {
      calls += 1;
      return response(404);
    },
    sleep: noSleep,
  });

  assert.equal(result.kind, 'nonexistent');
  assert.equal(calls, 1);
});

test('temporary statuses retry with exponential delays', async () => {
  const statuses = [429, 503, 200];
  const delays = [];
  const result = await requestItem(1, baseConfig, {
    fetchImpl: async () => response(statuses.shift(), itemPage(1)),
    sleep: async (milliseconds) => delays.push(milliseconds),
    random: () => 0,
  });

  assert.equal(result.kind, 'valid');
  assert.equal(result.attempts, 3);
  assert.deepEqual(delays, [1, 2]);
});

test('range scan separates valid, nonexistent, invalid, and failed results', async () => {
  const result = await scrapeRange(baseConfig, {
    logger: silentLogger,
    sleep: noSleep,
    random: () => 0,
    fetchImpl: async (url) => {
      const itemId = Number(new URL(url).pathname.split('/').pop());
      if (itemId === 1) return response(200, itemPage(1, 100));
      if (itemId === 2) return response(404);
      if (itemId === 3) return response(200, '<html>invalid</html>');
      return response(403);
    },
  });

  assert.deepEqual(result.items.map((item) => item.itemId), [1]);
  assert.deepEqual(result.summary, {
    ...result.summary,
    minItemId: 1,
    maxItemId: 4,
    totalIdsScanned: 4,
    validItems: 1,
    nonexistentIds: 1,
    invalidItemPages: 1,
    failedRequests: 1,
    itemsWithValues: 1,
    itemsWithoutValues: 0,
  });
  assert.equal(result.invalidItems[0].itemId, 3);
  assert.equal(result.failedRequests[0].itemId, 4);
});
