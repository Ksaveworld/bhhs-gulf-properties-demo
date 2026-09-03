import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ClientRequirement, Dataset, ListingTransactionLink, Transaction } from '../../shared/types';

const clientIds = (scope: Locator) => scope.locator('article[data-client-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')));
const conditions = (drawer: Locator) => drawer.getByRole('region', { name: 'Customers with conditions met', exact: true });
const clarification = (drawer: Locator) => drawer.getByRole('region', { name: 'Customers needing clarification', exact: true });
const client = (drawer: Locator, id: string) => drawer.locator(`article[data-client-id="${id}"]`);

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('result-count')).toHaveText('9');
}

async function openListing(page: Page, id: string, tab: 'clients' | 'evidence') {
  await page.getByTestId(`listing-${id}`).getByRole('button', { name: /^Open / }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: tab === 'clients' ? /Potential clients/ : 'Price evidence' }).click();
  return drawer;
}

async function choose(page: Page, scope: Locator, label: string, value: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
}

test('a property counts distinct clients and retains separate requirements and return paths', async ({ page }) => {
  await ready(page);
  let drawer = await openListing(page, 'DEMO-L-001', 'clients');
  await expect(drawer.getByRole('tab', { name: /Potential clients \(6 clients\)/ })).toBeVisible();
  await expect(drawer.getByTestId('client-count-total')).toContainText('6');
  await expect(drawer.getByTestId('client-count-match')).toContainText('2');
  await expect(drawer.getByTestId('client-count-review')).toContainText('2');
  await expect(drawer.getByTestId('client-count-excluded')).toContainText('2');
  expect(await clientIds(conditions(drawer))).toEqual(['DEMO-C-001', 'DEMO-C-002']);
  expect(await clientIds(clarification(drawer))).toEqual(['DEMO-C-003', 'DEMO-C-006']);
  await expect(client(drawer, 'DEMO-C-004')).toBeHidden();
  await drawer.locator('summary').filter({ hasText: 'Hard condition conflicts (2 clients)' }).click();
  await expect(client(drawer, 'DEMO-C-004')).toBeVisible();
  expect(await clientIds(drawer)).toEqual(['DEMO-C-001', 'DEMO-C-002', 'DEMO-C-003', 'DEMO-C-006', 'DEMO-C-004', 'DEMO-C-005']);
  const a = client(drawer, 'DEMO-C-001');
  await a.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  await expect(a.locator('[data-requirement-id="DEMO-R-001"]')).toContainText('2,800,000');
  await expect(a.locator('[data-requirement-id="DEMO-R-007"]')).toContainText('Conditions met');
  await a.getByRole('button', { name: 'View properties for Demo client A · Marina home', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('2');

  drawer = await openListing(page, 'DEMO-L-002', 'clients');
  await expect(drawer.getByTestId('client-count-total')).toContainText('6');
  await expect(drawer.getByTestId('client-count-match')).toContainText('2');
  const b = client(drawer, 'DEMO-C-002');
  await b.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  const original = b.locator('[data-requirement-id="DEMO-R-002"]');
  const second = b.locator('[data-requirement-id="DEMO-R-008"]');
  await expect(original).toContainText('100,000');
  await expect(original).toContainText('Hard condition conflict');
  await expect(second).toContainText('Conditions met');
  await expect(second).not.toContainText('100,000 above');
  await original.getByRole('button', { name: /DEMO-R-002/ }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
});

test('sorting changes order using stated budget and dates, keeps condition groups and puts unknowns last', async ({ page, request }) => {
  const original = await (await request.get('/api/dataset')).json() as Dataset;
  const source = original.client_requirements.find(row => row.requirement_id === 'DEMO-R-007')!;
  expect(source).toBeDefined();
  const makeRequirement = (id: string, overrides: Partial<ClientRequirement>): ClientRequirement => ({
    ...source, client_id: `DEMO-QA-C-${id}`, requirement_id: `DEMO-QA-R-${id}`, client_alias: `Demo sorting case ${id}`,
    raw_request: 'Synthetic browser acceptance case; no real customer or business priority is asserted.',
    source_ref: `DEMO-QA-SOURCE-${id}`, data_kind: 'demo', budget_min: null, budget_constraint: 'flexible',
    missing_questions: 'Confirm the stated details with the client.', intent_evidence: null, ...overrides,
  });
  const requirements = [
    source,
    makeRequirement('000', { budget_max: null, currency: null, purchase_by: null }),
    makeRequirement('001', { budget_max: 2300000, currency: 'AED', purchase_by: '2026-10-20' }),
    makeRequirement('002', { budget_max: 3000000, currency: 'AED', purchase_by: '2026-11-20' }),
    makeRequirement('003', { budget_max: 1000000, currency: 'AED', budget_constraint: 'hard', purchase_by: '2026-10-01' }),
  ];
  await page.route('**/api/dataset', route => route.fulfill({ json: { ...original, client_requirements: requirements } }));
  await ready(page);
  const drawer = await openListing(page, 'DEMO-L-001', 'clients');
  const review = clarification(drawer);
  expect(await clientIds(review)).toEqual(['DEMO-QA-C-000', 'DEMO-QA-C-001', 'DEMO-QA-C-002']);
  await choose(page, drawer, 'Sort clients', 'Budget coverage');
  expect(await clientIds(review)).toEqual(['DEMO-QA-C-002', 'DEMO-QA-C-001', 'DEMO-QA-C-000']);
  expect(await clientIds(conditions(drawer))).toEqual(['DEMO-C-001']);
  await expect(client(drawer, 'DEMO-QA-C-000')).toContainText('Budget not provided');
  await expect(client(drawer, 'DEMO-QA-C-000')).toContainText('No intent evidence supplied');
  await expect(client(drawer, 'DEMO-QA-C-001')).toContainText('150,000');
  await choose(page, drawer, 'Sort clients', 'Earliest purchase date');
  expect(await clientIds(review)).toEqual(['DEMO-QA-C-001', 'DEMO-QA-C-002', 'DEMO-QA-C-000']);
  await expect(client(drawer, 'DEMO-QA-C-000')).toContainText('To be confirmed');
  await drawer.locator('summary').filter({ hasText: 'Hard condition conflicts (1 client)' }).click();
  expect(await clientIds(drawer)).toEqual(['DEMO-C-001', 'DEMO-QA-C-001', 'DEMO-QA-C-002', 'DEMO-QA-C-000', 'DEMO-QA-C-003']);
  await choose(page, drawer, 'Sort clients', 'Condition status');
  expect(await clientIds(review)).toEqual(['DEMO-QA-C-000', 'DEMO-QA-C-001', 'DEMO-QA-C-002']);
  await expect(drawer).not.toContainText(/\b\d+(?:\.\d+)?\s*%/);
});

const chart = (drawer: Locator) => drawer.locator('[aria-label="Same-property transaction history"]');
const salePoints = (scope: Locator) => scope.locator('svg [role="button"]');
const transactionRecord = (drawer: Locator, id: string) => drawer.getByRole('article', { name: `Same-property transaction ${id}`, exact: true });

test('multi-sale history uses actual dates and amounts, opens the original source and recovers from an empty range', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await ready(page);
  const drawer = await openListing(page, 'DEMO-L-001', 'evidence');
  const history = chart(drawer);
  await expect(history.getByText('Sales recorded: 3', { exact: true })).toBeVisible();
  await expect(history.getByRole('combobox', { name: 'Chart series', exact: true })).toHaveValue('AED:registration');
  await expect(salePoints(history)).toHaveCount(3);
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(1);
  await expect(history.getByText('Total sale price (AED)', { exact: true })).toBeVisible();
  await expect(history.getByText('Lines connect recorded sales for readability; no prices are inferred between sales.')).toBeVisible();
  const timeline = history.getByRole('list', { name: 'Recorded transaction timeline', exact: true });
  expect(await timeline.locator('time').allTextContents()).toEqual(['2020-03-12', '2022-08-06', '2024-11-20']);
  expect(await timeline.locator('.th-timeline-record strong').allTextContents()).toEqual(['AED 1,650,000', 'AED 1,920,000', 'AED 2,100,000']);
  const firstPoint = history.getByRole('button', { name: /^Transaction DEMO-T-007: 2020-03-12, AED 1,650,000, source DEMO-SOURCE-T-007$/ });
  await firstPoint.click();
  const firstRecord = transactionRecord(drawer, 'DEMO-T-007');
  await expect(firstRecord).toBeInViewport();
  await expect(firstRecord.getByText('DEMO-SOURCE-T-007', { exact: true })).toBeVisible();
  const lastPoint = history.getByRole('button', { name: /^Transaction DEMO-T-001:/ });
  await lastPoint.focus();
  await page.keyboard.press('Enter');
  await expect(transactionRecord(drawer, 'DEMO-T-001').getByText('DEMO-SOURCE-T-001', { exact: true })).toBeVisible();

  await history.getByLabel('From', { exact: true }).fill('2021-01-01');
  await expect(salePoints(history)).toHaveCount(2);
  await history.getByLabel('To', { exact: true }).fill('2021-12-31');
  await expect(history.getByText('No recorded sales in this date range.', { exact: true })).toBeVisible();
  await expect(history.getByText('Showing 0 of 3 sales in this series · 3 unique sales recorded overall.', { exact: true })).toBeVisible();
  await expect(salePoints(history)).toHaveCount(0);
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(0);
  await history.getByLabel('From', { exact: true }).fill('2025-01-01');
  await expect(history.getByRole('alert')).toHaveText('From must be on or before To.');
  await history.getByRole('button', { name: 'Reset range', exact: true }).click();
  await expect(salePoints(history)).toHaveCount(3);
  await expect(timeline.getByRole('button')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('a single recorded sale is a point, and a property with no history has no invented curve', async ({ page }) => {
  await ready(page);
  let drawer = await openListing(page, 'DEMO-L-004', 'evidence');
  let history = chart(drawer);
  await expect(history.getByText('Sales recorded: 1', { exact: true })).toBeVisible();
  await expect(salePoints(history)).toHaveCount(1);
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(0);
  await expect(history.getByText('One sale is recorded in this range. A single point does not establish a price trend.')).toBeVisible();
  await history.getByRole('button', { name: 'View transaction DEMO-T-006', exact: true }).click();
  await expect(transactionRecord(drawer, 'DEMO-T-006').getByText('DEMO-SOURCE-T-006', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  drawer = await openListing(page, 'DEMO-L-005', 'evidence');
  history = chart(drawer);
  await expect(history.getByText('Sales recorded: 0', { exact: true })).toBeVisible();
  await expect(history.getByText('No available same-property sale history.', { exact: true })).toBeVisible();
  await expect(salePoints(history)).toHaveCount(0);
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(0);
  await expect(history.getByLabel('From', { exact: true })).toHaveCount(0);
});

function syntheticTransaction(source: Transaction, id: string, overrides: Partial<Transaction>): Transaction {
  return { ...source, transaction_id: id, source_record_id: `${id}-RECORD`, source_ref: `${id}-SOURCE`,
    data_kind: 'demo', notes: 'Invented browser acceptance sample. No real transaction or market fact is asserted.', ...overrides };
}

function syntheticLink(source: ListingTransactionLink, transactionId: string): ListingTransactionLink {
  return { ...source, link_id: `${transactionId}-LINK`, transaction_id: transactionId, data_kind: 'demo',
    evidence_refs: `Synthetic association for ${transactionId}`, notes: 'Invented browser acceptance association.' };
}

test('currency and date basis form separate series and duplicate, comparable, asking and ineligible evidence cannot inflate the curve', async ({ page, request }) => {
  const original = await (await request.get('/api/dataset')).json() as Dataset;
  const source = original.transactions.find(row => row.transaction_id === 'DEMO-T-001')!;
  const link = original.listing_transaction_links.find(row => row.transaction_id === 'DEMO-T-001')!;
  const extra = [
    syntheticTransaction(source, 'DEMO-QA-T-USD', { currency: 'USD', transaction_date: '2025-01-05', amount: 480000 }),
    syntheticTransaction(source, 'DEMO-QA-T-CONTRACT', { date_basis: 'contract', transaction_date: '2022-07-05', amount: 1850000 }),
    syntheticTransaction(source, 'DEMO-QA-T-MORTGAGE', { record_type: 'mortgage', amount: 999000 }),
    syntheticTransaction(source, 'DEMO-QA-T-UNREVIEWED', { verification_status: 'needs_review', amount: 999001 }),
  ];
  await page.route('**/api/dataset', route => route.fulfill({ json: {
    ...original, transactions: [...original.transactions, ...extra],
    listing_transaction_links: [...original.listing_transaction_links, { ...link, link_id: 'DEMO-QA-DUPLICATE-LINK' }, ...extra.map(row => syntheticLink(link, row.transaction_id))],
  } }));
  await ready(page);
  const drawer = await openListing(page, 'DEMO-L-001', 'evidence');
  const history = chart(drawer);
  await expect(history.getByText('Sales recorded: 5', { exact: true })).toBeVisible();
  await expect(history.getByText('Currencies and date bases are shown in separate series; no conversion or date substitution is applied.')).toBeVisible();
  const series = history.getByRole('combobox', { name: 'Chart series', exact: true });
  await expect(series.locator('option')).toHaveText(['AED · Contract date', 'AED · Registration date', 'USD · Registration date']);
  await series.selectOption('AED:registration');
  await expect(salePoints(history)).toHaveCount(3);
  await expect(history.getByText('Showing 3 of 3 sales in this series · 5 unique sales recorded overall.', { exact: true })).toBeVisible();
  await expect(transactionRecord(drawer, 'DEMO-T-001')).toHaveCount(1);
  await expect(drawer.locator('.pd-comparable-section').getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true })).toHaveCount(1);
  const pointNames = await salePoints(history).evaluateAll(points => points.map(point => point.getAttribute('aria-label')));
  expect(pointNames.join(' ')).not.toMatch(/DEMO-T-002|DEMO-T-003|DEMO-T-005|DEMO-QA-T-MORTGAGE|DEMO-QA-T-UNREVIEWED|2,450,000|2,550,000/);
  await history.getByLabel('From', { exact: true }).fill('2024-01-01');
  await series.selectOption('USD:registration');
  await expect(history.getByLabel('From', { exact: true })).toHaveValue('');
  await expect(salePoints(history)).toHaveCount(1);
  await expect(history.getByRole('button', { name: /^Transaction DEMO-QA-T-USD: 2025-01-05, USD 480,000/ })).toBeVisible();
  await expect(history.getByText('Total sale price (USD)', { exact: true })).toBeVisible();
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(0);
  await series.selectOption('AED:contract');
  await expect(salePoints(history)).toHaveCount(1);
  await expect(history.getByRole('button', { name: /^Transaction DEMO-QA-T-CONTRACT: 2022-07-05, AED 1,850,000/ })).toBeVisible();
  await expect(history.locator('svg').getByText('Contract date', { exact: true })).toBeVisible();
});

test('a shared non-final sale marker supports keyboard access to both distinct source records', async ({ page, request }) => {
  const original = await (await request.get('/api/dataset')).json() as Dataset;
  const source = original.transactions.find(row => row.transaction_id === 'DEMO-T-008')!;
  const link = original.listing_transaction_links.find(row => row.transaction_id === 'DEMO-T-008')!;
  const duplicatePosition = syntheticTransaction(source, 'DEMO-QA-T-SAME-POSITION', {});
  await page.route('**/api/dataset', route => route.fulfill({ json: {
    ...original, transactions: [...original.transactions, duplicatePosition],
    listing_transaction_links: [...original.listing_transaction_links, syntheticLink(link, duplicatePosition.transaction_id)],
  } }));
  await ready(page);
  const drawer = await openListing(page, 'DEMO-L-001', 'evidence');
  const history = chart(drawer);
  await expect(history.getByText('Sales recorded: 4', { exact: true })).toBeVisible();
  await expect(salePoints(history)).toHaveCount(3);
  await expect(history.getByRole('list', { name: 'Recorded transaction timeline' }).getByRole('button')).toHaveCount(4);
  await history.getByRole('button', { name: /^2 transactions at 2022-08-06, AED 1,920,000:/ }).focus();
  await page.keyboard.press('Enter');
  await expect(history.getByRole('button', { name: 'View selected transaction DEMO-T-008', exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: 'View selected transaction DEMO-QA-T-SAME-POSITION', exact: true })).toBeVisible();
  const sourceActions = history.getByRole('button', { name: /^View selected transaction / });
  await expect(sourceActions).toHaveCount(2);
  await expect(sourceActions.nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  const secondAction = sourceActions.nth(1);
  await expect(secondAction).toBeFocused();
  const targetId = (await secondAction.textContent())!.replace('View selected transaction ', '');
  const targetSource = [source, duplicatePosition].find(row => row.transaction_id === targetId)!;
  expect(targetSource).toBeDefined();
  await page.keyboard.press('Enter');
  await expect(transactionRecord(drawer, targetId).getByText(targetSource.source_ref, { exact: true })).toBeVisible();
});
