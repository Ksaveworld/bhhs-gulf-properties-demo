import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { ClientRequirement, Dataset } from '../../shared/types';

const requirementId = 'DEMO-AREA-R-001';
const clientId = 'DEMO-AREA-C-001';
const clientAlias = 'Demo area review client';
const areaWarning = 'Area basis needs confirmation (面积口径待确认)';
const library = (page: Page) => page.getByRole('region', { name: 'Property filters', exact: true });
const selection = (scope: Locator, label: string) => scope.getByRole('combobox', { name: label, exact: true })
  .locator('xpath=ancestor::*[contains(@class, "ant-select-selector")][1]');

async function demoDataset(request: APIRequestContext): Promise<Dataset> {
  const response = await request.get('/api/dataset');
  expect(response.ok()).toBeTruthy();
  const dataset = await response.json() as Dataset;
  expect(dataset.meta.mode).toBe('demo');
  return dataset;
}

function areaRequirement(dataset: Dataset, overrides: Partial<ClientRequirement> = {}): ClientRequirement {
  const base = dataset.client_requirements.find(row => row.requirement_id === 'DEMO-R-001');
  expect(base).toBeDefined();
  return {
    ...base!, requirement_id: requirementId, client_id: clientId, client_alias: clientAlias,
    raw_request: 'Demo: a ready two-bedroom apartment in Dubai Marina, up to AED 2.8m, at least 1,100 sqft. Confirm what the area measurement includes.',
    budget_min: null, budget_max: 2800000, currency: 'AED', budget_constraint: 'hard',
    preferred_areas: ['Dubai Marina'], property_types: ['apartment'], bedrooms_min: 2,
    area_min: 1100, area_unit: 'sqft', area_basis: null, market_preference: 'ready',
    purchase_by: '2026-12-01', move_in_by: '2027-01-01', hard_constraints: 'must have parking',
    missing_questions: null, soft_preferences: null, source_ref: 'DEMO-AREA-SOURCE-001', data_kind: 'demo',
    notes: 'Invented browser acceptance sample. No incoming or private records are used.', ...overrides,
  };
}

async function loadRequirement(page: Page, dataset: Dataset, requirement: ClientRequirement) {
  await page.unroute('**/api/dataset');
  await page.route('**/api/dataset', route => route.fulfill({ json: {
    ...dataset, client_requirements: [requirement], match_reference: [],
  } }));
  await page.goto('/');
  await expect(page.getByTestId('result-count')).toHaveText('9');
}

async function viewRequirementProperties(page: Page) {
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  const row = page.locator('.client-row').filter({ hasText: requirementId });
  await row.getByRole('button', { name: /View properties/ }).click();
}

