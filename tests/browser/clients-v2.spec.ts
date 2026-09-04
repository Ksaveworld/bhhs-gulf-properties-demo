import { expect, test, type Page } from '@playwright/test';
import { evaluateMatch, latestListings } from '../../shared/matching';
import { filterClientDirectory, EMPTY_CLIENT_DIRECTORY_FILTERS } from '../../shared/client-directory';
import type { Dataset } from '../../shared/types';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);
const clientId = 'DEMO-C-001';
const directory = (page: Page) => page.getByRole('region', { name: 'Client directory', exact: true });
const detail = (page: Page) => page.locator('.client-detail-drawer .ant-drawer-content');
const cards = (page: Page) => directory(page).locator('article[data-client-id]');
const requirementDrafts = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:')).map(key => ({ key, value: localStorage.getItem(key) })));
async function clients(page: Page) { await page.goto('/#/clients'); await expect(directory(page)).toBeVisible(); }
async function openClient(page: Page, id = clientId) {
  await clients(page);
  await directory(page).locator(`article[data-client-id="${id}"]`).getByRole('button', { name: 'View Client Details' }).click();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).getByRole('tab', { name: 'Recommended Properties', exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function signedIn(page: Page) { await page.goto('/'); await ensureSalesIdentity(page); }
async function viewingForm(page: Page) {
  await detail(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  const entry = detail(page).locator('.client-detail-viewing-entry');
  if (await entry.getAttribute('open') === null) await entry.locator('summary').click();
  return entry;
}
async function saveViewing(page: Page, feedback: string) {
  const form = await viewingForm(page);
  await form.getByRole('combobox', { name: 'Viewed property', exact: true }).selectOption('DEMO-L-001');
  await form.getByLabel('Viewed at', { exact: true }).fill('2026-09-02T09:30');
  await form.getByRole('combobox', { name: 'Visit feedback signal', exact: true }).selectOption('positive');
  await form.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill(feedback);
  await form.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(detail(page).getByTestId('viewing-save-status')).toContainText('Saved to this browser');
}

test('four ordered client filters operate on actual requirements and Unassigned means an unowned company client', async ({ page, request }) => {
  const dataset = await (await request.get('/api/dataset')).json() as Dataset;
  await signedIn(page); await clients(page);
  const fields = directory(page).locator('.client-directory-fields > *');
  await expect(fields).toHaveCount(4);
  const labels = await fields.locator(':scope > span:first-child').allTextContents();
  expect(labels.map(value => value.trim())).toEqual(['Client Name', 'Preferred Location', 'Budget Range AED', 'Property Type']);
  const geometry = await fields.evaluateAll(rows => rows.map(row => row.lastElementChild!.getBoundingClientRect()).map(box => ({ y: box.y, height: box.height })));
  expect(Math.max(...geometry.map(box => box.y)) - Math.min(...geometry.map(box => box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...geometry.map(box => box.height)) - Math.min(...geometry.map(box => box.height))).toBeLessThanOrEqual(1);
  await directory(page).getByRole('textbox', { name: 'Preferred Location', exact: true }).fill('Marina');
  await directory(page).getByRole('spinbutton', { name: 'Maximum client budget', exact: true }).fill('2800000');
  const expected = filterClientDirectory(dataset.client_requirements, { ...EMPTY_CLIENT_DIRECTORY_FILTERS, preferred_location: 'Marina', budget_max: 2800000 }, () => 'company');
  expect(await cards(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')))).toEqual(expected.map(row => row.client_id));
  await directory(page).getByRole('spinbutton', { name: 'Minimum client budget', exact: true }).fill('3000000');
  await expect(cards(page)).toHaveCount(0);
  await expect(directory(page).getByText('Min. budget cannot be greater than Max. budget.', { exact: true })).toBeVisible();
  await directory(page).getByRole('button', { name: 'Clear filters', exact: true }).click();
  await directory(page).getByRole('combobox', { name: 'Client Property Type', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('Villa', { exact: true }).click();
  expect(await cards(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')))).toEqual(filterClientDirectory(dataset.client_requirements, { ...EMPTY_CLIENT_DIRECTORY_FILTERS, property_type: 'villa' }, () => 'company').map(row => row.client_id));
  await directory(page).getByRole('button', { name: 'Clear filters', exact: true }).click();
  const unassigned = directory(page).getByRole('radio', { name: 'Unassigned', exact: true });
  await unassigned.locator('xpath=ancestor::label[1]').click();
  await expect(unassigned).toBeChecked();
  expect(await cards(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')))).toEqual(filterClientDirectory(dataset.client_requirements, { ...EMPTY_CLIENT_DIRECTORY_FILTERS, visibility: 'unassigned' }, () => 'company').map(row => row.client_id));
});

test('client drawer has two tabs and its visible recommendation groups exactly match the deterministic assessments', async ({ page, request }, testInfo) => {
  const dataset = await (await request.get('/api/dataset')).json() as Dataset;
  await signedIn(page); await openClient(page);
  expect(new URL(page.url()).hash).toMatch(/^#\/clients/);
  await expect(detail(page).getByRole('tab')).toHaveText(['Recommended Properties', 'Viewing History']);
  await detail(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  const requirement = dataset.client_requirements.find(row => row.requirement_id === 'DEMO-R-001')!;
  for (const status of ['match', 'review'] as const) {
    const expected = latestListings(dataset.listing_snapshots).filter(listing => (listing.currency === 'AED' || listing.currency === null) && evaluateMatch(listing, requirement).status === status).map(row => row.listing_id);
    expect(await detail(page).locator(`[data-match-group="${status}"] article[data-listing-id]`).evaluateAll(rows => rows.map(row => row.getAttribute('data-listing-id')))).toEqual(expected);
  }
  await expect(detail(page).getByText(/Hard Conflict|Unique Clients/)).toHaveCount(0);
  await detail(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(detail(page).getByText('No viewing history recorded for this client.', { exact: true })).toBeVisible();
  await detail(page).getByRole('tab', { name: 'Recommended Properties', exact: true }).click();
  await detail(page).locator('.client-detail-property[data-listing-id="DEMO-L-001"]').getByRole('button', { name: 'View Property Details' }).click();
  const property = page.locator('.property-detail .ant-drawer-content');
  await expect(property).toBeVisible();
  await property.getByRole('tab', { name: 'Potential clients', exact: true }).click();
  const listing = latestListings(dataset.listing_snapshots).find(row => row.listing_id === 'DEMO-L-001')!;
  const clientStatuses = dataset.client_requirements.filter(row => row.client_id === clientId).map(row => evaluateMatch(listing, row).status);
  const reverseGroup = clientStatuses.includes('match') ? 'Customers with conditions met' : 'Customers needing clarification';
  await expect(property.getByRole('region', { name: reverseGroup, exact: true }).locator(`[data-client-id="${clientId}"]`)).toBeVisible();
  await testInfo.attach('client-viewport', { body: JSON.stringify(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))), contentType: 'application/json' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1366);
});

test('editing one plan preserves originals, updates one current version, and restores with history retained', async ({ page, request }) => {
  const source = await (await request.get('/api/dataset')).json() as Dataset;
  await signedIn(page); await openClient(page);
  await detail(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  await detail(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit client requirements', exact: true });
  await editor.getByRole('spinbutton', { name: 'Budget Range maximum', exact: true }).fill('2500000');
  await editor.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(detail(page).locator('.client-detail-current')).toContainText('2,500,000');
  await detail(page).locator('.client-detail-history > summary').click();
  await expect(detail(page).locator('.client-detail-history')).toContainText('Maximum budget');
  await expect(detail(page).locator('.client-detail-history')).toContainText('2800000 → 2500000');
  const copies = await requirementDrafts(page);
  expect(copies).toHaveLength(1);
  expect(JSON.parse(copies[0].value!).copies[0].edit_kind).toBe('revision');
  await page.reload();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('.client-detail-current')).toContainText('2,500,000');
  await detail(page).getByRole('button', { name: 'Restore original', exact: true }).click();
  await expect(detail(page).locator('.client-detail-current')).toContainText('2,800,000');
  await detail(page).locator('.client-detail-history > summary').click();
  await expect(detail(page).locator('.client-detail-history > ol > li')).toHaveCount(3);
  const after = await (await request.get('/api/dataset')).json() as Dataset;
  expect(after.client_requirements).toEqual(source.client_requirements);
  expect(after.match_reference).toEqual(source.match_reference);
});

test('viewing entries survive reload and reopen; reviewing feedback requires an explicit requirement save', async ({ page, context }) => {
  await signedIn(page); await openClient(page);
  const before = await requirementDrafts(page);
  await saveViewing(page, 'Synthetic QA: the client explicitly preferred a quieter outlook.');
  await expect(detail(page).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  expect(await requirementDrafts(page)).toEqual(before);
  await page.reload();
  await detail(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(detail(page).getByRole('list', { name: 'Client viewing timeline', exact: true })).toContainText('quieter outlook');
  const reopened = await context.newPage();
  await reopened.goto(page.url());
  await detail(reopened).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(detail(reopened).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await reopened.close();
  await detail(page).getByRole('button', { name: 'Review as Preference Update', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit client requirements', exact: true });
  await expect(editor.getByRole('textbox', { name: 'Preferences / Notes', exact: true })).toHaveValue(/quieter outlook/);
  expect(await requirementDrafts(page)).toEqual(before);
  await editor.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(await requirementDrafts(page)).not.toEqual(before);
});

test('viewing save failure keeps prior records and draft without a false success', async ({ page }) => {
  await signedIn(page); await openClient(page);
  await saveViewing(page, 'Synthetic QA existing viewing.');
  const prior = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:viewing-records:v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
  expect(prior).toHaveLength(1);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Synthetic QA quota failure', 'QuotaExceededError'); original.call(this, name, value); };
  }, prior[0].key);
  const form = await viewingForm(page);
  await form.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill('Synthetic unsaved draft stays visible.');
  await form.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(detail(page).getByTestId('viewing-save-error')).toContainText('Saving could not be confirmed');
  await expect(detail(page).getByTestId('viewing-save-status')).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Viewing feedback', exact: true })).toHaveValue('Synthetic unsaved draft stays visible.');
  await expect(detail(page).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  expect(await page.evaluate(key => localStorage.getItem(key), prior[0].key)).toBe(prior[0].value);
});
