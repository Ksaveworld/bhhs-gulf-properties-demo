import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Dataset } from '../../shared/types';

test.use({ viewport: { width: 1366, height: 768 } });
const errors = new WeakMap<Page, string[]>();
const clientA = 'DEMO-C-001';
const clientB = 'DEMO-C-002';
const history = (scope: Page | Locator) => scope.locator('[aria-label="Same-property transaction history"]');
const timeline = (page: Page) => page.getByRole('list', { name: 'Client viewing timeline', exact: true });
const viewingRows = (page: Page) => timeline(page).locator(':scope > li[data-viewing-id]');

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your client. Their next home.', exact: true })).toBeVisible();
  await expect(page.getByTestId('local-storage-notice')).not.toContainText('Loading browser copies');
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function signIn(page: Page, salesId = 'REPORTS-A') {
  const switchButton = page.getByRole('button', { name: 'Switch sales identity', exact: true });
  if (await switchButton.count()) await switchButton.click();
  else await page.getByRole('banner').getByRole('button', { name: /Sign in$/ }).click();
  const modal = page.getByRole('dialog', { name: 'Demo sign in', exact: true });
  await modal.getByRole('textbox', { name: 'Username', exact: true }).fill(`Report QA ${salesId}`);
  await modal.getByRole('textbox', { name: 'Sales ID', exact: true }).fill(salesId);
  await modal.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('current-sales-identity')).toContainText(salesId);
  await expect(page.getByTestId('local-storage-notice')).not.toContainText('Loading browser copies');
}
async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button').filter({ hasText: name }).click();
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
}
async function reports(page: Page, tab: 'property' | 'client' = 'property') {
  await navigate(page, 'Reports');
  await page.getByRole('tab', { name: tab === 'property' ? 'Property scan report' : 'Client profile report', exact: true }).click();
}
async function selectClient(page: Page, id: string) {
  await page.getByRole('combobox', { name: 'Report client', exact: true }).selectOption(id);
  await expect(page.getByRole('combobox', { name: 'Report client', exact: true })).toHaveValue(id);
}
async function saveViewing(page: Page, options: {
  feedback: string; clientId?: string; listingId?: string; date?: string;
  signal?: 'positive' | 'mixed' | 'negative' | 'not_recorded'; area?: boolean;
}) {
  if (options.clientId) await selectClient(page, options.clientId);
  await page.getByRole('combobox', { name: 'Viewed property', exact: true }).selectOption(options.listingId ?? 'DEMO-L-001');
  await page.getByLabel('Viewed at', { exact: true }).fill(options.date ?? '2026-09-02T09:30');
  await page.getByRole('combobox', { name: 'Visit feedback signal', exact: true }).selectOption(options.signal ?? 'not_recorded');
  await page.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill(options.feedback);
  await page.getByRole('checkbox', { name: 'Stated area preference', exact: true }).setChecked(options.area ?? false);
  await page.getByRole('button', { name: 'Save viewing record', exact: true }).click();
  await expect(page.getByTestId('viewing-save-status')).toContainText('saved in this browser');
  await expect(page.getByTestId('viewing-save-error')).toHaveCount(0);
}
function clientObservations(page: Page) {
  return page.locator('section.report-panel').filter({ has: page.getByRole('heading', { name: 'Observed viewings for this client', exact: true }) });
}
function dimensionRow(scope: Locator, dimension: string) {
  return scope.locator('tbody tr').filter({ has: scope.page().locator('.report-dimension').filter({ hasText: new RegExp(`^${dimension}$`) }) });
}
async function noDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 1366, viewport: 1366 });
}

