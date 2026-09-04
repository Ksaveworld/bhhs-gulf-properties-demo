import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { requirementStorageKey, type LocalRequirementCopy } from '../../shared/local-requirements';
import { salesRequirementKey } from '../../shared/sales-identity';
import type { ClientRequirement, Dataset } from '../../shared/types';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);
const clientId = 'DEMO-LIFECYCLE-C';
const originalId = 'DEMO-LIFECYCLE-R';
const drawer = (page: Page) => page.locator('.client-detail-drawer .ant-drawer-content');
const directory = (page: Page) => page.getByRole('region', { name: 'Client directory', exact: true });
const home = (page: Page) => page.getByRole('region', { name: 'Sales task workspace', exact: true });
const current = (page: Page) => drawer(page).locator('.client-detail-current');
const editor = (page: Page) => page.getByRole('dialog', { name: 'Edit client requirements', exact: true });
const localSnapshot = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:')).sort().map(key => ({ key, raw: localStorage.getItem(key)! })));
const copies = async (page: Page) => (await localSnapshot(page)).flatMap(entry => (JSON.parse(entry.raw) as { copies: LocalRequirementCopy[] }).copies);
const propertyIds = (page: Page) => drawer(page).locator('.client-detail-property').evaluateAll(rows => rows.map(row => row.getAttribute('data-listing-id')));
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message)); });
test.afterEach(async ({ page }) => { expect.soft(errors.get(page)).toEqual([]); if (!page.isClosed()) expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); });

async function fixture(context: BrowserContext, request: APIRequestContext, name: string, changes: Partial<ClientRequirement> = {}) {
  const base = await (await request.get('/api/dataset')).json() as Dataset;
  const seed = base.client_requirements.find(row => row.requirement_id === 'DEMO-R-001')!;
  const req: ClientRequirement = { ...seed, requirement_id: originalId, client_id: clientId, client_alias: 'Synthetic lifecycle client',
    raw_request: 'A ready apartment in Dubai Marina, at least 2 bedrooms, budget up to AED 2.8m, at least 1100 sqft built-up area. Must have parking.',
    budget_min: null, budget_max: 2800000, budget_constraint: 'hard', preferred_areas: ['Dubai Marina'], property_types: ['apartment'], bedrooms_min: 2,
    area_min: 1100, area_max: null, area_basis: 'built_up', area_unit: 'sqft', market_preference: 'ready', purchase_by: '2026-12-01', move_in_by: '2027-01-01',
    hard_constraints: 'must have parking', soft_preferences: null, missing_questions: null, source_ref: 'DEMO-LIFECYCLE-SOURCE', notes: 'Invented browser case only.', ...changes };
  const source: Dataset = { ...structuredClone(base), client_requirements: [req], match_reference: [], meta: { ...base.meta, storage_namespace: 'demo-lifecycle-' + name } };
  let value = source;
  await context.route('**/api/dataset', route => route.fulfill({ json: value }));
  return { source, change: (next: Dataset) => { value = next; } };
}
async function signIn(page: Page, id = 'LIFECYCLE-A') {
  const active = page.getByTestId('current-sales-identity');
  await expect(active.or(page.getByRole('banner').getByRole('button', { name: /Sign in$/ }))).toBeVisible();
  if (await active.isVisible()) await page.getByRole('button', { name: 'Switch sales identity', exact: true }).click();
  else await page.getByRole('banner').getByRole('button', { name: /Sign in$/ }).click();
  const modal = page.getByRole('dialog', { name: 'Sales sign in', exact: true });
  await modal.getByRole('textbox', { name: 'Username', exact: true }).fill('Synthetic ' + id);
  await modal.getByRole('textbox', { name: 'Sales ID', exact: true }).fill(id);
  await modal.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(modal).toBeHidden();
}
async function openClient(page: Page, id = clientId) { await page.goto('/#/clients'); await directory(page).locator('article[data-client-id="' + id + '"]').getByRole('button', { name: 'View Client Details' }).click(); await expect(drawer(page)).toBeVisible(); }
async function saveEdit(page: Page, budget: string) { await drawer(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click(); await editor(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true }).fill(budget); await editor(page).getByRole('button', { name: 'Save requirements', exact: true }).click(); await expect(editor(page)).toBeHidden(); await expect(current(page)).toHaveAttribute('data-requirement-id', /^SESSION-R-/); return (await current(page).getAttribute('data-requirement-id'))!; }

