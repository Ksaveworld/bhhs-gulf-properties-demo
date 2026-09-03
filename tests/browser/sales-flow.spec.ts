import { expect, test, type Locator, type Page } from '@playwright/test';
import { newRequirement, openPropertyLibrary } from './helpers';

const filterPanel = (page: Page) => page.getByRole('region', { name: 'Property filters' });
async function choose(page: Page, scope: Page | Locator, label: string, value: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
  await page.keyboard.press('Escape');
}
async function ready(page: Page) {
  await openPropertyLibrary(page);
}
async function listingIds(page: Page) {
  return page.locator('.property-table tbody tr[data-testid]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')));
}

test('budget, area, completion and missing fields change actual inventory', async ({ page }) => {
  await ready(page);
  await expect(page.getByText('Demonstration only · Properties, prices, transactions and clients are fictional samples.')).toBeVisible();
  const scope = filterPanel(page);
  await choose(page, scope, 'Area / community', 'Dubai Marina');
  await expect(page.getByTestId('result-count')).toHaveText('3');
  await expect(page.getByTestId('listing-DEMO-L-007')).toContainText('Price not disclosed');
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2800000');
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2500000');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('100');
  await expect(page.getByText('No properties meet these filters.')).toBeVisible();
  await scope.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await scope.getByRole('button', { name: 'More filters' }).click();
  await choose(page, scope, 'Completion', 'Off-plan');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('listing-DEMO-L-006')).toBeVisible();
});

test('ordinary filters and reviewed assistant produce identical candidates, including editable budget', async ({ page }) => {
  await ready(page);
  const scope = filterPanel(page);
  await choose(page, scope, 'Area / community', 'Dubai Marina');
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2800000');
  await choose(page, scope, 'Bedrooms', '2+ bedrooms');
  await choose(page, scope, 'Property type', 'apartment');
  await scope.getByRole('button', { name: 'More filters' }).click();
  await choose(page, scope, 'Completion', 'Ready');
  await expect(page.getByTestId('result-count')).toHaveText('2');
  const manual = await listingIds(page);
  const drawer = await newRequirement(page);
  await drawer.getByRole('textbox', { name: 'Sales conversation / notes' }).fill('Budget up to AED 2.8m. A ready 2 bedroom apartment in Dubai Marina for self use. Purchase by 2026-12-01.');
  await drawer.getByRole('button', { name: 'Extract requirements', exact: true }).click();
  await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2800000');
  await expect(drawer.getByText('Pattern extraction · No language model connected')).toBeVisible();
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(drawer).toBeHidden();
  expect(await listingIds(page)).toEqual(manual);
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2500000');
  await expect(page.getByTestId('result-count')).toHaveText('1');
});

