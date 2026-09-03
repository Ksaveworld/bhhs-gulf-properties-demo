import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement, ruleAssistant } from '../shared/assistant';
import { EMPTY_FILTERS, evaluateMatch, filterListings, latestListings, parseHardConstraints, requirementsToFilters } from '../shared/matching';
import { getPriceEvidence } from '../shared/pricing';
import { deriveClients, deriveProperties } from '../shared/types';
import type { ClientRequirement, Dataset, ListingSnapshot, ListingTransactionLink, Transaction } from '../shared/types';

const source = {
  data_kind: 'demo' as const, source_name: 'Synthetic test fixture', source_ref: 'DEMO-TEST-SOURCE',
  source_date: null, captured_at: '2026-09-03T12:00:00Z', verification_status: 'verified' as const,
  usage_status: 'approved' as const, reviewed_by: 'Synthetic fixture reviewer', notes: 'Fictional test data, never real evidence.',
};
function listing(change: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    ...source, snapshot_id: 'S1', listing_id: 'L1', property_id: 'P1', title: 'Synthetic apartment',
    area_name: 'Dubai Marina', building_name: 'DEMO TOWER', unit_ref: 'DEMO UNIT 1', property_type: 'apartment',
    bedrooms: 2, area_value: 1280, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready',
    listing_status: 'active', asking_price: 2450000, currency: 'AED', listed_at: null,
    availability_date: '2026-11-01', amenities: ['parking', 'pool'], evidence_excerpt: 'Fictional fixture only.', ...change,
  };
}
function requirement(change: Partial<ClientRequirement> = {}): ClientRequirement {
  return {
    ...createEmptyRequirement('Synthetic client request'), ...source, requirement_id: 'R1', client_id: 'C1',
    client_alias: 'Demo buyer', budget_min: 2200000, budget_max: 2800000, currency: 'AED', budget_constraint: 'hard',
    preferred_areas: ['Dubai Marina'], property_types: ['apartment'], bedrooms_min: 2, area_min: 1100, area_unit: 'sqft',
    hard_constraints: 'area basis: built_up; must have parking', market_preference: 'ready', purchase_purpose: 'self_use',
    purchase_by: '2026-12-01', move_in_by: '2026-12-31', ...change,
  };
}
function transaction(change: Partial<Transaction> = {}): Transaction {
  return {
    ...source, transaction_id: 'T1', source_record_id: 'DEMO REGISTRY RECORD', property_id: 'P1', record_type: 'sale',
    transaction_scope: 'whole_unit', transaction_date: '2025-04-01', date_basis: 'registration', amount: 2000000,
    currency: 'AED', area_name: 'Dubai Marina', building_name: 'DEMO TOWER', unit_ref: 'DEMO UNIT 1',
    property_type: 'apartment', bedrooms: 2, area_value: 1280, area_unit: 'sqft', area_basis: 'built_up',
    registration_segment: 'ready', evidence_excerpt: 'Synthetic whole-unit sale amount and registration date.', ...change,
  };
}
function link(change: Partial<ListingTransactionLink> = {}): ListingTransactionLink {
  return {
    link_id: 'LINK1', listing_id: 'L1', transaction_id: 'T1', relation_type: 'exact_property',
    match_basis: 'Synthetic stable property identity P1 and unit identity correspond.', differences: 'Synthetic example; no valuation.',
    pricing_eligible: 'yes', evidence_refs: 'DEMO-L1|DEMO-T1', verification_status: 'verified', reviewed_by: 'Synthetic fixture reviewer',
    reviewed_at: '2026-09-03T12:00:00Z', data_kind: 'demo', notes: null, ...change,
  };
}
function dataset(transactions: Transaction[] = [transaction()], links: ListingTransactionLink[] = [link()]): Dataset {
  return {
    listing_snapshots: [listing()], transactions, listing_transaction_links: links, client_requirements: [requirement()], match_reference: [],
    meta: { mode: 'demo', label: 'Synthetic test fixture', loaded_at: '2026-09-03T12:00:00Z', warnings: [], quarantined_count: 0 },
  };
}

