import { expect, test, type Page } from '@playwright/test';
import { buildClientGroups } from '../../shared/client-priorities';
import { latestListings } from '../../shared/matching';
import type { Dataset } from '../../shared/types';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
const ids = (page: Page) => page.locator('tr[data-testid^="listing-"]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')!.replace('listing-', '')));
async function ready(page: Page) { await page.goto('/#/properties'); await expect(page.getByTestId('result-count')).toHaveText('8'); }
async function detail(page: Page, id = 'DEMO-L-001') { await page.getByTestId('listing-' + id).getByRole('button', { name: /^Open / }).click(); return page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) }); }

test('one-frame ranges align and filter live; only property name opens details; status supports keyboard focus', async ({ page }, info) => {
  await ready(page);
  const filters = page.getByRole('region', { name: 'Property filters', exact: true });
  const price = filters.getByRole('group', { name: 'Price Range (AED)', exact: true }).locator('.pv2-range');
  const size = filters.getByRole('group', { name: 'Size Range (sq ft)', exact: true }).locator('.pv2-range');
  const location = filters.getByRole('combobox', { name: 'Area / community', exact: true }).locator('xpath=ancestor::label[1]').locator('.ant-select').first();
  const boxes = await Promise.all([price.boundingBox(), size.boundingBox(), location.boundingBox()]);
  await info.attach('range-geometry', { body: JSON.stringify(boxes), contentType: 'application/json' });
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0]!.height - boxes[1]!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0]!.height - boxes[2]!.height)).toBeLessThanOrEqual(1);
  await expect(page.locator('.client-brief')).toHaveCount(0);
  await page.getByTestId('listing-DEMO-L-001').getByRole('cell').filter({ hasText: /^Dubai Marina$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / })).not.toContainText('bedroom');
  const status = page.getByRole('button', { name: 'Status definitions', exact: true });
  await status.focus();
  await expect(page.getByRole('tooltip')).toContainText('does not mean sold');
  await filters.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('1000000');
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await filters.getByRole('spinbutton', { name: 'Min. price', exact: true }).fill('950000');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await ids(page)).toEqual(['DEMO-L-005']);
  await filters.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await filters.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1000');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await ids(page)).toEqual(['DEMO-L-005']);
  await filters.getByRole('spinbutton', { name: 'Min. size', exact: true }).fill('1200');
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await expect(filters.getByText('Min. size cannot be greater than Max. size.', { exact: true })).toBeVisible();
  await filters.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1300');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await ids(page)).toEqual(['DEMO-L-001']);
  await page.getByRole('button', { name: 'Sort asking price ascending', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sort asking price ascending', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await detail(page);
  await expect(page.getByRole('dialog').getByText('AED 2,450,000', { exact: true })).toBeVisible();
});

