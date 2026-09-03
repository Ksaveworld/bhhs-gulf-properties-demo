import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import {
  buildBudgetCohort, createFictionalViewingExamples, createViewingRecord, listingViewingDimensions,
  loadViewingRecords, saveViewingRecords, sortViewingRecords, summarizeViewingEvidence, viewingStorageKey,
  type ViewingAccess, type ViewingDraft, type ViewingRecord,
} from '../shared/viewing-records';
import type { ClientRequirement, ListingSnapshot } from '../shared/types';

const now = '2026-09-03T08:00:00.000Z';
const source = {
  data_kind: 'demo' as const, source_name: 'Synthetic viewing test', source_ref: 'DEMO-TEST-SOURCE',
  source_date: null, captured_at: now, verification_status: 'needs_review' as const,
  usage_status: 'pending' as const, reviewed_by: null, notes: 'Fictional test data only.',
};
function requirement(clientId = 'DEMO-C-1', overrides: Partial<ClientRequirement> = {}): ClientRequirement {
  return { ...createEmptyRequirement('Synthetic request.'), ...source, client_id: clientId, client_alias: `Sample ${clientId}`, requirement_id: `${clientId}-R1`, budget_min: 100, budget_max: 200, currency: 'AED', ...overrides };
}
function listing(listingId = 'DEMO-L-1', overrides: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    ...source, listing_id: listingId, snapshot_id: `${listingId}-S1`, property_id: null, title: 'Synthetic property', area_name: 'Demo Harbour', building_name: null, unit_ref: null,
    property_type: 'apartment', bedrooms: 1, area_value: 1000, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready', listing_status: 'active', asking_price: 150, currency: 'AED',
    listed_at: null, availability_date: null, amenities: null, evidence_excerpt: null, ...overrides,
  };
}
function access(overrides: Partial<ViewingAccess> = {}): ViewingAccess {
  return { scope: 'batch-one-v1:sales-a', salesId: 'SALES-A', requirements: [requirement(), requirement('DEMO-C-2'), requirement('DEMO-C-3')], listings: [listing(), listing('DEMO-L-2', { area_name: 'Demo Garden' })], ...overrides };
}
function record(ctx = access(), overrides: Partial<ViewingDraft> = {}): ViewingRecord {
  return createViewingRecord(ctx, { client_id: 'DEMO-C-1', listing_id: 'DEMO-L-1', viewed_at: now, feedback: 'Sales observation only.', feedback_signal: 'not_recorded', preference_tags: [], ...overrides }, 'sales_entered', now);
}
class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  data = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes++; this.data.set(key, value); }
}

test('viewing records are isolated by both Sales ID and data-version scope', () => {
  const store = new MemoryStorage();
  const first = access();
  const otherSales = access({ salesId: 'SALES-B' });
  const otherVersion = access({ scope: 'batch-one-v2:sales-a' });
  const keys = [first, otherSales, otherVersion].map(viewingStorageKey);
  assert.equal(new Set(keys).size, 3);
  const saved = saveViewingRecords(store, first, [record(first)], '');
  assert.deepEqual(loadViewingRecords(store, first), saved);
  assert.equal(loadViewingRecords(store, otherSales).records.length, 0);
  assert.equal(loadViewingRecords(store, otherVersion).records.length, 0);
  store.data.set(keys[1], store.data.get(keys[0])!);
  assert.throws(() => loadViewingRecords(store, otherSales), /could not be validated/);
  assert.equal(store.writes, 1);
});

test('sign-out, missing scope, foreign owners and invisible client/property cannot write', () => {
  const store = new MemoryStorage();
  const ctx = access();
  for (const denied of [access({ salesId: null }), access({ scope: null }), access({ salesId: ' ' }), access({ scope: '\u0000' })]) {
    assert.throws(() => record(denied), /Select a Sales ID/);
    assert.throws(() => saveViewingRecords(store, denied, [record(ctx)], ''), /Select a Sales ID/);
  }
  assert.throws(() => record(ctx, { client_id: 'INVISIBLE-CLIENT' }), /visible client and property/);
  assert.throws(() => record(ctx, { listing_id: 'INVISIBLE-PROPERTY' }), /visible client and property/);
  assert.throws(() => saveViewingRecords(store, ctx, [{ ...record(ctx), sales_id: 'SALES-B' }], ''), /selected Sales ID/);
  assert.equal(store.writes, 0);
});

