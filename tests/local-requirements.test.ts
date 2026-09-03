import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import { evaluateMatch, filterListings, requirementsToFilters } from '../shared/matching';
import { loadLocalRequirements, requirementStorageKey, saveLocalRequirements, type LocalRequirementCopy } from '../shared/local-requirements';
import type { ClientRequirement, Dataset, ListingSnapshot } from '../shared/types';

const source = {
  data_kind: 'demo' as const, source_name: 'Synthetic local-storage test', source_ref: 'DEMO-LOCAL-STORAGE',
  source_date: null, captured_at: '2026-06-14T12:00:00Z', verification_status: 'needs_review' as const,
  usage_status: 'pending' as const, reviewed_by: null, notes: 'Fictional test data only.',
};

function requirement(changes: Partial<ClientRequirement> = {}): ClientRequirement {
  return {
    ...createEmptyRequirement('Synthetic request; uncertain details remain to be confirmed.'), ...source,
    requirement_id: 'IMPORTED-R-A', client_id: 'DEMO-C-A', client_alias: 'Synthetic buyer A',
    budget_max: 900000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Demo Harbour'],
    property_types: ['apartment'], bedrooms_min: 2, market_preference: 'ready', ...changes,
  };
}

function listing(changes: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    ...source, snapshot_id: 'DEMO-S-A', listing_id: 'DEMO-L-A', property_id: 'DEMO-P-A',
    title: 'Synthetic harbour apartment', area_name: 'Demo Harbour', building_name: null, unit_ref: null,
    property_type: 'apartment', bedrooms: 2, area_value: 100, area_unit: 'sqm', area_basis: 'internal',
    market_segment: 'ready', listing_status: 'active', asking_price: 850000, currency: 'AED',
    listed_at: null, availability_date: null, amenities: null, evidence_excerpt: null, ...changes,
  };
}

function dataset(namespace = 'opaque-source-A'): Dataset {
  return {
    listing_snapshots: [listing()], transactions: [], listing_transaction_links: [],
    client_requirements: [requirement()], match_reference: [],
    meta: { mode: 'demo', label: 'Synthetic dataset', loaded_at: '2026-06-14T12:00:00Z', warnings: [], quarantined_count: 0, storage_namespace: namespace },
  };
}

function copy(id = 'SESSION-R-A', changes: Partial<ClientRequirement> = {}, links: Partial<Omit<LocalRequirementCopy, 'requirement'>> = {}): LocalRequirementCopy {
  return {
    requirement: requirement({ requirement_id: id, ...changes }), original_requirement_id: 'IMPORTED-R-A',
    parent_requirement_id: 'IMPORTED-R-A', saved_at: '2026-06-15T12:00:00Z', ...links,
  };
}

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  data = new Map<string, string>();
  reads = 0;
  writes = 0;
  removals = 0;
  getItem(key: string): string | null { this.reads++; return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes++; this.data.set(key, value); }
  removeItem(key: string): void { this.removals++; this.data.delete(key); }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  return value;
}

test('storage scope is stable across reload metadata and object-key ordering without mutating the original dataset', async () => {
  const original = freeze(dataset());
  const before = JSON.stringify(original);
  const refreshed = reverseKeys(original) as Dataset;
  refreshed.meta.loaded_at = '2027-01-03T00:00:00Z';
  refreshed.meta.warnings = ['Synthetic temporary warning'];
  refreshed.meta.label = 'Updated display label';
  refreshed.meta.quarantined_count = 3;
  const key = await requirementStorageKey(original);
  assert.match(key, /^bhhs:local-requirements:v1:[a-f0-9]{64}$/);
  assert.equal(await requirementStorageKey(refreshed), key);
  assert.equal(JSON.stringify(original), before);
});

test('different sources and different content versions isolate identical imported requirement IDs', async () => {
  const first = dataset();
  const otherSource = dataset('opaque-source-B');
  const newer = dataset();
  newer.client_requirements[0].budget_max = 600000;
  const firstKey = await requirementStorageKey(first);
  const otherKey = await requirementStorageKey(otherSource);
  const newerKey = await requirementStorageKey(newer);
  assert.equal(new Set([firstKey, otherKey, newerKey]).size, 3);
  const storage = new MemoryStorage();
  const saved = saveLocalRequirements(storage, firstKey, [copy()], first.client_requirements, '');
  assert.equal(loadLocalRequirements(storage, otherKey, otherSource.client_requirements).copies.length, 0);
  assert.equal(loadLocalRequirements(storage, newerKey, newer.client_requirements).copies.length, 0);
  assert.deepEqual(loadLocalRequirements(storage, firstKey, first.client_requirements), saved);
  storage.data.set(otherKey, storage.data.get(firstKey)!);
  assert.throws(() => loadLocalRequirements(storage, otherKey, otherSource.client_requirements), /invalid data or links/);
  assert.equal(storage.writes, 1);
});

