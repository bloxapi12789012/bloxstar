const OUTPUT_FIELDS = [
  'itemId',
  'itemName',
  'value',
  'tokenValue',
  'rap',
  'demand',
  'trend',
];

function findJsonObjectEnd(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function extractInitialItem(html) {
  // Next.js places the item in an escaped React Server Components payload.
  const escapedMarker = '\\"initialItem\\":';
  const escapedStart = html.indexOf(escapedMarker);

  if (escapedStart !== -1) {
    const objectStart = html.indexOf('{', escapedStart + escapedMarker.length);
    const endMarker = ',\\"initialChartData\\":';
    const objectEnd = html.indexOf(endMarker, objectStart);

    if (objectStart === -1 || objectEnd === -1) {
      throw new Error('Found initialItem marker but could not delimit its object');
    }

    const escapedObject = html.slice(objectStart, objectEnd);
    const decodedObject = JSON.parse(`"${escapedObject}"`);
    return JSON.parse(decodedObject);
  }

  // This also supports an unescaped JSON/Next.js representation if the site
  // changes how it serializes the same server-side data.
  const plainMarker = '"initialItem":';
  const plainStart = html.indexOf(plainMarker);
  if (plainStart === -1) {
    return null;
  }

  const objectStart = html.indexOf('{', plainStart + plainMarker.length);
  const objectEnd = findJsonObjectEnd(html, objectStart);
  if (objectStart === -1 || objectEnd === -1) {
    throw new Error('Found initialItem marker but could not parse its object');
  }

  return JSON.parse(html.slice(objectStart, objectEnd));
}

function isNullableFiniteNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

export function parseItemPage(html, expectedItemId) {
  if (typeof html !== 'string' || html.length === 0) {
    return { ok: false, reason: 'empty response body' };
  }

  let source;
  try {
    source = extractInitialItem(html);
  } catch (error) {
    return { ok: false, reason: `malformed initialItem data: ${error.message}` };
  }

  if (!source || typeof source !== 'object') {
    return { ok: false, reason: 'initialItem data not found' };
  }

  const missingFields = OUTPUT_FIELDS.filter((field) => !Object.hasOwn(source, field));
  if (missingFields.length > 0) {
    return { ok: false, reason: `missing fields: ${missingFields.join(', ')}` };
  }

  if (!Number.isSafeInteger(source.itemId) || source.itemId !== expectedItemId) {
    return {
      ok: false,
      reason: `itemId mismatch: expected ${expectedItemId}, received ${JSON.stringify(source.itemId)}`,
    };
  }

  if (source.gameId !== undefined && source.gameId !== 'baddies') {
    return { ok: false, reason: `unexpected gameId: ${JSON.stringify(source.gameId)}` };
  }

  if (typeof source.itemName !== 'string' || source.itemName.trim() === '') {
    return { ok: false, reason: 'itemName is empty or not a string' };
  }

  for (const field of ['value', 'tokenValue', 'rap']) {
    if (!isNullableFiniteNumber(source[field])) {
      return { ok: false, reason: `${field} is neither a finite number nor null` };
    }
  }

  for (const field of ['demand', 'trend']) {
    if (!isNullableString(source[field])) {
      return { ok: false, reason: `${field} is neither a string nor null` };
    }
  }

  return {
    ok: true,
    item: {
      itemId: source.itemId,
      itemName: source.itemName.trim(),
      value: source.value,
      tokenValue: source.tokenValue,
      rap: source.rap,
      demand: source.demand,
      trend: source.trend,
    },
  };
}
