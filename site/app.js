const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const elements = {
  datasetStatus: document.querySelector('#datasetStatus'),
  lastUpdated: document.querySelector('#lastUpdated'),
  statScanned: document.querySelector('#statScanned'),
  statValid: document.querySelector('#statValid'),
  statWithValues: document.querySelector('#statWithValues'),
  statNonexistent: document.querySelector('#statNonexistent'),
  statInvalid: document.querySelector('#statInvalid'),
  statFailed: document.querySelector('#statFailed'),
  searchInput: document.querySelector('#searchInput'),
  demandFilter: document.querySelector('#demandFilter'),
  trendFilter: document.querySelector('#trendFilter'),
  valueFilter: document.querySelector('#valueFilter'),
  resetFilters: document.querySelector('#resetFilters'),
  resultCount: document.querySelector('#resultCount'),
  itemRows: document.querySelector('#itemRows'),
  emptyState: document.querySelector('#emptyState'),
  errorBanner: document.querySelector('#errorBanner'),
  sortButtons: [...document.querySelectorAll('[data-sort]')],
  sortableHeaders: [...document.querySelectorAll('th[data-column]')],
};

const state = {
  items: [],
  sortKey: 'itemId',
  sortDirection: 'ascending',
};

function formatNumber(value) {
  return value === null || value === undefined ? '—' : numberFormatter.format(value);
}

function normalizedText(value) {
  return value === null || value === undefined ? '' : String(value).trim().toLocaleLowerCase();
}

function appendOption(select, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  select.append(option);
}

function populateFilter(select, values) {
  [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
    .sort((left, right) => left.localeCompare(right))
    .forEach((value) => appendOption(select, value));
}

function renderSummary(summary) {
  elements.statScanned.textContent = formatNumber(summary.totalIdsScanned);
  elements.statValid.textContent = formatNumber(summary.validItems);
  elements.statWithValues.textContent = formatNumber(summary.itemsWithValues);
  elements.statNonexistent.textContent = formatNumber(summary.nonexistentIds);
  elements.statInvalid.textContent = formatNumber(summary.invalidItemPages);
  elements.statFailed.textContent = formatNumber(summary.failedRequests);

  const completedAt = new Date(summary.scanCompletedAt);
  if (!Number.isNaN(completedAt.getTime())) {
    elements.lastUpdated.dateTime = summary.scanCompletedAt;
    elements.lastUpdated.textContent = `Updated ${dateFormatter.format(completedAt)}`;
    elements.lastUpdated.title = summary.scanCompletedAt;
  }

  const issues = (summary.invalidItemPages || 0) + (summary.failedRequests || 0);
  elements.datasetStatus.textContent = issues === 0
    ? 'Latest scan completed cleanly'
    : `Latest scan completed with ${numberFormatter.format(issues)} issue${issues === 1 ? '' : 's'}`;
}

function compareItems(left, right, key) {
  const leftValue = left[key];
  const rightValue = right[key];

  if (leftValue === null || leftValue === undefined) return rightValue === null || rightValue === undefined ? 0 : 1;
  if (rightValue === null || rightValue === undefined) return -1;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
}

function currentItems() {
  const query = normalizedText(elements.searchInput.value);
  const demand = elements.demandFilter.value;
  const trend = elements.trendFilter.value;
  const valueStatus = elements.valueFilter.value;

  const filtered = state.items.filter((item) => {
    const matchesQuery = !query
      || normalizedText(item.itemName).includes(query)
      || String(item.itemId).includes(query);
    const matchesDemand = !demand || item.demand === demand;
    const matchesTrend = !trend || item.trend === trend;
    const matchesValue = !valueStatus
      || (valueStatus === 'with' && item.value !== null)
      || (valueStatus === 'without' && item.value === null);
    return matchesQuery && matchesDemand && matchesTrend && matchesValue;
  });

  return filtered.sort((left, right) => {
    const comparison = compareItems(left, right, state.sortKey);
    return state.sortDirection === 'ascending' ? comparison : -comparison;
  });
}

function appendTextCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
}