test('property scan retains three-sale, single-sale and no-history evidence and original price units', async ({ page, request }, testInfo) => {
  const dataset = await (await request.get('/api/dataset')).json() as Dataset;
  expect(dataset.meta.mode).toBe('demo');
  await signIn(page);
  await reports(page);
  const picker = page.getByRole('combobox', { name: 'Report property', exact: true });
  await picker.selectOption('DEMO-L-001');
  await expect(page.getByTestId('property-scan-summary')).toContainText('AED 2,450,000');
  await expect(page.getByTestId('property-scan-summary')).toContainText('DEMO-S-001-02');
  await page.locator('details.report-listing-source > summary').click();
  const snapshot = dataset.listing_snapshots.find(row => row.snapshot_id === 'DEMO-S-001-02')!;
  await expect(page.locator('details.report-listing-source')).toContainText(snapshot.source_ref);
  await expect(page.locator('details.report-listing-source')).toContainText(snapshot.captured_at);
  await expect(history(page).getByText('Sales recorded: 3', { exact: true })).toBeVisible();
  await expect(history(page).locator('svg [role="button"]')).toHaveCount(3);
  await expect(history(page).getByTestId('transaction-history-line')).toHaveCount(1);
  for (const id of ['DEMO-T-001', 'DEMO-T-007', 'DEMO-T-008']) {
    const transaction = dataset.transactions.find(row => row.transaction_id === id)!;
    await history(page).getByRole('button', { name: `View transaction ${id}`, exact: true }).click();
    const record = page.getByRole('article', { name: `Same-property transaction ${id}`, exact: true });
    await expect(record.getByText(transaction.source_ref, { exact: true })).toBeVisible();
    await expect(record).toContainText(`${transaction.currency} ${transaction.amount!.toLocaleString('en-US')}`);
  }
  const comparable = page.getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true });
  await comparable.locator('details.pd-source-details > summary').click();
  await expect(comparable).toContainText(dataset.transactions.find(row => row.transaction_id === 'DEMO-T-002')!.source_ref);
  await expect(history(page)).not.toContainText('DEMO-T-002');
  await picker.selectOption('DEMO-L-004');
  await expect(history(page).getByText('Sales recorded: 1', { exact: true })).toBeVisible();
  await expect(history(page).locator('svg [role="button"]')).toHaveCount(1);
  await expect(history(page).getByTestId('transaction-history-line')).toHaveCount(0);
  await history(page).getByRole('button', { name: 'View transaction DEMO-T-006', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Same-property transaction DEMO-T-006', exact: true })).toContainText('DEMO-SOURCE-T-006');
  await picker.selectOption('DEMO-L-005');
  await expect(history(page).getByText('Sales recorded: 0', { exact: true })).toBeVisible();
  await expect(history(page)).toContainText('No available same-property sale history.');
  await expect(history(page).locator('svg [role="button"]')).toHaveCount(0);
  await picker.selectOption('DEMO-L-010');
  await expect(page.getByTestId('property-scan-summary')).toContainText('USD 1,250,000');
  await noDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('property-report-1366.png') });
});

