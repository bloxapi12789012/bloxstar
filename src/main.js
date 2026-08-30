#!/usr/bin/env node

import { loadConfig } from './config.js';
import { formatSummary, scrapeRange, writeOutputs } from './scraper.js';

async function main() {
  const config = loadConfig();
  console.log(
    `Scanning Bloxtsar Baddies item IDs ${config.minItemId}-${config.maxItemId} `
      + `with concurrency ${config.concurrency}`,
  );

  const result = await scrapeRange(config);
  await writeOutputs(result, config.outputDir);

  console.log('\nScan complete');
  console.log(formatSummary(result.summary));
  console.log(`Output directory: ${config.outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
