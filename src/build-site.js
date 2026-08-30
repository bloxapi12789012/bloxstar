#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_FILES = ['index.html', 'styles.css', 'app.js', '.nojekyll'];
const DATA_FILES = [
  'baddies-items.json',
  'scan-summary.json',
  'failed-requests.json',
  'invalid-item-ids.log',
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function buildSite({ dataDir, staticDir, outputDir }) {
  const resolvedDataDir = path.resolve(dataDir);
  const resolvedStaticDir = path.resolve(staticDir);
  const resolvedOutputDir = path.resolve(outputDir);

  const items = await readJson(path.join(resolvedDataDir, 'baddies-items.json'));
  const summary = await readJson(path.join(resolvedDataDir, 'scan-summary.json'));

  if (!Array.isArray(items)) {
    throw new Error('baddies-items.json must contain an array');
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('scan-summary.json must contain an object');
  }
  if (summary.validItems !== items.length) {
    throw new Error(
      `Summary/item mismatch: summary says ${summary.validItems}, data contains ${items.length}`,
    );
  }

  await mkdir(resolvedOutputDir, { recursive: true });
  await Promise.all([
    ...STATIC_FILES.map((fileName) => copyFile(
      path.join(resolvedStaticDir, fileName),
      path.join(resolvedOutputDir, fileName),
    )),
    ...DATA_FILES.map((fileName) => copyFile(
      path.join(resolvedDataDir, fileName),
      path.join(resolvedOutputDir, fileName),
    )),
  ]);

  const apiIndex = {
    generatedAt: summary.scanCompletedAt,
    endpoints: {
      items: './baddies-items.json',
      summary: './scan-summary.json',
      failedRequests: './failed-requests.json',
      invalidItemIds: './invalid-item-ids.log',
    },
  };
  await writeFile(
    path.join(resolvedOutputDir, 'api.json'),
    `${JSON.stringify(apiIndex, null, 2)}\n`,
    'utf8',
  );

  return { itemCount: items.length, outputDir: resolvedOutputDir };
}

async function main() {
  const cwd = process.cwd();
  const result = await buildSite({
    dataDir: process.env.OUTPUT_DIR || path.join(cwd, 'data'),
    staticDir: process.env.STATIC_DIR || path.join(cwd, 'site'),
    outputDir: process.env.SITE_OUTPUT_DIR || path.join(cwd, 'public'),
  });
  console.log(`Built GitHub Pages site with ${result.itemCount} items at ${result.outputDir}`);
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