test('saving real form entries persists on reload and separates viewing counts, explicit tags and positive feedback', async ({ page }, testInfo) => {
  await signIn(page);
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await saveViewing(page, { feedback: 'QA only: explicitly liked Dubai Marina; positive visit feedback.', signal: 'positive', area: true });
  await saveViewing(page, { feedback: 'QA only: negative feedback; no preference was stated.', signal: 'negative', date: '2026-08-30T14:00' });
  await expect(page.getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  await expect(viewingRows(page)).toHaveCount(2);
  await expect(viewingRows(page).first()).toContainText('explicitly liked Dubai Marina');
  await expect(viewingRows(page).last()).toContainText('negative feedback');
  const ids = await viewingRows(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-viewing-id')));
  expect(new Set(ids).size).toBe(2);
  const observations = clientObservations(page);
  await expect(observations).toContainText('2 recorded viewings · 1 clients · 2 demonstration records');
  const area = dimensionRow(observations, 'area');
  await expect(area.locator('td')).toHaveText(['2', '1', '1']);
  await expect(dimensionRow(observations, 'type').locator('td')).toHaveText(['2', '0', '1']);
  await expect(dimensionRow(observations, 'size').locator('td')).toHaveText(['2', '0', '1']);
  await area.locator('summary').click();
  await expect(area.locator('code')).toHaveText(ids);
  await page.reload();
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  expect(await viewingRows(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-viewing-id')))).toEqual(ids);
  await expect(dimensionRow(clientObservations(page), 'area').locator('td')).toHaveText(['2', '1', '1']);
  await viewingRows(page).first().locator('details > summary').click();
  await expect(viewingRows(page).first()).toContainText('Entered by sales in this browser; not independently verified');
  await expect(viewingRows(page).first()).toContainText('REPORTS-A');
  await expect(viewingRows(page).first()).toContainText('LOCAL-SALES:VIEW-');
  await noDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('client-viewing-report-1366.png') });
});

async function saveQABudgetCopy(page: Page, requirementId: string): Promise<string> {
  await navigate(page, 'Clients & needs');
  await page.locator(`article[data-requirement-id="${requirementId}"]`).getByRole('button', { name: /View properties/ }).click();
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await editor.getByRole('spinbutton', { name: 'Min. price', exact: true }).fill('2200000');
  const hard = editor.getByRole('textbox', { name: 'Other hard restrictions', exact: true });
  await hard.fill(`${await hard.inputValue()}\nQA-only browser acceptance assumption: minimum budget AED 2,200,000; not a confirmed customer fact.`);
  await editor.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.client-brief').getByTestId('local-copy-status')).toContainText('Saved in this browser');
  const id = (await page.locator('.client-brief > p.source-note').innerText()).match(/SESSION-R-[a-z0-9-]+/i)?.[0];
  expect(id).toBeTruthy();
  return id!;
}

test('fictional examples require a click and budget cohorts only summarize visible observations after explicit QA copies supply missing bounds', async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  const source = await (await request.get('/api/dataset')).json() as Dataset;
  await signIn(page);
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await expect(page.getByTestId('budget-cohort')).toContainText('Insufficient observations');
  // Existing B/C minimum budgets are unknown. Only separate QA browser copies are given a test bound.
  expect(source.client_requirements.find(row => row.requirement_id === 'DEMO-R-002')!.budget_min).toBeNull();
  expect(source.client_requirements.find(row => row.requirement_id === 'DEMO-R-003')!.budget_min).toBeNull();
  const copyB = await saveQABudgetCopy(page, 'DEMO-R-002');
  const copyC = await saveQABudgetCopy(page, 'DEMO-R-003');
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('budget-cohort')).toContainText('Insufficient observations');
  await page.getByRole('button', { name: 'Load fictional viewing examples', exact: true }).click();
  await expect(page.getByTestId('viewing-save-status')).toContainText('6 fictional viewing records saved');
  await expect(page.getByRole('button', { name: 'Fictional examples already loaded', exact: true })).toBeDisabled();
  await expect(page.getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  await expect(viewingRows(page)).toHaveCount(2);
  for (const row of await viewingRows(page).all()) await expect(row).toContainText('Fictional example');
  const cohort = page.getByTestId('budget-cohort');
  await expect(cohort).toContainText('same known currency and both finite budget bounds');
  await expect(cohort).toContainText('4 recorded viewings · 2 clients · 4 demonstration records (4 fictional examples)');
  await expect(cohort.locator('.report-cohort-members > li')).toHaveCount(2);
  await expect(cohort).toContainText(copyB);
  await expect(cohort).toContainText(copyC);
  await expect(dimensionRow(cohort, 'area').locator('td')).toHaveText(['4', '2', '2']);
  await expect(dimensionRow(cohort, 'type').locator('td')).toHaveText(['4', '2', '2']);
  await expect(cohort).toContainText('not a claim about group preferences, buying power or likelihood of closing');
  await selectClient(page, clientB);
  await page.getByRole('combobox', { name: 'Client report requirement', exact: true }).selectOption('DEMO-R-002');
  await expect(page.getByTestId('budget-cohort')).toContainText('both finite budget bounds are required');
  const after = await (await request.get('/api/dataset')).json() as Dataset;
  expect(after.client_requirements).toEqual(source.client_requirements);
  expect(after.match_reference).toEqual(source.match_reference);
  await page.reload();
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('budget-cohort')).toContainText('4 recorded viewings · 2 clients');
  await noDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('fictional-cohort-report-1366.png') });
});