test('latest snapshot changes price without collapsing separate listings into physical properties', () => {
  const old = listing({ snapshot_id: 'OLD', captured_at: '2026-08-01T10:00:00Z', asking_price: 2300000 });
  const newRow = listing();
  const duplicate = listing({ snapshot_id: 'S2', listing_id: 'L2' });
  assert.deepEqual(latestListings([old, newRow, duplicate]).map((row) => [row.listing_id, row.asking_price]), [['L1', 2450000], ['L2', 2450000]]);
  const derived = deriveProperties({ listing_snapshots: [old, newRow, duplicate, listing({ listing_id: 'UNIDENTIFIED', property_id: null })], transactions: [transaction()] });
  assert.deepEqual(derived, [{ property_id: 'P1', listing_ids: ['L1', 'L2'], transaction_ids: ['T1'] }]);
  assert.equal(deriveClients([requirement(), requirement({ requirement_id: 'R2' })])[0].requirement_ids.length, 2);
});

test('ordinary filters and reviewed assistant conditions share exact results; budget and area changes alter candidates', async () => {
  const rows = [listing(), listing({ listing_id: 'L2', snapshot_id: 'S2', asking_price: 2700000 }), listing({ listing_id: 'L3', snapshot_id: 'S3', area_name: 'Downtown Dubai' })];
  const extracted = await ruleAssistant.extract('Budget AED 2.8m, 2 bedrooms apartment in Dubai Marina, ready for self-use.', { areas: ['Dubai Marina', 'Downtown Dubai'] });
  const filters = requirementsToFilters(extracted.requirement);
  const manual = { ...EMPTY_FILTERS, areas: ['Dubai Marina'], budget_max: 2800000, bedrooms_min: 2, property_types: ['apartment'], market_preference: 'ready' };
  assert.deepEqual(filterListings(rows, filters).map((row) => row.listing_id), filterListings(rows, manual).map((row) => row.listing_id));
  assert.deepEqual(filterListings(rows, { ...manual, budget_max: 2600000 }).map((row) => row.listing_id), ['L1']);
  assert.deepEqual(filterListings(rows, { ...manual, areas: ['Downtown Dubai'] }).map((row) => row.listing_id), ['L3']);
  assert.equal(filterListings(rows, { ...manual, areas: ['Marina'] }).length, 0);
});

test('unknown hard fields and area basis do not pass a confirmed filter; sqft / sqm conversion keeps basis', () => {
  const filters = requirementsToFilters(requirement());
  assert.equal(filterListings([listing()], filters).length, 1);
  assert.equal(filterListings([listing({ area_value: 119, area_unit: 'sqm' })], filters).length, 1);
  assert.equal(filterListings([listing({ area_basis: 'internal' })], filters).length, 0);
  assert.equal(filterListings([listing({ area_basis: 'unknown' })], filters).length, 0);
  assert.equal(filterListings([listing({ asking_price: null })], filters).length, 0);
  assert.equal(filterListings([listing({ bedrooms: null })], filters).length, 0);
  assert.equal(filterListings([listing({ amenities: null })], filters).length, 0);
  assert.equal(filterListings([listing()], { ...filters, area_basis: '' }).length, 0);
  assert.equal(evaluateMatch(listing({ area_basis: 'internal' }), requirement()).status, 'review');
});

