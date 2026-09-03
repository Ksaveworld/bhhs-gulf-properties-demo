import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSalesIdentity, makeSalesIdentity, salesRequirementKey, saveSalesIdentity, SALES_IDENTITY_KEY, type IdentityStorage } from '../shared/sales-identity';

function storage(): IdentityStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
}

test('demo identity survives reload; sign-out does not remove private stores', () => {
  const store = storage(); const a = makeSalesIdentity(' Alice ', 'SALES-A');
  store.setItem(salesRequirementKey('batch-one', 'SALES-A'), 'private requirements');
  assert.equal(loadSalesIdentity(store), null);
  assert.deepEqual(saveSalesIdentity(store, a), a);
  assert.deepEqual(loadSalesIdentity(store), a);
  assert.equal(saveSalesIdentity(store, null), null);
  assert.equal(loadSalesIdentity(store), null);
  assert.equal(store.getItem(salesRequirementKey('batch-one', 'SALES-A')), 'private requirements');
});
test('sales and batch scopes cannot collide, and old unassigned keys are preserved', () => {
  const keys = ['A', 'B', 'a', null].flatMap(id => ['batch-one', 'batch-two'].map(batch => salesRequirementKey(batch, id)));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(salesRequirementKey('old-batch', null), 'old-batch');
  assert.throws(() => salesRequirementKey('batch', 'A:sales:B'));
  assert.throws(() => makeSalesIdentity('', 'A'));
});
test('malformed or blocked identity storage never becomes a signed-in identity', () => {
  const store = storage(); store.setItem(SALES_IDENTITY_KEY, '{bad');
  assert.throws(() => loadSalesIdentity(store), /could not be read/);
  const blocked = { ...store, getItem: () => { throw new Error('SecurityError'); } };
  assert.throws(() => loadSalesIdentity(blocked), /could not be read/);
  const readback = { ...store, setItem: () => {} };
  assert.throws(() => saveSalesIdentity(readback, makeSalesIdentity('Alice', 'A')), /could not be saved/);
  assert.equal(store.getItem(SALES_IDENTITY_KEY), '{bad');
});