test('each of the five original tables and dataset mode participates in the scope', async () => {
  const key = await requirementStorageKey(dataset());
  for (const table of ['listing_snapshots', 'transactions', 'listing_transaction_links', 'client_requirements', 'match_reference'] as const) {
    const changed = dataset();
    // Scope generation hashes supplied table content; it does not validate or synthesize product records.
    (changed[table] as unknown[]).push({ synthetic_test_marker: table });
    assert.notEqual(await requirementStorageKey(changed), key, table);
  }
  const product = dataset();
  product.meta.mode = 'product';
  assert.notEqual(await requirementStorageKey(product), key);
  const ordered = dataset();
  ordered.client_requirements.push(requirement({ requirement_id: 'IMPORTED-R-B' }));
  const orderedKey = await requirementStorageKey(ordered);
  ordered.client_requirements.reverse();
  assert.notEqual(await requirementStorageKey(ordered), orderedKey);
});

test('missing namespaces and unhashable data do not fall back to shared browser storage', async () => {
  for (const namespace of ['', '   ', '\u0000invalid']) {
    await assert.rejects(requirementStorageKey(dataset(namespace)), /no valid storage namespace/);
  }
  const absent = dataset();
  delete absent.meta.storage_namespace;
  await assert.rejects(requirementStorageKey(absent), /no valid storage namespace/);
  const nonFinite = dataset();
  nonFinite.client_requirements[0].budget_max = Number.NaN;
  await assert.rejects(requirementStorageKey(nonFinite), /secure local storage scope/);
  const sparse = dataset();
  sparse.transactions = new Array(1);
  await assert.rejects(requirementStorageKey(sparse), /secure local storage scope/);
});

test('empty scope and absent storage return an empty snapshot without writing', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadLocalRequirements(storage, '', []), { version: 1, key: '', revision: '', copies: [] });
  assert.equal(storage.reads, 0);
  assert.deepEqual(loadLocalRequirements(storage, 'test-key', []), { version: 1, key: 'test-key', revision: '', copies: [] });
  assert.equal(storage.writes, 0);
  assert.equal(storage.removals, 0);
  assert.throws(() => saveLocalRequirements(storage, '', [], [], ''), /valid dataset storage scope/);
});

