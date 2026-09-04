import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import { EMPTY_CLIENT_DIRECTORY_FILTERS } from '../shared/client-directory';
import { filterListings } from '../shared/matching';
import dataset from '../data/demo/dataset.json';
import type { ListingSnapshot } from '../shared/types';
import { extractClientName, hasClientSearchCondition, homePropertyFilters, homeRequirementErrors, homeReviewQuestions, missingHomeFields, prepareClientSearch, prepareHomeRequirement } from '../shared/home-tasks';

const areas = ['Dubai Marina', 'Downtown Dubai', 'Jumeirah Village Circle'];
const english = 'A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m. Must have parking.';
const chinese = 'Dubai Marina的现房两居公寓，预算上限280万迪拉姆。必须有停车位。';

test('property and private-client tasks enforce their own required fields, including zero bedrooms', async () => {
  const empty = createEmptyRequirement();
  empty.client_alias = '';
  assert.equal(missingHomeFields('property', empty).length, 4);
  assert.equal(missingHomeFields('create', empty).length, 5);
  const { requirement } = await prepareHomeRequirement(english, areas);
  assert.deepEqual(missingHomeFields('property', requirement), []);
  assert.deepEqual(missingHomeFields('create', requirement), ['client_alias']);
  assert.deepEqual(missingHomeFields('create', { ...requirement, client_alias: 'Synthetic Alex', bedrooms_min: 0 }), []);
});

test('Chinese and English task inputs produce the same deterministic property candidates', async () => {
  const en = await prepareHomeRequirement(english, areas);
  const zh = await prepareHomeRequirement(chinese, areas);
  const fields = (result: typeof en) => ({ ...homePropertyFilters(result.requirement), amenities: homePropertyFilters(result.requirement).amenities.sort() });
  assert.deepEqual(fields(en), fields(zh));
  const ids = (result: typeof en) => filterListings(dataset.listing_snapshots as ListingSnapshot[], fields(result)).map(row => row.listing_id);
  assert.deepEqual(ids(en), ids(zh));
  assert.ok(ids(en).length > 0);
  assert.equal(zh.requirement.raw_request, chinese);
});

test('size ranges preserve both bounds and do not fill unknown measurement basis', async () => {
  const result = await prepareHomeRequirement(`${english} Size 900 to 1400 sq ft.`, areas);
  assert.equal(result.requirement.area_min, 900);
  assert.equal(result.requirement.area_max, 1400);
  assert.equal(result.requirement.area_basis, 'unknown');
  assert.equal(homePropertyFilters(result.requirement).area_basis, 'unknown');
  assert.ok(homeReviewQuestions(result.requirement).some(message => /Area basis needs confirmation/.test(message)));
  assert.deepEqual(filterListings(dataset.listing_snapshots as ListingSnapshot[], homePropertyFilters(result.requirement)), []);
});

test('explicit size basis survives, and sqm is converted without relabeling the number', async () => {
  const result = await prepareHomeRequirement(`${english} Size 100 to 120 sqm built_up area.`, areas);
  assert.equal(result.requirement.area_basis, 'built_up');
  assert.equal(result.requirement.area_unit, 'sqft');
  assert.ok(Math.abs(result.requirement.area_min! - 1076.3910416709723) < 1e-6);
  assert.ok(Math.abs(result.requirement.area_max! - 1291.6692500051667) < 1e-6);
});

test('an explicit upper size bound is not turned into a lower bound', async () => {
  const en = await prepareHomeRequirement(`${english} Size no more than 1400 sq ft.`, areas);
  const zh = await prepareHomeRequirement(`${chinese} 面积不超过1400平方英尺。`, areas);
  for (const { requirement } of [en, zh]) {
    assert.equal(requirement.area_min, null);
    assert.equal(requirement.area_max, 1400);
    assert.equal(requirement.area_basis, 'unknown');
    assert.ok(!homeReviewQuestions(requirement).some(message => /maximum or exact area is not supported/.test(message)));
    assert.ok(homeReviewQuestions(requirement).some(message => /maximum size has been extracted/.test(message)));
  }
});

