import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import { buildClientGroups, countClientGroups } from '../shared/client-priorities';
import { evaluateMatch } from '../shared/matching';
import type { ClientRequirement, ListingSnapshot } from '../shared/types';

const source = {
  data_kind: 'demo' as const, source_name: 'Synthetic test fixture', source_ref: 'DEMO-CLIENT-PRIORITIES',
  source_date: null, captured_at: '2026-09-03T12:00:00Z', verification_status: 'verified' as const,
  usage_status: 'approved' as const, reviewed_by: 'Synthetic fixture reviewer', notes: 'Fictional test data only.',
};

function listing(change: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    ...source, snapshot_id: 'S1', listing_id: 'L1', property_id: 'P1', title: 'Synthetic apartment',
    area_name: 'Dubai Marina', building_name: 'DEMO TOWER', unit_ref: 'DEMO UNIT 1', property_type: 'apartment',
    bedrooms: 2, area_value: 1280, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready',
    listing_status: 'active', asking_price: 2500000, currency: 'AED', listed_at: null,
    availability_date: '2026-11-01', amenities: ['parking'], evidence_excerpt: 'Fictional fixture only.', ...change,
  };
}

function requirement(client_id: string, change: Partial<ClientRequirement> = {}): ClientRequirement {
  return {
    ...createEmptyRequirement('Synthetic client request'), ...source,
    requirement_id: `${client_id}-R1`, client_id, client_alias: `Demo buyer ${client_id}`,
    budget_min: 2000000, budget_max: 3000000, currency: 'AED', budget_constraint: 'hard',
    preferred_areas: ['Dubai Marina'], property_types: ['apartment'], bedrooms_min: 2,
    market_preference: 'ready', purchase_purpose: 'self_use', purchase_by: '2026-12-01',
    move_in_by: '2026-12-31', hard_constraints: 'must have parking', ...change,
  };
}

const ids = (groups: ReturnType<typeof buildClientGroups>): string[] => groups.map((group) => group.client_id);

test('one client with matching and conflicting requirements appears once with both original assessments', () => {
  const compatible = requirement('C1', { requirement_id: 'R2', client_alias: 'Alias on compatible request' });
  const conflicting = requirement('C1', { requirement_id: 'R1', bedrooms_min: 4, client_alias: 'Alias on conflicting request' });
  const unknown = requirement('C2', { preferred_areas: null });
  const groups = buildClientGroups(listing(), [conflicting, unknown, compatible]);

  assert.deepEqual(countClientGroups(groups), { total: 2, match: 1, review: 1, excluded: 0 });
  const client = groups[0];
  assert.equal(client.client_id, 'C1');
  assert.equal(client.status, 'match');
  assert.equal(client.client_alias, compatible.client_alias);
  assert.equal(client.primary.requirement, compatible);
  assert.equal(client.requirements.length, 2);
  assert.equal(client.requirements[1].requirement, conflicting);
  assert.equal(client.requirements[1].result.status, 'excluded');
  for (const assessment of client.requirements) {
    assert.deepEqual(assessment.result, evaluateMatch(listing(), assessment.requirement));
  }
});

test('individually conflicting requirements cannot form a synthetic matching request', () => {
  const tooExpensive = requirement('C1', { requirement_id: 'R1', budget_max: 2400000 });
  const tooFewBedrooms = requirement('C1', { requirement_id: 'R2', bedrooms_min: 4 });
  const [group] = buildClientGroups(listing(), [tooExpensive, tooFewBedrooms]);

  assert.equal(group.status, 'excluded');
  assert.equal(group.primary.requirement, tooExpensive);
  assert.equal(group.primary.requirement.budget_max, 2400000);
  assert.deepEqual(group.requirements.map((entry) => entry.result.status), ['excluded', 'excluded']);
  assert.equal(group.requirements[1].requirement.bedrooms_min, 4);
  assert.deepEqual(countClientGroups([group]), { total: 1, match: 0, review: 0, excluded: 1 });
});

test('condition grouping orders matches, review and hard conflicts with stable client IDs', () => {
  const requests = [
    requirement('X', { bedrooms_min: 4 }), requirement('Z'),
    requirement('R', { budget_max: null, budget_min: null }), requirement('A'),
  ];
  const expected = ['A', 'Z', 'R', 'X'];
  assert.deepEqual(ids(buildClientGroups(listing(), requests)), expected);
  assert.deepEqual(ids(buildClientGroups(listing(), [...requests].reverse())), expected);
  assert.deepEqual(buildClientGroups(listing(), requests).map((group) => group.status), ['match', 'match', 'review', 'excluded']);
  assert.deepEqual(countClientGroups([]), { total: 0, match: 0, review: 0, excluded: 0 });
});

