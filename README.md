# Bloxtsar Baddies item scraper

This project scans every numeric item ID in an inclusive range. It does not assume IDs are contiguous and does not discover the catalog first.

By default it requests:

```text
https://bloxtsar.com/baddies/item/1
...
https://bloxtsar.com/baddies/item/2856
```

Each valid record in `data/baddies-items.json` contains only:

```json
{
  "itemId": 1,
  "itemName": "Loveboard",
  "value": 18000,
  "tokenValue": 13000,
  "rap": 10850,
  "demand": "High",
  "trend": "Raising"
}
```

Legitimate missing values are retained as `null`. A record is rejected when the page has no server-rendered item data, its item ID does not match the requested ID, it belongs to another game, or a required field has an invalid type.

## Run locally

Node.js 20 or newer is required. There are no third-party runtime dependencies.

```bash
npm test
npm run scrape
```

To change the inclusive maximum:

```bash
MAX_ITEM_ID=3000 npm run scrape
```

PowerShell:

```powershell
$env:MAX_ITEM_ID = '3000'
npm run scrape
```

The important defaults are defined once in `src/config.js`:

```js
export const MIN_ITEM_ID = 1;
export const DEFAULT_MAX_ITEM_ID = 2856;
export const DEFAULT_CONCURRENCY = 4;
```

Supported environment variables:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `MAX_ITEM_ID` | `2856` | Inclusive maximum ID |
| `MIN_ITEM_ID` | `1` | Inclusive minimum ID; useful for small smoke tests |
| `CONCURRENCY` | `4` | Simultaneous workers; keep this around 3-5 |
| `REQUEST_DELAY_MS` | `150` | Per-worker delay between item requests |
| `JITTER_MS` | `150` | Random additional per-worker delay |
| `REQUEST_TIMEOUT_MS` | `30000` | Timeout for each attempt |
| `MAX_RETRIES` | `4` | Retries after the initial attempt |
| `RETRY_BASE_DELAY_MS` | `1000` | Initial exponential-backoff delay |
| `MAX_RETRY_DELAY_MS` | `120000` | Backoff/`Retry-After` cap |
| `PROGRESS_EVERY` | `100` | Progress log interval; `0` disables it |
| `OUTPUT_DIR` | `data` | Output directory |

HTTP 404 responses are counted as nonexistent IDs and are not retried. HTTP 408, 425, 429, 500, 502, 503, and 504 responses, timeouts, and network errors are retried with exponential backoff and jitter. A server-provided `Retry-After` is honored up to the configured maximum retry delay.

## Outputs

- `data/baddies-items.json`: valid item records only, sorted by `itemId`
- `data/scan-summary.json`: counts, range, timestamps, and elapsed time
- `data/invalid-item-ids.log`: IDs and reasons for pages that returned success but lacked valid item data
- `data/failed-requests.json`: requests still unsuccessful after retry handling

The console prints a final summary in this format:

```text
ID range scanned: 1-2856
Valid items: 842
Nonexistent IDs: 1994
Invalid item pages: 0
Failed requests: 20
Items with values: 810
Items without values: 32
Elapsed: 123.4s
```

## GitHub Actions

`.github/workflows/scrape-baddies.yml` runs at minute 17 of every hour, defaults to IDs `1-2856`, uses four workers, runs the tests first, and uploads all four output files as a 30-day workflow artifact. The off-peak minute reduces top-of-hour scheduling delays while retaining a 60-minute interval.

Manual runs expose an optional `max_item_id` input so the upper bound can be increased without editing the workflow. When it is blank, the workflow uses the single default from `src/config.js`.
