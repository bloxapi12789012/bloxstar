import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSite } from '../src/build-site.js';

test('builds a static site with valid JSON API endpoints', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baddies-site-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const dataDir = path.join(root, 'data');
  const staticDir = path.join(root, 'site');
  const outputDir = path.join(root, 'public');
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(staticDir, { recursive: true }),
  ]);

  const items = [{
    itemId: 1,
    itemName: 'Loveboard',
    value: 18000,
    tokenValue: 13000,
    rap: 10850,
    demand: 'High',
    trend: 'Raising',
  }];
  const summary = { validItems: 1, scanCompletedAt: '2026-08-30T20:09:02.193Z' };

  await Promise.all([
    writeFile(path.join(dataDir, 'baddies-items.json'), JSON.stringify(items)),
    writeFile(path.join(dataDir, 'scan-summary.json'), JSON.stringify(summary)),
    writeFile(path.join(dataDir, 'failed-requests.json'), '[]'),
    writeFile(path.join(dataDir, 'invalid-item-ids.log'), ''),
    writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>Baddies</title>'),
    writeFile(path.join(staticDir, 'styles.css'), 'body {}'),
    writeFile(path.join(staticDir, 'app.js'), 'export {};'),
    writeFile(path.join(staticDir, '.nojekyll'), ''),
  ]);

  const result = await buildSite({ dataDir, staticDir, outputDir });
  assert.equal(result.itemCount, 1);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(outputDir, 'baddies-items.json'), 'utf8')),
    items,
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(outputDir, 'api.json'), 'utf8')),
    {
      generatedAt: summary.scanCompletedAt,
      endpoints: {
        items: './baddies-items.json',
        summary: './scan-summary.json',
        failedRequests: './failed-requests.json',
        invalidItemIds: './invalid-item-ids.log',
      },
    },
  );
});

test('rejects a site build when the summary and item collection disagree', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baddies-site-mismatch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  await mkdir(dataDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dataDir, 'baddies-items.json'), '[]'),
    writeFile(path.join(dataDir, 'scan-summary.json'), JSON.stringify({ validItems: 1 })),
  ]);

  await assert.rejects(
    buildSite({ dataDir, staticDir: path.join(root, 'site'), outputDir: path.join(root, 'public') }),
    /Summary\/item mismatch/,
  );
});
