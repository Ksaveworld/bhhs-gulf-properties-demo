import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingConfirmationKey, loadListingConfirmation, saveListingConfirmation } from '../shared/listing-confirmation';

function storage() { const rows = new Map<string, string>(); return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } }; }
const access = { scope: 'batch/A', salesId: 'SALES-1', listingId: 'LISTING-1' };
const now = '2026-09-04T10:00:00.000Z';

test('sales confirmation persists, clears and isolates batch, sales identity and property', () => {
  const store = storage();
  assert.equal(loadListingConfirmation(store, access), null);
  const value = saveListingConfirmation(store, access, true, now);
  assert.deepEqual(loadListingConfirmation(store, access), value);
  assert.equal(value?.confirmed_at, now);
  for (const other of [{ ...access, scope: 'batch/B' }, { ...access, salesId: 'SALES-2' }, { ...access, listingId: 'LISTING-2' }]) assert.equal(loadListingConfirmation(store, other), null);
  assert.equal(saveListingConfirmation(store, access, false), null);
  assert.equal(loadListingConfirmation(store, access), null);
});

test('invalid identities and copied or malformed acknowledgements cannot be consumed or overwritten', () => {
  const store = storage();
  assert.throws(() => listingConfirmationKey({ ...access, salesId: null }), /Sign in/);
  store.setItem(listingConfirmationKey(access), '{broken');
  assert.throws(() => loadListingConfirmation(store, access), /could not be validated/);
  assert.throws(() => saveListingConfirmation(store, access, true, now), /could not be validated/);
  assert.equal(store.getItem(listingConfirmationKey(access)), '{broken');
  store.removeItem(listingConfirmationKey(access));
  const value = saveListingConfirmation(store, access, true, now)!;
  store.setItem(listingConfirmationKey({ ...access, salesId: 'SALES-2' }), JSON.stringify(value));
  assert.throws(() => loadListingConfirmation(store, { ...access, salesId: 'SALES-2' }), /could not be validated/);
});

test('read, write, readback and deletion failures never return a success result', () => {
  const store = storage();
  assert.throws(() => loadListingConfirmation({ ...store, getItem() { throw new Error('denied'); } }, access), /could not read/);
  assert.throws(() => saveListingConfirmation({ ...store, setItem() { throw new Error('quota'); } }, access, true, now), /could not be confirmed/);
  assert.throws(() => saveListingConfirmation({ ...store, setItem() {} }, access, true, now), /could not be confirmed/);
  saveListingConfirmation(store, access, true, now);
  assert.throws(() => saveListingConfirmation({ ...store, removeItem() {} }, access, false), /could not be confirmed/);
  assert.throws(() => saveListingConfirmation({ ...store, removeItem() { throw new Error('denied'); } }, access, false), /could not be confirmed/);
});
