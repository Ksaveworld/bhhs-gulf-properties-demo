import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { ClientRequirement, Dataset } from '../../shared/types';

type ScopedDataset = Dataset & { meta: Dataset['meta'] & { storage_namespace?: string } };
type FaultWindow = Window & { __bhhsRestoreStorage?: () => void; __bhhsStorageFaultHits?: string[] };
const originalId = 'PERSIST-R-001';
const secondOriginalId = 'PERSIST-R-002';
const clientId = 'PERSIST-C-001';
const localRows = (page: Page) => page.locator('.client-row[data-requirement-id^="SESSION-R-"]');
const row = (page: Page, id: string) => page.locator(`.client-row[data-requirement-id="${id}"]`);

async function fixture(context: BrowserContext, request: APIRequestContext, name: string, twoRequirements = false) {
  const response = await request.get('/api/dataset');
  expect(response.ok()).toBeTruthy();
  const base = await response.json() as Dataset;
  expect(base.meta.mode).toBe('demo');
  const seed = base.client_requirements.find(requirement => requirement.requirement_id === 'DEMO-R-001');
  expect(seed).toBeDefined();
  const requirement: ClientRequirement = {
    ...seed!, requirement_id: originalId, client_id: clientId, client_alias: 'Synthetic persistence client',
    raw_request: 'Synthetic browser case: a ready two-bedroom apartment in Dubai Marina, maximum AED 2.8m, at least 1,100 sqft built-up area. Parking required.',
    budget_min: null, budget_max: 2800000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Dubai Marina'],
    property_types: ['apartment'], bedrooms_min: 2, area_min: 1100, area_unit: 'sqft', area_basis: 'built_up',
    market_preference: 'ready', purchase_by: '2026-12-01', move_in_by: '2027-01-01', hard_constraints: 'must have parking',
    soft_preferences: null, missing_questions: null, data_kind: 'demo', source_ref: 'SYNTHETIC-PERSISTENCE-SOURCE-001',
    notes: 'Invented persistence regression sample; no private or incoming customer records are copied.',
  };
  const source: ScopedDataset = {
    ...structuredClone(base), client_requirements: [requirement], match_reference: [],
    meta: { ...base.meta, storage_namespace: `browser-persistence-${name}`, loaded_at: '2026-09-01T00:00:00Z' },
  };
  if (twoRequirements) source.client_requirements.push({ ...requirement, requirement_id: secondOriginalId,
    raw_request: 'Another independent synthetic request for the same client: ready Dubai Marina apartment, at least two bedrooms, maximum AED 2.6m.',
    budget_max: 2600000, source_ref: 'SYNTHETIC-PERSISTENCE-SOURCE-002' });
  let current: ScopedDataset = structuredClone(source);
  // Context routing also applies to a newly opened tab after the first page is closed.
  await context.route('**/api/dataset', route => route.fulfill({ json: current }));
  return { source, requirement, changeDataset: (next: ScopedDataset) => { current = structuredClone(next); } };
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('result-count')).toHaveText('9');
}

async function clientList(page: Page) {
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  await expect(page.getByRole('heading', { name: 'Clients & needs', exact: true })).toBeVisible();
}

async function viewRequirement(page: Page, id: string) {
  await clientList(page);
  await row(page, id).getByRole('button', { name: /View properties/ }).click();
}

async function review(page: Page, budget?: string) {
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await expect(drawer.getByTestId('requirement-save-status')).toContainText('Not saved');
  if (budget) await drawer.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill(budget);
  return drawer;
}

async function applyAndGetId(page: Page, drawer: Locator, expectedCount: string) {
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText(expectedCount);
  await expect(page.locator('.client-brief').getByTestId('local-copy-status')).toContainText('Saved in this browser');
  const selected = page.getByRole('combobox', { name: 'Select a client requirement', exact: true })
    .locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]');
  const id = (await selected.innerText()).match(/SESSION-R-[a-z0-9-]+/i)?.[0];
  expect(id).toBeTruthy();
  return id!;
}

async function saveOriginalReview(page: Page, id = originalId, budget = '2500000', expectedCount = '1') {
  await viewRequirement(page, id);
  return applyAndGetId(page, await review(page, budget), expectedCount);
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:v1:')).sort()
    .map(key => ({ key, value: localStorage.getItem(key) })));
}