test('batch and content-version isolation survive reload and reopening while timestamps keep the same saved version', async ({ page, request, context }) => {
  const { source, change } = await fixture(context, request, 'scope');
  await page.goto('/'); await signIn(page); await openClient(page);
  const saved = await saveEdit(page, '2500000');
  const candidateIds = await propertyIds(page);
  expect(candidateIds).toEqual(['DEMO-L-001', 'DEMO-L-007']);
  change({ ...source, meta: { ...source.meta, loaded_at: '2026-09-04T12:00:00Z' } });
  await page.reload(); await expect(current(page)).toHaveAttribute('data-requirement-id', saved);
  change({ ...source, meta: { ...source.meta, storage_namespace: 'demo-lifecycle-other-batch' } });
  await page.reload(); await expect(current(page)).toHaveAttribute('data-requirement-id', originalId);
  const revised = structuredClone(source); revised.listing_snapshots[0].title += ' revised synthetic input'; change(revised);
  await page.reload(); await expect(current(page)).toHaveAttribute('data-requirement-id', originalId);
  change(source); await page.reload(); await expect(current(page)).toHaveAttribute('data-requirement-id', saved);
  expect(await propertyIds(page)).toEqual(candidateIds);
  const url = page.url(); await page.close(); const reopened = await context.newPage();
  await reopened.goto(url); await expect(current(reopened)).toHaveAttribute('data-requirement-id', saved); expect(await propertyIds(reopened)).toEqual(candidateIds);
  await drawer(reopened).locator('.client-detail-property[data-listing-id="DEMO-L-001"]').getByRole('button', { name: 'View Property Details', exact: true }).click();
  const property = reopened.locator('.property-detail .ant-drawer-content'); await property.getByRole('tab', { name: 'Potential clients', exact: true }).click();
  await expect(property.locator('article[data-client-id="' + clientId + '"]')).toBeVisible();
  await reopened.close();
});

test('browser storage read failure keeps saved bytes and recovers through the visible retry action', async ({ page, request, context }) => {
  await fixture(context, request, 'read-failure'); await page.goto('/'); await signIn(page); await openClient(page);
  const id = await saveEdit(page, '2500000'); const before = await localSnapshot(page);
  await page.addInitScript(() => { const original = Storage.prototype.getItem; (window as Window & { restoreRead?: () => void }).restoreRead = () => { Storage.prototype.getItem = original; }; Storage.prototype.getItem = function (key) { if (key.startsWith('bhhs:local-requirements:')) throw new DOMException('Synthetic blocked read', 'SecurityError'); return original.call(this, key); }; });
  await page.reload(); await expect(page.getByTestId('local-storage-error')).toContainText('could not be loaded');
  await page.evaluate(() => (window as Window & { restoreRead?: () => void }).restoreRead!());
  expect(await localSnapshot(page)).toEqual(before);
  await drawer(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Retry local storage', exact: true }).click();
  await expect(page.getByTestId('local-storage-error')).toHaveCount(0); await openClient(page); await expect(current(page)).toHaveAttribute('data-requirement-id', id);
});

test('an existing revision survives a denied write and the unchanged draft can be saved after retry', async ({ page, request, context }) => {
  await fixture(context, request, 'write-retry'); await page.goto('/'); await signIn(page); await openClient(page);
  await saveEdit(page, '2500000'); const before = await localSnapshot(page);
  await drawer(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click();
  await editor(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true }).fill('2600000');
  await page.evaluate(() => { const original = Storage.prototype.setItem; (window as Window & { restoreWrite?: () => void }).restoreWrite = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function (key, value) { if (key.startsWith('bhhs:local-requirements:')) throw new DOMException('Synthetic blocked write', 'SecurityError'); return original.call(this, key, value); }; });
  await editor(page).getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(editor(page)).toContainText('Saving could not be confirmed'); await expect(editor(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true })).toHaveValue('2600000'); expect(await localSnapshot(page)).toEqual(before);
  await page.evaluate(() => (window as Window & { restoreWrite?: () => void }).restoreWrite!());
  // AntD's transparent leaving loading icon can remain in the accessible name after busy is false.
  const retry = editor(page).getByRole('button', { name: /Save requirements$/ });
  await expect(retry).toBeEnabled(); await expect(retry).not.toHaveClass(/ant-btn-loading\b/);
  await retry.click(); await expect(editor(page)).toBeHidden();
  await page.reload(); await expect(current(page)).toContainText('2,600,000'); expect(await copies(page)).toHaveLength(2);
});