test('Sales A and B viewing histories stay separate and signing out cannot write or expose them', async ({ page }) => {
  await reports(page, 'client');
  await expect(page.getByText('Select a Sales ID to view client reports and record viewings.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save viewing record', exact: true })).toHaveCount(0);
  await signIn(page, 'REPORTS-A');
  await reports(page, 'client');
  await saveViewing(page, { clientId: clientA, feedback: 'QA private viewing for Sales A only.' });
  const aId = await viewingRows(page).first().getAttribute('data-viewing-id');
  await signIn(page, 'REPORTS-B');
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await expect(page.getByText('QA private viewing for Sales A only.', { exact: true })).toHaveCount(0);
  await saveViewing(page, { feedback: 'QA private viewing for Sales B only.' });
  const bId = await viewingRows(page).first().getAttribute('data-viewing-id');
  expect(bId).not.toBe(aId);
  await signIn(page, 'REPORTS-A');
  await reports(page, 'client');
  await selectClient(page, clientA);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await expect(viewingRows(page).first()).toHaveAttribute('data-viewing-id', aId!);
  await expect(viewingRows(page).first()).toContainText('Sales A only');
  await expect(page.getByText('QA private viewing for Sales B only.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await reports(page, 'client');
  await expect(page.getByRole('button', { name: 'Save viewing record', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-viewing-id]')).toHaveCount(0);
  await signIn(page, 'REPORTS-A');
  await reports(page, 'client');
  await expect(viewingRows(page).first()).toHaveAttribute('data-viewing-id', aId!);
  await noDocumentOverflow(page);
});

type ViewingFaultWindow = Window & { __restoreViewingStorage?: () => void; __viewingFaultKeys?: string[] };

test('quota failure on the selected viewing key keeps the draft and prior history without a success message', async ({ page }) => {
  await signIn(page);
  await reports(page, 'client');
  await saveViewing(page, { clientId: clientA, feedback: 'QA existing viewing remains after storage failure.' });
  const existingId = await viewingRows(page).first().getAttribute('data-viewing-id');
  const before = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:viewing-records:v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
  expect(before).toHaveLength(1);
  const key = before[0].key;
  await page.evaluate(targetKey => {
    const original = Storage.prototype.setItem;
    const target = window as ViewingFaultWindow;
    target.__viewingFaultKeys = [];
    target.__restoreViewingStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (storageKey: string, value: string) {
      if (storageKey === targetKey) {
        target.__viewingFaultKeys!.push(storageKey);
        throw new DOMException('QA-only viewing-record quota failure.', 'QuotaExceededError');
      }
      return original.call(this, storageKey, value);
    };
  }, key);
  const feedback = page.getByRole('textbox', { name: 'Viewing feedback', exact: true });
  await feedback.fill('QA unsaved viewing draft must remain after quota failure.');
  await page.getByRole('combobox', { name: 'Visit feedback signal', exact: true }).selectOption('positive');
  await page.getByRole('checkbox', { name: 'Stated area preference', exact: true }).check();
  await page.getByRole('button', { name: 'Save viewing record', exact: true }).click();
  await expect(page.getByTestId('viewing-save-error')).toContainText('Saving viewing records could not be confirmed');
  await expect(page.getByTestId('viewing-save-status')).toHaveCount(0);
  await expect(feedback).toHaveValue('QA unsaved viewing draft must remain after quota failure.');
  await expect(page.getByRole('combobox', { name: 'Visit feedback signal', exact: true })).toHaveValue('positive');
  await expect(page.getByRole('checkbox', { name: 'Stated area preference', exact: true })).toBeChecked();
  await expect(page.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await expect(viewingRows(page).first()).toHaveAttribute('data-viewing-id', existingId!);
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe(before[0].value);
  expect(await page.evaluate(() => (window as ViewingFaultWindow).__viewingFaultKeys)).toEqual([key]);
  await expect(page.getByTestId('current-sales-identity')).toContainText('REPORTS-A');
  await page.evaluate(() => (window as ViewingFaultWindow).__restoreViewingStorage?.());
  await page.getByTestId('viewing-save-error').getByRole('button', { name: 'Reload viewing records', exact: true }).click();
  await page.getByRole('button', { name: 'Save viewing record', exact: true }).click();
  await expect(page.getByTestId('viewing-save-status')).toContainText('saved in this browser');
  await expect(page.getByTestId('viewing-save-error')).toHaveCount(0);
  await expect(page.getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  await page.reload();
  await reports(page, 'client');
  await expect(page.getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  await expect(timeline(page)).toContainText('QA unsaved viewing draft must remain after quota failure.');
});

test('property-source drilldown, browser Back and client-viewing links retain the selected Reports context', async ({ page }, testInfo) => {
  await signIn(page);
  await reports(page);
  await page.getByRole('combobox', { name: 'Report property', exact: true }).selectOption('DEMO-L-004');
  await page.getByRole('button', { name: 'Open property details', exact: true }).click();
  let drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/#\/reports\?listing=DEMO-L-004$/);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  await history(drawer).getByRole('button', { name: 'View transaction DEMO-T-006', exact: true }).click();
  await expect(drawer.getByText('DEMO-SOURCE-T-006', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/#\/reports$/);
  await expect(page.getByRole('tab', { name: 'Property scan report', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Report property', exact: true })).toHaveValue('DEMO-L-004');
  await reports(page, 'client');
  await saveViewing(page, { clientId: clientB, feedback: 'QA viewing link keeps the selected client report.', listingId: 'DEMO-L-002' });
  await page.getByRole('combobox', { name: 'Client report requirement', exact: true }).selectOption('DEMO-R-008');
  const record = viewingRows(page).first();
  await expect(record.getByRole('button')).toHaveCount(1);
  await record.getByRole('button').click();
  drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/#\/reports\?listing=DEMO-L-002$/);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const comparable = drawer.getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true });
  await comparable.locator('details.pd-source-details > summary').click();
  await expect(comparable.getByText('DEMO-SOURCE-T-002', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Client profile report', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Report client', exact: true })).toHaveValue(clientB);
  await expect(page.getByRole('combobox', { name: 'Client report requirement', exact: true })).toHaveValue('DEMO-R-008');
  await expect(page.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await expect(record).toContainText('QA viewing link keeps the selected client report.');
  await noDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reports-return-context-1366.png') });
});
