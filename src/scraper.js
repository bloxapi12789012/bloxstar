import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseItemPage } from './parser.js';

export const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function randomInteger(maxExclusive, random = Math.random) {
  return maxExclusive > 0 ? Math.floor(random() * maxExclusive) : 0;
}

function retryAfterMilliseconds(response, now = Date.now()) {
  const value = response.headers.get('retry-after');
  if (!value) {
    return 0;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
}

function retryDelayMilliseconds(response, attempt, config, random) {
  const exponentialDelay = config.retryBaseDelayMs * (2 ** attempt);
  const jitter = randomInteger(Math.max(1, Math.floor(exponentialDelay / 4) + 1), random);
  const retryAfter = response ? retryAfterMilliseconds(response) : 0;
  return Math.min(config.maxRetryDelayMs, Math.max(exponentialDelay + jitter, retryAfter));
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestItem(itemId, config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const sleep = dependencies.sleep || defaultSleep;
  const random = dependencies.random || Math.random;
  const onRetry = dependencies.onRetry || (() => {});
  const url = `${config.baseUrl.replace(/\/$/, '')}/${itemId}`;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    let response;

    try {
      response = await fetchWithTimeout(
        url,
        {
          redirect: 'follow',
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': config.userAgent,
          },
        },
        config.requestTimeoutMs,
        fetchImpl,
      );

      if (response.status === 404) {
        return { kind: 'nonexistent', itemId, attempts: attempt + 1 };
      }

      if (response.ok) {
        const parsed = parseItemPage(await response.text(), itemId);
        return parsed.ok
          ? { kind: 'valid', itemId, item: parsed.item, attempts: attempt + 1 }
          : { kind: 'invalid', itemId, reason: parsed.reason, attempts: attempt + 1 };
      }

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === config.maxRetries) {
        return {
          kind: 'failed',
          itemId,
          status: response.status,
          error: `HTTP ${response.status} ${response.statusText}`.trim(),
          attempts: attempt + 1,
        };
      }
    } catch (error) {
      if (attempt === config.maxRetries) {
        return {
          kind: 'failed',
          itemId,
          status: null,
          error: error instanceof Error ? error.message : String(error),
          attempts: attempt + 1,
        };
      }
    }

    const delayMs = retryDelayMilliseconds(response, attempt, config, random);
    onRetry({ itemId, attempt: attempt + 1, status: response?.status ?? null, delayMs });
    await sleep(delayMs);
  }

  throw new Error('Unreachable retry state');
}

function elapsedSeconds(startedAt) {
  return Math.round((Date.now() - startedAt) / 100) / 10;
}

export async function scrapeRange(config, dependencies = {}) {
  const logger = dependencies.logger || console;
  const sleep = dependencies.sleep || defaultSleep;
  const random = dependencies.random || Math.random;
  const startedAt = Date.now();
  const totalIds = config.maxItemId - config.minItemId + 1;
  const items = [];
  const invalidItems = [];
  const failedRequests = [];
  let nonexistentIds = 0;
  let completed = 0;
  let nextItemId = config.minItemId;

  const takeNextItemId = () => {
    if (nextItemId > config.maxItemId) {
      return null;
    }
    const itemId = nextItemId;
    nextItemId += 1;
    return itemId;
  };

  const worker = async () => {
    for (;;) {
      const itemId = takeNextItemId();
      if (itemId === null) {
        return;
      }

      const result = await requestItem(itemId, config, {
        ...dependencies,
        sleep,
        random,
        onRetry: ({ attempt, status, delayMs }) => {
          logger.warn(
            `Retrying item ${itemId} after attempt ${attempt}`
              + `${status ? ` (HTTP ${status})` : ''} in ${delayMs}ms`,
          );
        },
      });

      if (result.kind === 'valid') {
        items.push(result.item);
      } else if (result.kind === 'nonexistent') {
        nonexistentIds += 1;
      } else if (result.kind === 'invalid') {
        invalidItems.push({ itemId, reason: result.reason });
        logger.warn(`Skipping invalid item ${itemId}: ${result.reason}`);
      } else {
        failedRequests.push({
          itemId,
          status: result.status,
          error: result.error,
          attempts: result.attempts,
        });
        logger.error(`Request failed for item ${itemId}: ${result.error}`);
      }

      completed += 1;
      if (config.progressEvery > 0 && (completed % config.progressEvery === 0 || completed === totalIds)) {
        logger.log(`Progress: ${completed}/${totalIds} IDs (${elapsedSeconds(startedAt)}s)`);
      }

      if (completed < totalIds) {
        await sleep(config.requestDelayMs + randomInteger(config.jitterMs + 1, random));
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(config.concurrency, totalIds) }, () => worker()));
  items.sort((left, right) => left.itemId - right.itemId);
  invalidItems.sort((left, right) => left.itemId - right.itemId);
  failedRequests.sort((left, right) => left.itemId - right.itemId);

  const itemsWithValues = items.filter((item) => item.value !== null).length;
  const completedAt = Date.now();
  const summary = {
    scanStartedAt: new Date(startedAt).toISOString(),
    scanCompletedAt: new Date(completedAt).toISOString(),
    elapsedSeconds: Math.round((completedAt - startedAt) / 100) / 10,
    minItemId: config.minItemId,
    maxItemId: config.maxItemId,
    totalIdsScanned: totalIds,
    validItems: items.length,
    nonexistentIds,
    invalidItemPages: invalidItems.length,
    failedRequests: failedRequests.length,
    itemsWithValues,
    itemsWithoutValues: items.length - itemsWithValues,
  };

  return { items, invalidItems, failedRequests, summary };
}

async function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function writeOutputs(result, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const invalidLog = result.invalidItems
    .map(({ itemId, reason }) => `${itemId}\t${reason}`)
    .join('\n');

  await Promise.all([
    atomicWrite(path.join(outputDir, 'baddies-items.json'), `${JSON.stringify(result.items, null, 2)}\n`),
    atomicWrite(path.join(outputDir, 'scan-summary.json'), `${JSON.stringify(result.summary, null, 2)}\n`),
    atomicWrite(path.join(outputDir, 'invalid-item-ids.log'), invalidLog ? `${invalidLog}\n` : ''),
    atomicWrite(
      path.join(outputDir, 'failed-requests.json'),
      `${JSON.stringify(result.failedRequests, null, 2)}\n`,
    ),
  ]);
}

export function formatSummary(summary) {
  return [
    `ID range scanned: ${summary.minItemId}-${summary.maxItemId}`,
    `Valid items: ${summary.validItems}`,
    `Nonexistent IDs: ${summary.nonexistentIds}`,
    `Invalid item pages: ${summary.invalidItemPages}`,
    `Failed requests: ${summary.failedRequests}`,
    `Items with values: ${summary.itemsWithValues}`,
    `Items without values: ${summary.itemsWithoutValues}`,
    `Elapsed: ${summary.elapsedSeconds}s`,
  ].join('\n');
}
