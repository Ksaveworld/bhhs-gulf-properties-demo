import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewConstraintSegment, reviewRawRequest } from '../shared/constraint-review';
import type { ClientRequirement } from '../shared/types';

/** Independently invented regression examples; no received customer or workbook records are copied here. */
function requirement(change: Partial<ClientRequirement> = {}): ClientRequirement {
  return {
    requirement_id: 'SYNTHETIC-R', client_id: 'SYNTHETIC-C', client_alias: 'Synthetic regression request', sales_owner: null,
    raw_request: '', budget_min: 900000, budget_max: 1400000, currency: 'AED', budget_constraint: 'hard',
    preferred_areas: ['Synthetic district'], property_types: ['apartment'], bedrooms_min: 3,
    area_min: 1350, area_unit: 'sqft', area_basis: null, purchase_purpose: 'unknown', market_preference: 'ready',
    purchase_by: null, move_in_by: null, hard_constraints: null, soft_preferences: null, intent_evidence: null,
    missing_questions: null, data_kind: 'demo', source_name: 'Synthetic regression fixture', source_ref: 'DEMO-CONSTRAINT-TEST',
    source_date: null, captured_at: '2026-01-01T00:00:00Z', verification_status: 'needs_review', usage_status: 'pending',
    reviewed_by: null, notes: 'Invented independently for parser tests.', ...change,
  };
}

test('a structured lower budget needs its own evidence when the original only states a cap', () => {
  const capOnly = requirement({ raw_request: '预算上限AED 1.4M' });
  assert.ok(reviewRawRequest(capOnly).some(message => /source of that lower bound/.test(message)));
  assert.deepEqual(reviewRawRequest({ ...capOnly, budget_min: null }), []);
  assert.deepEqual(reviewRawRequest({ ...capOnly, raw_request: '预算AED 0.9M-1.4M' }), []);
});

test('complete explicit budget caps require the same amount, currency and hard-limit status', () => {
  for (const text of ['预算上限AED 1.4M', '预算不超过140万 AED。', '预算不得超过 AED 1,400,000', '预算最高为AED 1400K']) {
    const result = reviewConstraintSegment(text, requirement());
    assert.equal(result.kind, 'equivalent', text);
    assert.deepEqual([...result.fields].sort(), ['budget_constraint', 'budget_max', 'currency']);
  }
  assert.equal(reviewConstraintSegment('预算上限AED 1.6M', requirement()).kind, 'conflict');
  assert.equal(reviewConstraintSegment('预算上限AED 1.4M', requirement({ budget_constraint: 'flexible' })).kind, 'conflict');
  assert.equal(reviewConstraintSegment('预算上限AED 1.4M', requirement({ budget_constraint: 'unknown' })).kind, 'unrecognized');
  assert.equal(reviewConstraintSegment('预算上限AED 1.4M', requirement({ budget_max: null })).kind, 'unrecognized');
});

test('budget comparison does not assume missing currency, FX or equivalence of qualified and partial clauses', () => {
  for (const text of ['预算上限 USD 1.4M', '预算上限140万', '预算上限AED 1.4M含全部税费', '预算上限AED 1.4M但可以上浮', '预算大约AED 1.4M', '预算AED 1.4M']) {
    assert.equal(reviewConstraintSegment(text, requirement()).kind, 'unrecognized', text);
  }
  assert.equal(reviewConstraintSegment('预算上限AED 1.4M', requirement({ currency: null })).kind, 'unrecognized');
  assert.equal(reviewConstraintSegment('预算上限AED 1.4M', requirement({ currency: 'other' })).kind, 'unrecognized');
});