test('successful append is read back, survives reload and keeps source objects unchanged', () => {
  const ctx = access();
  const before = JSON.stringify(ctx);
  const first = record(ctx, { feedback: '  Explicit recorded words.  ' });
  const store = new MemoryStorage();
  const saved = saveViewingRecords(store, ctx, [first], '');
  assert.equal(first.feedback, 'Explicit recorded words.');
  assert.equal(first.data_kind, 'demo');
  assert.equal(first.source_kind, 'sales_entered');
  assert.equal(saved.records.length, 1);
  assert.ok(saved.revision);
  assert.deepEqual(loadViewingRecords(store, ctx), saved);
  assert.equal(JSON.stringify(ctx), before);
});

test('real pairs stay sales-entered and unverified; fictional generation never uses a real client', () => {
  const ctx = access({ requirements: [requirement('REAL-C', { data_kind: 'real_authorized' }), requirement('DEMO-C-1')], listings: [listing('REAL-L', { data_kind: 'real_public' }), listing()] });
  const real = record(ctx, { client_id: 'REAL-C', listing_id: 'REAL-L' });
  assert.equal(real.data_kind, 'sales_recorded');
  assert.equal(real.source_kind, 'sales_entered');
  const examples = createFictionalViewingExamples(ctx, now);
  assert.equal(examples.length, 1);
  assert.ok(examples.every(value => value.client_id === 'DEMO-C-1' && value.listing_id === 'DEMO-L-1' && value.data_kind === 'demo' && value.source_kind === 'fictional_example'));
  assert.throws(() => createViewingRecord(ctx, { ...real }, 'fictional_example', now), /only allowed for visible demonstration/);
  assert.throws(() => createFictionalViewingExamples(access({ requirements: [requirement('REAL-C', { data_kind: 'real_authorized' })] }), now), /No visible demonstration/);
});

test('fictional examples require an explicit call, remain bounded, and retain fictional sources', () => {
  const ctx = access({ requirements: [requirement(), requirement('DEMO-C-2'), requirement('DEMO-C-3'), requirement('DEMO-C-4')] });
  const store = new MemoryStorage();
  assert.equal(loadViewingRecords(store, ctx).records.length, 0);
  const examples = createFictionalViewingExamples(ctx, now);
  assert.equal(examples.length, 6);
  assert.equal(new Set(examples.map(value => value.record_id)).size, 6);
  assert.ok(examples.every(value => value.source_ref.startsWith('FICTIONAL:') && value.feedback.startsWith('Fictional example:')));
  assert.equal(store.writes, 0);
  saveViewingRecords(store, ctx, examples, '');
  assert.equal(loadViewingRecords(store, ctx).records.length, 6);
});

test('invalid dates and invalid dimension tags are rejected before storage changes', () => {
  const ctx = access();
  for (const viewed_at of ['not-a-date', '2026-02-30T08:00:00.000Z', '2026-09-03']) assert.throws(() => record(ctx, { viewed_at }), /invalid dates/);
  assert.throws(() => record(ctx, { preference_tags: [{ dimension: 'area', value: 'Invented area' }] }), /explicitly name a supplied dimension/);
  assert.throws(() => record(ctx, { preference_tags: [{ dimension: 'area', value: 'Demo Harbour' }, { dimension: 'area', value: 'Demo Harbour' }] }), /preference tags/);
});

test('viewing ordering uses the actual viewing date, preserves input order, and breaks ties deterministically', () => {
  const ctx = access();
  const old = { ...record(ctx, { viewed_at: '2026-08-01T08:00:00.000Z' }), record_id: 'A', created_at: '2026-09-03T09:00:00.000Z' };
  const recentB = { ...record(ctx), record_id: 'B' };
  const recentA = { ...record(ctx), record_id: 'A2' };
  const rows = [old, recentB, recentA];
  assert.deepEqual(sortViewingRecords(rows).map(row => row.record_id), ['A2', 'B', 'A']);
  assert.deepEqual(rows.map(row => row.record_id), ['A', 'B', 'A2']);
});