test('price sorting groups currencies and never uses an implied FX conversion', () => {
  const rows = [listing({ listing_id: 'USD-L', currency: 'USD', asking_price: 1 }), listing({ listing_id: 'AED-H', asking_price: 900 }), listing({ listing_id: 'AED-L', asking_price: 100 }), listing({ listing_id: 'AED-NULL', asking_price: null })];
  assert.deepEqual(filterListings(rows, { ...EMPTY_FILTERS, sort: 'price_asc' }).map((row) => row.listing_id), ['AED-L', 'AED-H', 'AED-NULL', 'USD-L']);
  assert.deepEqual(filterListings(rows, { ...EMPTY_FILTERS, budget_max: 500 }).map((row) => row.listing_id), ['AED-L']);
  assert.equal(evaluateMatch(listing({ currency: 'USD' }), requirement()).status, 'review');
});

test('hard budget excludes; flexible budget gives a reviewable amount difference, never a probability', () => {
  const hard = evaluateMatch(listing(), requirement({ budget_max: 2400000 }));
  const flexible = evaluateMatch(listing(), requirement({ budget_max: 2400000, budget_constraint: 'flexible' }));
  assert.equal(hard.status, 'excluded');
  assert.equal(flexible.status, 'review');
  assert.match(flexible.budget_fit, /AED 50,000/);
  assert.equal(JSON.stringify(flexible).includes('%'), false);
  assert.equal(flexible.intent_evidence, null);
  assert.equal(evaluateMatch(listing(), requirement()).status, 'match');
});

test('amenity hard constraints, unknown requests and soft preferences remain distinct', () => {
  assert.deepEqual(parseHardConstraints('must have parking; area basis: built_up').amenities, ['parking']);
  assert.deepEqual(parseHardConstraints('必须带车位; area basis: built_up').amenities, ['parking']);
  const result = evaluateMatch(listing(), requirement({ hard_constraints: 'must be within 5 minutes of my school; area basis: built_up', soft_preferences: 'prefer a gym' }));
  assert.equal(result.status, 'review');
  assert.ok(result.unknowns.some((message) => message.includes('5 minutes')));
  assert.ok(result.unknowns.some((message) => message.includes('Soft preferences')));
  assert.equal(result.conflicts.length, 0);
  assert.equal(filterListings([listing()], requirementsToFilters(requirement({ soft_preferences: 'prefer a gym' }))).length, 1);
});

test('assistant handles English and Chinese budgets but never invents currency or area aliases', async () => {
  const chinese = await ruleAssistant.extract('预算 180–280 万 AED，两居，自住，必须带车位，偏好泳池。', { areas: ['Dubai Marina'] });
  assert.equal(chinese.mode, 'rules');
  assert.equal(chinese.requirement.budget_min, 1800000);
  assert.equal(chinese.requirement.budget_max, 2800000);
  assert.equal(chinese.requirement.bedrooms_min, 2);
  assert.equal(chinese.requirement.purchase_purpose, 'self_use');
  assert.match(chinese.requirement.hard_constraints!, /必须带车位/);
  assert.match(chinese.requirement.soft_preferences!, /偏好泳池/);
  const noCurrency = await ruleAssistant.extract('预算280万，迪拜码头', { areas: ['Dubai Marina'] });
  assert.equal(noCurrency.requirement.currency, null);
  assert.equal(noCurrency.requirement.preferred_areas, null);
  assert.ok(noCurrency.warnings.some((warning) => warning.includes('currency')));
  assert.equal(noCurrency.requirement.raw_request, '预算280万，迪拜码头');
});

test('assistant separates purchase and move-in dates and retains vague timing without filling dates', async () => {
  const complete = await ruleAssistant.extract('Buy by 2026-12-01, move in by 2027-02-01. Budget AED 2.8m, ready, 1200 sqft built_up.', { areas: [] });
  assert.equal(complete.requirement.purchase_by, '2026-12-01');
  assert.equal(complete.requirement.move_in_by, '2027-02-01');
  assert.equal(complete.requirement.area_min, 1200);
  assert.equal(requirementsToFilters(complete.requirement).area_basis, 'built_up');
  const vague = await ruleAssistant.extract('下周看房，尽快购买，Q4 入住；预算280万 AED', { areas: [] });
  assert.equal(vague.requirement.purchase_by, null);
  assert.equal(vague.requirement.move_in_by, null);
  assert.ok(vague.warnings.some((warning) => warning.includes('Relative dates')));
  const invalid = await ruleAssistant.extract('Buy by 2026-02-31', { areas: [] });
  assert.equal(invalid.requirement.purchase_by, null);
  assert.ok(invalid.warnings.some((warning) => warning.includes('Invalid')));
});