test('new requirements and another review of a saved copy survive reload and reopening the tab as separate records', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fixture(context, request, 'new-and-review');
  await ready(page);
  await expect(page.getByTestId('local-storage-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Client requirements', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  const text = 'Looking for a ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m, for self use. Must have parking. Purchase by 2026-12-01.';
  await drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill(text);
  await drawer.getByRole('button', { name: 'Extract requirements', exact: true }).click();
  await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2800000');
  await drawer.getByRole('textbox', { name: 'Client alias', exact: true }).fill('Synthetic locally added client');
  const newId = await applyAndGetId(page, drawer, '2');
  drawer = await review(page, '2500000');
  await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(text);
  const revisedId = await applyAndGetId(page, drawer, '1');
  expect(revisedId).not.toBe(newId);
  await page.reload();
  await clientList(page);
  await expect(localRows(page)).toHaveCount(2);
  await expect(row(page, newId).getByTestId('local-copy-status')).toContainText('Saved in this browser');
  await expect(row(page, revisedId)).toContainText(text);
  await expect(row(page, originalId)).toBeVisible();

  await page.close();
  const reopened = await context.newPage();
  try {
    await ready(reopened);
    await clientList(reopened);
    await expect(localRows(reopened)).toHaveCount(2);
    await viewRequirement(reopened, newId);
    await expect(reopened.getByTestId('result-count')).toHaveText('2');
    await viewRequirement(reopened, revisedId);
    await expect(reopened.getByTestId('result-count')).toHaveText('1');
    drawer = await review(reopened);
    await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(text);
    await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2500000');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await reopened.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
    const property = reopened.getByRole('dialog');
    await property.getByRole('tab', { name: /Potential clients/ }).click();
    const addedClient = property.getByRole('article', { name: 'Client match for Synthetic locally added client', exact: true });
    await expect(addedClient).toHaveCount(1);
    await addedClient.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
    await expect(addedClient.locator(`[data-requirement-id="${newId}"]`)).toBeVisible();
    await expect(addedClient.locator(`[data-requirement-id="${revisedId}"]`)).toBeVisible();
    expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { await reopened.close(); }
});

test('copies are isolated by namespace and payload version while a new load timestamp preserves the same version', async ({ page, context, request }) => {
  const { source, changeDataset } = await fixture(context, request, 'source-version');
  await ready(page);
  const copyId = await saveOriginalReview(page);
  changeDataset({ ...source, meta: { ...source.meta, loaded_at: '2026-09-03T12:34:56Z' } });
  await page.reload();
  await clientList(page);
  await expect(row(page, copyId)).toBeVisible();

  changeDataset({ ...source, meta: { ...source.meta, storage_namespace: 'browser-persistence-other-source' } });
  await page.reload();
  await clientList(page);
  await expect(localRows(page)).toHaveCount(0);
  await expect(row(page, originalId)).toBeVisible();

  const nextVersion = structuredClone(source);
  nextVersion.listing_snapshots[0].title += ' · synthetic revised source';
  changeDataset(nextVersion);
  await page.reload();
  await clientList(page);
  await expect(localRows(page)).toHaveCount(0);
  await expect(row(page, originalId)).toBeVisible();

  changeDataset(source);
  await page.reload();
  await clientList(page);
  await expect(localRows(page)).toHaveCount(1);
  await expect(row(page, copyId)).toBeVisible();
  await viewRequirement(page, copyId);
  await expect(page.getByTestId('result-count')).toHaveText('1');
});

test('deleting one same-client copy preserves the other, and Restore original removes only the current copy', async ({ page, context, request }) => {
  const { source } = await fixture(context, request, 'delete-and-restore', true);
  await ready(page);
  const firstCopy = await saveOriginalReview(page);
  const secondCopy = await saveOriginalReview(page, secondOriginalId, '2800000', '2');
  await clientList(page);
  await expect(page.locator('.client-row')).toHaveCount(4);
  await expect(localRows(page)).toHaveCount(2);
  for (const id of [originalId, secondOriginalId]) {
    await expect(row(page, id).getByRole('button', { name: 'Delete local copy', exact: true })).toHaveCount(0);
    await expect(row(page, id).getByRole('button', { name: 'Restore original', exact: true })).toHaveCount(0);
  }
  await row(page, firstCopy).getByRole('button', { name: 'Delete local copy', exact: true }).click();
  await expect(row(page, firstCopy)).toHaveCount(0);
  await expect(row(page, secondCopy)).toBeVisible();
  await page.reload();
  await clientList(page);
  await expect(page.locator('.client-row')).toHaveCount(3);
  await expect(localRows(page)).toHaveCount(1);
  await viewRequirement(page, secondCopy);
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await page.locator('.client-brief').getByRole('button', { name: 'Restore original', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.locator('.client-brief').getByTestId('local-copy-status')).toHaveCount(0);
  const drawer = await review(page);
  await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2600000');
  await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(source.client_requirements[1].raw_request);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await clientList(page);
  await expect(page.locator('.client-row')).toHaveCount(2);
  await expect(localRows(page)).toHaveCount(0);
  await expect(row(page, originalId)).toBeVisible();
  await expect(row(page, secondOriginalId)).toBeVisible();
});

for (const failureName of ['QuotaExceededError', 'SecurityError'] as const) {
  test(`${failureName} preserves the open draft and previous saved copy, and a later successful retry persists`, async ({ page, context, request }) => {
    await fixture(context, request, `save-failure-${failureName}`);
    await ready(page);
    const existingCopy = await saveOriginalReview(page);
    const before = await storageSnapshot(page);
    expect(before.length).toBeGreaterThan(0);
    const drawer = await review(page, '2600000');
    const raw = await drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).inputValue();
    const hard = await drawer.getByRole('textbox', { name: 'Other hard restrictions', exact: true }).inputValue();
    await page.evaluate(({ name, keys }) => {
      const original = Storage.prototype.setItem;
      const target = window as FaultWindow;
      target.__bhhsStorageFaultHits = [];
      target.__bhhsRestoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (keys.includes(key)) {
          target.__bhhsStorageFaultHits!.push(key);
          throw new DOMException('Synthetic local-storage write failure for browser acceptance.', name);
        }
        return original.call(this, key, value);
      };
    }, { name: failureName, keys: before.map(item => item.key) });
    await drawer.getByRole('button', { name: 'Apply to property library' }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('requirement-save-error')).toBeVisible();
    await expect(drawer.getByTestId('requirement-save-status')).toContainText('Not saved');
    await expect(page.getByTestId('local-storage-error')).toBeVisible();
    await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2600000');
    await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(raw);
    await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions', exact: true })).toHaveValue(hard);
    expect(await storageSnapshot(page)).toEqual(before);
    expect(await page.evaluate(() => (window as FaultWindow).__bhhsStorageFaultHits!.length)).toBeGreaterThan(0);
    await page.evaluate(() => (window as FaultWindow).__bhhsRestoreStorage!());
    const retryCopy = await applyAndGetId(page, drawer, '1');
    expect(retryCopy).not.toBe(existingCopy);
    await page.reload();
    await clientList(page);
    await expect(localRows(page)).toHaveCount(2);
    await expect(row(page, existingCopy)).toBeVisible();
    await expect(row(page, retryCopy)).toBeVisible();
    await viewRequirement(page, retryCopy);
    const restored = await review(page);
    await expect(restored.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2600000');
    await expect(restored.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(raw);
  });
}

test('a restored copy produces consistent forward candidates and per-requirement reverse reasons without changing price sources', async ({ page, context, request }) => {
  await fixture(context, request, 'matching-and-prices');
  await ready(page);
  const copyId = await saveOriginalReview(page);
  await page.reload();
  await viewRequirement(page, copyId);
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  let drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  await expect(drawer.getByTestId('client-count-total')).toHaveText('1');
  let client = drawer.locator(`article[data-client-id="${clientId}"]`);
  await client.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  await expect(client.locator(`[data-requirement-id="${copyId}"]`)).toContainText('Conditions met');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Clear client search', exact: true }).click();
  await page.getByTestId('listing-DEMO-L-002').getByRole('button', { name: /^Open / }).click();
  drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  client = drawer.locator(`article[data-client-id="${clientId}"]`);
  await client.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  const conflicted = client.locator(`[data-requirement-id="${copyId}"]`);
  await expect(conflicted).toContainText('Hard condition conflict');
  await expect(conflicted).toContainText('200,000');
  await conflicted.getByRole('button', { name: `View properties for ${copyId}`, exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  drawer = page.getByRole('dialog');
  await expect(drawer.getByText('AED 2,450,000', { exact: true })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  await expect(history.getByText('Sales recorded: 3', { exact: true })).toBeVisible();
  await expect(drawer.locator('.pd-comparable-section').getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true })).toHaveCount(1);
  await history.getByRole('button', { name: 'View transaction DEMO-T-001', exact: true }).click();
  const record = history.getByRole('article', { name: 'Same-property transaction DEMO-T-001', exact: true });
  await expect(record.locator('details.pd-source-details').getByText('DEMO-SOURCE-T-001', { exact: true })).toBeVisible();
});