test('only explicit bedroom minima are equivalent to bedrooms_min', () => {
  for (const text of ['至少3居', '不少于三居室。', '不低于3卧室']) assert.equal(reviewConstraintSegment(text, requirement()).kind, 'equivalent', text);
  for (const text of ['3居室', '正好3居', '最多3居', '只要3居', '约3居', '至少3居或4居', '不要至少3居']) {
    assert.equal(reviewConstraintSegment(text, requirement()).kind, 'unrecognized', text);
  }
  assert.equal(reviewConstraintSegment('至少4居', requirement()).kind, 'conflict');
  assert.equal(reviewConstraintSegment('至少3居', requirement({ bedrooms_min: null })).kind, 'unrecognized');
});

test('a complete shared minimum conjunction can cover bedrooms and area without swallowing a remaining condition', () => {
  for (const text of ['至少3居和1,350 sqft。', '不少于三居室及1350平方英尺', '至少3居与至少1350sqft']) {
    const result = reviewConstraintSegment(text, requirement());
    assert.equal(result.kind, 'equivalent', text);
    assert.deepEqual([...result.fields].sort(), ['area_min', 'area_unit', 'bedrooms_min']);
  }
  for (const text of ['至少3居和1350sqft且近学校', '至少3居和1350sqft和停车位', '至少3居；至少1350sqft', '至少3居和最多1350sqft']) {
    assert.equal(reviewConstraintSegment(text, requirement()).kind, 'unrecognized', text);
  }
  assert.equal(reviewConstraintSegment('至少3居和1450sqft', requirement()).kind, 'conflict');
});

test('area review checks exact unit and amount without assigning or confirming area_basis', () => {
  const row = requirement();
  assert.equal(reviewConstraintSegment('面积至少1,350 sqft', row).kind, 'equivalent');
  assert.equal(reviewConstraintSegment('至少1350平方英尺。', row).kind, 'equivalent');
  assert.equal(reviewConstraintSegment('至少1400sqft', row).kind, 'conflict');
  assert.equal(reviewConstraintSegment('至少125.42sqm', row).kind, 'unrecognized');
  assert.equal(reviewConstraintSegment('至少1350sqft', requirement({ area_unit: null })).kind, 'unrecognized');
  assert.equal(reviewConstraintSegment('最多1350sqft', row).kind, 'unrecognized');
  assert.equal(row.area_basis, null);
  assert.equal(reviewConstraintSegment('至少1350sqft', row).fields.includes('area_basis'), false);
});

test('a market condition from hard_constraints is checked as a condition while preference wording is not upgraded', () => {
  assert.deepEqual(reviewConstraintSegment('现房。', requirement()), { kind: 'equivalent', fields: ['market_preference'] });
  assert.equal(reviewConstraintSegment('必须现房', requirement()).kind, 'equivalent');
  assert.equal(reviewConstraintSegment('期房', requirement()).kind, 'conflict');
  assert.equal(reviewConstraintSegment('现房', requirement({ market_preference: 'either' })).kind, 'conflict');
  assert.equal(reviewConstraintSegment('现房', requirement({ market_preference: 'unknown' })).kind, 'unrecognized');
  assert.equal(reviewConstraintSegment('偏好期房', requirement({ market_preference: 'off_plan' })).kind, 'unrecognized');
});

test('raw budget ranges compare each supplied bound without converting a single amount into a maximum', () => {
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '预算AED 900K-1.4M。' })), []);
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '预算范围为AED 900K至AED 1.4M。' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '预算AED 800K-1.4M。' })).some((text) => text.includes('budget_min')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '预算AED 900K-1.6M。' })).some((text) => text.includes('budget_max')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '预算不超过AED 1.6M。' })).some((text) => text.includes('budget_max')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '预算AED 1.4M。' })).some((text) => text.includes('single budget amount')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '预算AED 900K-USD 1.4M。' })).some((text) => text.includes('different currencies')));
});