test('English and Chinese edits retain clear numeric contradictions as review questions', async () => {
  for (const text of [
    `${english} Size 900 to 1400 sq ft.`,
    `${chinese} 面积900到1400平方英尺。`,
  ]) {
    const { requirement } = await prepareHomeRequirement(text, areas);
    assert.ok(!homeReviewQuestions(requirement).some(message => /differs from the original notes/.test(message)));
    const questions = homeReviewQuestions({ ...requirement, budget_max: 2_000_000, bedrooms_min: 3, area_max: 1200 });
    assert.ok(questions.some(message => /maximum budget differs/.test(message)));
    assert.ok(questions.some(message => /bedroom count differs/.test(message)));
    assert.ok(questions.some(message => /size range differs/.test(message)));
    assert.equal(requirement.raw_request, text);
  }
});

test('changed upper-size limits stay flagged after supported extraction', async () => {
  const { requirement } = await prepareHomeRequirement(`${english} Size no more than 1400 sq ft.`, areas);
  assert.ok(!homeReviewQuestions(requirement).some(message => /maximum size differs/.test(message)));
  assert.ok(homeReviewQuestions({ ...requirement, area_max: 1500 }).some(message => /maximum size differs/.test(message)));
});

test('fixed AED task currency does not silently reinterpret a stated USD budget', async () => {
  const result = await prepareHomeRequirement('Client name: Alex. Dubai Marina, 2 bedroom apartment, budget USD 700k.', areas);
  assert.equal(result.requirement.currency, 'AED');
  assert.equal(result.requirement.budget_max, null);
  assert.ok(result.warnings.some(message => /not in AED/.test(message)));
  assert.ok(missingHomeFields('create', result.requirement).includes('budget_max'));
  assert.match(result.requirement.raw_request, /USD 700k/);
});

test('client search extracts its own name/location/type/scope and allows a single condition', async () => {
  const named = await prepareClientSearch('Find client Alex', areas);
  assert.equal(named.filters.name, 'Alex');
  assert.equal(hasClientSearchCondition(named.filters), true);
  const grouped = await prepareClientSearch('Find company clients looking for apartments in Dubai Marina, budget AED 2m to 3m.', areas);
  assert.equal(grouped.filters.name, '');
  assert.equal(grouped.filters.preferred_location, 'Dubai Marina');
  assert.equal(grouped.filters.property_type, 'apartment');
  assert.equal(grouped.filters.visibility, 'company');
  assert.equal(grouped.filters.budget_min, 2_000_000);
  assert.equal(grouped.filters.budget_max, 3_000_000);
  const unassigned = await prepareClientSearch('寻找未分配公司客户，偏好Dubai Marina公寓', areas);
  assert.equal(unassigned.filters.visibility, 'unassigned');
});

test('a scope alone never counts as a client search condition', () => {
  assert.equal(hasClientSearchCondition({ ...EMPTY_CLIENT_DIRECTORY_FILTERS, visibility: 'company' }), false);
  assert.equal(hasClientSearchCondition({ ...EMPTY_CLIENT_DIRECTORY_FILTERS, name: '   ' }), false);
  assert.equal(hasClientSearchCondition({ ...EMPTY_CLIENT_DIRECTORY_FILTERS, budget_max: 0 }), true);
});

test('names support explicit Chinese/English labels without inventing names from descriptions', () => {
  assert.equal(extractClientName('客户姓名：陈女士，预算280万'), '陈女士');
  assert.equal(extractClientName('Client alias: Synthetic Alex. In Dubai Marina.'), 'Synthetic Alex');
  assert.equal(extractClientName('Find a client in Dubai Marina'), '');
  assert.equal(extractClientName('Find clients with a budget of AED 2m'), '');
  assert.equal(extractClientName('Dubai Marina apartment for investment'), '');
});

test('raw conflicts remain visible and invalid ranges block continue', async () => {
  const result = await prepareHomeRequirement('Dubai Marina公寓，两居，预算不超过280万迪拉姆。必须不要停车位。', areas);
  const edited = { ...result.requirement, budget_min: 3_000_000, budget_max: 2_000_000, area_min: 1500, area_max: 1000 };
  assert.equal(homeRequirementErrors(edited).length, 2);
  assert.match(edited.raw_request, /必须不要停车位/);
  assert.ok(homeReviewQuestions(edited).length > 0);
});
