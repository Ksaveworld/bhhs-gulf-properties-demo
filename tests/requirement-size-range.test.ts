import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMatch, filterListings, requirementsToFilters } from '../shared/matching';
import { applyRequirementFields } from '../shared/requirement-edit';
import type { Dataset } from '../shared/types';
const data = JSON.parse(readFileSync(new URL('../data/demo/dataset.json', import.meta.url), 'utf8')) as Dataset;
const listing = { ...data.listing_snapshots[0], area_value: 1100, area_unit: 'sqft' as const, area_basis: 'built_up' as const };
const base = { ...data.client_requirements[0], preferred_areas:[listing.area_name], area_min:null, area_unit:'sqft' as const,area_basis:'built_up' as const, hard_constraints:null, raw_request:'Sales entered size range', budget_max:100000000, bedrooms_min:0, market_preference:'either' as const, property_types:[], move_in_by:null };
test('size ceiling is preserved from review and applied in both matching directions',()=>{
  const req = {...base, area_max:1000};
  assert.equal(filterListings([listing],requirementsToFilters(req)).length,0);
  assert.equal(evaluateMatch(listing,req).status,'excluded');
  assert.ok(evaluateMatch(listing,req).conflicts.some(reason=>reason.includes('exceeds 1000')));
  const filters = {...requirementsToFilters(req),area_max:1200};
  const edited = applyRequirementFields(req,filters);
  assert.equal(edited.area_max,1200);
  assert.equal(filterListings([listing],filters).length,1);
  assert.ok(evaluateMatch(listing,edited).matched.some(reason=>reason.includes('1200')));
});
test('old omitted ceiling is unbounded, and missing or conflicting basis stays unknown',()=>{
  assert.equal(filterListings([listing],requirementsToFilters(base)).length,1);
  for(const change of [{area_basis:'unknown' as const},{area_basis:'internal' as const,hard_constraints:'area basis: built_up'}]){
    const req = {...base,area_max:1200,...change};
    assert.equal(filterListings([listing],requirementsToFilters(req)).length,0);
    assert.ok(evaluateMatch(listing,req).unknowns.some(reason=>reason.includes('basis')));
  }
});
test('same-basis conversion and reversed range do not broaden candidates',()=>{
  const req={...base,area_min:100,area_max:103,area_unit:'sqm' as const};
  assert.equal(filterListings([listing],requirementsToFilters(req)).length,1);
  assert.notEqual(evaluateMatch(listing,req).status,'excluded');
  const invalid={...req,area_max:99};
  assert.equal(filterListings([listing],requirementsToFilters(invalid)).length,0);
  assert.equal(evaluateMatch(listing,invalid).status,'excluded');
});
