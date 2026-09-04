import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyRequirement } from '../shared/assistant';
import { currentClientRequirements, requirementChanges, clientRequirementHistory } from '../shared/client-requirement-history';
import { loadLocalRequirements, saveLocalRequirements, requirementStorageKey, type LocalRequirementCopy } from '../shared/local-requirements';
import type { ClientRequirement, Dataset } from '../shared/types';

const original = (id = 'R1'): ClientRequirement => ({ ...createEmptyRequirement('Fictional request.'), requirement_id: id, client_id: 'C1', client_alias: 'Fictional client', captured_at: '2026-09-01T00:00:00Z', budget_max: 2000000 });
const copy = (id: string, parent: string | null = 'R1', edit_kind?: 'revision'): LocalRequirementCopy => ({
  requirement: { ...original(), requirement_id: id, budget_max: 3000000 }, original_requirement_id: 'R1',
  parent_requirement_id: parent, saved_at: '2026-09-03T00:00:00Z', ...(edit_kind ? { edit_kind } : {}),
});
const ids = (rows: ClientRequirement[]) => rows.map(row => row.requirement_id);
class MemoryStorage {
  rows = new Map<string, string>();
  getItem(key: string) { return this.rows.get(key) ?? null; }
  setItem(key: string, value: string) { this.rows.set(key, value); }
  removeItem(key: string) { this.rows.delete(key); }
}

test('legacy local copies and independent imported plans are not silently converted into revisions', () => {
  const imported = [original(), original('R2')];
  const copies = [copy('L1'), copy('L2')];
  assert.deepEqual(ids(currentClientRequirements(imported, copies)), ['R1', 'R2', 'L1', 'L2']);
});
test('explicit revision shows one complete latest version and preserves original records', () => {
  const imported = [original(), original('R2')];
  const copies = [copy('L1', 'R1', 'revision'), { ...copy('L2', 'L1', 'revision'), requirement: { ...original('L2'), budget_max: null, preferred_areas: ['Demo garden'] } }];
  const bytes = JSON.stringify({ imported, copies });
  const current = currentClientRequirements(imported, copies);
  assert.deepEqual(ids(current), ['L2', 'R2']);
  assert.equal(current[0].budget_max, null, 'A deliberately removed budget is not backfilled from an older version.');
  assert.deepEqual(current[0].preferred_areas, ['Demo garden']);
  assert.equal(JSON.stringify({ imported, copies }), bytes);
});
test('editing an independent legacy copy replaces that plan and keeps the imported plan', () => {
  const copies = [copy('L1'), copy('L2', 'L1', 'revision')];
  assert.deepEqual(ids(currentClientRequirements([original()], copies)), ['R1', 'L2']);
});
test('multiple explicit revision branches choose latest saved complete leaf deterministically', () => {
  const earlier = { ...copy('L1', 'R1', 'revision'), saved_at: '2026-09-02T00:00:00Z' };
  const later = copy('L2', 'R1', 'revision');
  assert.deepEqual(ids(currentClientRequirements([original()], [later, earlier])), ['L2']);
  assert.deepEqual(ids(currentClientRequirements([original()], [earlier, later])), ['L2']);
  assert.deepEqual(clientRequirementHistory(later.requirement, [original()], [earlier, later]).map(row => row.requirement.requirement_id), ['R1', 'L1', 'L2']);
});
test('deleting a revision restores its parent while a missing parent never guesses an independent plan', () => {
  const first = copy('L1', 'R1', 'revision');
  const second = copy('L2', 'L1', 'revision');
  assert.deepEqual(ids(currentClientRequirements([original()], [first])), ['L1']);
  assert.deepEqual(ids(currentClientRequirements([original()], [])), ['R1']);
  assert.deepEqual(ids(currentClientRequirements([original()], [second])), ['R1', 'L2']);
  assert.equal(clientRequirementHistory(second.requirement, [original()], [second])[0].parent_missing, true);
});
test('change summaries record additions changes removals and omit unchanged source metadata', () => {
  const before = { ...original(), soft_preferences: 'Quiet street' };
  const after = { ...before, budget_max: 3500000, purchase_by: '2027-01-01', soft_preferences: null, reviewed_by: 'DEMO-SALES', source_name: 'Browser revision' };
  assert.deepEqual(requirementChanges(before, after).map(row => [row.field, row.kind]), [['budget_max', 'changed'], ['purchase_by', 'added'], ['soft_preferences', 'removed']]);
});
test('old four-field copies and new explicit revision metadata round-trip together in v1 storage', () => {
  const storage = new MemoryStorage();
  const copies = [copy('L1'), copy('L2', 'L1', 'revision')];
  saveLocalRequirements(storage, 'test', copies, [original()], '');
  const loaded = loadLocalRequirements(storage, 'test', [original()]);
  assert.deepEqual(loaded.copies, copies);
  assert.deepEqual(ids(currentClientRequirements([original()], loaded.copies)), ['R1', 'L2']);
});
test('invalid revision metadata and revision without explicit parent fail before any write', () => {
  for (const invalid of [{ ...copy('L1'), edit_kind: 'merged' }, { ...copy('L1', null), edit_kind: 'revision' }]) {
    const storage = new MemoryStorage();
    assert.throws(() => saveLocalRequirements(storage, 'test', [invalid as LocalRequirementCopy], [original()], ''), /invalid data or links/);
    assert.equal(storage.rows.size, 0);
  }
});

test('optional upper size bound preserves legacy storage keys only while absent or null', async () => {
  const dataset: Dataset = { listing_snapshots: [], transactions: [], listing_transaction_links: [], match_reference: [], client_requirements: [original()], meta: { mode: 'demo', label: 'Fictional key test', loaded_at: '2026-09-03T00:00:00Z', warnings: [], quarantined_count: 0, storage_namespace: 'test-size-v1' } };
  const before = await requirementStorageKey(dataset);
  Object.assign(dataset.client_requirements[0], { area_max: null });
  assert.equal(await requirementStorageKey(dataset), before);
  Object.assign(dataset.client_requirements[0], { area_max: 1500 });
  assert.notEqual(await requirementStorageKey(dataset), before);
});
test('optional upper size bound is validated while old copies remain readable', () => {
  for (const area_max of [-1, Infinity, '1500', 500]) {
    const storage = new MemoryStorage();
    const next = copy('L1');
    Object.assign(next.requirement, { area_min: 1000, area_max });
    assert.throws(() => saveLocalRequirements(storage, 'test', [next], [original()], ''), /invalid data or links/);
  }
  const storage = new MemoryStorage();
  const next = copy('L1');
  Object.assign(next.requirement, { area_min: 1000, area_max: 1500 });
  assert.deepEqual(saveLocalRequirements(storage, 'test', [next], [original()], '').copies[0], next);
});