test('negated area and market conditions are not extracted as positive preferences', async () => {
  const result = await ruleAssistant.extract('Avoid Dubai Marina; no off-plan; budget AED 2.8m.', { areas: ['Dubai Marina'] });
  assert.equal(result.requirement.preferred_areas, null);
  assert.equal(result.requirement.market_preference, 'unknown');
  assert.ok(result.warnings.some((warning) => warning.includes('exclusion')));
  assert.ok(result.warnings.some((warning) => warning.includes('negated')));
  assert.equal(evaluateMatch(listing(), result.requirement).status, 'review');
});

test('budget ranges accept repeated currency markers on both endpoints', async () => {
  const result = await ruleAssistant.extract('Budget AED 2.2m to AED 2.8m in Dubai Marina, 2 bedrooms', { areas: ['Dubai Marina'] });
  assert.equal(result.requirement.budget_min, 2200000);
  assert.equal(result.requirement.budget_max, 2800000);
});

test('explicit client budget takes precedence over observed listing prices', async () => {
  const result = await ruleAssistant.extract('I saw an apartment for AED 2.1m. My budget is AED 2.8m in Dubai Marina, 2 bedrooms', { areas: ['Dubai Marina'] });
  assert.equal(result.requirement.budget_max, 2800000);
  const observedOnly = await ruleAssistant.extract('I saw an apartment for AED 2.1m in Dubai Marina.', { areas: ['Dubai Marina'] });
  assert.equal(observedOnly.requirement.budget_max, null);
});

test('do not consider retains the exclusion and selects only a positive preferred area', async () => {
  const result = await ruleAssistant.extract('Do not consider Dubai Marina; prefer Downtown Dubai', { areas: ['Dubai Marina', 'Downtown Dubai'] });
  assert.deepEqual(result.requirement.preferred_areas, ['Downtown Dubai']);
  assert.match(result.requirement.hard_constraints!, /Excluded area requested: Dubai Marina/);
});

test('maximum bedrooms remains an unsupported constraint instead of being inverted into a minimum', async () => {
  const result = await ruleAssistant.extract('Budget AED 2.8m in Dubai Marina, no more than 2 bedrooms', { areas: ['Dubai Marina'] });
  assert.equal(result.requirement.bedrooms_min, null);
  assert.ok(result.warnings.some((warning) => /maximum.*bedroom|bedroom.*maximum/i.test(warning)));
  assert.match(result.requirement.hard_constraints!, /no more than 2 bedrooms/i);
  assert.equal(evaluateMatch(listing({ bedrooms: 3 }), result.requirement).status, 'review');
});

test('negated property type, layout and purpose do not turn into positive preferences', async () => {
  const types = await ruleAssistant.extract('Budget AED 6m. Ready apartment, no villas.', { areas: [] });
  assert.deepEqual(types.requirement.property_types, ['apartment']);
  assert.match(types.requirement.hard_constraints!, /villa/i);
  const layout = await ruleAssistant.extract('Budget AED 2.8m; not a studio, at least 2 bedrooms.', { areas: [] });
  assert.equal(layout.requirement.bedrooms_min, 2);
  const purpose = await ruleAssistant.extract('Budget AED 2.8m. Not for investment, self-use only.', { areas: [] });
  assert.equal(purpose.requirement.purchase_purpose, 'self_use');
});

