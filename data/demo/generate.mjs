import { readFile, writeFile } from 'node:fs/promises';

// Entirely invented fixtures. Real source records never belong in this directory.
const schema = JSON.parse(await readFile(new URL('../templates/schema.json', import.meta.url), 'utf8'));
const captured = '2026-09-02T12:00:00+04:00';
const syntheticNote = 'Invented for interaction testing. Not a real BHHS property, client, transaction, source or business rule.';
const source = (ref) => ({
  data_kind: 'demo', source_name: 'Synthetic demo fixture', source_ref: ref,
  source_date: '2026-09-02', captured_at: captured, verification_status: 'verified',
  usage_status: 'approved', reviewed_by: 'Demo fixture author (synthetic validation only)', notes: syntheticNote,
});
const listing = (id, overrides) => ({
  ...source(`DEMO-SOURCE-L-${id}`), snapshot_id: `DEMO-S-${id}-02`, listing_id: `DEMO-L-${id}`,
  property_id: `DEMO-P-${id}`, title: `Demo residence ${id}`, area_name: 'Dubai Marina',
  building_name: `Demo Building ${id}`, unit_ref: `DEMO-UNIT-${id}`, property_type: 'apartment',
  bedrooms: 2, area_value: 1280, area_unit: 'sqft', area_basis: 'built_up',
  market_segment: 'ready', listing_status: 'active', asking_price: 2450000, currency: 'AED',
  listed_at: '2026-08-10', availability_date: '2026-10-01', amenities: ['parking', 'pool', 'balcony'],
  evidence_excerpt: 'Synthetic fixture fields only; all prices, dates, sizes and features are invented.',
  ...overrides,
});
const listings = [
  listing('001', { title: 'Marina Vista · two bedroom', building_name: 'Demo Marina Vista', captured_at: '2026-09-02T16:00:00+04:00' }),
  listing('002', { title: 'Harbour View · two bedroom', building_name: 'Demo Harbour View', asking_price: 2700000, area_value: 1400, captured_at: '2026-09-02T15:30:00+04:00' }),
  listing('003', { title: 'Downtown Terrace · two bedroom', area_name: 'Downtown Dubai', asking_price: 3200000, area_value: 1450, building_name: 'Demo Downtown Terrace', captured_at: '2026-09-02T15:00:00+04:00' }),
  listing('004', { title: 'Palm Garden · three bedroom villa', area_name: 'Palm Jumeirah', property_type: 'villa', bedrooms: 3, asking_price: 5700000, area_value: 3100, building_name: 'Demo Palm Garden', amenities: ['parking', 'private garden'], captured_at: '2026-09-02T14:30:00+04:00' }),
  listing('005', { title: 'Circle Court · one bedroom', area_name: 'Jumeirah Village Circle', bedrooms: 1, asking_price: 975000, area_value: 760, building_name: 'Demo Circle Court', amenities: ['parking', 'gym'], captured_at: '2026-09-02T14:00:00+04:00' }),
  listing('006', { title: 'Downtown Horizon · off-plan two bedroom', area_name: 'Downtown Dubai', asking_price: 2400000, area_value: 1180, market_segment: 'off_plan', availability_date: '2028-06-30', building_name: 'Demo Downtown Horizon', amenities: ['parking'], captured_at: '2026-09-02T13:30:00+04:00' }),
  listing('007', { title: 'Marina Cove · price to confirm', asking_price: null, currency: null, area_value: 1390, building_name: 'Demo Marina Cove', notes: `${syntheticNote} Asking price and currency were intentionally omitted for missing-data testing.`, captured_at: '2026-09-02T13:00:00+04:00' }),
  listing('008', { title: 'Circle Studio · area to confirm', area_name: 'Jumeirah Village Circle', bedrooms: 0, asking_price: 620000, area_value: null, area_unit: null, area_basis: null, building_name: 'Demo Circle Studio', amenities: null, notes: `${syntheticNote} Area, unit and basis were intentionally omitted.`, captured_at: '2026-09-02T12:30:00+04:00' }),
  listing('009', { title: 'Marina Quay · withdrawn listing', bedrooms: 1, asking_price: 1600000, area_value: 840, listing_status: 'withdrawn', availability_date: null, building_name: 'Demo Marina Quay', notes: `${syntheticNote} Withdrawn means removed from market; no sale is asserted.`, captured_at: '2026-09-02T12:00:00+04:00' }),
  listing('010', { title: 'Palm Shore · two bedroom (USD)', area_name: 'Palm Jumeirah', asking_price: 1250000, currency: 'USD', area_value: 1750, building_name: 'Demo Palm Shore', notes: `${syntheticNote} Original USD denomination; no FX conversion supplied.`, captured_at: '2026-09-02T11:30:00+04:00' }),
];
listings.push({ ...listings[0], snapshot_id: 'DEMO-S-001-01', asking_price: 2550000, captured_at: '2026-08-21T10:00:00+04:00', source_date: '2026-08-21', notes: `${syntheticNote} Older asking-price snapshot, not a completed transaction.` });