test('raw explicit minima find numeric discrepancies while exact, approximate and alternative wording stays reviewable', () => {
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '至少3居，面积至少1350sqft。' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '至少4居，面积至少1450sqft。' })).some((text) => text.includes('bedrooms_min')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '至少4居，面积至少1450sqft。' })).some((text) => text.includes('area_min')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '寻找正好3居，面积约1350sqft。' })).some((text) => text.includes('Bedroom wording')));
  const uncertain = reviewRawRequest(requirement({ raw_request: '至少3居或者4居，面积约1450sqft以上。' }));
  assert.ok(uncertain.some((text) => text.includes('approximate')));
  assert.equal(uncertain.some((text) => text.includes('different numeric limits')), false);
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '至少3居和1350sqft。' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '至少3居和1450sqft。' })).some((text) => text.includes('area_min')));
});

test('required amenities must remain in hard constraints even if the soft preferences mention them', () => {
  const raw_request = '需要花园和停车位。';
  assert.deepEqual(reviewRawRequest(requirement({ raw_request, hard_constraints: 'must have garden; 必须带停车位' })), []);
  const softOnly = reviewRawRequest(requirement({ raw_request, hard_constraints: '必须带停车位', soft_preferences: '偏好花园' }));
  assert.equal(softOnly.length, 1);
  assert.match(softOnly[0], /garden.*only in soft_preferences/);
  const missing = reviewRawRequest(requirement({ raw_request }));
  assert.equal(missing.length, 2);
  assert.ok(missing.every((text) => text.includes('hard_constraints')));
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '不需要花园。' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '必须带停车位且靠近学校。' })).some((text) => text.includes('not fully understood')));
});

test('raw negations and additional maximum or exact conditions are not reduced to the recognized minimum', () => {
  const negative = reviewRawRequest(requirement({ raw_request: '不要至少4居，也不接受至少1500sqft。' }));
  assert.equal(negative.some((text) => text.includes('different numeric limits')), false);
  const additional = reviewRawRequest(requirement({ raw_request: '至少3居但最多4居；面积至少1350sqft且不超过1500sqft。' }));
  assert.ok(additional.some((text) => text.includes('Bedroom wording')));
  assert.ok(additional.some((text) => text.includes('Area wording')));
});

test('different view or pool concepts are not silently treated as equivalent amenities', () => {
  const warnings = reviewRawRequest(requirement({ raw_request: '必须有泳池。', hard_constraints: 'community_pool' }));
  assert.ok(warnings.some((text) => text.includes('requires pool')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '必须有水景。', hard_constraints: 'sea_view' })).some((text) => text.includes('not fully understood')));
});

test('raw market acceptance is compatible with either and market preferences do not become mandatory automatically', () => {
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '可接受期房。', market_preference: 'either' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '可接受期房。', market_preference: 'off_plan' })).some((text) => text.includes('exclusive')));
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '偏好期房。', market_preference: 'off_plan' })), []);
  assert.ok(reviewRawRequest(requirement({ raw_request: '偏好期房。', market_preference: 'off_plan', hard_constraints: '期房' })).some((text) => text.includes('mandatory')));
  assert.ok(reviewRawRequest(requirement({ raw_request: '必须现房。', market_preference: 'ready' })).some((text) => text.includes('missing from hard_constraints')));
  assert.deepEqual(reviewRawRequest(requirement({ raw_request: '必须现房。', market_preference: 'ready', hard_constraints: '现房' })), []);
});

test('relative timing produces a review notice and never fills or swaps dates', () => {
  const row = requirement({ raw_request: '四个月内入住，年内购房。' });
  assert.ok(reviewRawRequest(row).some((text) => text.includes('relative purchase or move-in timing')));
  assert.equal(row.purchase_by, null);
  assert.equal(row.move_in_by, null);
});

test('all reviews preserve frozen input records and original wording', () => {
  const row = requirement({ raw_request: '预算不超过AED 1.6M；需要花园和停车位。', hard_constraints: '至少3居和1350sqft。', soft_preferences: '偏好花园' });
  Object.freeze(row.preferred_areas);
  Object.freeze(row.property_types);
  Object.freeze(row);
  const before = JSON.stringify(row);
  reviewConstraintSegment(row.hard_constraints!, row);
  reviewRawRequest(row);
  assert.equal(JSON.stringify(row), before);
});