test('multiple local requirements stay independent and retain all original fields and match decisions after serialization', () => {
  const originals = freeze([requirement()]);
  const copies = freeze([
    copy('SESSION-R-FIRST', { budget_max: 900000, hard_constraints: 'A quiet outlook still needs clarification.', area_basis: 'unknown', purchase_by: null }),
    copy('SESSION-R-SECOND', { budget_max: 600000, preferred_areas: ['Demo Garden'], raw_request: 'Unedited second synthetic request.' }),
    copy('LOCAL-NEW', { client_id: 'DEMO-NEW-C', client_alias: 'Synthetic new buyer', currency: null, budget_max: null }, { original_requirement_id: null, parent_requirement_id: null }),
  ]);
  const listings = [listing(), listing({ listing_id: 'DEMO-L-B', snapshot_id: 'DEMO-S-B', area_name: 'Demo Garden', asking_price: 550000 })];
  const evaluate = (req: ClientRequirement) => ({
    candidates: filterListings(listings, requirementsToFilters(req)).map(row => row.listing_id),
    assessments: listings.map(row => evaluateMatch(row, req)),
  });
  const before = copies.map(item => evaluate(item.requirement));
  assert.notDeepEqual(before[0].candidates, before[1].candidates);
  const originalBytes = JSON.stringify({ copies, originals });
  const storage = new MemoryStorage();
  const saved = saveLocalRequirements(storage, 'test-key', copies, originals, '');
  const loaded = loadLocalRequirements(storage, 'test-key', originals);
  assert.deepEqual(loaded, saved);
  assert.deepEqual(loaded.copies, copies);
  assert.deepEqual(loaded.copies.map(item => evaluate(item.requirement)), before);
  assert.equal(JSON.stringify({ copies, originals }), originalBytes);
  assert.match(saved.revision, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(saved.copies, copies);
  saved.copies[0].requirement.raw_request = 'Only this returned snapshot changed.';
  assert.equal(loadLocalRequirements(storage, 'test-key', originals).copies[0].requirement.raw_request, copies[0].requirement.raw_request);
});

test('deleted parents retain child lineage and original requirements are never removed', () => {
  const originals = [requirement()];
  const parent = copy('SESSION-R-PARENT');
  const child = copy('SESSION-R-CHILD', { budget_max: 800000 }, { parent_requirement_id: parent.requirement.requirement_id });
  const storage = new MemoryStorage();
  const first = saveLocalRequirements(storage, 'test-key', [parent, child], originals, '');
  const second = saveLocalRequirements(storage, 'test-key', [child], originals, first.revision);
  assert.notEqual(first.revision, second.revision);
  assert.deepEqual(loadLocalRequirements(storage, 'test-key', originals).copies, [child]);
  assert.equal(child.parent_requirement_id, 'SESSION-R-PARENT');
  assert.equal(originals[0].requirement_id, 'IMPORTED-R-A');
  assert.equal(storage.removals, 0);
});

test('invalid record shapes and lineage are refused without overwriting an existing snapshot', () => {
  const originals = [requirement(), requirement({ requirement_id: 'IMPORTED-R-B', client_id: 'DEMO-C-B' }), requirement({ requirement_id: 'IMPORTED-R-A2' })];
  const invalidSets: [string, LocalRequirementCopy[]][] = [
    ['imported ID collision', [copy('IMPORTED-R-A')]],
    ['duplicate copy ID', [copy(), copy()]],
    ['unknown original root', [copy('LOCAL', {}, { original_requirement_id: 'MISSING-ROOT' })]],
    ['root from another client', [copy('LOCAL', {}, { original_requirement_id: 'IMPORTED-R-B', parent_requirement_id: null })]],
    ['parent from another client', [copy('LOCAL', {}, { parent_requirement_id: 'IMPORTED-R-B' })]],
    ['original parent differs from root', [copy('LOCAL', {}, { parent_requirement_id: 'IMPORTED-R-A2' })]],
    ['local parent differs from root', [copy('PARENT', {}, { original_requirement_id: 'IMPORTED-R-A2', parent_requirement_id: 'IMPORTED-R-A2' }), copy('CHILD', {}, { parent_requirement_id: 'PARENT' })]],
    ['local parent from another client', [copy('PARENT', { client_id: 'DEMO-C-B' }, { original_requirement_id: null, parent_requirement_id: null }), copy('CHILD', {}, { original_requirement_id: null, parent_requirement_id: 'PARENT' })]],
    ['self parent', [copy('LOCAL', {}, { parent_requirement_id: 'LOCAL' })]],
    ['local cycle', [copy('FIRST', {}, { parent_requirement_id: 'SECOND' }), copy('SECOND', {}, { parent_requirement_id: 'FIRST' })]],
    ['invalid metadata', [copy('LOCAL', {}, { saved_at: 'not-a-date' })]],
    ['nonfinite budget', [copy('LOCAL', { budget_max: Number.NaN })]],
    ['invalid enum', [copy('LOCAL', { currency: 'not-a-currency' as ClientRequirement['currency'] })]],
    ['missing raw request', [copy('LOCAL', { raw_request: undefined as unknown as string })]],
    ['unexpected field', [{ ...copy(), unexpected: 'extra' } as LocalRequirementCopy]],
    ['unexpected requirement field', [copy('LOCAL', { unexpected: 'extra' } as Partial<ClientRequirement>)]],
  ];
  for (const [label, invalid] of invalidSets) {
    const storage = new MemoryStorage();
    const first = saveLocalRequirements(storage, 'test-key', [copy('VALID')], originals, '');
    const priorBytes = storage.data.get('test-key');
    assert.throws(() => saveLocalRequirements(storage, 'test-key', invalid, originals, first.revision), /invalid data or links/, label);
    assert.equal(storage.data.get('test-key'), priorBytes, label);
    assert.equal(storage.writes, 1, label);
  }
});

test('damaged stored content is reported generically and cannot be silently replaced by a save', () => {
  const valid = { version: 1, key: 'test-key', revision: 'saved-revision', copies: [copy()] };
  const damaged = [
    'private-sentinel-not-json', 'null', '[]', '{}',
    JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, key: 'other-dataset' }),
    JSON.stringify({ ...valid, revision: '' }), JSON.stringify({ ...valid, copies: 'wrong-shape' }),
    JSON.stringify({ ...valid, copies: [copy('IMPORTED-R-A')] }),
    JSON.stringify({ ...valid, copies: [copy('LOCAL', { client_id: 'DIFFERENT-CLIENT' })] }),
    JSON.stringify({ ...valid, unexpected: 'private-sentinel' }),
  ];
  for (const bytes of damaged) {
    const storage = new MemoryStorage();
    storage.data.set('test-key', bytes);
    const safeError = (error: unknown): boolean => error instanceof Error && /invalid data or links/.test(error.message) && !error.message.includes('private-sentinel');
    assert.throws(() => loadLocalRequirements(storage, 'test-key', [requirement()]), safeError);
    assert.throws(() => saveLocalRequirements(storage, 'test-key', [], [requirement()], ''), safeError);
    assert.equal(storage.data.get('test-key'), bytes);
    assert.equal(storage.writes, 0);
    assert.equal(storage.removals, 0);
  }
});

