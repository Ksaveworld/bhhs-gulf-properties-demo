import type { ClientRequirement, Dataset } from './types';

export type LocalRequirementCopy = {
  requirement: ClientRequirement;
  original_requirement_id: string | null;
  parent_requirement_id: string | null;
  saved_at: string;
  /** Explicitly replaces its parent in the current view; absent on independent legacy copies. */
  edit_kind?: 'revision';
};

export type StoredRequirements = { version: 1; key: string; revision: string; copies: LocalRequirementCopy[] };
type LocalStorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const TABLES = ['listing_snapshots', 'transactions', 'listing_transaction_links', 'client_requirements', 'match_reference'] as const;
const INVALID_DATA = 'Saved local requirements have invalid data or links. Existing browser data was not replaced.';
const LOAD_FAILED = 'Local requirements could not be loaded from this browser. Keep any open draft and retry.';
const SAVE_FAILED = 'Local requirements could not be saved and verified. Keep this draft open and retry.';
const STALE_REVISION = 'Local requirements changed in another tab. Reload local copies before saving.';
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const nullableString = (value: unknown): boolean => value === null || typeof value === 'string';
const nullableNumber = (value: unknown): boolean => value === null || typeof value === 'number' && Number.isFinite(value);
const nullableArray = (value: unknown): boolean => value === null || Array.isArray(value) && value.every(entry => typeof entry === 'string');

function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if ((!Array.isArray(value) && !isRecord(value)) || ancestors.has(value)) throw new Error('Invalid canonical data.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${Array.from(value, entry => canonical(entry, ancestors)).join(',')}]`;
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], ancestors)}`).join(',')}}`;
  } finally { ancestors.delete(value); }
}

