import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import { EMPTY_FILTERS, convertArea, evaluateMatch, filterListings, getAreaRangeError, requirementsToFilters, type Filters } from '../shared/matching';
import type { ListingSnapshot } from '../shared/types';

function listing(id: string, change: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    snapshot_id: `SNAP-${id}`, listing_id: id, property_id: `PROPERTY-${id}`, title: 'Synthetic filter fixture',
    area_name: 'Demo Garden', building_name: null, unit_ref: null, property_type: 'apartment',
    bedrooms: 2, area_value: 1200, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready',
    listing_status: 'active', asking_price: 850000, currency: 'AED', listed_at: null, availability_date: null,
    amenities: null, evidence_excerpt: null, data_kind: 'demo', source_name: 'Synthetic test fixture',
    source_ref: 'DEMO-LIBRARY-FILTERS', source_date: null, captured_at: '2026-05-10T12:00:00Z',
    verification_status: 'needs_review', usage_status: 'pending', reviewed_by: null, notes: 'Fictional test data only.', ...change,
  };
}
const filters = (change: Partial<Filters> = {}): Filters => ({ ...EMPTY_FILTERS, ...change });
const ids = (rows: ListingSnapshot[], search: Filters) => filterListings(rows, search).map(row => row.listing_id);

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('manual size range includes both exact boundaries and excludes values outside either limit', () => {
  const rows = [listing('BELOW', { area_value: 999.99 }), listing('MIN', { area_value: 1000 }),
    listing('MIDDLE', { area_value: 1250 }), listing('MAX', { area_value: 1500 }), listing('ABOVE', { area_value: 1500.01 })];
  assert.deepEqual(ids(rows, filters({ area_min: 1000, area_max: 1500 })), ['MAX', 'MIDDLE', 'MIN']);
  assert.deepEqual(ids(rows, filters({ area_max: 1000 })), ['BELOW', 'MIN']);
  assert.deepEqual(ids(rows, filters({ area_min: 1500 })), ['ABOVE', 'MAX']);
  assert.deepEqual(ids(rows, filters({ area_min: 1000, area_max: 1000 })), ['MIN']);
  const legacy = filters({ area_min: 1500 });
  delete legacy.area_max;
  assert.deepEqual(ids(rows, legacy), ['ABOVE', 'MAX']);
});

test('sqm and sqft compare on the same confirmed area basis with inclusive converted boundaries', () => {
  const converted = convertArea(100, 'sqm', 'sqft');
  assert.ok(Math.abs(converted - 1076.3910416709723) < 1e-9);
  const rows = [listing('SQM', { area_value: 100, area_unit: 'sqm' }), listing('SQFT', { area_value: converted })];
  assert.deepEqual(ids(rows, filters({ area_min: converted, area_max: converted })), ['SQFT', 'SQM']);
  assert.deepEqual(ids(rows, filters({ area_min: 100, area_max: 100, area_unit: 'sqm' })), ['SQFT', 'SQM']);
  assert.deepEqual(ids(rows, filters({ area_max: converted - 0.001 })), []);
  assert.deepEqual(ids(rows, filters({ area_min: converted + 0.001 })), []);
});

test('an upper limit alone does not admit unknown area values, units or mismatched bases', () => {
  const rows = [listing('KNOWN'), listing('UNKNOWN-VALUE', { area_value: null }),
    listing('UNKNOWN-UNIT', { area_unit: null }), listing('UNKNOWN-BASIS', { area_basis: 'unknown' }),
    listing('EMPTY-BASIS', { area_basis: null }), listing('OTHER-BASIS', { area_basis: 'internal' })];
  assert.deepEqual(ids(rows, filters({ area_max: 1300 })), ['KNOWN']);
  for (const change of [{ area_basis: '' }, { area_basis: 'unknown' }, { area_unit: null }]) {
    assert.deepEqual(ids(rows, filters({ area_max: 1300, ...change })), []);
    assert.deepEqual(ids(rows, filters({ area_min: 1000, area_max: 1300, ...change })), []);
  }
  assert.equal(ids(rows, filters({ area_basis: 'unknown', area_unit: null })).length, rows.length);
});

