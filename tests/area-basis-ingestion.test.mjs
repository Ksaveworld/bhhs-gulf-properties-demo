import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { SCHEMA, TABLE_NAMES, WORKSPACE_ROOT, loadDataset, validateDataset } from '../apps/api/ingest.mjs';

const fixture = JSON.parse(await readFile(new URL('../data/demo/dataset.json', import.meta.url), 'utf8'));

test('v1 JSON without client area_basis is accepted and normalized to null', () => {
  const input = structuredClone(fixture);
  input.client_requirements.forEach(row => delete row.area_basis);
  const result = validateDataset(input);
  assert.equal(result.meta.quarantined_count, 0);
  assert.ok(result.client_requirements.every(row => row.area_basis === null));
  assert.equal(result.client_requirements[0].hard_constraints, input.client_requirements[0].hard_constraints);
});

test('v1.1 accepts all shared area bases and does not quarantine source disagreements', () => {
  for (const basis of [null, 'unknown', 'internal', 'gross', 'built_up', 'land']) {
    const input = structuredClone(fixture);
    input.client_requirements[0].area_basis = basis;
    input.client_requirements[0].hard_constraints = 'area basis: internal';
    const result = validateDataset(input);
    assert.equal(result.meta.quarantined_count, 0);
    assert.equal(result.client_requirements[0].area_basis, basis);
    assert.equal(result.client_requirements[0].hard_constraints, 'area basis: internal');
  }
});

test('invalid client basis is withheld with dependent references; real-data gates remain enforced', () => {
  const input = structuredClone(fixture);
  input.client_requirements[0].area_basis = 'square_feet';
  const result = validateDataset(input);
  assert.ok(!result.client_requirements.some(row => row.requirement_id === input.client_requirements[0].requirement_id));
  assert.match(result.meta.warnings.join('\n'), /area_basis: invalid option/);
  const product = structuredClone(fixture);
  TABLE_NAMES.forEach(table => product[table].forEach(row => { row.data_kind = 'real_authorized'; }));
  product.client_requirements[0].usage_status = 'pending';
  product.client_requirements[0].area_basis = 'built_up';
  assert.ok(!validateDataset(product, { mode: 'product' }).client_requirements.some(row => row.requirement_id === product.client_requirements[0].requirement_id));
});

test('old and new CSV headers both load, with versioned empty templates matching their schema', async (t) => {
  const base = path.resolve(WORKSPACE_ROOT, 'data/demo');
  const directory = await mkdtemp(path.join(base, 'area-contract-test-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), base);
    await rm(directory, { recursive: true, force: true });
  });
  for (const version of ['1.0.0', '1.1.0']) {
    const versionSchema = JSON.parse(await readFile(new URL(`../data/templates/v${version}/schema.json`, import.meta.url), 'utf8'));
    assert.equal(versionSchema.version, version);
    for (const table of versionSchema.tables) {
      const keys = table.fields.map(field => field.key);
      const template = (await readFile(new URL(`../data/templates/v${version}/${table.key}.csv`, import.meta.url), 'utf8')).replace(/^\uFEFF/, '').trim();
      assert.equal(template, keys.join(','));
      const cell = value => `"${(Array.isArray(value) ? value.join('|') : value ?? '').toString().replaceAll('"', '""')}"`;
      const rows = fixture[table.key].map(row => ({ ...row, ...(table.key === 'client_requirements' ? { area_basis: 'built_up' } : {}) }));
      await writeFile(path.join(directory, `${table.key}.csv`), `${template}\r\n${rows.map(row => keys.map(key => cell(row[key])).join(',')).join('\r\n')}\r\n`, 'utf8');
    }
    const result = await loadDataset(directory);
    assert.equal(result.meta.quarantined_count, 0, result.meta.warnings.join('\n'));
    assert.equal(result.client_requirements[0].area_basis, version === '1.0.0' ? null : 'built_up');
  }
  const clientField = SCHEMA.tables.find(table => table.key === 'client_requirements').fields.find(field => field.key === 'area_basis');
  const listingField = SCHEMA.tables.find(table => table.key === 'listing_snapshots').fields.find(field => field.key === 'area_basis');
  assert.deepEqual(clientField.options, listingField.options);
  assert.equal(clientField.required, '选填');
});
