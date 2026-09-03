import type { ClientRequirement, ListingSnapshot } from './types';

export type ViewingDimension = 'area' | 'type' | 'size';
export type ViewingPreferenceTag = { dimension: ViewingDimension; value: string };
export type ViewingFeedbackSignal = 'positive' | 'mixed' | 'negative' | 'not_recorded';
export type ViewingRecord = {
  record_id: string;
  client_id: string;
  listing_id: string;
  sales_id: string;
  viewed_at: string;
  feedback: string;
  feedback_signal: ViewingFeedbackSignal;
  preference_tags: ViewingPreferenceTag[];
  source_kind: 'sales_entered' | 'fictional_example';
  source_ref: string;
  data_kind: 'demo' | 'sales_recorded';
  created_at: string;
};
export type ViewingAccess = {
  scope: string | null;
  salesId: string | null;
  requirements: ClientRequirement[];
  listings: ListingSnapshot[];
};
export type ViewingDraft = Pick<ViewingRecord, 'client_id' | 'listing_id' | 'viewed_at' | 'feedback' | 'feedback_signal' | 'preference_tags'>;
export type StoredViewingRecords = { version: 1; key: string; revision: string; records: ViewingRecord[] };
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;
const dimensions: ViewingDimension[] = ['area', 'type', 'size'];
const signals: ViewingFeedbackSignal[] = ['positive', 'mixed', 'negative', 'not_recorded'];
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && !/[\u0000-\u001f]/u.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const invalid = 'Saved viewing records could not be validated. Existing browser data was not replaced.';

export function viewingStorageKey(access: Pick<ViewingAccess, 'scope' | 'salesId'>): string {
  if (!id(access.salesId) || !id(access.scope)) throw new Error('Select a Sales ID and wait for the data scope before saving viewing records.');
  return `bhhs:viewing-records:v1:${encodeURIComponent(access.scope)}:${encodeURIComponent(access.salesId)}`;
}

export function listingViewingDimensions(listing: ListingSnapshot): Record<ViewingDimension, string | null> {
  return {
    area: listing.area_name?.trim() && listing.area_name.toLowerCase() !== 'unknown' ? listing.area_name : null,
    type: listing.property_type && listing.property_type !== 'unknown' ? listing.property_type : null,
    size: listing.area_value !== null && listing.area_value > 0 && listing.area_unit && listing.area_basis && listing.area_basis !== 'unknown'
      ? `${listing.area_value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${listing.area_unit} · ${listing.area_basis}` : null,
  };
}

function validRecord(value: unknown): value is ViewingRecord {
  if (!object(value) || !['record_id', 'client_id', 'listing_id', 'sales_id', 'source_ref'].every(key => id(value[key]))) return false;
  if (!timestamp(value.viewed_at) || !timestamp(value.created_at) || typeof value.feedback !== 'string' || value.feedback.length > 4000) return false;
  if (!signals.includes(value.feedback_signal as ViewingFeedbackSignal) || !['sales_entered', 'fictional_example'].includes(value.source_kind as string) || !['demo', 'sales_recorded'].includes(value.data_kind as string)) return false;
  if (value.source_kind === 'fictional_example' && value.data_kind !== 'demo') return false;
  if (!Array.isArray(value.preference_tags) || value.preference_tags.length > dimensions.length) return false;
  return value.preference_tags.every(tag => object(tag) && dimensions.includes(tag.dimension as ViewingDimension) && id(tag.value))
    && new Set(value.preference_tags.map(tag => tag.dimension)).size === value.preference_tags.length;
}

function visible(record: ViewingRecord, access: ViewingAccess): boolean {
  return !!access.salesId && !!access.scope && record.sales_id === access.salesId
    && access.requirements.some(requirement => requirement.client_id === record.client_id)
    && access.listings.some(listing => listing.listing_id === record.listing_id);
}

/** Newest actual viewing first; capture time and ID make equal viewing dates deterministic. */
export function sortViewingRecords(records: ViewingRecord[]): ViewingRecord[] {
  return [...records].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at) || b.created_at.localeCompare(a.created_at) || a.record_id.localeCompare(b.record_id));
}

function loadStored(storage: BrowserStorage, access: ViewingAccess): StoredViewingRecords {
  const key = viewingStorageKey(access);
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { throw new Error('Viewing records could not be read from this browser. Retry before saving.'); }
  if (raw === null) return { version: 1, key, revision: '', records: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed) || parsed.version !== 1 || parsed.key !== key || !id(parsed.revision) || !Array.isArray(parsed.records)) throw new Error(invalid);
    if (!parsed.records.every(record => validRecord(record) && record.sales_id === access.salesId)) throw new Error(invalid);
    if (new Set(parsed.records.map(record => record.record_id)).size !== parsed.records.length) throw new Error(invalid);
    return parsed as StoredViewingRecords;
  } catch { throw new Error(invalid); }
}