async function openReview(page: Page) {
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function chooseBasis(page: Page, scope: Locator, option: string) {
  await selection(scope, 'Area basis').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: new RegExp(`^${option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
}

async function applyReview(page: Page, drawer: Locator, count: string) {
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText(count);
}

async function openPropertyClients(page: Page) {
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: /Potential clients/ }).click();
  return drawer;
}

test('a missing area basis remains pending until sales reviews it, preserving notes and other hard restrictions', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const dataset = await demoDataset(request);
  const requirement = areaRequirement(dataset, { hard_constraints: 'must have parking; Confirm the orientation with the client.' });
  await loadRequirement(page, dataset, requirement);
  await viewRequirementProperties(page);
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await expect(page.getByTestId('library-area-warning')).toContainText(areaWarning);
  await expect(page.getByText('Area comparison is awaiting confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByText('No properties meet these filters.', { exact: true })).toHaveCount(0);

  let drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('Needs confirmation');
  await expect(drawer.getByTestId('requirement-area-warning')).toContainText(areaWarning);
  await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes' })).toHaveValue(requirement.raw_request);
  await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions' })).toHaveValue(requirement.hard_constraints!);
  await chooseBasis(page, drawer, 'built up');
  await expect(drawer.getByTestId('requirement-area-warning')).toHaveCount(0);
  await applyReview(page, drawer, '2');
  await expect(page.getByTestId('library-area-warning')).toHaveCount(0);
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
  await expect(page.getByTestId('listing-DEMO-L-002')).toBeVisible();

  drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('built up');
  await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes' })).toHaveValue(requirement.raw_request);
  await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions' })).toHaveValue(requirement.hard_constraints!);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('v1 text can supply a missing column but an explicit unknown never silently inherits that text', async ({ page, request }) => {
  const dataset = await demoDataset(request);
  const legacy = areaRequirement(dataset, { hard_constraints: 'area basis: built_up; must have parking' });
  delete legacy.area_basis;
  await loadRequirement(page, dataset, legacy);
  await viewRequirementProperties(page);
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await expect(page.getByTestId('library-area-warning')).toHaveCount(0);
  let drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('built up');
  await expect(drawer.getByTestId('requirement-area-warning')).toHaveCount(0);
  await applyReview(page, drawer, '2');

  const unconfirmed = { ...legacy, area_basis: 'unknown' as const };
  await loadRequirement(page, dataset, unconfirmed);
  await viewRequirementProperties(page);
  await expect(page.getByTestId('result-count')).toHaveText('0');
  drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('Needs confirmation');
  await expect(drawer.getByTestId('requirement-area-warning')).toContainText(areaWarning);
  await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions' })).toHaveValue(legacy.hard_constraints!);
  await applyReview(page, drawer, '0');
  await expect(page.getByTestId('library-area-warning')).toContainText(areaWarning);
});

test('a conflicting explicit basis stays visible for review while filtering stays unknown until the evidence agrees', async ({ page, request }) => {
  const dataset = await demoDataset(request);
  const requirement = areaRequirement(dataset, { area_basis: 'internal', hard_constraints: 'area basis: built_up; must have parking' });
  await loadRequirement(page, dataset, requirement);
  await viewRequirementProperties(page);
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await library(page).getByRole('button', { name: 'More filters' }).click();
  await expect(selection(library(page), 'Area basis')).toContainText('Needs confirmation');

  let drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('internal');
  await expect(drawer.getByTestId('requirement-area-warning')).toContainText('Structured field (internal)');
  await expect(drawer.getByTestId('requirement-area-warning')).toContainText('legacy statements (built_up)');
  await applyReview(page, drawer, '0');
  await expect(page.getByTestId('library-area-warning')).toContainText(areaWarning);
  drawer = await openReview(page);
  await expect(selection(drawer, 'Area basis')).toContainText('internal');
  await chooseBasis(page, drawer, 'built up');
  await expect(drawer.getByTestId('requirement-area-warning')).toHaveCount(0);
  await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions' })).toHaveValue(requirement.hard_constraints!);
  await applyReview(page, drawer, '2');
  await expect(selection(library(page), 'Area basis')).toContainText('built up');
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
});

test('property-to-client review creates another requirement for the same client and keeps the original pending', async ({ page, request }) => {
  const dataset = await demoDataset(request);
  const requirement = areaRequirement(dataset);
  await loadRequirement(page, dataset, requirement);
  let drawer = await openPropertyClients(page);
  await expect(drawer.getByTestId('client-count-total')).toHaveText('1');
  await expect(drawer.getByTestId('client-count-match')).toHaveText('0');
  await expect(drawer.getByTestId('client-count-review')).toHaveText('1');
  let client = drawer.locator(`article[data-client-id="${clientId}"]`);
  await client.locator('summary').filter({ hasText: 'Review 1 requirement' }).click();
  await expect(client.locator(`[data-requirement-id="${requirementId}"]`)).toContainText(areaWarning);
  await client.getByRole('button', { name: `View properties for ${requirementId}`, exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('0');
  const review = await openReview(page);
  await chooseBasis(page, review, 'built up');
  await applyReview(page, review, '2');

  drawer = await openPropertyClients(page);
  await expect(drawer.getByTestId('client-count-total')).toHaveText('1');
  await expect(drawer.getByTestId('client-count-match')).toHaveText('1');
  await expect(drawer.getByTestId('client-count-review')).toHaveText('0');
  await expect(drawer.locator('article[data-client-id]')).toHaveCount(1);
  client = drawer.locator(`article[data-client-id="${clientId}"]`);
  await client.locator('summary').filter({ hasText: 'Review 2 requirements' }).click();
  const original = client.locator(`[data-requirement-id="${requirementId}"]`);
  const revised = client.locator('[data-requirement-id^="SESSION-R-"]');
  await expect(original).toContainText(areaWarning);
  await expect(revised).toHaveCount(1);
  await expect(revised).toContainText('Conditions met');
  await expect(revised).not.toContainText(areaWarning);
  await original.locator('summary').filter({ hasText: 'Client requirement & source' }).click();
  await expect(original.locator('.pd-raw-request')).toHaveText(requirement.raw_request);
  await revised.locator('summary').filter({ hasText: 'Client requirement & source' }).click();
  await expect(revised.locator('.pd-raw-request')).toHaveText(requirement.raw_request);
  await expect(revised).toContainText(`of ${requirementId}; original record retained`);
  await original.getByRole('button', { name: `View properties for ${requirementId}`, exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await expect(page.getByTestId('library-area-warning')).toContainText(areaWarning);
});