test('stale tab revisions fail before writing and cannot replace newer edits', () => {
  const storage = new MemoryStorage();
  const first = saveLocalRequirements(storage, 'test-key', [copy()], [requirement()], '');
  const second = saveLocalRequirements(storage, 'test-key', [copy('SESSION-R-NEWER', { budget_max: 750000 })], [requirement()], first.revision);
  const priorBytes = storage.data.get('test-key');
  for (const staleRevision of ['', first.revision]) {
    assert.throws(() => saveLocalRequirements(storage, 'test-key', [copy('SESSION-R-STALE')], [requirement()], staleRevision), /changed in another tab/);
    assert.equal(storage.data.get('test-key'), priorBytes);
  }
  assert.equal(storage.writes, 2);
  assert.equal(loadLocalRequirements(storage, 'test-key', [requirement()]).revision, second.revision);
});

test('storage read security errors preserve drafts and existing bytes without exposing exception contents', () => {
  const storage = new MemoryStorage();
  storage.data.set('test-key', 'prior-value');
  storage.getItem = () => { throw new Error('SecurityError private-sentinel'); };
  const safeError = (error: unknown): boolean => error instanceof Error && /could not be loaded/.test(error.message) && !error.message.includes('private-sentinel');
  assert.throws(() => loadLocalRequirements(storage, 'test-key', [requirement()]), safeError);
  assert.throws(() => saveLocalRequirements(storage, 'test-key', [copy()], [requirement()], ''), safeError);
  assert.equal(storage.data.get('test-key'), 'prior-value');
  assert.equal(storage.writes, 0);
});

test('quota and write-security failures cannot be reported as successful saves', () => {
  for (const category of ['QuotaExceededError', 'SecurityError']) {
    const storage = new MemoryStorage();
    const first = saveLocalRequirements(storage, 'test-key', [copy()], [requirement()], '');
    const priorBytes = storage.data.get('test-key');
    storage.setItem = () => { throw new Error(`${category} private-sentinel`); };
    assert.throws(() => saveLocalRequirements(storage, 'test-key', [copy('SESSION-R-NEW')], [requirement()], first.revision), (error: unknown) =>
      error instanceof Error && /could not be saved and verified/.test(error.message) && !error.message.includes('private-sentinel'));
    assert.equal(storage.data.get('test-key'), priorBytes);
    assert.equal(storage.removals, 0);
  }
});

test('missing, changed or unreadable readback is a failed save without destructive rollback', () => {
  for (const behavior of ['missing', 'changed', 'unreadable']) {
    const storage = new MemoryStorage();
    storage.getItem = (key: string) => {
      if (!storage.writes) return null;
      if (behavior === 'unreadable') throw new Error('SecurityError private-sentinel');
      if (behavior === 'missing') return null;
      return `${storage.data.get(key)} `;
    };
    assert.throws(() => saveLocalRequirements(storage, 'test-key', [copy()], [requirement()], ''), /could not be saved and verified/);
    assert.equal(storage.writes, 1);
    assert.equal(storage.removals, 0);
    // A failed readback may follow a successful write or another tab's write; never erase it.
    assert.ok(storage.data.has('test-key'));
  }
});