export function loadViewingRecords(storage: BrowserStorage, access: ViewingAccess): StoredViewingRecords {
  const stored = loadStored(storage, access);
  // Deleted local-only clients may no longer be visible. Keep their stored records intact,
  // but never include them in the current report or overwrite them while appending a record.
  return { ...stored, records: sortViewingRecords(stored.records.filter(record => visible(record, access))) };
}

function validateNewRecord(record: ViewingRecord, access: ViewingAccess): void {
  if (!visible(record, access)) throw new Error('The viewing must belong to the selected Sales ID and a visible client and property.');
  const client = access.requirements.filter(requirement => requirement.client_id === record.client_id);
  const listing = access.listings.find(item => item.listing_id === record.listing_id)!;
  const demoPair = client.every(requirement => requirement.data_kind === 'demo') && listing.data_kind === 'demo';
  if (record.source_kind === 'fictional_example' && !demoPair) throw new Error('Fictional examples are only allowed for visible demonstration clients and properties.');
  if (!validRecord(record)) throw new Error('The viewing record contains invalid dates, feedback or preference tags.');
  const expectedKind = client.some(requirement => requirement.data_kind === 'demo') || listing.data_kind === 'demo' ? 'demo' : 'sales_recorded';
  if (record.data_kind !== expectedKind) throw new Error('The viewing data label does not match the selected client and property.');
  const values = listingViewingDimensions(listing);
  if (record.preference_tags.some(tag => values[tag.dimension] !== tag.value)) throw new Error('Preference tags must explicitly name a supplied dimension of this property.');
}

/** Append only. Revision and readback checks surface stale tabs and failed writes. */
export function saveViewingRecords(storage: BrowserStorage, access: ViewingAccess, additions: ViewingRecord[], expectedRevision: string): StoredViewingRecords {
  const current = loadStored(storage, access);
  if (current.revision !== expectedRevision) throw new Error('Viewing records changed in another tab. Reload records before saving this draft.');
  if (!additions.length) throw new Error('Supply a viewing record before saving.');
  for (const record of additions) validateNewRecord(record, access);
  const records = [...current.records, ...additions];
  if (new Set(records.map(record => record.record_id)).size !== records.length) throw new Error('This viewing record already exists. Reload records before retrying.');
  const value: StoredViewingRecords = { version: 1, key: current.key, revision: globalThis.crypto.randomUUID(), records };
  const serialized = JSON.stringify(value);
  try {
    storage.setItem(current.key, serialized);
    if (storage.getItem(current.key) !== serialized) throw new Error('Readback failed.');
  } catch { throw new Error('Saving viewing records could not be confirmed. Your draft remains available; reload records before retrying.'); }
  return { ...value, records: sortViewingRecords(records.filter(record => visible(record, access))) };
}

export function createViewingRecord(access: ViewingAccess, draft: ViewingDraft, sourceKind: ViewingRecord['source_kind'] = 'sales_entered', now = new Date().toISOString()): ViewingRecord {
  viewingStorageKey(access);
  const listing = access.listings.find(item => item.listing_id === draft.listing_id);
  const client = access.requirements.filter(requirement => requirement.client_id === draft.client_id);
  const recordId = `VIEW-${globalThis.crypto.randomUUID()}`;
  const record: ViewingRecord = {
    ...draft, feedback: draft.feedback.trim(), preference_tags: draft.preference_tags.map(tag => ({ ...tag })),
    record_id: recordId, sales_id: access.salesId!, source_kind: sourceKind,
    source_ref: `${sourceKind === 'fictional_example' ? 'FICTIONAL' : 'LOCAL-SALES'}:${recordId}`,
    data_kind: client.some(requirement => requirement.data_kind === 'demo') || listing?.data_kind === 'demo' ? 'demo' : 'sales_recorded', created_at: now,
  };
  validateNewRecord(record, access);
  return record;
}

export function createFictionalViewingExamples(access: ViewingAccess, now = new Date().toISOString()): ViewingRecord[] {
  viewingStorageKey(access);
  if (!timestamp(now)) throw new Error('A valid capture date is required.');
  const clients = [...new Set(access.requirements.map(row => row.client_id))].filter(clientId => access.requirements.filter(row => row.client_id === clientId).every(row => row.data_kind === 'demo')).slice(0, 3);
  const listings = access.listings.filter(listing => listing.data_kind === 'demo').slice(0, 2);
  if (!clients.length || !listings.length) throw new Error('No visible demonstration client and property pair is available for fictional examples.');
  return clients.flatMap((clientId, clientIndex) => listings.map((listing, listingIndex) => {
    const values = listingViewingDimensions(listing);
    const dimension: ViewingDimension = listingIndex === 0 ? 'area' : 'type';
    return createViewingRecord(access, {
      client_id: clientId, listing_id: listing.listing_id,
      viewed_at: new Date(Date.parse(now) - (clientIndex * 2 + listingIndex + 1) * 86400000).toISOString(),
      feedback: listingIndex === 0 ? 'Fictional example: the sample client explicitly liked this area and gave positive visit feedback.' : 'Fictional example: the sample client explicitly liked the property type but had mixed feedback about the visit.',
      feedback_signal: listingIndex === 0 ? 'positive' : 'mixed',
      preference_tags: values[dimension] ? [{ dimension, value: values[dimension]! }] : [],
    }, 'fictional_example', now);
  }));
}

