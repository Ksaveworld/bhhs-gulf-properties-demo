import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);

const errors = new WeakMap<Page, string[]>();
const row = (page: Page, id: string) => page.locator(`.client-row[data-requirement-id="${id}"]`);
const libraryFilters = (page: Page) => page.getByRole('region', { name: 'Property filters', exact: true });
const directory = (page: Page) => page.getByRole('region', { name: 'Client directory', exact: true });
const notes = 'A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m, for self use. Must have parking. Purchase by 2026-12-01.';
const activeId = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('requirement');

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10000);
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }, testInfo) => {
  expect.soft(errors.get(page), 'No unhandled browser errors').toEqual([]);
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect.soft(widths.document, 'The document fits the target desktop; tables may scroll inside their container').toBeLessThanOrEqual(widths.viewport);
  await testInfo.attach('desktop-widths', { body: JSON.stringify(widths), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('desktop-end.png'), fullPage: true });
});

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your client. Their next home.', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toBeVisible();
  await expect(page.getByTestId('local-storage-notice')).not.toContainText('Loading browser copies');
}
async function signIn(page: Page, name = 'Synthetic Sales A', id = 'WORKSPACE-A') {
  const switchButton = page.getByRole('button', { name: 'Switch sales identity', exact: true });
  if (await switchButton.count()) await switchButton.click();
  else await page.getByRole('button', { name: /Sign in$/ }).click();
  const modal = page.getByRole('dialog', { name: 'Demo sign in', exact: true });
  await modal.getByRole('textbox', { name: 'Username', exact: true }).fill(name);
  await modal.getByRole('textbox', { name: 'Sales ID', exact: true }).fill(id);
  await modal.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('current-sales-identity')).toHaveText(`${name} · ${id}`);
  await expect(page.getByTestId('local-storage-notice')).not.toContainText('Loading browser copies');
}
async function clients(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByText('Clients & needs', { exact: true }).click();
  await expect(directory(page)).toBeVisible();
}
async function library(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByText('Property library', { exact: true }).click();
  await expect(libraryFilters(page)).toBeVisible();
}
async function displayedListingIds(page: Page) {
  return page.locator('.property-table tbody tr[data-testid]').evaluateAll(rows => rows.map(item => item.getAttribute('data-testid')!.replace('listing-', '')));
}
async function allListingIds(page: Page) {
  const ids = await displayedListingIds(page);
  const next = page.locator('.property-table .ant-pagination-next');
  while (await next.count() && !(await next.getAttribute('class'))!.includes('ant-pagination-disabled')) {
    const first = (await displayedListingIds(page))[0];
    await next.click();
    await expect.poll(async () => (await displayedListingIds(page))[0]).not.toBe(first);
    ids.push(...await displayedListingIds(page));
  }
  return ids;
}
async function apply(page: Page, editor: Locator, count: string) {
  await editor.getByRole('button', { name: /Apply to property library/ }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText(count);
  await expect(page.locator('.client-brief').getByTestId('local-copy-status')).toContainText('Saved in this browser');
  const id = activeId(page);
  expect(id).toMatch(/^SESSION-R-/);
  return id!;
}
async function privateClient(page: Page, alias = 'Synthetic private Avery') {
  await clients(page);
  await directory(page).getByRole('button', { name: /Add Private Client/ }).click();
  const editor = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await editor.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill(notes);
  await editor.getByRole('button', { name: 'Extract requirements', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Client alias', exact: true }).fill(alias);
  await editor.getByRole('spinbutton', { name: 'Min. price', exact: true }).fill('2200000');
  return apply(page, editor, '2');
}
async function viewRequirement(page: Page, id: string) {
  await clients(page);
  await row(page, id).getByRole('button', { name: /View properties/ }).click();
  await expect.poll(() => activeId(page)).toBe(id);
}
async function visibility(page: Page, label: string) {
  const radio = directory(page).getByRole('radio', { name: label, exact: true });
  await radio.locator('xpath=ancestor::label[1]').click();
  await expect(radio).toBeChecked();
}
async function reviewCopy(page: Page, id: string, budget: string, count: string) {
  await viewRequirement(page, id);
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await editor.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill(budget);
  return apply(page, editor, count);
}
async function openProperty(page: Page, id = 'DEMO-L-001') {
  await page.getByTestId(`listing-${id}`).getByRole('button', { name: /^Open / }).click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(drawer).toBeVisible();
  return drawer;
}
async function clientOptions(page: Page) {
  const input = page.getByRole('combobox', { name: 'Select a client requirement', exact: true });
  await input.locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]').click();
  const popup = page.locator('.ant-select-dropdown:visible');
  await expect(popup.locator('.ant-select-item-option-content').first()).toBeVisible();
  const holder = popup.locator('.rc-virtual-list-holder');
  await holder.evaluate(element => { element.scrollTop = 0; });
  await page.waitForTimeout(50);
  const labels = new Set<string>();
  for (let step = 0; step < 5; step++) {
    for (const label of await popup.locator('.ant-select-item-option-content').allTextContents()) labels.add(label);
    const reachedEnd = await holder.evaluate(element => {
      if (element.scrollTop + element.clientHeight >= element.scrollHeight) return true;
      element.scrollTop = Math.min(element.scrollTop + element.clientHeight, element.scrollHeight);
      return false;
    });
    if (reachedEnd) break;
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Escape');
  return [...labels];
}

test('Home exposes the assistant, the library has no duplicate entry, and sign-in uses the visible username and Sales ID form', async ({ page }, testInfo) => {
  await ready(page);
  await expect(page.getByRole('region', { name: 'Client requirements', exact: true })).toBeVisible();
  await expect(page.getByText('Pattern extraction · No language model connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in to save', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-1366.png'), fullPage: true });
  await library(page);
  await expect(page.getByTestId('result-count')).toHaveText('8');
  await expect(page.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Extract requirements', exact: true })).toHaveCount(0);
  await expect(libraryFilters(page).getByText(/Refine your search/)).toContainText('AED');
  await expect(libraryFilters(page).getByRole('combobox', { name: 'Currency', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('aed-view-note')).toBeVisible();
  expect(await allListingIds(page)).not.toContain('DEMO-L-010');
  await page.goto('/#/properties?listing=DEMO-L-010');
  const usdDrawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(usdDrawer.getByText('USD 1,250,000', { exact: true })).toBeVisible();
  await usdDrawer.getByRole('button', { name: 'Close', exact: true }).click();
  await clients(page);
  await expect(directory(page).getByRole('button', { name: /Add Private Client/ })).toBeDisabled();
  await expect(directory(page).getByText('Sign in to add a private client.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Sign in$/ }).click();
  const modal = page.getByRole('dialog', { name: 'Demo sign in', exact: true });
  await modal.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(modal.getByTestId('identity-save-error')).toBeVisible();
  await modal.getByRole('textbox', { name: 'Username', exact: true }).fill('Synthetic Sales A');
  await modal.getByRole('textbox', { name: 'Sales ID', exact: true }).fill('WORKSPACE-A');
  await modal.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('current-sales-identity')).toHaveText('Synthetic Sales A · WORKSPACE-A');
  await page.reload();
  await expect(page.getByTestId('current-sales-identity')).toContainText('WORKSPACE-A');
});

test('Home requirements navigate to matching properties and a refreshable property URL retaining the client and price evidence', async ({ page }, testInfo) => {
  await ready(page);
  await signIn(page);
  const home = page.getByRole('region', { name: 'Client requirements', exact: true });
  await home.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill(notes);
  await home.getByRole('button', { name: 'Extract requirements', exact: true }).click();
  await expect(home.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2800000');
  await home.getByRole('textbox', { name: 'Client alias', exact: true }).fill('Synthetic Home buyer');
  const id = await apply(page, home, '2');
  expect(await displayedListingIds(page)).toEqual(['DEMO-L-001', 'DEMO-L-002']);
  let drawer = await openProperty(page);
  const url = page.url();
  expect(url).toContain(`requirement=${id}`);
  expect(url).toContain('listing=DEMO-L-001');
  await page.reload();
  drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(drawer.getByText('AED 2,450,000', { exact: true })).toBeVisible();
  await expect(drawer.getByText('DEMO-P-001', { exact: true })).toBeVisible();
  await expect(page.locator('.client-brief').getByRole('heading', { name: 'Synthetic Home buyer', exact: true })).toBeVisible();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  expect(activeId(page)).toBe(id);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  await expect(history.getByText('Sales recorded: 3', { exact: true })).toBeVisible();
  await expect(drawer.locator('.pd-comparable-section').getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true })).toBeVisible();
  await history.getByRole('button', { name: /^Transaction DEMO-T-007:/ }).click();
  await history.getByRole('button', { name: 'View selected transaction DEMO-T-007', exact: true }).click();
  await expect(history.getByRole('article', { name: 'Same-property transaction DEMO-T-007', exact: true }).locator('details.pd-source-details')).toHaveAttribute('open', '');
  await page.screenshot({ path: testInfo.outputPath('property-evidence-1366.png'), fullPage: true });
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Client requirements', exact: true }).getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(notes);
});

test('a saved private client is found by one combined directory filter and returns to the same forward and reverse matches', async ({ page }, testInfo) => {
  await ready(page);
  await signIn(page);
  const id = await privateClient(page);
  const candidates = await displayedListingIds(page);
  await clients(page);
  const filter = directory(page);
  await filter.getByRole('textbox', { name: 'Name', exact: true }).fill('private avery');
  await filter.getByRole('spinbutton', { name: 'Min. budget', exact: true }).fill('2500000');
  await filter.getByRole('spinbutton', { name: 'Max. budget', exact: true }).fill('2600000');
  await filter.getByRole('textbox', { name: 'Preferred location', exact: true }).fill('marina');
  await visibility(page, 'Private');
  await expect(filter.locator('.client-directory-client')).toHaveCount(1);
  await expect(row(page, id)).toBeVisible();
  await expect(row(page, id).getByTestId('local-copy-status')).toContainText('Saved in this browser');
  await filter.getByRole('spinbutton', { name: 'Min. budget', exact: true }).fill('2900000');
  await expect(filter.getByText('Min. budget cannot be greater than Max. budget.', { exact: true })).toBeVisible();
  await expect(filter.locator('.client-row')).toHaveCount(0);
  await filter.getByRole('spinbutton', { name: 'Max. budget', exact: true }).fill('3000000');
  await expect(filter.locator('.client-row')).toHaveCount(0);
  await filter.getByRole('spinbutton', { name: 'Min. budget', exact: true }).fill('2500000');
  await filter.getByRole('textbox', { name: 'Preferred location', exact: true }).fill('Downtown');
  await expect(filter.locator('.client-row')).toHaveCount(0);
  await filter.getByRole('textbox', { name: 'Preferred location', exact: true }).fill('Marina');
  await visibility(page, 'Company');
  await expect(row(page, id)).toHaveCount(0);
  await visibility(page, 'Unassigned browser review');
  await expect(row(page, id)).toHaveCount(0);
  await visibility(page, 'All');
  await expect(row(page, id)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('filtered-private-client-1366.png'), fullPage: true });
  await row(page, id).getByRole('button', { name: /View properties/ }).click();
  expect(await displayedListingIds(page)).toEqual(candidates);
  await expect(libraryFilters(page).getByRole('spinbutton', { name: 'Min. price', exact: true })).toHaveValue('2200000');
  await expect(libraryFilters(page).getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2800000');
  const drawer = await openProperty(page);
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  const client = drawer.getByRole('article', { name: 'Client match for Synthetic private Avery', exact: true });
  await expect(client).toHaveCount(1);
  await expect(client).toContainText('Needs clarification');
  await expect(client).toContainText('Budget flexibility has not been confirmed.');
  await client.locator('summary').filter({ hasText: 'Review 1 requirement' }).click();
  await expect(client.getByText('Area: Dubai Marina', { exact: true })).toBeVisible();
  await expect(client.getByText('Required amenity disclosed: parking', { exact: true })).toBeVisible();
  await expect(client.getByText('No conflicts identified in the supplied fields.', { exact: true })).toBeVisible();
  await client.getByRole('button', { name: 'View properties for Synthetic private Avery', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  expect(activeId(page)).toBe(id);
});

test('Sales B cannot access Sales A private clients through directories, choices, reverse matches or refreshed deep links; company requirements stay shared', async ({ page }) => {
  await ready(page);
  await signIn(page);
  const id = await privateClient(page, 'Synthetic private isolation buyer');
  const drawerA = await openProperty(page);
  const privateUrl = page.url();
  await drawerA.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await clientOptions(page)).some(label => label.includes(id))).toBeTruthy();
  await clients(page);
  await expect(row(page, 'DEMO-R-001')).toBeVisible();
  await signIn(page, 'Synthetic Sales B', 'WORKSPACE-B');
  await clients(page);
  await expect(row(page, id)).toHaveCount(0);
  await expect(row(page, 'DEMO-R-001')).toBeVisible();
  await expect(directory(page).locator('.client-row')).toHaveCount(8);
  await visibility(page, 'Private');
  await expect(directory(page).locator('.client-row')).toHaveCount(0);
  await library(page);
  const options = await clientOptions(page);
  expect(options.some(label => label.includes(id) || label.includes('Synthetic private isolation buyer'))).toBeFalsy();
  expect(options.some(label => label.includes('DEMO-R-001'))).toBeTruthy();
  let drawer = await openProperty(page);
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  await expect(drawer.getByRole('article', { name: 'Client match for Synthetic private isolation buyer', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('article', { name: 'Client match for Demo client A · Marina home', exact: true })).toBeVisible();
  await page.goto(privateUrl);
  await page.reload();
  drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  await expect(drawer.getByRole('article', { name: 'Client match for Synthetic private isolation buyer', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('This requirement is not available for the current sales identity or data version.', { exact: true })).toBeVisible();
  await expect(page.locator('.client-brief')).not.toContainText('Synthetic private isolation buyer');
  await signIn(page);
  await clients(page);
  await expect(row(page, id)).toBeVisible();
  await expect(row(page, 'DEMO-R-001')).toBeVisible();
});

test('returning to Sales A restores independent same-client copies and delete or Restore original removes only the selected copy after refresh', async ({ page }) => {
  await ready(page);
  await signIn(page);
  const first = await reviewCopy(page, 'DEMO-R-001', '2500000', '1');
  const second = await reviewCopy(page, 'DEMO-R-007', '2800000', '2');
  const third = await reviewCopy(page, second, '2600000', '1');
  expect(new Set([first, second, third]).size).toBe(3);
  await signIn(page, 'Synthetic Sales B', 'WORKSPACE-B');
  await clients(page);
  await expect(directory(page).locator('.client-row[data-requirement-id^="SESSION-R-"]')).toHaveCount(0);
  await signIn(page);
  await clients(page);
  const client = directory(page).locator('[data-client-id="DEMO-C-001"]');
  await expect(client).toHaveCount(1);
  await expect(client.locator('.client-row')).toHaveCount(5);
  await row(page, first).getByRole('button', { name: 'Delete local copy', exact: true }).click();
  await expect(row(page, first)).toHaveCount(0);
  await page.reload();
  await expect(row(page, first)).toHaveCount(0);
  await expect(row(page, second)).toBeVisible();
  await expect(row(page, third)).toBeVisible();
  await row(page, second).getByRole('button', { name: 'Restore original', exact: true }).click();
  await expect.poll(() => activeId(page)).toBe('DEMO-R-007');
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await page.reload();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  expect(activeId(page)).toBe('DEMO-R-007');
  await clients(page);
  await expect(row(page, second)).toHaveCount(0);
  await expect(row(page, third)).toBeVisible();
  await expect(directory(page).locator('[data-client-id="DEMO-C-001"] .client-row')).toHaveCount(3);
  await row(page, third).getByRole('button', { name: /View properties/ }).click();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Client requirements', exact: true }).getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2600000');
});

test('library size limits update real results, retain an available 760 sq ft home and recover from an inverted interval', async ({ page }, testInfo) => {
  await ready(page);
  await library(page);
  const scope = libraryFilters(page);
  await expect(page.getByTestId('listing-DEMO-L-005')).toContainText('760 sq ft');
  await expect(scope.getByRole('spinbutton', { name: 'Min. size', exact: true })).toBeVisible();
  await expect(scope.getByRole('spinbutton', { name: 'Max. size', exact: true })).toBeVisible();
  const minBox = await scope.getByRole('spinbutton', { name: 'Min. size', exact: true }).boundingBox();
  const maxBox = await scope.getByRole('spinbutton', { name: 'Max. size', exact: true }).boundingBox();
  const tableBox = await page.locator('.results-panel').boundingBox();
  const briefBox = await page.locator('.client-brief').boundingBox();
  await testInfo.attach('library-layout-geometry', { body: JSON.stringify({ minBox, maxBox, tableBox, briefBox }), contentType: 'application/json' });
  console.info('Library geometry at 1366px:', JSON.stringify({ minInputWidth: minBox!.width, maxInputWidth: maxBox!.width, briefTop: briefBox!.y, resultsBottom: tableBox!.y + tableBox!.height }));
  expect.soft(minBox!.width, 'Min. size remains wide enough to enter a usable value').toBeGreaterThanOrEqual(85);
  expect.soft(maxBox!.width, 'Max. size remains wide enough to enter a usable value').toBeGreaterThanOrEqual(85);
  expect.soft(briefBox!.y, 'Without an active client, the requirement selector is below the results').toBeGreaterThanOrEqual(tableBox!.y + tableBox!.height);
  await scope.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1000');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await displayedListingIds(page)).toEqual(['DEMO-L-005']);
  const drawer = await openProperty(page, 'DEMO-L-005');
  await expect(drawer.getByText('760 sq ft', { exact: true })).toBeVisible();
  await expect(drawer.getByText('AED 975,000', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await scope.getByRole('spinbutton', { name: 'Min. size', exact: true }).fill('1200');
  await expect(scope.getByText('Min. size cannot be greater than Max. size.', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await scope.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1300');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  expect(await displayedListingIds(page)).toEqual(['DEMO-L-001']);
  await scope.getByRole('spinbutton', { name: 'Max. size', exact: true }).fill('1450');
  await expect(page.getByTestId('result-count')).toHaveText('4');
  expect(await displayedListingIds(page)).toEqual(['DEMO-L-001', 'DEMO-L-002', 'DEMO-L-003', 'DEMO-L-007']);
  await scope.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('8');
});

test('asking-price and updated column arrows sort actual rows in both directions across pagination', async ({ page }, testInfo) => {
  await ready(page);
  await library(page);
  const cases = [
    ['Sort asking price ascending', ['DEMO-L-008', 'DEMO-L-005', 'DEMO-L-006', 'DEMO-L-001', 'DEMO-L-002', 'DEMO-L-003', 'DEMO-L-004', 'DEMO-L-007']],
    ['Sort asking price descending', ['DEMO-L-004', 'DEMO-L-003', 'DEMO-L-002', 'DEMO-L-001', 'DEMO-L-006', 'DEMO-L-005', 'DEMO-L-008', 'DEMO-L-007']],
    ['Sort updated ascending', ['DEMO-L-008', 'DEMO-L-007', 'DEMO-L-006', 'DEMO-L-005', 'DEMO-L-004', 'DEMO-L-003', 'DEMO-L-002', 'DEMO-L-001']],
    ['Sort updated descending', ['DEMO-L-001', 'DEMO-L-002', 'DEMO-L-003', 'DEMO-L-004', 'DEMO-L-005', 'DEMO-L-006', 'DEMO-L-007', 'DEMO-L-008']],
  ] as const;
  for (const [label, expected] of cases) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await displayedListingIds(page))[0]).toBe(expected[0]);
    expect(await allListingIds(page), label).toEqual(expected);
  }
  await page.screenshot({ path: testInfo.outputPath('library-sort-1366.png'), fullPage: true });
});

test('Home preserves an unassigned guest draft at first sign-in but clears unsaved notes when an existing sales identity leaves', async ({ page }, testInfo) => {
  test.setTimeout(30000);
  await ready(page);
  const home = page.getByRole('region', { name: 'Client requirements', exact: true });
  const conversation = home.getByRole('textbox', { name: 'Sales conversation / notes', exact: true });
  const alias = home.getByRole('textbox', { name: 'Client alias', exact: true });
  await conversation.fill(notes);
  await home.getByRole('button', { name: /Extract requirements/ }).click();
  await alias.fill('Synthetic unassigned guest buyer');
  await signIn(page);
  await expect(conversation, 'First sign-in retains the guest-entered notes').toHaveValue(notes);
  await expect(alias, 'First sign-in retains the guest-reviewed fields').toHaveValue('Synthetic unassigned guest buyer');

  await alias.fill('Synthetic A unsaved buyer');
  await signIn(page, 'Synthetic Sales B', 'WORKSPACE-B');
  await expect.soft(conversation, 'Sales B must not inherit Sales A unsaved notes').toHaveValue('', { timeout: 1500 });
  await expect.soft(alias, 'Sales B must not inherit Sales A reviewed draft fields').toHaveCount(0, { timeout: 1500 });
  await page.screenshot({ path: testInfo.outputPath('after-identity-switch.png'), fullPage: true });

  await conversation.fill(`UNSAVED-SYNTHETIC-B-NOTE. ${notes}`);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByTestId('current-sales-identity')).toHaveCount(0);
  await expect.soft(conversation, 'Signing out removes the prior sales identity unsaved notes').toHaveValue('', { timeout: 1500 });
  await expect.soft(alias, 'Signing out removes the prior sales identity reviewed fields').toHaveCount(0, { timeout: 1500 });
  await expect(home.getByRole('button', { name: 'Sign in to save', exact: true })).toBeVisible();
});
