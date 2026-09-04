import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

export const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SCHEMA = JSON.parse(readFileSync(new URL('../../data/templates/schema.json', import.meta.url), 'utf8'));
export const TABLE_NAMES = SCHEMA.tables.map((table) => table.key);
const PRIMARY_KEYS = {
  listing_snapshots: 'snapshot_id', transactions: 'transaction_id',
  listing_transaction_links: 'link_id', client_requirements: 'requirement_id', match_reference: 'case_id',
};
const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const realRow = (row) => row.data_kind !== 'demo';

export class DataImportError extends Error {
  constructor(code, message) { super(message); this.name = 'DataImportError'; this.code = code; }
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, date, hour, minute, second, zone, offsetHour, offsetMinute] = match;
  return isDate(date) && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 &&
    (zone === 'Z' || (Number(offsetHour) <= 14 && Number(offsetMinute) <= 59 &&
    (Number(offsetHour) !== 14 || Number(offsetMinute) === 0))) && Number.isFinite(Date.parse(value));
}

function normalizeField(value, field, issues) {
  if (isEmpty(value) || (field.type === 'multi_text' && Array.isArray(value) && value.length === 0)) {
    if (field.required === '必填') issues.push(`${field.key}: required`);
    return null;
  }
  if (field.type === 'multi_text') {
    const values = typeof value === 'string' ? value.split('|') : value;
    if (!Array.isArray(values) || values.some((item) => typeof item !== 'string')) {
      issues.push(`${field.key}: expected text list`); return null;
    }
    const clean = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
    return clean.length ? clean : null;
  }
  if (field.type === 'number' || field.type === 'integer') {
    if ((typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) {
      issues.push(`${field.key}: expected plain number`); return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (field.type === 'integer' && !Number.isSafeInteger(number))) {
      issues.push(`${field.key}: expected finite nonnegative ${field.type}`); return null;
    }
    return number;
  }
  if (typeof value !== 'string') { issues.push(`${field.key}: expected text`); return null; }
  const text = value.trim();
  if (field.type === 'enum' && !field.options.includes(text)) issues.push(`${field.key}: invalid option`);
  if (field.type === 'date' && !isDate(text)) issues.push(`${field.key}: expected valid YYYY-MM-DD`);
  if (field.type === 'datetime' && !isDateTime(text)) issues.push(`${field.key}: expected valid ISO datetime with timezone`);
  return text;
}

function validateConditions(table, row, issues) {
  if (row.verification_status === 'verified' && !row.reviewed_by) issues.push('reviewed_by: required for verified records');
  if (realRow(row) && row.verification_status && row.verification_status !== 'verified') issues.push('verification_status: real record withheld until verified');
  if (realRow(row) && row.usage_status && row.usage_status !== 'approved') issues.push('usage_status: real record withheld until approved');
  if (row.currency === 'other' && !row.notes) issues.push('notes: identify other currency; currency mapping still required');
  if (row.area_value !== null && row.area_value !== undefined && (!row.area_unit || !row.area_basis)) issues.push('area_value: unit and basis required');
  if (table === 'listing_snapshots' && row.asking_price !== null && !row.currency) issues.push('asking_price: currency required');
  if (table === 'transactions') {
    if (row.verification_status === 'verified' && !row.evidence_excerpt) issues.push('evidence_excerpt: required for verified transaction');
    if (row.property_id && row.property_id === row.transaction_id) issues.push('property_id: transaction ID is not a property identity');
  }
  if (table === 'listing_transaction_links' && row.verification_status === 'verified' && !row.reviewed_at) issues.push('reviewed_at: required for verified association');
  if (table === 'client_requirements') {
    if ((row.budget_min !== null || row.budget_max !== null) && !row.currency) issues.push('budget: currency required');
    if (row.budget_min !== null && row.budget_max !== null && row.budget_min > row.budget_max) issues.push('budget: minimum exceeds maximum');
    if (row.area_min !== null && !row.area_unit) issues.push('area_min: unit required');
    if (row.area_max != null && !row.area_unit) issues.push('area_max: unit required');
    if (row.area_min != null && row.area_max != null && row.area_min > row.area_max) issues.push('area: minimum exceeds maximum');
    const types = SCHEMA.tables.find((t) => t.key === 'listing_snapshots').fields.find((f) => f.key === 'property_type').options;
    if (row.property_types?.some((value) => !types.includes(value))) issues.push('property_types: invalid property type');
  }
  if (table === 'match_reference') {
    if (['recommend', 'alternative', 'exclude'].includes(row.expected_result) && !row.listing_id) issues.push('listing_id: required for selected result');
    if (row.expected_result === 'no_match' && row.listing_id) issues.push('listing_id: must be empty for no_match');
    if (['recommend', 'alternative'].includes(row.expected_result) && !row.matched_conditions) issues.push('matched_conditions: required for recommendation');
    if (['exclude', 'no_match'].includes(row.expected_result) && !row.conflicting_conditions) issues.push('conflicting_conditions: exclusion reason required');
    if (row.intent_assessment && row.intent_assessment !== 'unknown' && !row.intent_basis) issues.push('intent_basis: evidence required for intent assessment');
    if (!row.listing_id && row.pricing_link_ids?.length) issues.push('pricing_link_ids: listing required');
    if (realRow(row) && row.review_status !== 'confirmed') issues.push('review_status: real draft is not an acceptance benchmark');
  }
}

function latestListings(records) {
  const result = new Map();
  for (const row of records) {
    const current = result.get(row.listing_id);
    if (!current || Date.parse(row.captured_at) > Date.parse(current.captured_at)) result.set(row.listing_id, row);
  }
  return result;
}

function associationIssues(link, listing, transaction) {
  const issues = [];
  if (!listing) issues.push('listing_id: target missing or quarantined');
  if (!transaction) issues.push('transaction_id: target missing or quarantined');
  if (!listing || !transaction) return issues;
  if ((listing.data_kind === 'demo' || transaction.data_kind === 'demo') && link.data_kind !== 'demo') issues.push('data_kind: association with demo target must be demo');
  if (link.relation_type === 'comparable' && listing.property_id && listing.property_id === transaction.property_id) {
    issues.push('comparable: same property identity contradicts a surrounding-property association');
  }
  if (link.relation_type === 'exact_property') {
    const refs = new Set((link.evidence_refs ?? '').split('|').map((v) => v.trim()));
    if (!listing.property_id || listing.property_id !== transaction.property_id) issues.push('exact_property: matching evidence-backed stable property IDs required');
    if (!refs.has(listing.source_ref) || !refs.has(transaction.source_ref)) issues.push('evidence_refs: both listing and transaction source references required');
    if (listing.unit_ref && transaction.unit_ref && listing.unit_ref !== transaction.unit_ref) issues.push('exact_property: unit identifiers conflict');
  }
  if (link.pricing_eligible === 'yes') {
    if (transaction.record_type !== 'sale' || transaction.transaction_scope !== 'whole_unit') issues.push('pricing_eligible: requires sale of whole unit');
    if (!(transaction.amount > 0) || !transaction.currency || transaction.currency === 'other' || !transaction.transaction_date || transaction.date_basis === 'unknown') issues.push('pricing_eligible: explicit positive amount, mapped currency and dated basis required');
    if (link.relation_type === 'unresolved') issues.push('pricing_eligible: unresolved association');
    if ([link, listing, transaction].some((r) => r.verification_status !== 'verified') ||
        [listing, transaction].some((r) => r.usage_status !== 'approved')) issues.push('pricing_eligible: approved sources and verified association required');
    if (listing.currency !== transaction.currency) issues.push('pricing_eligible: currencies differ or listing currency is unknown');
    if (listing.area_basis === 'unknown' || !listing.area_basis || listing.area_basis !== transaction.area_basis ||
        !(listing.area_value > 0) || !(transaction.area_value > 0)) issues.push('pricing_eligible: explicit consistent area basis and positive areas required');
    if (transaction.transaction_date > listing.captured_at.slice(0, 10)) issues.push('pricing_eligible: transaction occurs after listing observation');
    if (link.relation_type === 'comparable') {
      if (listing.area_name !== transaction.area_name || listing.property_type === 'unknown' || listing.property_type !== transaction.property_type) issues.push('pricing_eligible: comparable area and property type must agree');
      if (!link.differences) issues.push('differences: comparable time and material differences must be documented');
    }
  }
  return issues;
}

/** Return only schema fields and safe issue summaries; raw rejected rows never leave this function. */
export function validateDataset(raw, { mode = 'demo', warnings: inputWarnings = [] } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DataImportError('INVALID_DATASET', 'Dataset must be an object with the five contract tables.');
  if (!['demo', 'product'].includes(mode)) throw new DataImportError('INVALID_MODE', 'Unknown dataset mode.');
  const accepted = {}, warnings = [...inputWarnings];
  let allListingSnapshots = [];
  let quarantined = 0;
  const quarantine = (table, index, issues) => {
    quarantined += 1;
    warnings.push(`${table} row ${index + 1}: ${issues.join('; ')}`);
  };
  for (const table of SCHEMA.tables) {
    const rows = raw[table.key] ?? [];
    if (!Array.isArray(rows)) throw new DataImportError('INVALID_TABLE', `${table.key}: expected an array.`);
    const fields = new Set(table.fields.map((field) => field.key));
    const normalized = rows.map((source, index) => {
      const issues = [];
      if (!source || typeof source !== 'object' || Array.isArray(source)) return { row: {}, index, issues: ['expected a record object'] };
      if (Object.keys(source).some((key) => !fields.has(key))) issues.push('record contains fields outside the contract');
      const row = Object.fromEntries(table.fields.map((field) => [field.key, normalizeField(source[field.key], field, issues)]));
      if (mode === 'demo' && row.data_kind !== 'demo') issues.push('data_kind: real data is forbidden in the demo directory');
      if (mode === 'product' && row.data_kind === 'demo') issues.push('data_kind: keep synthetic records in the demo directory');
      validateConditions(table.key, row, issues);
      return { row, index, issues };
    });
    if (table.key === 'listing_snapshots') allListingSnapshots = normalized;
    const primaryKey = PRIMARY_KEYS[table.key];
    const counts = new Map();
    for (const { row } of normalized) if (row[primaryKey]) counts.set(row[primaryKey], (counts.get(row[primaryKey]) ?? 0) + 1);
    accepted[table.key] = [];
    for (const entry of normalized) {
      if (entry.row[primaryKey] && counts.get(entry.row[primaryKey]) > 1) entry.issues.push(`${primaryKey}: duplicate stable ID; all duplicates withheld`);
      if (entry.issues.length) quarantine(table.key, entry.index, entry.issues);
      else accepted[table.key].push(entry);
    }
  }
  // Establish currentness from every input snapshot, before using accepted rows.
  // Otherwise an unapproved withdrawal/new price could silently resurrect old active inventory.
  const snapshotGroups = new Map();
  for (const entry of allListingSnapshots) {
    if (!entry.row.listing_id) continue;
    const group = snapshotGroups.get(entry.row.listing_id) ?? [];
    group.push(entry);
    snapshotGroups.set(entry.row.listing_id, group);
  }
  const unsafeCurrentListings = new Set();
  for (const [listingId, group] of snapshotGroups) {
    const unknownChronology = group.some(({ row }) => !isDateTime(row.captured_at ?? ''));
    const latestTime = group.reduce((time, { row }) => Math.max(time, Date.parse(row.captured_at)), -Infinity);
    if (unknownChronology || group.some(({ row, issues }) => Date.parse(row.captured_at) === latestTime && issues.length)) unsafeCurrentListings.add(listingId);
  }
  accepted.listing_snapshots = accepted.listing_snapshots.filter(({ row, index }) => {
    if (!unsafeCurrentListings.has(row.listing_id)) return true;
    quarantine('listing_snapshots', index, ['listing_id: current snapshot is unusable or chronology is unknown; older snapshots withheld to avoid stale current inventory']);
    return false;
  });
  const listings = latestListings(accepted.listing_snapshots.map(({ row }) => row));
  const transactions = new Map(accepted.transactions.map(({ row }) => [row.transaction_id, row]));
  accepted.listing_transaction_links = accepted.listing_transaction_links.filter(({ row, index }) => {
    const issues = associationIssues(row, listings.get(row.listing_id), transactions.get(row.transaction_id));
    if (issues.length) quarantine('listing_transaction_links', index, issues);
    return !issues.length;
  });
  const links = new Map(accepted.listing_transaction_links.map(({ row }) => [row.link_id, row]));
  const requirements = new Map(accepted.client_requirements.map(({ row }) => [row.requirement_id, row]));
  accepted.match_reference = accepted.match_reference.filter(({ row, index }) => {
    const issues = [];
    const requirement = requirements.get(row.requirement_id), listing = listings.get(row.listing_id);
    if (!requirement) issues.push('requirement_id: target missing or quarantined');
    if (row.listing_id && !listing) issues.push('listing_id: target missing or quarantined');
    if ((requirement?.data_kind === 'demo' || listing?.data_kind === 'demo') && row.data_kind !== 'demo') issues.push('data_kind: reference with demo target must be demo');
    for (const id of row.pricing_link_ids ?? []) {
      const link = links.get(id);
      if (!link || link.listing_id !== row.listing_id || link.pricing_eligible !== 'yes' || link.verification_status !== 'verified') issues.push('pricing_link_ids: missing, quarantined, ineligible or belongs to another listing');
    }
    if (issues.length) quarantine('match_reference', index, issues);
    return !issues.length;
  });
  return {
    ...Object.fromEntries(TABLE_NAMES.map((table) => [table, accepted[table].map(({ row }) => row)])),
    meta: {
      mode, label: mode === 'demo' ? 'Synthetic demo data — not real properties, transactions or clients' : 'Product-provided data — accepted records only',
      loaded_at: new Date().toISOString(), warnings, quarantined_count: quarantined,
    },
  };
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function assertSafePath(candidate) {
  const resolved = await realpath(candidate).catch(() => { throw new DataImportError('DATA_NOT_FOUND', 'Configured data source does not exist.'); });
  const roots = await Promise.all(['data/demo', 'data/incoming', 'data/private'].map(async (folder) => {
    const root = path.resolve(WORKSPACE_ROOT, folder);
    // Reject symlink roots redirected outside the repository as well as escaping children.
    const actual = await realpath(root).catch(() => root);
    return { root: actual, kind: folder === 'data/demo' ? 'demo' : 'product', valid: inside(actual, path.resolve(WORKSPACE_ROOT, 'data')) };
  }));
  const allowed = roots.find((item) => item.valid && inside(resolved, item.root));
  if (!allowed) throw new DataImportError('UNSAFE_DATA_PATH', 'Data source must remain in data/demo, data/incoming or data/private.');
  return { resolved, mode: allowed.kind };
}

export async function loadDataset(configuredPath = process.env.BHHS_DATA_DIR) {
  const requested = configuredPath ? path.resolve(WORKSPACE_ROOT, configuredPath) : path.join(WORKSPACE_ROOT, 'data/demo/dataset.json');
  const { resolved, mode } = await assertSafePath(requested);
  const details = await stat(resolved);
  let raw;
  const warnings = [];
  if (details.isDirectory()) {
    const filenames = new Set(await readdir(resolved));
    const csvNames = TABLE_NAMES.filter((key) => filenames.has(`${key}.csv`));
    if (!csvNames.length && filenames.has('dataset.json')) return loadDataset(path.join(resolved, 'dataset.json'));
    if (!csvNames.length) throw new DataImportError('EMPTY_DATA_SOURCE', 'Data directory contains no contract CSV files or dataset.json.');
    raw = {};
    for (const table of SCHEMA.tables) {
      if (!filenames.has(`${table.key}.csv`)) { raw[table.key] = []; warnings.push(`${table.key}: file not supplied; table is empty`); continue; }
      const { resolved: csvPath, mode: csvMode } = await assertSafePath(path.join(resolved, `${table.key}.csv`));
      if (csvMode !== mode) throw new DataImportError('MIXED_SOURCE', 'CSV source crosses the demo/product directory boundary.');
      try {
        const text = await readFile(csvPath, 'utf8');
        const expected = new Set(table.fields.map((field) => field.key));
        const required = table.fields.filter((field) => field.required === '必填').map((field) => field.key);
        raw[table.key] = parse(text, {
          bom: true, trim: true, skip_empty_lines: true,
          columns: (header) => {
            if (!header.length || new Set(header).size !== header.length || header.some((key) => !expected.has(key)) || required.some((key) => !header.includes(key))) {
              throw new DataImportError('INVALID_CSV_HEADER', `${table.key}: use unique schema field names and include all required columns.`);
            }
            return header;
          },
        }).filter((record) => Object.values(record).some((value) => !isEmpty(value)));
      } catch (error) {
        if (error instanceof DataImportError) throw error;
        throw new DataImportError('INVALID_CSV', `${table.key}: CSV could not be parsed. Check quoting, UTF-8 encoding and column counts.`);
      }
    }
  } else {
    if (path.extname(resolved).toLowerCase() !== '.json') throw new DataImportError('UNSUPPORTED_FORMAT', 'Use a directory of CSV files or a JSON dataset file.');
    try { raw = JSON.parse((await readFile(resolved, 'utf8')).replace(/^\uFEFF/, '')); }
    catch { throw new DataImportError('INVALID_JSON', 'Dataset JSON could not be parsed.'); }
  }
  const dataset = validateDataset(raw, { mode, warnings });
  // Stable across refreshes and machines with the same relative source; never expose a local path.
  // The browser separately fingerprints the accepted five-table content to isolate source versions.
  const source = path.relative(WORKSPACE_ROOT, resolved).split(path.sep).join('/');
  dataset.meta.storage_namespace = `bhhs-source-v1:${createHash('sha256').update(`${mode}:${source}`).digest('hex')}`;
  return dataset;
}