export type ViewingObservation = { dimension: ViewingDimension; value: string; observed_count: number; stated_tag_count: number; positive_visit_count: number; record_ids: string[] };
export type ViewingSummary = { viewing_count: number; client_count: number; demo_count: number; fictional_count: number; positive_count: number; observations: ViewingObservation[] };

/** Counts recorded visits; neither visits nor positive visit feedback establish a dimension preference. */
export function summarizeViewingEvidence(records: ViewingRecord[], access: ViewingAccess): ViewingSummary {
  const unique = new Map(records.filter(record => validRecord(record) && visible(record, access)).map(record => [record.record_id, record]));
  const values = [...unique.values()];
  const observations = new Map<string, ViewingObservation>();
  for (const record of values) {
    const listing = access.listings.find(item => item.listing_id === record.listing_id)!;
    for (const dimension of dimensions) {
      const value = listingViewingDimensions(listing)[dimension];
      if (!value) continue;
      const key = `${dimension}:${value}`;
      const observation = observations.get(key) ?? { dimension, value, observed_count: 0, stated_tag_count: 0, positive_visit_count: 0, record_ids: [] };
      observation.observed_count++;
      if (record.preference_tags.some(tag => tag.dimension === dimension && tag.value === value)) observation.stated_tag_count++;
      if (record.feedback_signal === 'positive') observation.positive_visit_count++;
      observation.record_ids.push(record.record_id);
      observations.set(key, observation);
    }
  }
  return {
    viewing_count: values.length, client_count: new Set(values.map(record => record.client_id)).size,
    demo_count: values.filter(record => record.data_kind === 'demo').length,
    fictional_count: values.filter(record => record.source_kind === 'fictional_example').length,
    positive_count: values.filter(record => record.feedback_signal === 'positive').length,
    observations: [...observations.values()].sort((a, b) => a.dimension.localeCompare(b.dimension) || b.observed_count - a.observed_count || a.value.localeCompare(b.value)),
  };
}

function completeBudget(requirement: ClientRequirement): boolean {
  return !!requirement.currency && requirement.currency !== 'other'
    && requirement.budget_min !== null && Number.isFinite(requirement.budget_min) && requirement.budget_min >= 0
    && requirement.budget_max !== null && Number.isFinite(requirement.budget_max) && requirement.budget_max >= requirement.budget_min;
}
export type BudgetCohortMember = { client_id: string; client_alias: string; requirement_ids: string[]; viewing_count: number };
export type BudgetCohort = { available: boolean; reason: string | null; members: BudgetCohortMember[]; summary: ViewingSummary };

export function buildBudgetCohort(anchor: ClientRequirement | null, records: ViewingRecord[], access: ViewingAccess): BudgetCohort {
  const empty = summarizeViewingEvidence([], access);
  if (!access.salesId || !access.scope || !anchor || !access.requirements.some(row => row.requirement_id === anchor.requirement_id && row.client_id === anchor.client_id)) return { available: false, reason: 'Select a visible client requirement under a Sales ID.', members: [], summary: empty };
  if (!completeBudget(anchor)) return { available: false, reason: 'A known currency and both finite budget bounds are required. Missing bounds are not invented.', members: [], summary: empty };
  const members = new Map<string, BudgetCohortMember>();
  for (const requirement of access.requirements) {
    if (requirement.client_id === anchor.client_id || !completeBudget(requirement) || requirement.currency !== anchor.currency) continue;
    if (requirement.budget_min! > anchor.budget_max! || requirement.budget_max! < anchor.budget_min!) continue;
    const member = members.get(requirement.client_id) ?? { client_id: requirement.client_id, client_alias: requirement.client_alias, requirement_ids: [], viewing_count: 0 };
    if (!member.requirement_ids.includes(requirement.requirement_id)) member.requirement_ids.push(requirement.requirement_id);
    members.set(requirement.client_id, member);
  }
  const eligible = records.filter(record => members.has(record.client_id) && visible(record, access));
  for (const member of members.values()) member.viewing_count = new Set(eligible.filter(record => record.client_id === member.client_id).map(record => record.record_id)).size;
  const summary = summarizeViewingEvidence(eligible, access);
  const enough = summary.client_count >= 2 && summary.viewing_count >= 2;
  return { available: enough, reason: enough ? null : 'Insufficient observations: at least two other clients with recorded viewings are needed for a group summary.', members: [...members.values()], summary };
}