test('budget comparisons retain stated currency and signed headroom without changing match decisions', () => {
  const requests = [
    requirement('WITHIN'), requirement('EXACT', { budget_max: 2500000 }),
    requirement('ABOVE', { budget_max: 2400000 }),
    requirement('BELOW', { budget_min: 2600000, budget_max: 3000000 }),
  ];
  const byId = new Map(buildClientGroups(listing(), requests).map((group) => [group.client_id, group.primary.budget]));
  assert.equal(byId.get('WITHIN')?.status, 'within');
  assert.equal(byId.get('WITHIN')?.headroom, 500000);
  assert.equal(byId.get('EXACT')?.headroom, 0);
  assert.equal(byId.get('ABOVE')?.status, 'above');
  assert.equal(byId.get('ABOVE')?.headroom, -100000);
  assert.match(byId.get('ABOVE')!.label, /AED 100,000 above/);
  assert.equal(byId.get('BELOW')?.status, 'below');
  assert.equal(byId.get('BELOW')?.headroom, 500000);
  assert.match(byId.get('BELOW')!.label, /AED 100,000 below/);
  assert.match(byId.get('WITHIN')!.range_label, /AED 2,000,000.*3,000,000/);
});

test('budget sort uses coverage, absolute range gap and unknown last within the same condition group', () => {
  const review = { missing_questions: 'Confirm viewing interest.', budget_constraint: 'flexible' as const };
  const requests = [
    requirement('UNKNOWN-FX', { ...review, currency: 'USD' }),
    requirement('ABOVE-FAR', { ...review, budget_max: 2499000 }),
    requirement('WITHIN-Z', { ...review, budget_max: 4000000 }),
    requirement('BELOW', { ...review, budget_min: 2500200, budget_max: 2600000 }),
    requirement('ABOVE-NEAR', { ...review, budget_max: 2499900 }),
    requirement('WITHIN-A', { ...review, budget_max: 2500000 }),
    requirement('UNKNOWN-LOWER', { ...review, budget_max: null }),
    requirement('MATCH'),
  ];
  assert.deepEqual(ids(buildClientGroups(listing(), requests, 'budget')), [
    'MATCH', 'WITHIN-A', 'WITHIN-Z', 'ABOVE-NEAR', 'BELOW', 'ABOVE-FAR', 'UNKNOWN-FX', 'UNKNOWN-LOWER',
  ]);
});

test('missing upper budget, currency or price never implies confirmed coverage', () => {
  const lowerOnly = requirement('LOWER', { budget_max: null });
  const [group] = buildClientGroups(listing(), [lowerOnly]);
  assert.equal(group.primary.budget.status, 'unknown');
  assert.equal(group.primary.budget.headroom, null);
  assert.match(group.primary.budget.label, /maximum is missing/);
  assert.deepEqual(group.primary.result, evaluateMatch(listing(), lowerOnly));

  const [belowMinimum] = buildClientGroups(listing(), [requirement('BELOW', { budget_min: 2600000, budget_max: null })]);
  assert.equal(belowMinimum.primary.budget.status, 'below');
  assert.equal(belowMinimum.primary.budget.headroom, null);
  for (const request of [requirement('FX', { currency: 'USD' }), requirement('OTHER', { currency: 'other' }), requirement('MISSING', { currency: null }), requirement('NONE', { budget_min: null, budget_max: null })]) {
    const [{ primary }] = buildClientGroups(listing(), [request]);
    assert.equal(primary.budget.status, 'unknown');
    assert.equal(primary.budget.headroom, null);
  }
  assert.equal(buildClientGroups(listing({ asking_price: null }), [requirement('C1')])[0].primary.budget.status, 'unknown');
});

test('purchase-date sort uses confirmed dates with stable ties, preserves invalid source values and keeps unknown last', () => {
  const review = { missing_questions: 'Confirm viewing interest.' };
  const requests = [
    requirement('Z-LATE', { ...review, purchase_by: '2027-01-01' }),
    requirement('B-EARLY', { ...review, purchase_by: '2026-10-01' }),
    requirement('A-EARLY', { ...review, purchase_by: '2026-10-01' }),
    requirement('X-INVALID', { ...review, purchase_by: '2026-02-31' }),
    requirement('Y-UNKNOWN', { ...review, purchase_by: null }),
  ];
  const groups = buildClientGroups(listing(), requests, 'purchase_date');
  const expected = ['A-EARLY', 'B-EARLY', 'Z-LATE', 'X-INVALID', 'Y-UNKNOWN'];
  assert.deepEqual(ids(groups), expected);
  assert.deepEqual(ids(buildClientGroups(listing(), [...requests].reverse(), 'purchase_date')), expected);
  assert.equal(groups[3].primary.requirement.purchase_by, '2026-02-31');
  assert.equal(groups[3].primary.result.purchase_by, null);
});