test('stale revisions and duplicate IDs do not overwrite saved records', () => {
  const ctx = access();
  const store = new MemoryStorage();
  const first = record(ctx);
  const saved = saveViewingRecords(store, ctx, [first], '');
  const before = store.data.get(saved.key);
  assert.throws(() => saveViewingRecords(store, ctx, [record(ctx)], ''), /another tab/);
  assert.throws(() => saveViewingRecords(store, ctx, [first], saved.revision), /already exists/);
  assert.equal(store.data.get(saved.key), before);
  assert.equal(store.writes, 1);
});

test('read failures, write failures, invalid storage and failed readback never report success', () => {
  const ctx = access();
  const stored = new MemoryStorage();
  const blockedRead = { getItem() { throw new Error('Blocked'); }, setItem() { assert.fail('Must not write after a failed read'); } };
  assert.throws(() => loadViewingRecords(blockedRead, ctx), /could not be read/);
  assert.throws(() => saveViewingRecords(blockedRead, ctx, [record(ctx)], ''), /could not be read/);
  const blockedWrite = { getItem() { return null; }, setItem() { throw new Error('Quota'); } };
  assert.throws(() => saveViewingRecords(blockedWrite, ctx, [record(ctx)], ''), /could not be confirmed/);
  const lostWrite = { getItem() { return null; }, setItem() { /* Browser did not preserve this write. */ } };
  assert.throws(() => saveViewingRecords(lostWrite, ctx, [record(ctx)], ''), /could not be confirmed/);
  stored.data.set(viewingStorageKey(ctx), '{broken');
  assert.throws(() => loadViewingRecords(stored, ctx), /could not be validated/);
  assert.equal(stored.data.get(viewingStorageKey(ctx)), '{broken');
  assert.equal(stored.writes, 0);
});

test('temporarily hidden clients are not reported and their stored records are not erased by another append', () => {
  const ctx = access();
  const store = new MemoryStorage();
  const first = saveViewingRecords(store, ctx, [record(ctx), record(ctx, { client_id: 'DEMO-C-2' })], '');
  const reduced = { ...ctx, requirements: [requirement('DEMO-C-2')] };
  const limited = loadViewingRecords(store, reduced);
  assert.equal(limited.records.length, 1);
  assert.equal(limited.records[0].client_id, 'DEMO-C-2');
  saveViewingRecords(store, reduced, [record(reduced, { client_id: 'DEMO-C-2' })], first.revision);
  assert.equal(loadViewingRecords(store, ctx).records.length, 3);
});

test('observed visits, explicit preference tags and positive visit feedback are counted separately', () => {
  const ctx = access();
  const positive = record(ctx, { feedback: 'Liked the visit; no particular dimension named.', feedback_signal: 'positive' });
  const mixed = record(ctx, { feedback: 'Liked the area, mixed overall.', feedback_signal: 'mixed', preference_tags: [{ dimension: 'area', value: 'Demo Harbour' }] });
  const negative = record(ctx, { feedback_signal: 'negative', feedback: 'Not interested.' });
  const summary = summarizeViewingEvidence([positive, positive, mixed, negative], ctx);
  assert.equal(summary.viewing_count, 3);
  assert.equal(summary.client_count, 1);
  assert.equal(summary.demo_count, 3);
  assert.equal(summary.positive_count, 1);
  const area = summary.observations.find(row => row.dimension === 'area')!;
  assert.equal(area.observed_count, 3);
  assert.equal(area.stated_tag_count, 1);
  assert.equal(area.positive_visit_count, 1);
  assert.equal(area.record_ids.length, 3);
  assert.ok(summary.observations.filter(row => row.dimension !== 'area').every(row => row.stated_tag_count === 0));
});

test('aggregation excludes other sales, invisible clients/properties and malformed records', () => {
  const ctx = access();
  const valid = record(ctx);
  const rows = [valid, { ...record(ctx), sales_id: 'OTHER' }, { ...record(ctx), client_id: 'INVISIBLE' }, { ...record(ctx), listing_id: 'INVISIBLE' }, { ...record(ctx), viewed_at: 'invalid' }];
  assert.equal(summarizeViewingEvidence(rows, ctx).viewing_count, 1);
  assert.equal(summarizeViewingEvidence(rows, { ...ctx, salesId: null }).viewing_count, 0);
});