test('unknown and conflicting area bases stay pending and v1 legacy basis remains compatible without rewriting originals', async ({ page, request, context }) => {
  const { source, change } = await fixture(context, request, 'basis', { area_basis: 'unknown', hard_constraints: 'area basis: built_up; must have parking' });
  await page.goto('/'); await signIn(page); await openClient(page);
  await expect(current(page)).toContainText('Area basis needs confirmation'); await expect(drawer(page).locator('[data-match-group="match"] article')).toHaveCount(0);
  await saveEdit(page, '2800000'); expect((await copies(page))[0].requirement.area_basis).toBe('unknown');
  const conflict = structuredClone(source); conflict.client_requirements[0].area_basis = 'internal'; change(conflict); await page.reload();
  await expect(current(page)).toContainText('Area basis needs confirmation'); await drawer(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click();
  await expect(editor(page)).toContainText('Structured field (internal)'); await expect(editor(page)).toContainText('legacy statements (built_up)'); await editor(page).getByRole('button', { name: 'Close', exact: true }).click();
  const legacy = structuredClone(source); delete legacy.client_requirements[0].area_basis; change(legacy); await page.reload();
  await expect(current(page).getByText('Area basis needs confirmation', { exact: true })).toHaveCount(0); expect(await propertyIds(page)).toEqual(['DEMO-L-001', 'DEMO-L-002', 'DEMO-L-007']);
  expect(source.client_requirements[0].area_basis).toBe('unknown'); expect(source.client_requirements[0].hard_constraints).toBe('area basis: built_up; must have parking');
});

test('Chinese equivalent, contradictory and unrecognized hard wording remains traceable after editing and saving', async ({ page, request, context }) => {
  const text = '预算不超过AED 2.8M；不少于2卧室；面积不低于1100平方英尺；只考虑现房；必须有停车位。';
  const { source, change } = await fixture(context, request, 'wording', { raw_request: text, hard_constraints: text });
  await page.goto('/'); await signIn(page); await openClient(page);
  await expect(drawer(page).locator('[data-match-group="match"] article')).toHaveCount(2);
  await drawer(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click();
  await editor(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true }).fill('2500000');
  await expect(editor(page)).toContainText('budget_max'); await editor(page).getByRole('button', { name: 'Save requirements', exact: true }).click(); await expect(editor(page)).toBeHidden();
  await expect(drawer(page).locator('[data-match-group="match"] article')).toHaveCount(0); await expect(drawer(page).locator('[data-match-group="review"] article')).toHaveCount(2);
  expect((await copies(page))[0].requirement.raw_request).toBe(text); expect((await copies(page))[0].requirement.hard_constraints).toBe(text);
  const unresolved = structuredClone(source); Object.assign(unresolved.client_requirements[0], { raw_request: '需要花园和停车位；最多2卧室；面积约1100平方英尺；必须能够从客厅看到晨光。', hard_constraints: '必须有停车位；最多2卧室；面积约1100平方英尺；必须能够从客厅看到晨光。', soft_preferences: '偏好花园' });
  change(unresolved); await page.reload(); await drawer(page).getByRole('button', { name: 'Edit Current Needs', exact: true }).click();
  for (const clause of ['requires garden', '最多2卧室', '面积约1100平方英尺', '必须能够从客厅看到晨光']) await expect(editor(page)).toContainText(clause);
  await editor(page).getByRole('button', { name: 'Save requirements', exact: true }).click(); await expect(editor(page)).toBeHidden();
  await page.reload(); await expect(drawer(page).locator('[data-match-group="match"] article')).toHaveCount(0);
});

test('deleting one current local revision reveals its parent, retains the other plan, and restoring keeps history', async ({ page, request, context }) => {
  const { source } = await fixture(context, request, 'delete');
  source.client_requirements.push({ ...source.client_requirements[0], requirement_id: 'DEMO-LIFECYCLE-OTHER', preferred_areas: ['Downtown Dubai'], captured_at: '2020-01-01T00:00:00Z', raw_request: 'Independent synthetic Downtown Dubai purchase plan.' });
  await page.goto('/'); await signIn(page); await openClient(page);
  await drawer(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption(originalId);
  const first = await saveEdit(page, '2500000'); const second = await saveEdit(page, '2600000'); expect(first).not.toBe(second);
  await drawer(page).getByRole('button', { name: 'Delete local copy', exact: true }).click(); await expect(current(page)).toHaveAttribute('data-requirement-id', first);
  await page.reload(); await expect(current(page)).toHaveAttribute('data-requirement-id', first); expect((await copies(page)).map(copy => copy.requirement.requirement_id)).toEqual([first]);
  await expect(drawer(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).locator('option')).toHaveCount(2);
  await drawer(page).getByRole('button', { name: 'Restore original', exact: true }).click(); await expect(current(page)).toContainText('2,800,000');
  await drawer(page).locator('.client-detail-history > summary').click(); await expect(drawer(page).locator('.client-detail-history > ol > li')).toHaveCount(3);
  expect((await copies(page)).map(copy => copy.requirement.requirement_id)).toContain(first); expect(source.client_requirements).toHaveLength(2);
});

test('old unowned browser copies stay available separately and are not reassigned as company Unassigned clients', async ({ page, request, context }) => {
  const { source } = await fixture(context, request, 'legacy'); const key = await requirementStorageKey(source);
  const copy: LocalRequirementCopy = { requirement: { ...source.client_requirements[0], requirement_id: 'LEGACY-LOCAL-R', client_id: 'LEGACY-LOCAL-C', client_alias: 'Synthetic legacy local client', sales_owner: null }, original_requirement_id: null, parent_requirement_id: null, saved_at: '2026-09-01T00:00:00Z' };
  const raw = JSON.stringify({ version: 1, key, revision: 'legacy-browser-version', copies: [copy] });
  await page.goto('/'); await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw }); await page.reload(); await page.goto('/#/clients');
  await expect(directory(page).locator('article[data-client-id="LEGACY-LOCAL-C"]')).toHaveCount(0);
  await directory(page).locator('.client-directory-data-notes > summary').click(); await directory(page).getByRole('button', { name: 'Review legacy local copies', exact: true }).click();
  await expect(directory(page).locator('article[data-client-id="LEGACY-LOCAL-C"]')).toBeVisible();
  await directory(page).getByRole('radio', { name: 'Unassigned', exact: true }).locator('xpath=ancestor::label[1]').click(); await expect(directory(page).locator('article[data-client-id="LEGACY-LOCAL-C"]')).toHaveCount(0);
  await signIn(page); await page.goto('/#/clients'); await expect(directory(page).locator('.client-directory-data-notes')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw); expect(await page.evaluate(key => localStorage.getItem(key), salesRequirementKey(key, 'LIFECYCLE-A'))).toBeNull();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.goto('/#/clients'); await directory(page).locator('.client-directory-data-notes > summary').click(); await directory(page).getByRole('button', { name: 'Review legacy local copies', exact: true }).click(); await expect(directory(page).locator('article[data-client-id="LEGACY-LOCAL-C"]')).toBeVisible();
});

