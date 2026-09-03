/** Demo identity only. This is not authentication or a boundary against browser-storage inspection. */
export interface SalesIdentity { username: string; sales_id: string }
export type IdentityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const SALES_IDENTITY_KEY = 'bhhs:demo-sales:v1';

export function makeSalesIdentity(username: string, salesId: string): SalesIdentity {
  const identity = { username: username.trim(), sales_id: salesId.trim() };
  if (!identity.username || identity.username.length > 80 || !/^[A-Za-z0-9_-]{1,64}$/.test(identity.sales_id)) {
    throw new Error('Enter a username and a Sales ID of 1–64 letters, numbers, hyphens or underscores. Sales IDs are case-sensitive.');
  }
  return identity;
}

export function loadSalesIdentity(storage: IdentityStorage): SalesIdentity | null {
  try {
    const raw = storage.getItem(SALES_IDENTITY_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Object.keys(parsed).sort().join(',') !== 'sales_id,username' || typeof parsed.username !== 'string' || typeof parsed.sales_id !== 'string') throw new Error();
    const identity = makeSalesIdentity(parsed.username, parsed.sales_id);
    if (identity.username !== parsed.username || identity.sales_id !== parsed.sales_id) throw new Error();
    return identity;
  } catch { throw new Error('The saved demo identity could not be read. Sign in again; browser copies have not been deleted.'); }
}

export function saveSalesIdentity(storage: IdentityStorage, identity: SalesIdentity | null): SalesIdentity | null {
  const valid = identity ? makeSalesIdentity(identity.username, identity.sales_id) : null;
  try {
    const expected = valid ? JSON.stringify(valid) : null;
    if (expected) storage.setItem(SALES_IDENTITY_KEY, expected);
    else storage.removeItem(SALES_IDENTITY_KEY);
    if (storage.getItem(SALES_IDENTITY_KEY) !== expected) throw new Error();
    return valid;
  } catch { throw new Error('The identity change could not be saved. The current identity remains selected. Check browser storage and retry.'); }
}

export function salesRequirementKey(batchKey: string, salesId: string | null): string {
  if (!batchKey.trim()) throw new Error('A data batch is required for local saving.');
  // Keep old unassigned browser copies intact; never silently attribute them to a new salesperson.
  if (salesId === null) return batchKey;
  const valid = makeSalesIdentity('Scope validation', salesId).sales_id;
  return `${batchKey}:sales:${encodeURIComponent(valid)}`;
}