const transaction = (id, overrides) => ({
  ...source(`DEMO-SOURCE-T-${id}`), transaction_id: `DEMO-T-${id}`, source_record_id: `DEMO-RECORD-${id}`,
  property_id: `DEMO-TRANSACTED-P-${id}`, record_type: 'sale', transaction_scope: 'whole_unit',
  transaction_date: '2026-06-15', date_basis: 'registration', amount: 2350000, currency: 'AED',
  area_name: 'Dubai Marina', building_name: 'Demo Comparable Tower', unit_ref: `DEMO-T-UNIT-${id}`,
  property_type: 'apartment', bedrooms: 2, area_value: 1250, area_unit: 'sqft', area_basis: 'built_up', registration_segment: 'ready',
  evidence_excerpt: 'Synthetic evidence: invented sale type, whole-unit scope, amount and registration date.',
  ...overrides,
});
const transactions = [
  transaction('001', { property_id: 'DEMO-P-001', building_name: 'Demo Marina Vista', unit_ref: 'DEMO-UNIT-001', transaction_date: '2024-11-20', amount: 2100000, area_value: 1280 }),
  transaction('002', { transaction_date: '2026-07-18', amount: 2350000 }),
  transaction('003', { record_type: 'mortgage', transaction_date: '2026-01-10', amount: 1800000, evidence_excerpt: 'Synthetic mortgage amount. This is not a sale price.' }),
  transaction('004', { area_name: 'Downtown Dubai', building_name: 'Demo Downtown Comparable', amount: 3050000, area_value: 1420, transaction_date: '2026-05-12' }),
  transaction('005', { transaction_scope: 'partial_share', amount: 950000, transaction_date: '2025-08-08', evidence_excerpt: 'Synthetic transfer of a partial share. This is not a whole-unit sale price.' }),
  transaction('006', { property_id: 'DEMO-P-004', area_name: 'Palm Jumeirah', building_name: 'Demo Palm Garden', unit_ref: 'DEMO-UNIT-004', property_type: 'villa', bedrooms: 3, amount: 4800000, area_value: 3100, transaction_date: '2023-04-18' }),
];
const link = (id, listingId, transactionId, overrides) => ({
  link_id: `DEMO-LINK-${id}`, listing_id: `DEMO-L-${listingId}`, transaction_id: `DEMO-T-${transactionId}`,
  relation_type: 'comparable', match_basis: 'Synthetic same-area, same-property-type comparison; distinct physical properties.',
  differences: 'Different building and unit; size and transaction date differ. Floor, condition and orientation have not been adjusted. No calibrated valuation threshold.',
  pricing_eligible: 'yes', evidence_refs: `DEMO-SOURCE-L-${listingId}|DEMO-SOURCE-T-${transactionId}`,
  verification_status: 'verified', reviewed_by: 'Demo fixture author (synthetic validation only)', reviewed_at: captured,
  data_kind: 'demo', notes: syntheticNote, ...overrides,
});
const links = [
  link('001', '001', '001', { relation_type: 'exact_property', match_basis: 'Synthetic stable identity DEMO-P-001 and DEMO-UNIT-001 is explicitly the same in both invented source records.', differences: 'Earlier transaction date. No adjustment for condition or market movement.' }),
  link('002', '001', '002'),
  link('003', '001', '003', { pricing_eligible: 'no', match_basis: 'Same synthetic area; mortgage record retained only to demonstrate exclusion.', differences: 'Mortgage amount is not a sale price.', notes: `${syntheticNote} Excluded from price references: mortgage.` }),
  link('004', '003', '004'),
  link('005', '001', '005', { pricing_eligible: 'no', match_basis: 'Same synthetic area, but partial ownership transferred.', differences: 'Partial-share transfer cannot be compared with whole-unit asking price.', notes: `${syntheticNote} Excluded from price references: partial share.` }),
  link('006', '004', '006', { relation_type: 'exact_property', match_basis: 'Synthetic stable identity DEMO-P-004 and DEMO-UNIT-004 is explicitly the same in both invented source records.', differences: 'Transaction occurred in 2023; no time or property-condition adjustment.' }),
  link('007', '002', '002'),
];

