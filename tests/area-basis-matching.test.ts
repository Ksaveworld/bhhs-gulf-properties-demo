import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../shared/types';
import { evaluateMatch, filterListings, latestListings, requirementsToFilters } from '../shared/matching';
import { applyRequirementFields } from '../shared/requirement-edit';
import { ruleAssistant } from '../shared/assistant';

const fixture = JSON.parse(readFileSync(new URL('../data/demo/dataset.json', import.meta.url), 'utf8')) as Dataset;
const listing = latestListings(fixture.listing_snapshots).find(row => row.listing_id === 'DEMO-L-001')!;
const requirement = fixture.client_requirements[0];

test('matching and filters agree for explicit, legacy, missing and conflicting area bases', () => {
  const variants = [
    { change: { area_basis: 'built_up' as const, hard_constraints: 'must have parking' }, count: 1, areaMatched: true },
    { change: { area_basis: null, hard_constraints: 'area basis: built_up; must have parking' }, count: 1, areaMatched: true },
    { change: { area_basis: null, hard_constraints: 'must have parking' }, count: 0, areaMatched: false },
    { change: { area_basis: 'internal' as const, hard_constraints: 'area basis: built_up; must have parking' }, count: 0, areaMatched: false },
    { change: { area_basis: 'unknown' as const, hard_constraints: 'area basis: built_up' }, count: 0, areaMatched: false },
  ];
  for (const { change, count, areaMatched } of variants) {
    const req = { ...requirement, ...change };
    assert.equal(filterListings([listing], requirementsToFilters(req)).length, count);
    const match = evaluateMatch(listing, req);
    assert.equal(match.matched.some(reason => reason.startsWith('Area meets')), areaMatched);
    if (!areaMatched) assert.ok(match.unknowns.some(reason => /面积口径待确认/.test(reason)));
  }
});

test('a missing unit and differing property basis cannot be filled from listing data', () => {
  const req = { ...requirement, area_basis: 'built_up' as const, hard_constraints: null, area_unit: null };
  assert.equal(filterListings([listing], requirementsToFilters(req)).length, 0);
  assert.ok(evaluateMatch(listing, req).unknowns.some(reason => /area unit is missing/i.test(reason)));
  assert.equal(filterListings([{ ...listing, area_basis: 'internal' }], requirementsToFilters({ ...req, area_unit: 'sqft' })).length, 0);
  assert.equal(req.area_unit, null);
});

test('review edits retain original hard text, numeric constraints and source notes without rewriting old basis', () => {
  const req = { ...requirement, hard_constraints: 'area basis: built_up; 必须离学校五分钟; 预算不超过280万AED' };
  const reviewed = applyRequirementFields(req, { ...requirementsToFilters(req), area_basis: 'internal', amenities: ['parking'] });
  assert.equal(reviewed.raw_request, req.raw_request);
  assert.ok(reviewed.hard_constraints!.startsWith(req.hard_constraints));
  assert.match(reviewed.hard_constraints!, /must have parking/);
  assert.equal(requirementsToFilters(reviewed).area_basis, 'unknown');
  assert.equal(reviewed.area_basis, 'internal');
  assert.equal(req.area_basis, undefined);
});

test('assistant supplies a declared field but does not assume a basis from area units alone', async () => {
  const known = await ruleAssistant.extract('Budget AED 3m; at least 1200 sqft built_up.', { areas: [] });
  assert.equal(known.requirement.area_basis, 'built_up');
  assert.equal(requirementsToFilters(known.requirement).area_basis, 'built_up');
  const missing = await ruleAssistant.extract('Budget AED 3m; at least 1200 sqft.', { areas: [] });
  assert.equal(missing.requirement.area_basis, null);
  assert.equal(requirementsToFilters(missing.requirement).area_basis, 'unknown');
  assert.ok(missing.warnings.some(reason => /面积口径待确认/.test(reason)));
});