test('first sign-in retains the guest draft but A/B switches and sign-out clear unsaved notes while saved copies remain owner scoped', async ({ page, request, context }) => {
  await fixture(context, request, 'identity'); await page.goto('/'); const notes = home(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true });
  await notes.fill('Synthetic guest draft retained on first sign-in.'); await signIn(page); await expect(notes).toHaveValue('Synthetic guest draft retained on first sign-in.');
  await openClient(page); const id = await saveEdit(page, '2500000'); await drawer(page).getByRole('button', { name: 'Close', exact: true }).click(); await page.goto('/');
  await notes.fill('Synthetic A confidential unsaved draft.'); await signIn(page, 'LIFECYCLE-B'); await expect(notes).toHaveValue('');
  await openClient(page); await expect(current(page)).toHaveAttribute('data-requirement-id', originalId);
  await drawer(page).getByRole('button', { name: 'Close', exact: true }).click(); await page.goto('/'); await notes.fill('Synthetic B confidential unsaved draft.'); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(notes).toHaveValue('');
  await signIn(page); await openClient(page); await expect(current(page)).toHaveAttribute('data-requirement-id', id);
});

test('loading, API error and accepted empty data replace stale rows and retain recovery actions', async ({ page, request }) => {
  const source = await (await request.get('/api/dataset')).json() as Dataset;
  await page.goto('/#/properties'); await expect(page.getByTestId('result-count')).toHaveText('8');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/dataset', async route => { await gate; await route.fulfill({ json: source }); });
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click(); await expect(page.getByRole('status', { name: 'Loading property data' })).toBeVisible(); await expect(page.getByTestId('result-count')).toHaveCount(0);
  release(); await expect(page.getByTestId('result-count')).toHaveText('8'); await page.unroute('**/api/dataset');
  await page.route('**/api/dataset', route => route.fulfill({ status: 503, body: 'Synthetic API unavailable' })); await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByText('Data unavailable', { exact: true })).toBeVisible(); await expect(page.getByTestId('result-count')).toHaveCount(0); await page.unroute('**/api/dataset');
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click(); await expect(page.getByTestId('result-count')).toHaveText('8');
  await page.route('**/api/dataset', route => route.fulfill({ json: { ...source, listing_snapshots: [], transactions: [], listing_transaction_links: [], client_requirements: [], match_reference: [] } }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click(); await expect(page.getByTestId('result-count')).toHaveText('0'); await expect(page.getByText('No properties meet these filters.', { exact: true })).toBeVisible();
  await page.goto('/#/clients'); await expect(directory(page).getByText('No clients match these filters.', { exact: true })).toBeVisible(); await page.unroute('**/api/dataset'); await page.getByRole('button', { name: 'Refresh data', exact: true }).click(); await expect(directory(page).locator('article[data-client-id]')).not.toHaveCount(0);
});

test('all column sort directions change paginated rows and details retain USD, withdrawn and unknown-size facts', async ({ page }) => {
  await page.goto('/#/properties'); await expect(page.getByTestId('result-count')).toHaveText('8');
  const rows = () => page.locator('.property-table tbody tr[data-testid]').evaluateAll(items => items.map(item => item.getAttribute('data-testid')!.replace('listing-', '')));
  const orders = [
    ['Sort asking price ascending', ['DEMO-L-008', 'DEMO-L-005', 'DEMO-L-006', 'DEMO-L-001', 'DEMO-L-002', 'DEMO-L-003', 'DEMO-L-004', 'DEMO-L-007']],
    ['Sort asking price descending', ['DEMO-L-004', 'DEMO-L-003', 'DEMO-L-002', 'DEMO-L-001', 'DEMO-L-006', 'DEMO-L-005', 'DEMO-L-008', 'DEMO-L-007']],
    ['Sort updated ascending', ['DEMO-L-008', 'DEMO-L-007', 'DEMO-L-006', 'DEMO-L-005', 'DEMO-L-004', 'DEMO-L-003', 'DEMO-L-002', 'DEMO-L-001']],
    ['Sort updated descending', ['DEMO-L-001', 'DEMO-L-002', 'DEMO-L-003', 'DEMO-L-004', 'DEMO-L-005', 'DEMO-L-006', 'DEMO-L-007', 'DEMO-L-008']],
  ] as const;
  for (const [button, expected] of orders) {
    await page.getByRole('button', { name: button, exact: true }).click(); await expect(page.getByRole('button', { name: button, exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect.poll(async () => (await rows())[0]).toBe(expected[0]);
    const actual = await rows(); await page.locator('.property-table .ant-pagination-next').click(); await expect.poll(async () => (await rows())[0]).toBe(expected[6]); actual.push(...await rows()); expect(actual).toEqual(expected);
  }
  const property = page.locator('.property-detail .ant-drawer-content');
  await page.goto('/#/properties?listing=DEMO-L-010'); await expect(property.getByText('USD 1,250,000', { exact: true })).toBeVisible();
  await page.goto('/#/properties?listing=DEMO-L-009'); await expect(property.getByText('Withdrawn', { exact: true }).first()).toBeVisible(); await expect(property.getByText('Recorded asking price', { exact: true })).toBeVisible();
  await page.goto('/#/properties?listing=DEMO-L-008'); await expect(property.getByText('Size not supplied', { exact: true })).toBeVisible();
  await page.goto('/#/properties?listing=DEMO-L-001'); await property.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  expect(await property.locator('.th-timeline summary time').allTextContents()).toEqual(['2020-03-12', '2022-08-06', '2024-11-20']);
  expect(await property.locator('.th-timeline summary strong').allTextContents()).toEqual(['AED 1,650,000', 'AED 1,920,000', 'AED 2,100,000']);
});

test('fictional viewing examples require a click and are isolated across sales identities and sign-out', async ({ page, request, context }) => {
  await fixture(context, request, 'viewings'); await page.goto('/'); await signIn(page); await openClient(page);
  await drawer(page).getByRole('tab', { name: 'Viewing History', exact: true }).click(); await expect(drawer(page).getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await drawer(page).locator('.client-detail-demo-tools > summary').click(); await drawer(page).getByRole('button', { name: 'Load Fictional Viewings', exact: true }).click();
  await expect(drawer(page).getByTestId('client-viewing-count')).toHaveText('2 recorded viewings'); await expect(drawer(page).getByRole('button', { name: 'Load Fictional Viewings', exact: true })).toBeDisabled();
  for (const item of await drawer(page).locator('.client-detail-viewing-timeline > li').all()) await expect(item).toContainText('Fictional example');
  await drawer(page).getByRole('button', { name: 'Close', exact: true }).click(); await signIn(page, 'LIFECYCLE-B'); await openClient(page); await drawer(page).getByRole('tab', { name: 'Viewing History', exact: true }).click(); await expect(drawer(page).getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await drawer(page).getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await openClient(page); await drawer(page).getByRole('tab', { name: 'Viewing History', exact: true }).click(); await expect(drawer(page).getByText('Sign in to view and record viewing feedback.', { exact: true })).toBeVisible(); await expect(drawer(page).getByTestId('client-viewing-count')).toHaveText('0 recorded viewings'); await expect(drawer(page).getByRole('button', { name: 'Save Viewing Record', exact: true })).toHaveCount(0);
  await drawer(page).getByRole('button', { name: 'Close', exact: true }).click(); await signIn(page); await openClient(page); await drawer(page).getByRole('tab', { name: 'Viewing History', exact: true }).click(); await expect(drawer(page).getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
});

test('ordinary area and completion controls and the reviewed assistant produce identical live candidates', async ({ page }) => {
  await page.goto('/#/properties'); await expect(page.getByTestId('result-count')).toHaveText('8');
  const filters = page.getByRole('region', { name: 'Property filters', exact: true });
  const ids = () => page.locator('.property-table tbody tr[data-testid]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')));
  const choose = async (label: string, text: string) => { await filters.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]').click(); await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(text, { exact: true }).click(); await page.keyboard.press('Escape'); };
  await choose('Area / community', 'Dubai Marina'); await expect(page.getByTestId('result-count')).toHaveText('3');
  await filters.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2800000'); await choose('Bedrooms', '2+ bedrooms'); await choose('Property type', 'apartment');
  await filters.getByRole('button', { name: /More filters$/ }).click(); await choose('Completion', 'Ready'); await expect(page.getByTestId('result-count')).toHaveText('2'); const ordinary = await ids();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: /Home$/ }).click();
  await home(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill('A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m.'); await home(page).getByRole('button', { name: 'Send request', exact: true }).click();
  await home(page).getByRole('region', { name: 'Review task details', exact: true }).getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByTestId('result-count')).toHaveText('2'); expect(await ids()).toEqual(ordinary);
  await filters.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('1000000'); await expect(page.getByTestId('result-count')).toHaveText('0'); await filters.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await choose('Area / community', 'Downtown Dubai'); await expect(page.getByTestId('result-count')).toHaveText('2');
  if (await filters.getByRole('button', { name: /More filters$/ }).count()) await filters.getByRole('button', { name: /More filters$/ }).click();
  await choose('Completion', 'Off-plan'); await expect(page.getByTestId('result-count')).toHaveText('1'); expect(await ids()).toEqual(['listing-DEMO-L-006']);
});
