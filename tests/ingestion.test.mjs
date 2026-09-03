import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { DataImportError, SCHEMA, TABLE_NAMES, WORKSPACE_ROOT, loadDataset, validateDataset } from '../apps/api/ingest.mjs';
import { createApiServer } from '../apps/api/server.mjs';

const fixture = JSON.parse(await readFile(new URL('../data/demo/dataset.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);
const toProduct = (dataset) => {
  for (const table of TABLE_NAMES) for (const row of dataset[table]) row.data_kind = 'real_authorized';
  return dataset;
};
const csv = (table, rows) => {
  const keys = SCHEMA.tables.find((item) => item.key === table).fields.map((field) => field.key);
  const cell = (value) => `"${(Array.isArray(value) ? value.join('|') : value ?? '').toString().replaceAll('"', '""')}"`;
  return `\uFEFF${keys.join(',')}\r\n${rows.map((row) => keys.map((key) => cell(row[key])).join(',')).join('\r\n')}\r\n`;
};
async function temporarySource(t) {
  const base = path.resolve(WORKSPACE_ROOT, 'data/incoming');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'ingestion-test-'));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(`${base}${path.sep}`), 'cleanup stays in the authorized test directory');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('synthetic fixture is complete, marked and retains asking snapshots separately from transactions', async () => {
  const dataset = await loadDataset();
  assert.equal(dataset.meta.mode, 'demo');
  assert.equal(dataset.meta.quarantined_count, 0, dataset.meta.warnings.join('\n'));
  assert.deepEqual(TABLE_NAMES.map((key) => dataset[key].length), [11, 6, 7, 8, 8]);
  assert.equal(new Set(dataset.client_requirements.map(row => row.client_id)).size, 6);
  assert.equal(new Set(dataset.listing_snapshots.map((row) => row.listing_id)).size, 10);
  for (const table of SCHEMA.tables) {
    for (const row of dataset[table.key]) {
      assert.equal(row.data_kind, 'demo');
      assert.deepEqual(Object.keys(row).sort(), table.fields.map((field) => field.key).sort());
    }
  }
  const marina = dataset.listing_snapshots.filter((row) => row.listing_id === 'DEMO-L-001');
  assert.deepEqual(marina.map((row) => row.asking_price).sort(), [2450000, 2550000]);
  assert.equal(dataset.transactions.find((row) => row.transaction_id === 'DEMO-T-001').amount, 2100000);
  assert.equal(dataset.listing_snapshots.find((row) => row.listing_id === 'DEMO-L-007').asking_price, null);
});

test('CSV handles BOM, quoted punctuation/newlines, multi-value lists and blanks', async (t) => {
  const directory = await temporarySource(t);
  const raw = toProduct(clone());
  raw.client_requirements[0].raw_request = 'Authorized redacted example, with "quoted words"\nand a second line.';
  raw.client_requirements[0].preferred_areas = ['Dubai Marina', 'Downtown Dubai'];
  for (const table of TABLE_NAMES) await writeFile(path.join(directory, `${table}.csv`), csv(table, raw[table]), 'utf8');
  const dataset = await loadDataset(directory);
  assert.equal(dataset.meta.quarantined_count, 0, dataset.meta.warnings.join('\n'));
  assert.equal(dataset.meta.mode, 'product');
  assert.equal(dataset.client_requirements[0].raw_request, raw.client_requirements[0].raw_request);
  assert.deepEqual(dataset.client_requirements[0].preferred_areas, ['Dubai Marina', 'Downtown Dubai']);
  assert.equal(dataset.client_requirements[5].budget_max, null);
  assert.equal(dataset.listing_snapshots[7].amenities, null);
});

test('duplicate stable IDs quarantine all ambiguous rows and dependent references', () => {
  const raw = clone();
  raw.transactions.push({ ...raw.transactions[0], amount: 123456 });
  const result = validateDataset(raw);
  assert.ok(!result.transactions.some((row) => row.transaction_id === 'DEMO-T-001'));
  assert.ok(!result.listing_transaction_links.some((row) => row.link_id === 'DEMO-LINK-001'));
  assert.ok(!result.match_reference.some((row) => row.case_id === 'DEMO-M-001'));
  assert.equal(result.meta.quarantined_count, 4);
  assert.match(result.meta.warnings.join('\n'), /duplicate stable ID/);
});

test('types, valid calendar dates, timezone and unit/currency conditions are enforced', () => {
  const mutations = [
    (row) => { row.asking_price = -1; },
    (row) => { row.asking_price = Infinity; },
    (row) => { row.asking_price = true; },
    (row) => { row.asking_price = 'AED 2,450,000'; },
    (row) => { row.bedrooms = 2.5; },
    (row) => { row.currency = null; },
    (row) => { row.area_basis = null; },
    (row) => { row.listed_at = '2026-02-30'; },
    (row) => { row.captured_at = '2026-09-02T12:00:00'; },
    (row) => { row.captured_at = '2026-09-02T25:00:00+04:00'; },
    (row) => { row.market_segment = 'completed'; },
    (row) => { row.reviewed_by = null; },
  ];
  for (const mutate of mutations) {
    const raw = clone();
    mutate(raw.listing_snapshots[1]);
    const dataset = validateDataset(raw);
    assert.ok(!dataset.listing_snapshots.some((row) => row.listing_id === 'DEMO-L-002'));
    assert.ok(dataset.meta.quarantined_count >= 1);
  }
  const leap = clone();
  leap.listing_snapshots[1].listed_at = '2024-02-29';
  assert.equal(validateDataset(leap).listing_snapshots.length, 11);
});

test('unapproved or unverified real records and all referring links stay out of the API dataset', () => {
  for (const [field, value] of [['usage_status', 'pending'], ['usage_status', 'restricted'], ['verification_status', 'needs_review'], ['verification_status', 'conflict']]) {
    const raw = toProduct(clone());
    raw.transactions[0][field] = value;
    raw.transactions[0].source_ref = 'PRIVATE-RAW-DO-NOT-EXPOSE';
    const dataset = validateDataset(raw, { mode: 'product' });
    assert.ok(!dataset.transactions.some((row) => row.transaction_id === 'DEMO-T-001'));
    assert.ok(!dataset.listing_transaction_links.some((row) => row.transaction_id === 'DEMO-T-001'));
    assert.ok(!JSON.stringify(dataset).includes('PRIVATE-RAW-DO-NOT-EXPOSE'));
  }
});

test('an unusable latest snapshot never revives older active inventory or its linked evidence', () => {
  const mutations = [
    (row) => { row.usage_status = 'pending'; row.listing_status = 'withdrawn'; },
    (row) => { row.verification_status = 'needs_review'; },
    (row) => { row.title = null; },
    (row) => { row.captured_at = 'unknown'; },
  ];
  for (const mutate of mutations) {
    const raw = toProduct(clone());
    mutate(raw.listing_snapshots[0]);
    const result = validateDataset(raw, { mode: 'product' });
    assert.ok(!result.listing_snapshots.some((row) => row.listing_id === 'DEMO-L-001'));
    assert.ok(!result.listing_transaction_links.some((row) => row.listing_id === 'DEMO-L-001'));
    assert.ok(!result.match_reference.some((row) => row.listing_id === 'DEMO-L-001'));
    assert.match(result.meta.warnings.join('\n'), /older snapshots withheld/);
    assert.ok(result.listing_snapshots.some((row) => row.listing_id === 'DEMO-L-002'));
  }
  const olderInvalid = toProduct(clone());
  olderInvalid.listing_snapshots.at(-1).title = null;
  const acceptedLatest = validateDataset(olderInvalid, { mode: 'product' });
  assert.deepEqual(acceptedLatest.listing_snapshots.filter((row) => row.listing_id === 'DEMO-L-001').map((row) => row.snapshot_id), ['DEMO-S-001-02']);
});

test('known same-house identities cannot be imported as surrounding comparables', () => {
  for (const pricing of ['yes', 'no']) {
    const raw = clone();
    raw.listing_transaction_links[0].relation_type = 'comparable';
    raw.listing_transaction_links[0].pricing_eligible = pricing;
    const result = validateDataset(raw);
    assert.ok(!result.listing_transaction_links.some((row) => row.link_id === 'DEMO-LINK-001'));
    assert.ok(!result.match_reference.some((row) => row.case_id === 'DEMO-M-001'));
    assert.match(result.meta.warnings.join('\n'), /same property identity/);
    assert.ok(result.listing_transaction_links.some((row) => row.link_id === 'DEMO-LINK-002'));
  }
});

test('same building and area do not establish same-house history', () => {
  const raw = clone();
  raw.transactions[0].property_id = null;
  // Even otherwise matching unit and building labels cannot silently manufacture a stable identity.
  const dataset = validateDataset(raw);
  assert.ok(!dataset.listing_transaction_links.some((row) => row.link_id === 'DEMO-LINK-001'));
  assert.match(dataset.meta.warnings.join('\n'), /stable property IDs required/);
  const mismatchedSource = clone();
  mismatchedSource.listing_transaction_links[0].evidence_refs = 'DEMO-SOURCE-L-001';
  assert.ok(!validateDataset(mismatchedSource).listing_transaction_links.some((row) => row.link_id === 'DEMO-LINK-001'));
});

test('mortgages, partial shares, currency/basis differences and unchecked links cannot become pricing evidence', () => {
  const cases = [
    (raw) => { raw.listing_transaction_links[2].pricing_eligible = 'yes'; return 'DEMO-LINK-003'; },
    (raw) => { raw.listing_transaction_links[4].pricing_eligible = 'yes'; return 'DEMO-LINK-005'; },
    (raw) => { raw.transactions[1].currency = 'USD'; return 'DEMO-LINK-002'; },
    (raw) => { raw.transactions[1].area_basis = 'internal'; return 'DEMO-LINK-002'; },
    (raw) => { raw.transactions[1].date_basis = 'unknown'; return 'DEMO-LINK-002'; },
    (raw) => { raw.transactions[1].area_name = 'Downtown Dubai'; return 'DEMO-LINK-002'; },
    (raw) => { raw.listing_transaction_links[1].verification_status = 'needs_review'; return 'DEMO-LINK-002'; },
  ];
  for (const mutate of cases) {
    const raw = clone(), id = mutate(raw);
    assert.ok(!validateDataset(raw).listing_transaction_links.some((row) => row.link_id === id));
  }
  const dataset = validateDataset(clone());
  assert.equal(dataset.listing_transaction_links.find((row) => row.link_id === 'DEMO-LINK-003').pricing_eligible, 'no');
});

test('business references need evidence, correct links and confirmed review for product data', () => {
  const raw = clone();
  raw.match_reference[0].pricing_link_ids = ['DEMO-LINK-004'];
  raw.match_reference[1].intent_assessment = 'high';
  raw.match_reference[1].intent_basis = null;
  raw.match_reference[5].listing_id = 'DEMO-L-004';
  const dataset = validateDataset(raw);
  for (const id of ['DEMO-M-001', 'DEMO-M-002', 'DEMO-M-006']) assert.ok(!dataset.match_reference.some((row) => row.case_id === id));
  const product = toProduct(clone());
  product.match_reference[0].review_status = 'draft';
  assert.ok(!validateDataset(product, { mode: 'product' }).match_reference.some((row) => row.case_id === 'DEMO-M-001'));
});

test('demo and real directories never silently mix data; unexpected fields are not leaked', () => {
  const demo = clone();
  demo.listing_snapshots[1].data_kind = 'real_public';
  demo.listing_snapshots[2]['PRIVATE-UNEXPECTED-KEY'] = 'PRIVATE-UNEXPECTED-VALUE';
  const dataset = validateDataset(demo);
  assert.ok(!dataset.listing_snapshots.some((row) => ['DEMO-L-002', 'DEMO-L-003'].includes(row.listing_id)));
  assert.ok(!JSON.stringify(dataset).includes('PRIVATE-UNEXPECTED'));
  assert.equal(validateDataset(clone(), { mode: 'product' }).listing_snapshots.length, 0);
});

test('CSV errors and disallowed source paths return safe actionable messages', async (t) => {
  const directory = await temporarySource(t);
  await writeFile(path.join(directory, 'listing_snapshots.csv'), 'PRIVATE-HEADER,wrong\nPRIVATE-CONTENT,value', 'utf8');
  await assert.rejects(loadDataset(directory), (error) => error instanceof DataImportError && error.code === 'INVALID_CSV_HEADER' && !error.message.includes('PRIVATE-'));
  const header = SCHEMA.tables[0].fields.map((field) => field.key).join(',');
  await writeFile(path.join(directory, 'listing_snapshots.csv'), `${header}\n"PRIVATE-UNCLOSED`, 'utf8');
  await assert.rejects(loadDataset(directory), (error) => error.code === 'INVALID_CSV' && !error.message.includes('PRIVATE-'));
  await assert.rejects(loadDataset(path.join(WORKSPACE_ROOT, 'package.json')), (error) => error.code === 'UNSAFE_DATA_PATH');
});

test('live API reflects file replacements, remains GET-only, and exposes no raw parse errors', async (t) => {
  const directory = await temporarySource(t), dataPath = path.join(directory, 'dataset.json');
  const raw = toProduct(clone());
  await writeFile(dataPath, JSON.stringify(raw), 'utf8');
  const server = createApiServer({ dataPath });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/dataset`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).listing_snapshots[0].asking_price, 2450000);
  raw.listing_snapshots[0].asking_price = 2500000;
  await writeFile(dataPath, JSON.stringify(raw), 'utf8');
  assert.equal((await (await fetch(`${base}/api/dataset`)).json()).listing_snapshots[0].asking_price, 2500000);
  assert.equal((await fetch(`${base}/api/dataset`, { method: 'POST' })).status, 405);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).assistant_mode, 'rules');
  await writeFile(dataPath, '{"PRIVATE-PARSE-TEXT":', 'utf8');
  const bad = await fetch(`${base}/api/dataset`);
  assert.equal(bad.status, 503);
  const body = await bad.text();
  assert.ok(body.includes('INVALID_JSON'));
  assert.ok(!body.includes('PRIVATE-PARSE-TEXT'));
  assert.ok(!body.includes(directory));
});