test('availability compatibility compares only the explicit move-in deadline, not purchase timing', () => {
  const [{ primary: compatible }] = buildClientGroups(listing(), [requirement('C1', { purchase_by: '2026-01-01' })]);
  assert.equal(compatible.timing.status, 'compatible');
  assert.match(compatible.timing.label, /2026-11-01.*2026-12-31/);
  const [{ primary: conflict }] = buildClientGroups(listing(), [requirement('C1', { purchase_by: '2027-12-31', move_in_by: '2026-10-01' })]);
  assert.equal(conflict.timing.status, 'conflict');
  assert.equal(conflict.result.status, 'excluded');
  assert.equal(buildClientGroups(listing(), [requirement('C1', { move_in_by: null })])[0].primary.timing.status, 'unknown');
  assert.equal(buildClientGroups(listing({ availability_date: null }), [requirement('C1')])[0].primary.timing.status, 'unknown');
  assert.equal(buildClientGroups(listing(), [requirement('C1', { move_in_by: '2026-02-31' })])[0].primary.timing.status, 'unknown');
});

test('current sort can select a different real primary requirement only within the best condition status', () => {
  const early = requirement('C1', {
    requirement_id: 'R1', client_alias: 'Alias on early request', budget_max: 2499900, budget_constraint: 'flexible',
    purchase_by: '2026-10-01', missing_questions: 'Confirm viewing interest.',
  });
  const covered = requirement('C1', {
    requirement_id: 'R2', client_alias: 'Alias on covered request', purchase_by: '2026-12-01', missing_questions: 'Confirm viewing interest.',
  });
  const excluded = requirement('C1', { requirement_id: 'R0', bedrooms_min: 4, purchase_by: '2026-01-01' });
  const requests = [excluded, covered, early];
  const [budget] = buildClientGroups(listing(), requests, 'budget');
  const [date] = buildClientGroups(listing(), requests, 'purchase_date');
  assert.equal(budget.primary.requirement, covered);
  assert.equal(budget.client_alias, covered.client_alias);
  assert.equal(date.primary.requirement, early);
  assert.equal(date.client_alias, early.client_alias);
  assert.equal(date.status, 'review');
  assert.equal(date.requirements.length, 3);
  assert.equal(date.requirements[2].requirement, excluded);
});

test('changing the selected listing recomputes client groups and counts', () => {
  const requests = [requirement('C1'), requirement('C2', { bedrooms_min: 3, budget_max: 5000000 })];
  const first = buildClientGroups(listing(), requests);
  const second = buildClientGroups(listing({ listing_id: 'L2', bedrooms: 3, asking_price: 4000000 }), requests);
  assert.deepEqual(ids(first), ['C1', 'C2']);
  assert.deepEqual(ids(second), ['C2', 'C1']);
  assert.equal(first[0].primary.result.listing_id, 'L1');
  assert.equal(second[0].primary.result.listing_id, 'L2');
  assert.equal(first[0].status, 'match');
  assert.equal(second[1].status, 'excluded');
  assert.deepEqual(countClientGroups(first), { total: 2, match: 1, review: 0, excluded: 1 });
  const withdrawn = buildClientGroups(listing({ listing_status: 'withdrawn' }), requests);
  assert.deepEqual(countClientGroups(withdrawn), { total: 2, match: 0, review: 0, excluded: 2 });
});

test('grouping and every sort leave input records and their order unchanged', () => {
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  }
  const property = freeze(listing());
  const requests = freeze([requirement('Z'), requirement('A'), requirement('A', { requirement_id: 'A-R2', budget_max: 2400000 })]);
  const before = JSON.stringify({ property, requests });
  for (const sort of ['conditions', 'budget', 'purchase_date'] as const) {
    const groups = buildClientGroups(property, requests, sort);
    assert.equal(groups.length, 2);
    assert.ok(groups.every((group) => group.requirements.every((entry) => requests.includes(entry.requirement))));
  }
  assert.equal(JSON.stringify({ property, requests }), before);
});
