/** A browser-only sales acknowledgement, separate from source verification and pricing eligibility. */
export type ListingConfirmationAccess = { scope: string | null; salesId: string | null; listingId: string };
export type ListingConfirmation = { version: 1; key: string; confirmed_at: string; confirmed_by_sales_id: string; listing_id: string };
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const validId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && !/[\u0000-\u001f]/u.test(value);

export function listingConfirmationKey(access: ListingConfirmationAccess): string {
  if (!validId(access.scope) || !validId(access.salesId) || !validId(access.listingId)) throw new Error('Sign in and wait for the current data batch before confirming this property.');
  return `bhhs:listing-confirmation:v1:${encodeURIComponent(access.scope)}:${encodeURIComponent(access.salesId)}:${encodeURIComponent(access.listingId)}`;
}

export function loadListingConfirmation(storage: BrowserStorage, access: ListingConfirmationAccess): ListingConfirmation | null {
  const key = listingConfirmationKey(access);
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { throw new Error('This browser could not read the property confirmation. Retry before changing it.'); }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as ListingConfirmation;
    if (value.version !== 1 || value.key !== key || value.listing_id !== access.listingId || value.confirmed_by_sales_id !== access.salesId || !value.confirmed_at || new Date(value.confirmed_at).toISOString() !== value.confirmed_at) throw new Error('Invalid confirmation');
    return value;
  } catch { throw new Error('The saved property confirmation could not be validated. Existing browser data was kept.'); }
}

export function saveListingConfirmation(storage: BrowserStorage, access: ListingConfirmationAccess, checked: boolean, now = new Date().toISOString()): ListingConfirmation | null {
  const key = listingConfirmationKey(access);
  // Validate existing storage instead of silently replacing an unreadable acknowledgement.
  loadListingConfirmation(storage, access);
  if (!checked) {
    try { storage.removeItem(key); if (storage.getItem(key) !== null) throw new Error('Readback failed'); }
    catch { throw new Error('Removing the property confirmation could not be confirmed. Reload before retrying.'); }
    return null;
  }
  if (!now || new Date(now).toISOString() !== now) throw new Error('A valid confirmation timestamp is required.');
  const value: ListingConfirmation = { version: 1, key, confirmed_at: now, confirmed_by_sales_id: access.salesId!, listing_id: access.listingId };
  const raw = JSON.stringify(value);
  try { storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw new Error('Readback failed'); }
  catch { throw new Error('Saving the property confirmation could not be confirmed. Reload before retrying.'); }
  return value;
}