/** Scope uses only the supplied original dataset. Object-key order is canonical; array order is retained. */
export async function requirementStorageKey(dataset: Dataset): Promise<string> {
  const namespace = (dataset?.meta as Dataset['meta'] & { storage_namespace?: unknown })?.storage_namespace;
  if (!isId(namespace) || /[\u0000-\u001f]/u.test(namespace)) {
    throw new Error('Local saving is unavailable because this data source has no valid storage namespace.');
  }
  try {
    if (!['demo', 'product'].includes(dataset.meta.mode) || TABLES.some(table => !Array.isArray(dataset[table]))) throw new Error('Invalid dataset.');
    // v1.2 may materialize an absent optional upper size bound as null. Keep older
    // browser scopes stable; a supplied upper bound still creates a new version.
    const contents = canonical({ namespace, mode: dataset.meta.mode, tables: Object.fromEntries(TABLES.map(table => [table,
      table === 'client_requirements' ? dataset.client_requirements.map(row => {
        const { area_max, ...legacy } = row as ClientRequirement & { area_max?: number | null };
        return area_max == null ? legacy : row;
      }) : dataset[table],
    ])) });
    const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents));
    return `bhhs:local-requirements:v1:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    throw new Error('A secure local storage scope could not be created for this dataset. Local saving remains unavailable.');
  }
}

const STRING_FIELDS = ['requirement_id', 'client_id', 'client_alias', 'raw_request', 'source_name', 'source_ref', 'captured_at'] as const;
const NULLABLE_STRING_FIELDS = ['sales_owner', 'purchase_by', 'move_in_by', 'hard_constraints', 'soft_preferences', 'intent_evidence', 'missing_questions', 'source_date', 'reviewed_by', 'notes'] as const;
const NUMBER_FIELDS = ['budget_min', 'budget_max', 'bedrooms_min', 'area_min'] as const;
const ARRAY_FIELDS = ['preferred_areas', 'property_types'] as const;
const ENUM_FIELDS: Record<string, readonly (string | null)[]> = {
  currency: ['AED', 'USD', 'EUR', 'GBP', 'other', null], budget_constraint: ['hard', 'flexible', 'unknown'],
  area_unit: ['sqm', 'sqft', null], area_basis: ['internal', 'gross', 'built_up', 'land', 'unknown', null],
  purchase_purpose: ['self_use', 'investment', 'mixed', 'unknown'], market_preference: ['ready', 'off_plan', 'unknown', 'either'],
  data_kind: ['real_public', 'real_authorized', 'demo'], verification_status: ['verified', 'needs_review', 'conflict'],
  usage_status: ['approved', 'pending', 'restricted'],
};
const REQUIREMENT_FIELDS = new Set<string>([...STRING_FIELDS, ...NULLABLE_STRING_FIELDS, ...NUMBER_FIELDS, ...ARRAY_FIELDS, ...Object.keys(ENUM_FIELDS), 'area_max']);

function validRequirement(value: unknown): value is ClientRequirement {
  if (!isRecord(value) || Object.keys(value).some(key => !REQUIREMENT_FIELDS.has(key))) return false;
  if (!STRING_FIELDS.every(key => typeof value[key] === 'string') || !isId(value.requirement_id) || !isId(value.client_id)) return false;
  if (!NULLABLE_STRING_FIELDS.every(key => nullableString(value[key])) || !NUMBER_FIELDS.every(key => nullableNumber(value[key])) || !ARRAY_FIELDS.every(key => nullableArray(value[key]))) return false;
  if (value.area_max != null && (typeof value.area_max !== 'number' || !Number.isFinite(value.area_max) || value.area_max < 0 || typeof value.area_min === 'number' && value.area_min > value.area_max)) return false;
  return Object.entries(ENUM_FIELDS).every(([key, allowed]) => key === 'area_basis' && value[key] === undefined || allowed.includes(value[key] as string | null));
}

function validateCopies(copies: unknown, originals: ClientRequirement[]): asserts copies is LocalRequirementCopy[] {
  if (!Array.isArray(copies) || !Array.isArray(originals)) throw new Error(INVALID_DATA);
  const imported = new Map<string, ClientRequirement>();
  for (const original of originals) {
    if (!original || !isId(original.requirement_id) || !isId(original.client_id) || imported.has(original.requirement_id)) throw new Error(INVALID_DATA);
    imported.set(original.requirement_id, original);
  }
  const local = new Map<string, LocalRequirementCopy>();
  for (const copy of copies) {
    if (!isRecord(copy) || Object.keys(copy).some(key => !['requirement', 'original_requirement_id', 'parent_requirement_id', 'saved_at', 'edit_kind'].includes(key)) || !['requirement', 'original_requirement_id', 'parent_requirement_id', 'saved_at'].every(key => Object.hasOwn(copy, key)) || !validRequirement(copy.requirement)) throw new Error(INVALID_DATA);
    if (Object.hasOwn(copy, 'edit_kind') && (copy.edit_kind !== 'revision' || !isId(copy.parent_requirement_id))) throw new Error(INVALID_DATA);
    if (!(copy.original_requirement_id === null || isId(copy.original_requirement_id)) || !(copy.parent_requirement_id === null || isId(copy.parent_requirement_id)) || !isId(copy.saved_at) || !Number.isFinite(Date.parse(copy.saved_at))) throw new Error(INVALID_DATA);
    const id = copy.requirement.requirement_id;
    if (imported.has(id) || local.has(id) || copy.parent_requirement_id === id) throw new Error(INVALID_DATA);
    if (copy.original_requirement_id !== null) {
      const original = imported.get(copy.original_requirement_id);
      if (!original || original.client_id !== copy.requirement.client_id) throw new Error(INVALID_DATA);
    }
    local.set(id, copy as LocalRequirementCopy);
  }
  for (const copy of local.values()) {
    if (!copy.parent_requirement_id) continue;
    const parentOriginal = imported.get(copy.parent_requirement_id);
    if (parentOriginal && (parentOriginal.client_id !== copy.requirement.client_id || copy.original_requirement_id !== parentOriginal.requirement_id)) throw new Error(INVALID_DATA);
    const parentCopy = local.get(copy.parent_requirement_id);
    if (parentCopy && (parentCopy.requirement.client_id !== copy.requirement.client_id || parentCopy.original_requirement_id !== copy.original_requirement_id)) throw new Error(INVALID_DATA);
    // A missing parent may have been deleted. Keep its identifier and never cascade-delete descendants.
  }
  const completed = new Set<string>();
  for (const copy of local.values()) {
    const chain = new Set<string>();
    let current: LocalRequirementCopy | undefined = copy;
    while (current && !completed.has(current.requirement.requirement_id)) {
      const id = current.requirement.requirement_id;
      if (chain.has(id)) throw new Error(INVALID_DATA);
      chain.add(id);
      current = current.parent_requirement_id ? local.get(current.parent_requirement_id) : undefined;
    }
    for (const id of chain) completed.add(id);
  }
}

function parseStored(raw: string, key: string, originals: ClientRequirement[]): StoredRequirements {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || Object.keys(parsed).length !== 4 || parsed.version !== 1 || parsed.key !== key || !isId(parsed.revision) || !Object.hasOwn(parsed, 'copies')) throw new Error(INVALID_DATA);
    validateCopies(parsed.copies, originals);
    return parsed as StoredRequirements;
  } catch { throw new Error(INVALID_DATA); }
}

export function loadLocalRequirements(storage: LocalStorageAccess, key: string, originals: ClientRequirement[]): StoredRequirements {
  const empty: StoredRequirements = { version: 1, key, revision: '', copies: [] };
  if (typeof key === 'string' && !key.trim()) return empty;
  if (!isId(key)) throw new Error(INVALID_DATA);
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { throw new Error(LOAD_FAILED); }
  if (raw === null) return empty;
  if (typeof raw !== 'string') throw new Error(INVALID_DATA);
  return parseStored(raw, key, originals);
}

/** Optimistic revision check plus readback verification; localStorage itself does not provide atomic cross-tab CAS. */
export function saveLocalRequirements(storage: LocalStorageAccess, key: string, copies: LocalRequirementCopy[], originals: ClientRequirement[], expectedRevision: string): StoredRequirements {
  if (!isId(key)) throw new Error('A valid dataset storage scope is required before saving local requirements.');
  const current = loadLocalRequirements(storage, key, originals);
  if (typeof expectedRevision !== 'string' || current.revision !== expectedRevision) throw new Error(STALE_REVISION);
  let serialized: string;
  let result: StoredRequirements;
  try {
    validateCopies(copies, originals);
    serialized = JSON.stringify({ version: 1, key, revision: globalThis.crypto.randomUUID(), copies });
    // Return a detached snapshot and validate the exact serialized representation before any storage write.
    result = parseStored(serialized, key, originals);
  } catch { throw new Error(INVALID_DATA); }
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error(SAVE_FAILED);
  } catch { throw new Error(SAVE_FAILED); }
  return result;
}