function appendBadgeCell(row, value) {
  const cell = document.createElement('td');
  if (value === null || value === undefined || value === '') {
    cell.textContent = '—';
  } else {
    const badge = document.createElement('span');
    badge.className = 'pill';
    badge.dataset.value = normalizedText(value).replace(/[^a-z0-9]+/g, '-');
    badge.textContent = value;
    cell.append(badge);
  }
  row.append(cell);
}

function renderRows() {
  const items = currentItems();
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const row = document.createElement('tr');
    appendTextCell(row, String(item.itemId), 'item-id');

    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'item-link';
    link.href = `https://bloxtsar.com/baddies/item/${item.itemId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.itemName;
    nameCell.append(link);
    row.append(nameCell);

    appendTextCell(row, formatNumber(item.value), 'numeric');
    appendTextCell(row, formatNumber(item.tokenValue), 'numeric');
    appendTextCell(row, formatNumber(item.rap), 'numeric');
    appendBadgeCell(row, item.demand);
    appendBadgeCell(row, item.trend);
    fragment.append(row);
  }

  elements.itemRows.replaceChildren(fragment);
  elements.resultCount.textContent = `${numberFormatter.format(items.length)} of ${numberFormatter.format(state.items.length)} items`;
  elements.emptyState.hidden = items.length !== 0;
}

function updateSortIndicators() {
  for (const header of elements.sortableHeaders) {
    const active = header.dataset.column === state.sortKey;
    header.setAttribute('aria-sort', active ? state.sortDirection : 'none');
    const icon = header.querySelector('[aria-hidden="true"]');
    if (icon) icon.textContent = active ? (state.sortDirection === 'ascending' ? '↑' : '↓') : '↕';
  }
}

function resetFilters() {
  elements.searchInput.value = '';
  elements.demandFilter.value = '';
  elements.trendFilter.value = '';
  elements.valueFilter.value = '';
  state.sortKey = 'itemId';
  state.sortDirection = 'ascending';
  updateSortIndicators();
  renderRows();
  elements.searchInput.focus();
}

for (const control of [
  elements.searchInput,
  elements.demandFilter,
  elements.trendFilter,
  elements.valueFilter,
]) {
  control.addEventListener('input', renderRows);
}

elements.resetFilters.addEventListener('click', resetFilters);
for (const button of elements.sortButtons) {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) {
      state.sortDirection = state.sortDirection === 'ascending' ? 'descending' : 'ascending';
    } else {
      state.sortKey = key;
      state.sortDirection = 'ascending';
    }
    updateSortIndicators();
    renderRows();
  });
}

async function loadData() {
  try {
    const [itemsResponse, summaryResponse] = await Promise.all([
      fetch('./baddies-items.json', { cache: 'no-store' }),
      fetch('./scan-summary.json', { cache: 'no-store' }),
    ]);
    if (!itemsResponse.ok || !summaryResponse.ok) {
      throw new Error(`Data request failed (${itemsResponse.status}/${summaryResponse.status})`);
    }

    const [items, summary] = await Promise.all([itemsResponse.json(), summaryResponse.json()]);
    if (!Array.isArray(items)) throw new Error('Item endpoint did not return an array');

    state.items = items;
    renderSummary(summary);
    populateFilter(elements.demandFilter, items.map((item) => item.demand));
    populateFilter(elements.trendFilter, items.map((item) => item.trend));
    renderRows();
  } catch (error) {
    elements.datasetStatus.textContent = 'Dataset unavailable';
    elements.resultCount.textContent = 'Unable to load items';
    elements.errorBanner.hidden = false;
    elements.errorBanner.textContent = `The latest data could not be loaded. ${error.message}`;
  }
}

loadData();
