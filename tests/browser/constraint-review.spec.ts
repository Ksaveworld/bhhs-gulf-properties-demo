import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { ClientRequirement, Dataset } from '../../shared/types';

const requirementId = 'DEMO-TEXT-R-001';
const equivalentText = '预算不超过AED 2.8M；不少于2卧室；面积不低于1100平方英尺；只考虑现房；必须有停车位。';

async function loadSyntheticRequest(page: Page, request: APIRequestContext, overrides: Partial<ClientRequirement> = {}) {
  const response = await request.get('/api/dataset');
  expect(response.ok()).toBeTruthy();
  const dataset = await response.json() as Dataset;
  expect(dataset.meta.mode).toBe('demo');
  const base = dataset.client_requirements.find(row => row.requirement_id === 'DEMO-R-001');
  expect(base).toBeDefined();
  const requirement: ClientRequirement = {
    ...base!, requirement_id: requirementId, client_id: 'DEMO-TEXT-C-001', client_alias: 'Demo text review client',
    raw_request: equivalentText, hard_constraints: equivalentText,
    budget_min: null, budget_max: 2800000, currency: 'AED', budget_constraint: 'hard',
    preferred_areas: ['Dubai Marina'], property_types: ['apartment'], bedrooms_min: 2,
    area_min: 1100, area_unit: 'sqft', area_basis: 'built_up', market_preference: 'ready',
    purchase_by: '2026-12-01', move_in_by: '2027-01-01', soft_preferences: null, missing_questions: null,
    source_ref: 'DEMO-TEXT-SOURCE-001', data_kind: 'demo',
    notes: 'Independently invented browser acceptance wording; no received customer, incoming or private records are copied.',
    ...overrides,
  };
  await page.route('**/api/dataset', route => route.fulfill({ json: {
    ...dataset, client_requirements: [requirement], match_reference: [],
  } }));
  await page.goto('/');
  await expect(page.getByTestId('result-count')).toHaveText('9');
  await page.getByRole('button', { name: /Clients & needs/ }).click();
  await page.locator('.client-row').filter({ hasText: requirementId }).getByRole('button', { name: /View properties/ }).click();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  return requirement;
}

async function reviewSelected(page: Page) {
  await page.getByRole('button', { name: 'Review selected requirement', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Client requirements', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function expectOriginalWording(drawer: Locator, requirement: ClientRequirement) {
  await expect(drawer.getByRole('textbox', { name: 'Sales conversation / notes', exact: true })).toHaveValue(requirement.raw_request);
  await expect(drawer.getByRole('textbox', { name: 'Other hard restrictions', exact: true })).toHaveValue(requirement.hard_constraints!);
}

test('strict Chinese equivalents show their field mapping and an edited budget becomes a visible review conflict', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const requirement = await loadSyntheticRequest(page, request);
  await expect(page.getByTestId('library-text-warning')).toHaveCount(0);
  await expect(page.getByTestId('listing-DEMO-L-001')).toContainText('Conditions met');
  let drawer = await reviewSelected(page);
  await expect(drawer.getByTestId('requirement-text-warning')).toHaveCount(0);
  await expect(drawer.getByTestId('requirement-area-warning')).toHaveCount(0);
  const covered = drawer.getByTestId('requirement-text-covered');
  await covered.locator('summary').click();
  const budget = covered.getByRole('listitem').filter({ hasText: '预算不超过AED 2.8M' });
  await expect(budget).toContainText('budget_max');
  await expect(budget).toContainText('currency');
  await expect(budget).toContainText('budget_constraint');
  await expect(covered.getByRole('listitem').filter({ hasText: '不少于2卧室' })).toContainText('bedrooms_min');
  const area = covered.getByRole('listitem').filter({ hasText: '面积不低于1100平方英尺' });
  await expect(area).toContainText('area_min, area_unit');
  await expect(area).not.toContainText('area_basis');
  await expect(covered.getByRole('listitem').filter({ hasText: '只考虑现房' })).toContainText('market_preference');
  await expectOriginalWording(drawer, requirement);

  await drawer.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2500000');
  await expect(drawer.getByTestId('requirement-text-warning')).toContainText('budget_max contain different numeric limits');
  await expect(budget).toHaveCount(0);
  await expectOriginalWording(drawer, requirement);
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await expect(page.getByTestId('library-text-warning')).toContainText('structured search candidates, not confirmed recommendations');
  await expect(page.getByTestId('library-text-warning')).toContainText('budget_max');
  await expect(page.getByTestId('listing-DEMO-L-001')).toContainText('Review details');
  await expect(page.getByTestId('listing-DEMO-L-001')).not.toContainText('Conditions met');
  drawer = await reviewSelected(page);
  await expectOriginalWording(drawer, requirement);
  await expect(drawer.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2500000');
  await expect(drawer.getByTestId('requirement-text-warning')).toContainText('budget_max');
});

test('a required garden stored only as a preference and maximum, approximate or unrecognized conditions survive applying the review', async ({ page, request }) => {
  const hard = '必须有停车位；最多2卧室；面积约1100平方英尺；必须能够从客厅看到晨光。';
  const raw = '需要花园和停车位；最多2卧室；面积约1100平方英尺；必须能够从客厅看到晨光。';
  const requirement = await loadSyntheticRequest(page, request, { raw_request: raw, hard_constraints: hard, soft_preferences: '偏好花园' });
  const libraryWarning = page.getByTestId('library-text-warning');
  await expect(libraryWarning).toContainText('requires garden');
  await expect(libraryWarning).toContainText('only in soft_preferences');
  let drawer = await reviewSelected(page);
  const warning = drawer.getByTestId('requirement-text-warning');
  await expect(warning).toContainText('requires garden');
  await expect(warning).toContainText('only in soft_preferences');
  for (const clause of ['最多2卧室', '面积约1100平方英尺', '必须能够从客厅看到晨光']) {
    await expect(warning).toContainText(clause);
  }
  await expect(drawer.getByTestId('requirement-text-covered')).toHaveCount(0);
  await expectOriginalWording(drawer, requirement);
  await expect(drawer.getByRole('textbox', { name: 'Preferences', exact: true })).toHaveValue('偏好花园');
  await drawer.getByRole('button', { name: 'Apply to property library' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('result-count')).toHaveText('2');
  await expect(libraryWarning).toContainText('structured search candidates, not confirmed recommendations');
  for (const clause of ['requires garden', '最多2卧室', '面积约1100平方英尺', '必须能够从客厅看到晨光']) {
    await expect(libraryWarning).toContainText(clause);
  }
  await expect(page.getByTestId('listing-DEMO-L-001')).toContainText('Review details');
  await expect(page.getByTestId('listing-DEMO-L-002')).toContainText('Review details');
  drawer = await reviewSelected(page);
  await expectOriginalWording(drawer, requirement);
  await expect(drawer.getByRole('textbox', { name: 'Preferences', exact: true })).toHaveValue('偏好花园');
  await expect(drawer.getByTestId('requirement-text-warning')).toContainText('only in soft_preferences');
});