test('details preserve identity, original units and distinct price evidence; property-to-client-to-properties works', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Open Marina Vista · two bedroom', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('AED 2,450,000', { exact: true })).toBeVisible();
  await expect(drawer.getByText('1,280 sq ft', { exact: true })).toBeVisible();
  await expect(drawer.getByText('DEMO-P-001', { exact: true })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  const comps = drawer.locator('.pd-comparable-section');
  await expect(history.getByRole('article', { name: 'Same-property transaction DEMO-T-001', exact: true }).getByText('DEMO-T-001', { exact: true })).toBeVisible();
  await expect(comps.getByText('DEMO-T-002', { exact: true })).toBeVisible();
  await expect(history.getByText('DEMO-T-002', { exact: true })).toHaveCount(0);
  await expect(comps.getByText('DEMO-T-001', { exact: true })).toHaveCount(0);
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  await expect(drawer.locator('article[data-client-id]')).toHaveCount(6);
  const client = drawer.getByRole('article', { name: 'Client match for Demo client A · Marina home', exact: true });
  await client.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  await expect(client.locator('[data-requirement-id="DEMO-R-007"]').getByText('Matched conditions', { exact: true })).toBeVisible();
  await expect(client.getByText('Budget fit', { exact: true })).toBeVisible();
  await client.getByRole('button', { name: 'View properties for Demo client A · Marina home', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  expect(await listingIds(page)).toEqual(['listing-DEMO-L-001', 'listing-DEMO-L-002']);
});

test('no-history, absent measurements and withdrawn states remain honest', async ({ page }) => {
  await ready(page);
  const scope = filterPanel(page);
  await choose(page, scope, 'Area / community', 'Jumeirah Village Circle');
  await expect(page.getByTestId('listing-DEMO-L-008')).toContainText('Size undisclosed');
  await page.getByTestId('listing-DEMO-L-008').getByRole('button', { name: /^Open / }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Price evidence' }).click();
  await expect(drawer.getByText('No available same-property sale history.')).toBeVisible();
  await expect(drawer.getByText('No eligible comparable sale records.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await scope.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await scope.getByRole('button', { name: 'More filters' }).click();
  await choose(page, scope, 'Listing status', 'Withdrawn');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await page.getByTestId('listing-DEMO-L-009').getByRole('button', { name: /^Open / }).click();
  await expect(drawer.getByText('This listing is withdrawn.', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Recorded asking price', { exact: true })).toBeVisible();
});

test('area conversion preserves basis, unknown basis and invalid budgets have recovery paths', async ({ page }) => {
  await ready(page);
  const scope = filterPanel(page);
  await choose(page, scope, 'Area / community', 'Dubai Marina');
  await scope.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2800000');
  await scope.getByRole('button', { name: 'More filters' }).click();
  await scope.getByRole('spinbutton', { name: 'Min. size', exact: true }).fill('1300');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('listing-DEMO-L-002')).toBeVisible();
  const sqftCandidates = await listingIds(page);
  // The library uses sqft while request review must preserve a supplied sqm condition.
  await expect(scope.getByRole('combobox', { name: 'Area unit', exact: true })).toHaveCount(0);
  await scope.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1400');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  const review = await newRequirement(page);
  await review.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill('Budget up to AED 2.8m. Apartment in Dubai Marina.');
  await review.getByRole('button', { name: 'Extract requirements', exact: true }).click();
  await choose(page, review, 'Area unit', 'sqm');
  await review.getByRole('spinbutton', { name: 'Min. area', exact: true }).fill('120.774');
  await choose(page, review, 'Area basis', 'built up');
  await review.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await listingIds(page)).toEqual(sqftCandidates);
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await expect(restored.getByRole('spinbutton', { name: 'Min. area', exact: true })).toHaveValue('120.774');
  await expect(restored.getByRole('combobox', { name: 'Area unit', exact: true }).locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]')).toContainText('sqm');
  await restored.getByRole('button', { name: 'Close', exact: true }).click();
  await scope.getByRole('button', { name: 'More filters' }).click();
  await choose(page, scope, 'Area basis', 'Needs confirmation · 面积口径待确认');
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await expect(scope.getByTestId('library-area-warning')).toContainText('面积口径待确认');
  await expect(page.getByText('Area comparison is awaiting confirmation.', { exact: true })).toBeVisible();
  await scope.getByRole('spinbutton', { name: 'Min. price', exact: true }).fill('9000000');
  await expect(scope.getByText('Minimum price must not exceed maximum price.')).toBeVisible();
  await scope.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('8');
});

test('loading and failed refresh keep a recovery action and do not leave stale listings presented as current', async ({ page }) => {
  await ready(page);
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/dataset', async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Loading property data' })).toBeVisible();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  release!();
  await expect(page.getByTestId('result-count')).toHaveText('8');
  await page.unroute('**/api/dataset');
  await page.route('**/api/dataset', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DATA_UNAVAILABLE"}}' }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByText('Data unavailable', { exact: true })).toBeVisible();
  await expect(page.getByTestId('result-count')).toHaveCount(0);
  await page.unroute('**/api/dataset');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByTestId('result-count')).toHaveText('8');
});

test('1366 by 768 desktop supports the full navigation and draft review', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  await expect(page.locator('.client-directory-results')).toContainText('8 requirements');
  const drawer = await newRequirement(page);
  await drawer.getByRole('button', { name: 'Use demo conversation', exact: true }).click();
  await drawer.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2500000');
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Price evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Same-property history', exact: true })).toBeVisible();
});

test('price order respects the AED library scope and a USD source keeps USD in its direct detail', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Sort asking price ascending', exact: true }).click();
  await expect.poll(async () => (await listingIds(page))[0]).toBe('listing-DEMO-L-008');
  await choose(page, filterPanel(page), 'Area / community', 'Palm Jumeirah');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await listingIds(page)).toEqual(['listing-DEMO-L-004']);
  await expect(page.getByTestId('listing-DEMO-L-010')).toHaveCount(0);
  // The AED inventory does not relabel or convert the retained USD source record.
  await page.goto('/#/properties?listing=DEMO-L-010');
  await expect(page.getByRole('dialog').getByText('USD 1,250,000', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  const client = page.locator('.client-row[data-requirement-id="DEMO-R-004"]');
  await client.getByRole('button', { name: /View properties/ }).click();
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await expect(page.getByText('No properties meet these filters.')).toBeVisible();
});

test('an empty accepted dataset provides usable property and client empty states', async ({ page, request }) => {
  const original = await (await request.get('/api/dataset')).json();
  await page.route('**/api/dataset', route => route.fulfill({ json: { ...original, listing_snapshots: [], transactions: [], listing_transaction_links: [], client_requirements: [], match_reference: [] } }));
  await openPropertyLibrary(page, '0');
  await expect(page.getByText('No properties meet these filters.')).toBeVisible();
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  await expect(page.getByText('No client requirements are available.')).toBeVisible();
  await page.unroute('**/api/dataset');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('.client-directory-results')).toContainText('8 requirements');
});
