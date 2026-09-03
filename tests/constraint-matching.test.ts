import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../shared/types';
import { evaluateMatch, filterListings, latestListings, parseHardConstraints, requirementsToFilters, requirementTextReview } from '../shared/matching';
import { ruleAssistant } from '../shared/assistant';

const dataset = JSON.parse(readFileSync(new URL('../data/demo/dataset.json', import.meta.url), 'utf8')) as Dataset;
const listing = latestListings(dataset.listing_snapshots).find(row => row.listing_id === 'DEMO-L-001')!;
const base = { ...dataset.client_requirements[0], budget_min: null, area_basis: 'built_up' as const, soft_preferences: null, missing_questions: null,
  raw_request: '预算上限AED 2.8M；至少2居和1100 sqft；必须带停车位；现房。',
  hard_constraints: '预算上限AED 2.8M；至少2居和1100 sqft；必须带停车位；现房。' };

test('Chinese repeated hard conditions are traced to structured fields without deleting source or granting unknown area', () => {
  const before = structuredClone(base);
  const review = requirementTextReview(base);
  assert.equal(review.equivalents.length, 3);
  assert.deepEqual(review.warnings, []);
  assert.equal(evaluateMatch(listing, base).status, 'match');
  assert.equal(filterListings([listing], requirementsToFilters(base)).length, 1);
  const missing = { ...base, area_basis: null };
  assert.equal(filterListings([listing], requirementsToFilters(missing)).length, 0);
  assert.ok(evaluateMatch(listing, missing).unknowns.some(reason => /面积口径待确认/.test(reason)));
  assert.deepEqual(base, before);
});

test('inconsistent or partial hard conditions remain reviewable even when structured filters return candidates', () => {
  for (const hard_constraints of ['预算上限AED 2.7M', '至少3居', '至少1200 sqft', '正好2居', '至少2居但最多3居', '至少2居且距学校五分钟']) {
    const req = { ...base, hard_constraints };
    assert.ok(parseHardConstraints(hard_constraints, req).unknowns.length > 0, hard_constraints);
    assert.equal(evaluateMatch(listing, req).status, 'review', hard_constraints);
    assert.equal(req.hard_constraints, hard_constraints);
  }
});

test('explicit hard market conditions exclude while a market preference only records a difference', () => {
  const offPlan = { ...listing, market_segment: 'off_plan' as const };
  assert.equal(evaluateMatch(offPlan, base).status, 'excluded');
  const preference = { ...base, raw_request: '偏好现房', hard_constraints: '必须带停车位' };
  assert.equal(evaluateMatch(offPlan, preference).status, 'review');
});

test('required Chinese amenities are retained and applied; negations never become positive amenities', async () => {
  const extracted = await ruleAssistant.extract('预算上限AED 3M。需要花园和停车位。', { areas: [] });
  assert.match(extracted.requirement.hard_constraints!, /需要花园和停车位/);
  assert.deepEqual(requirementsToFilters(extracted.requirement).amenities.sort(), ['garden', 'parking']);
  const denied = await ruleAssistant.extract('预算上限AED 3M。不需要停车位。', { areas: [] });
  assert.deepEqual(requirementsToFilters(denied.requirement).amenities, []);
  assert.match(denied.requirement.hard_constraints!, /不需要停车位/);
});

test('accepting off-plan does not narrow to off-plan only; original obligations omitted from hard text stay unknown', async () => {
  const acceptance = await ruleAssistant.extract('预算AED 3M，可接受期房。', { areas: [] });
  assert.equal(acceptance.requirement.market_preference, 'unknown');
  const either = await ruleAssistant.extract('预算AED 3M，现房期房都可以。', { areas: [] });
  assert.equal(either.requirement.market_preference, 'either');
  const omitted = { ...base, raw_request: '需要花园和停车位', hard_constraints: '必须带停车位', soft_preferences: '花园' };
  assert.ok(evaluateMatch(listing, omitted).unknowns.some(reason => /requires garden/.test(reason)));
});

test('an English minimum is not reinterpreted by the Chinese-only original-text checker', () => {
  const req = { ...base, raw_request: 'At least 2 bedrooms and at least 1,100 sqft.' };
  assert.deepEqual(requirementTextReview(req).warnings, []);
});

test('ambiguous, conflicting and negated area descriptions are not promoted to a confirmed basis', async () => {
  for (const raw of ['至少1200 sqft，建筑面积', '1200 sqft, not internal', '1200 sqft built_up or internal', 'Land wanted, 1200 sqft']) {
    const result = await ruleAssistant.extract(raw, { areas: [] });
    assert.equal(result.requirement.area_basis, null, raw);
  }
  const explicit = await ruleAssistant.extract('至少1200 sqft，area basis: internal', { areas: [] });
  assert.equal(explicit.requirement.area_basis, 'internal');
});