test('maximum area is preserved for review without inversion into a minimum-area filter', async () => {
  const result = await ruleAssistant.extract('Budget AED 2.8m; no more than 1,000 sqft built_up area.', { areas: [] });
  assert.equal(result.requirement.area_min, null);
  assert.match(result.requirement.hard_constraints!, /no more than 1,000 sqft/i);
  assert.ok(result.warnings.some((warning) => /maximum.*area|area.*maximum/i.test(warning)));
  assert.equal(evaluateMatch(listing({ area_value: 1280 }), result.requirement).status, 'review');
});

test('complete English sentences keep required parking separate from balcony preference and purchase timing', async () => {
  const text = 'Looking for a ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m, for self use. Must have parking. Prefer a balcony. Purchase by 2026-12-01.';
  const result = await ruleAssistant.extract(text, { areas: ['Dubai Marina'] });
  assert.equal(result.requirement.budget_max, 2800000);
  assert.equal(result.requirement.hard_constraints, 'Must have parking');
  assert.equal(result.requirement.soft_preferences, 'Prefer a balcony');
  assert.deepEqual(requirementsToFilters(result.requirement).amenities, ['parking']);
  assert.equal(result.requirement.purchase_by, '2026-12-01');
});

test('same-home history and comparables use explicit separately verified links', () => {
  const comparable = transaction({ transaction_id: 'T2', property_id: 'P2', unit_ref: 'DEMO UNIT 2' });
  const evidence = getPriceEvidence(listing(), dataset([transaction(), comparable], [link(), link({ link_id: 'LINK2', transaction_id: 'T2', relation_type: 'comparable' })]));
  assert.deepEqual(evidence.history.map((entry) => entry.transaction.transaction_id), ['T1']);
  assert.deepEqual(evidence.comparables.map((entry) => entry.transaction.transaction_id), ['T2']);
  assert.equal(evidence.excluded_count, 0);
  const mistaken = getPriceEvidence(listing(), dataset([comparable], [link({ transaction_id: 'T2' })]));
  assert.equal(mistaken.history.length, 0);
  assert.equal(mistaken.excluded_count, 1);
});

test('same building and area alone are insufficient proof of property identity', () => {
  const unknownListing = listing({ property_id: null, unit_ref: null });
  const unknownTransaction = transaction({ property_id: null, unit_ref: null });
  assert.equal(getPriceEvidence(unknownListing, dataset([unknownTransaction], [link({ match_basis: 'Same building and area' })])).history.length, 0);
  assert.equal(getPriceEvidence(listing(), dataset([transaction()], [link({ verification_status: 'needs_review' })])).history.length, 0);
  assert.equal(getPriceEvidence(listing(), dataset([transaction()], [link({ reviewed_by: null })])).history.length, 0);
});

test('known same-property transactions cannot be presented as neighbourhood comparables', () => {
  const result = getPriceEvidence(listing(), dataset([transaction()], [link({ relation_type: 'comparable' })]));
  assert.equal(result.comparables.length, 0);
  assert.equal(result.history.length, 0);
  assert.equal(result.excluded_count, 1);
});

test('non-sale, partial-share, unapproved, unknown-date and mixed-basis evidence is excluded', () => {
  for (const change of [{ record_type: 'mortgage' }, { transaction_scope: 'partial_share' }, { usage_status: 'pending' }, { transaction_date: null }, { amount: null }, { date_basis: 'unknown' }] as Partial<Transaction>[]) {
    const result = getPriceEvidence(listing(), dataset([transaction(change)]));
    assert.equal(result.history.length, 0, JSON.stringify(change));
    assert.equal(result.excluded_count, 1);
  }
  const mixedBasis = getPriceEvidence(listing(), dataset([transaction({ area_basis: 'internal', property_id: 'P2' })], [link({ relation_type: 'comparable' })]));
  assert.equal(mixedBasis.comparables.length, 0);
  assert.deepEqual(getPriceEvidence(listing(), dataset([], [])), { history: [], comparables: [], excluded_count: 0 });
});