const requirement = (id, overrides) => ({
  ...source(`DEMO-SOURCE-R-${id}`), requirement_id: `DEMO-R-${id}`, client_id: `DEMO-C-${id}`,
  client_alias: `Demo client ${id}`, sales_owner: 'Demo sales team', raw_request: 'Synthetic request for interaction testing.',
  budget_min: null, budget_max: null, currency: null, budget_constraint: 'unknown', preferred_areas: null,
  property_types: ['apartment'], bedrooms_min: null, area_min: null, area_unit: null, purchase_purpose: 'unknown',
  market_preference: 'unknown', purchase_by: null, move_in_by: null, hard_constraints: null, soft_preferences: null,
  intent_evidence: null, missing_questions: 'Does the budget include transaction fees?', ...overrides,
});
const requirements = [
  requirement('001', { client_alias: 'Demo client A · Marina home', raw_request: 'Demo: AED 2.2m to 2.8m for a ready apartment in Dubai Marina, at least 2 bedrooms and 1,100 sqft built-up area. Buy by 2026-12-01 and move in by 2027-01-01. Prefer a pool.', budget_min: 2200000, budget_max: 2800000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Dubai Marina'], bedrooms_min: 2, area_min: 1100, area_unit: 'sqft', purchase_purpose: 'self_use', market_preference: 'ready', purchase_by: '2026-12-01', move_in_by: '2027-01-01', hard_constraints: 'area basis: built_up; budget upper limit is firm.', soft_preferences: 'Prefer a pool.', intent_evidence: 'Synthetic client asked to review viewing options next week.' }),
  requirement('002', { client_alias: 'Demo client B · Marina shortlist', raw_request: 'Demo: looking for a ready Dubai Marina apartment with at least 2 bedrooms, budget up to AED 2.6m. No purchase date stated.', budget_max: 2600000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Dubai Marina'], bedrooms_min: 2, purchase_purpose: 'mixed', market_preference: 'ready', soft_preferences: 'Prefer a balcony.', missing_questions: 'Confirm purchase date and whether budget includes fees.' }),
  requirement('003', { client_alias: 'Demo client C · Future investment', raw_request: 'Demo: off-plan apartment in Downtown Dubai, at least 2 bedrooms, maximum AED 2.6m, for investment. No delivery deadline stated.', budget_max: 2600000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Downtown Dubai'], bedrooms_min: 2, market_preference: 'off_plan', purchase_purpose: 'investment', missing_questions: 'Confirm delivery window and payment-plan requirements.' }),
  requirement('004', { client_alias: 'Demo client D · No match case', raw_request: 'Demo: ready villa on Palm Jumeirah, at least 3 bedrooms, firm maximum AED 4m.', budget_max: 4000000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Palm Jumeirah'], property_types: ['villa'], bedrooms_min: 3, market_preference: 'ready', purchase_purpose: 'self_use', missing_questions: 'Would the client consider another area? Do not assume budget flexibility.' }),
  requirement('005', { client_alias: 'Demo client E · JVC apartment', raw_request: 'Demo: ready apartment in Jumeirah Village Circle, at least 1 bedroom, maximum AED 1.2m. Purchase timing undecided.', budget_max: 1200000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Jumeirah Village Circle'], bedrooms_min: 1, market_preference: 'ready', purchase_purpose: 'unknown', missing_questions: 'Confirm purchase purpose, timing and budget fee treatment.' }),
  requirement('006', { client_alias: 'Demo client F · Needs clarification', raw_request: 'Demo: I may be interested in an apartment. Please help me understand the options.', property_types: ['apartment'], missing_questions: 'Confirm budget and currency, preferred areas, bedroom count, purchase purpose and timing.', notes: `${syntheticNote} Intentionally incomplete; no wealth, purchasing power or intent inference is allowed.` }),
];
const reference = (id, requirementId, listingId, overrides) => ({
  case_id: `DEMO-M-${id}`, requirement_id: `DEMO-R-${requirementId}`, listing_id: listingId ? `DEMO-L-${listingId}` : null,
  expected_result: 'recommend', expected_rank: null, matched_conditions: 'Synthetic requested area, budget, bedrooms and market segment agree with fixture fields.',
  conflicting_conditions: null, intent_assessment: 'unknown', intent_basis: null, pricing_link_ids: null,
  price_reference_note: 'Synthetic test evidence only; no valuation or closing-price prediction.', follow_up_questions: 'Confirm budget fee treatment.',
  next_action: 'Salesperson reviews the evidence and confirms missing information before proposing a viewing.',
  case_type: 'standard', business_reviewer: 'Demo fixture author (not product business approval)', review_status: 'confirmed',
  reference_evidence: `Synthetic DEMO-R-${requirementId} request and ${listingId ? `DEMO-L-${listingId} listing fields` : 'current synthetic inventory'}.`,
  data_kind: 'demo', notes: syntheticNote, ...overrides,
});
const references = [
  reference('001', '001', '001', { expected_rank: 1, pricing_link_ids: ['DEMO-LINK-001', 'DEMO-LINK-002'], case_type: 'multiple_properties' }),
  reference('002', '001', '002', { expected_rank: 2, pricing_link_ids: ['DEMO-LINK-007'], case_type: 'multiple_properties' }),
  reference('003', '002', '001', { case_type: 'multiple_clients' }),
  reference('004', '002', '002', { expected_result: 'exclude', matched_conditions: 'Area, bedrooms and market segment match.', conflicting_conditions: 'AED 2.7m asking price exceeds the AED 2.6m hard cap.', case_type: 'budget_conflict' }),
  reference('005', '003', '006', { case_type: 'no_history', follow_up_questions: 'Confirm delivery and payment-plan requirements.' }),
  reference('006', '004', null, { expected_result: 'no_match', matched_conditions: null, conflicting_conditions: 'The only ready three-bedroom Palm Jumeirah villa in the fixture is above the AED 4m hard cap.', case_type: 'no_match', next_action: 'Ask whether another area is acceptable; do not presume extra purchasing power.' }),
  reference('007', '005', '005', { case_type: 'no_history' }),
  reference('008', '006', null, { expected_result: 'needs_clarification', matched_conditions: null, case_type: 'missing_fields', follow_up_questions: 'Confirm budget, currency, location, bedrooms, purpose and timing.', next_action: 'Salesperson captures the missing requirements.' }),
];
const raw = { listing_snapshots: listings, transactions, listing_transaction_links: links, client_requirements: requirements, match_reference: references };
const dataset = Object.fromEntries(schema.tables.map((table) => [table.key, raw[table.key].map((row) => Object.fromEntries(table.fields.map((field) => [field.key, row[field.key] ?? null])))]));
await writeFile(new URL('./dataset.json', import.meta.url), `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log('Created synthetic BHHS interaction fixtures: 10 listings / 11 snapshots, 6 transactions, 7 links, 6 requirements, 8 references.');