test('invalid ranges return an actionable error and zero candidates without silently swapping bounds', () => {
  const rows = [listing('L')];
  const inverted = freeze(filters({ area_min: 1400, area_max: 1000 }));
  assert.equal(getAreaRangeError(inverted), 'Min. size cannot be greater than Max. size.');
  assert.deepEqual(ids(rows, inverted), []);
  assert.equal(inverted.area_min, 1400);
  assert.equal(inverted.area_max, 1000);
  for (const change of [{ area_min: -1 }, { area_max: -1 }, { area_max: Infinity }, { area_min: Number.NaN }]) {
    const search = filters(change);
    assert.match(getAreaRangeError(search)!, /zero or greater/);
    assert.deepEqual(ids(rows, search), []);
  }
  assert.equal(getAreaRangeError(filters({ area_min: 0, area_max: 0 })), null);
  assert.equal(getAreaRangeError(filters()), null);
});

test('range search only uses the latest snapshot and never falls back to an older qualifying size', () => {
  const old = listing('L', { snapshot_id: 'OLD', area_value: 1100, captured_at: '2026-05-01T12:00:00Z' });
  const latest = listing('L', { snapshot_id: 'NEW', area_value: 1600 });
  assert.deepEqual(ids([old, latest], filters({ area_min: 1000, area_max: 1500 })), []);
  assert.deepEqual(ids([latest, old], filters({ area_min: 1000, area_max: 1500 })), []);
});

test('updated ascending uses actual timestamps, stable listing-ID ties and unknown timestamps last', () => {
  const rows = [listing('LATE', { captured_at: '2026-06-01T12:00:00Z' }),
    listing('TIE-B', { captured_at: '2026-05-10T16:00:00+04:00' }),
    listing('TIE-A', { captured_at: '2026-05-10T12:00:00Z' }),
    listing('EARLY', { captured_at: '2026-01-01T00:00:00Z' }),
    listing('UNKNOWN-B', { captured_at: 'unconfirmed' }), listing('UNKNOWN-A', { captured_at: '' })];
  assert.deepEqual(ids(rows, filters({ sort: 'updated_asc' })), ['EARLY', 'TIE-A', 'TIE-B', 'LATE', 'UNKNOWN-A', 'UNKNOWN-B']);
  assert.deepEqual(ids(rows, filters({ sort: 'updated_desc' })), ['LATE', 'TIE-A', 'TIE-B', 'EARLY', 'UNKNOWN-A', 'UNKNOWN-B']);
});

test('every sort is stable for equal values and leaves snapshots, filters and source order unchanged', () => {
  const rows = freeze([listing('C'), listing('A'), listing('B')]);
  const before = JSON.stringify(rows);
  for (const sort of ['updated_asc', 'updated_desc', 'price_asc', 'price_desc'] as const) {
    const search = freeze(filters({ area_max: 1500, sort }));
    assert.deepEqual(ids(rows, search), ['A', 'B', 'C']);
    assert.deepEqual(ids([...rows].reverse(), search), ['A', 'B', 'C']);
  }
  assert.equal(JSON.stringify(rows), before);
});

test('manual upper size limits never enter the client requirement or change its match assessment', () => {
  const request = freeze({ ...createEmptyRequirement('Synthetic minimum-size request.'), area_min: 1000, area_unit: 'sqft' as const, area_basis: 'built_up' as const });
  const row = freeze(listing('L'));
  const before = evaluateMatch(row, request);
  const reviewed = requirementsToFilters(request);
  assert.equal(reviewed.area_max, null);
  assert.deepEqual(ids([row], reviewed), ['L']);
  assert.deepEqual(ids([row], { ...reviewed, area_max: 1100 }), []);
  assert.deepEqual(evaluateMatch(row, request), before);
  assert.equal(Object.hasOwn(request, 'area_max'), false);
});

// The retired FilterEditor component cases are covered by the V2 browser range and editor flows.
