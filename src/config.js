import path from 'node:path';

export const MIN_ITEM_ID = 1;
export const DEFAULT_MAX_ITEM_ID = 2856;
export const DEFAULT_CONCURRENCY = 4;

function readInteger(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}; received ${JSON.stringify(raw)}`);
  }

  return value;
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const minItemId = readInteger(env, 'MIN_ITEM_ID', MIN_ITEM_ID, { min: 1 });
  const maxItemId = readInteger(env, 'MAX_ITEM_ID', DEFAULT_MAX_ITEM_ID, { min: minItemId });

  return {
    minItemId,
    maxItemId,
    concurrency: readInteger(env, 'CONCURRENCY', DEFAULT_CONCURRENCY, { min: 1, max: 10 }),
    requestDelayMs: readInteger(env, 'REQUEST_DELAY_MS', 150, { min: 0, max: 60_000 }),
    jitterMs: readInteger(env, 'JITTER_MS', 150, { min: 0, max: 60_000 }),
    requestTimeoutMs: readInteger(env, 'REQUEST_TIMEOUT_MS', 30_000, { min: 1_000, max: 300_000 }),
    maxRetries: readInteger(env, 'MAX_RETRIES', 4, { min: 0, max: 10 }),
    retryBaseDelayMs: readInteger(env, 'RETRY_BASE_DELAY_MS', 1_000, { min: 0, max: 60_000 }),
    maxRetryDelayMs: readInteger(env, 'MAX_RETRY_DELAY_MS', 120_000, { min: 1_000, max: 600_000 }),
    progressEvery: readInteger(env, 'PROGRESS_EVERY', 100, { min: 0, max: 100_000 }),
    outputDir: path.resolve(cwd, env.OUTPUT_DIR || 'data'),
    baseUrl: env.BASE_URL || 'https://bloxtsar.com/baddies/item',
    userAgent: env.USER_AGENT || 'BloxtsarBaddiesScraper/1.0 (+GitHub Actions)',
  };
}