test('price history keeps one chart and expandable record nodes, separates comparables and handles no history', async ({ page }) => {
  await ready(page);
  let drawer = await detail(page);
  await expect(drawer.getByText('Snapshot ID', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Record notes', { exact: true })).toHaveCount(0);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  await expect(history.getByRole('heading', { name: 'Property Transaction History', exact: true })).toBeVisible();
  await expect(history.getByTestId('transaction-history-line')).toBeVisible();
  await expect(history.locator('details[data-transaction-id]')).toHaveCount(3);
  await expect(history.locator('input[type="date"]')).toHaveCount(0);
  await expect(history.getByText('Original transaction records', { exact: true })).toHaveCount(0);
  await history.getByRole('button', { name: /^Transaction DEMO-T-007:/ }).press('Enter');
  const node = history.locator('details[data-transaction-id="DEMO-T-007"]');
  await expect(node).toHaveAttribute('open', '');
  await expect(node.getByRole('heading', { name: 'Original Evidence', exact: true })).toHaveCount(0);
  await expect(node.getByText('Transaction Type', { exact: true })).toBeVisible();
  await expect(node.getByText('Source Date', { exact: true })).toBeVisible();
  await expect(history.getByRole('article', { name: 'Same-property transaction DEMO-T-007', exact: true })).toHaveCount(1);
  await expect(drawer.locator('.pd-comparable-section').getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true })).toBeVisible();
  await expect(drawer.getByText('Link ID', { exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  drawer = await detail(page, 'DEMO-L-005');
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  await expect(drawer.getByText('No available same-property sale history.', { exact: true })).toBeVisible();
});

test('potential client groups mirror deterministic results and hide excluded clients without reclassifying', async ({ page, request }) => {
  const data = await (await request.get('/api/dataset')).json() as Dataset;
  const listing = latestListings(data.listing_snapshots).find(row => row.listing_id === 'DEMO-L-001')!;
  const expected = buildClientGroups(listing, data.client_requirements);
  await ready(page);
  const drawer = await detail(page);
  await drawer.getByRole('tab', { name: 'Potential clients', exact: true }).click();
  for (const status of ['match', 'review'] as const) {
    const group = drawer.getByRole('region', { name: status === 'match' ? 'Customers with conditions met' : 'Customers needing clarification', exact: true });
    expect(await group.locator('article[data-client-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')))).toEqual(expected.filter(row => row.status === status).map(row => row.client_id));
  }
  for (const excluded of expected.filter(row => row.status === 'excluded')) await expect(drawer.locator('article[data-client-id="' + excluded.client_id + '"]')).toHaveCount(0);
  await expect(drawer.getByText(/Hard Conflict|Unique Clients/)).toHaveCount(0);
  await expect(drawer.getByRole('combobox', { name: 'Sort clients' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'View Client Details', exact: true }).first()).toBeVisible();
});

test('currencies and date bases keep separate chart series; grouped markers expand every source node', async ({ page, request, context }) => {
  const data = await (await request.get('/api/dataset')).json() as Dataset;
  const source = data.transactions.find(row => row.transaction_id === 'DEMO-T-007')!;
  const link = data.listing_transaction_links.find(row => row.transaction_id === source.transaction_id)!;
  const origin = new URL(page.context().pages()[0]?.url() || 'http://127.0.0.1:5173');
  const evidenceUrl = (origin.origin === 'null' ? 'http://127.0.0.1:5173' : origin.origin) + '/evidence/synthetic-sale';
  const contract = { ...source, transaction_id: 'DEMO-QA-CONTRACT', date_basis: 'contract' as const };
  const usd = { ...source, transaction_id: 'DEMO-QA-USD-1', currency: 'USD' as const, source_ref: evidenceUrl };
  const duplicate = { ...usd, transaction_id: 'DEMO-QA-USD-2' };
  data.transactions.push(contract, usd, duplicate);
  data.listing_transaction_links.push(...[contract, usd, duplicate].map(transaction => ({ ...link, link_id: 'DEMO-QA-' + transaction.transaction_id, transaction_id: transaction.transaction_id })));
  await page.route('**/api/dataset', route => route.fulfill({ json: data }));
  await context.route('**/evidence/synthetic-sale', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic evidence page</h1>' }));
  await ready(page);
  const drawer = await detail(page);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  const series = history.getByRole('combobox', { name: 'Price series', exact: true });
  await expect(series.locator('option')).toHaveCount(3);
  await series.selectOption('AED:contract');
  await expect(history.locator('details[data-transaction-id]')).toHaveCount(1);
  await expect(history.getByTestId('transaction-history-line')).toHaveCount(0);
  await expect(history.getByText('One recorded sale does not establish a price trend.', { exact: true })).toBeVisible();
  await series.selectOption('USD:registration');
  await expect(history.locator('details[data-transaction-id]')).toHaveCount(2);
  await expect(history.locator('.th-sale-point')).toHaveCount(1);
  await history.locator('.th-sale-point').press('Enter');
  await expect(history.locator('details[data-transaction-id][open]')).toHaveCount(2);
  const popupPromise = page.waitForEvent('popup');
  await history.locator('details[data-transaction-id="DEMO-QA-USD-1"]').getByRole('link', { name: 'View Source', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Synthetic evidence page', exact: true })).toBeVisible();
  await expect(popup).toHaveURL(evidenceUrl);
  await popup.close();
});

test('sales confirmation survives reload, supports cancellation and surfaces failed storage', async ({ page }) => {
  await ready(page); await ensureSalesIdentity(page); await page.goto('/#/properties');
  let drawer = await detail(page);
  await drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true }).check();
  await expect(drawer.getByTestId('listing-confirmation')).toContainText('LEGACY-REGRESSION-SALES');
  await page.reload();
  drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).toBeChecked();
  await drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true }).uncheck();
  await page.reload();
  await expect(drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).not.toBeChecked();
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('bhhs:listing-confirmation:')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true }).click();
  await expect(drawer.getByTestId('listing-confirmation-error')).toContainText('could not be confirmed');
  await expect(drawer.getByTestId('listing-confirmation')).toHaveCount(0);
});