test('size observations retain measurement units and bases and omit unknown measurements', () => {
  const ctx = access({ listings: [listing(), listing('DEMO-L-2', { area_basis: 'internal' }), listing('DEMO-L-3', { area_unit: 'sqm' }), listing('DEMO-L-4', { area_basis: 'unknown' })] });
  const rows = ctx.listings.map(value => record(ctx, { listing_id: value.listing_id }));
  const sizes = summarizeViewingEvidence(rows, ctx).observations.filter(value => value.dimension === 'size');
  assert.equal(sizes.length, 3);
  assert.ok(sizes.some(value => value.value === '1,000 sqft · built_up'));
  assert.ok(sizes.some(value => value.value === '1,000 sqft · internal'));
  assert.ok(sizes.some(value => value.value === '1,000 sqm · built_up'));
  assert.equal(listingViewingDimensions(ctx.listings[3]).size, null);
});

test('same-budget cohorts use same-currency inclusive overlap and count each other client once', () => {
  const ctx = access({ requirements: [
    requirement(), requirement('DEMO-C-1', { requirement_id: 'ANCHOR-SECOND' }),
    requirement('DEMO-C-2', { budget_min: 200, budget_max: 300 }),
    requirement('DEMO-C-2', { requirement_id: 'OTHER-SECOND', budget_min: 150, budget_max: 170 }),
    requirement('DEMO-C-3', { budget_min: 50, budget_max: 100 }),
    requirement('DEMO-C-4', { currency: 'USD' }),
    requirement('DEMO-C-5', { budget_min: 201, budget_max: 300 }),
  ] });
  const rows = [record(ctx, { client_id: 'DEMO-C-2' }), record(ctx, { client_id: 'DEMO-C-3' }), record(ctx, { client_id: 'DEMO-C-4' })];
  const cohort = buildBudgetCohort(ctx.requirements[0], rows, ctx);
  assert.equal(cohort.available, true);
  assert.deepEqual(cohort.members.map(member => member.client_id), ['DEMO-C-2', 'DEMO-C-3']);
  assert.equal(cohort.members[0].requirement_ids.length, 2);
  assert.equal(cohort.members[0].viewing_count, 1);
  assert.equal(cohort.summary.client_count, 2);
  assert.equal(cohort.summary.viewing_count, 2);
});

test('cohorts do not invent incomplete budgets, merge disjoint requirements or infer a group from one client', () => {
  const ctx = access();
  for (const changes of [{ budget_min: null }, { budget_max: null }, { currency: null }, { currency: 'other' as const }, { budget_min: 300 }, { budget_max: NaN }]) {
    const candidate = requirement('DEMO-C-1', changes);
    const incomplete = { ...ctx, requirements: [candidate, ...ctx.requirements.slice(1)] };
    const result = buildBudgetCohort(candidate, [], incomplete);
    assert.equal(result.available, false);
    assert.match(result.reason!, /both finite budget bounds/);
  }
  const anchor = requirement('DEMO-C-1', { budget_min: 250, budget_max: 350 });
  const separate = { ...ctx, requirements: [anchor, requirement('DEMO-C-2', { budget_min: 100, budget_max: 200 }), requirement('DEMO-C-2', { requirement_id: 'SEPARATE-R2', budget_min: 400, budget_max: 500 })] };
  assert.equal(buildBudgetCohort(anchor, [], separate).members.length, 0);
  const oneClient = buildBudgetCohort(ctx.requirements[0], [record(ctx, { client_id: 'DEMO-C-2' }), record(ctx, { client_id: 'DEMO-C-2' })], ctx);
  assert.equal(oneClient.available, false);
  assert.match(oneClient.reason!, /at least two other clients/);
  assert.equal(oneClient.summary.viewing_count, 2);
  assert.equal(buildBudgetCohort(ctx.requirements[0], [], { ...ctx, salesId: null }).available, false);
});
