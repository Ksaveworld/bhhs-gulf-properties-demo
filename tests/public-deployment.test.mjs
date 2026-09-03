import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, TABLE_NAMES, validateDataset, WORKSPACE_ROOT } from '../apps/api/ingest.mjs';
import { assertPublicDemo, exportPublicDemo } from '../tools/export-public-demo.mjs';

const execFileAsync = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL('../data/demo/dataset.json', import.meta.url), 'utf8'));
const scriptPath = fileURLToPath(new URL('../tools/export-public-demo.mjs', import.meta.url));

async function temporaryDirectory(t, parent = '.work') {
  const base = path.resolve(WORKSPACE_ROOT, parent);
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'public-deployment-test-'));
  t.after(async () => {
    const relative = path.relative(base, path.resolve(directory));
    assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'cleanup stays inside the test parent directory');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function setDataEnvironment(t, value) {
  const previous = process.env.BHHS_DATA_DIR;
  process.env.BHHS_DATA_DIR = value;
  t.after(() => {
    if (previous === undefined) delete process.env.BHHS_DATA_DIR;
    else process.env.BHHS_DATA_DIR = previous;
  });
}

async function assertSnapshot(directory) {
  assert.deepEqual((await readdir(directory)).sort(), ['dataset.json', 'health.json']);
  const dataset = JSON.parse(await readFile(path.join(directory, 'dataset.json'), 'utf8'));
  const health = JSON.parse(await readFile(path.join(directory, 'health.json'), 'utf8'));
  const expected = await loadDataset('data/demo/dataset.json');
  assertPublicDemo(dataset);
  for (const table of TABLE_NAMES) assert.deepEqual(dataset[table], expected[table]);
  assert.equal(dataset.meta.label, expected.meta.label);
  assert.deepEqual(dataset.meta.warnings, expected.meta.warnings);
  assert.deepEqual(health, {
    status: 'ok', mode: 'demo', assistant_mode: 'rules', quarantined_count: 0,
    loaded_at: dataset.meta.loaded_at, delivery: 'static_demo_snapshot',
  });
  assert.ok(Number.isFinite(Date.parse(health.loaded_at)));
  return dataset;
}

test('public export ignores a configured private dataset and writes only the paired demo snapshot files', async (t) => {
  const directory = await temporaryDirectory(t);
  const privateDirectory = await temporaryDirectory(t, 'data/private');
  const privatePath = path.join(privateDirectory, 'dataset.json');
  const privateFixture = structuredClone(fixture);
  for (const table of TABLE_NAMES) for (const row of privateFixture[table]) row.data_kind = 'real_authorized';
  privateFixture.listing_snapshots[0].source_name = 'SYNTHETIC-PRIVATE-PATH-TEST-SENTINEL';
  await writeFile(privatePath, JSON.stringify(privateFixture), 'utf8');
  setDataEnvironment(t, privatePath);
  assert.equal((await loadDataset()).meta.mode, 'product', 'the ordinary local loader still honors the configured product source');
  const result = await exportPublicDemo(directory);
  assert.equal(result.directory, directory);
  const snapshot = await assertSnapshot(directory);
  assert.ok(!JSON.stringify(snapshot).includes('SYNTHETIC-PRIVATE-PATH-TEST-SENTINEL'));
  assert.equal(process.env.BHHS_DATA_DIR, privatePath, 'the exporter does not rewrite the local API configuration');
});

test('a missing BHHS_DATA_DIR cannot redirect or prevent the fixed demo export', async (t) => {
  const directory = await temporaryDirectory(t);
  setDataEnvironment(t, path.join(WORKSPACE_ROOT, 'data/private', 'missing-public-export-test', 'dataset.json'));
  await assert.rejects(loadDataset(), (error) => error.code === 'DATA_NOT_FOUND');
  await exportPublicDemo(directory);
  await assertSnapshot(directory);
});

test('public guard rejects product mode, real rows in any contract table, missing tables and quarantined rows', async () => {
  const demo = await loadDataset('data/demo/dataset.json');
  assert.doesNotThrow(() => assertPublicDemo(demo));
  assert.throws(() => assertPublicDemo({ ...demo, meta: { ...demo.meta, mode: 'product' } }), /demo mode/);
  for (const table of TABLE_NAMES) {
    for (const kind of ['real_public', 'real_authorized', undefined]) {
      const changed = structuredClone(demo);
      changed[table][0].data_kind = kind;
      assert.throws(() => assertPublicDemo(changed), /only demo rows/);
    }
    const missing = structuredClone(demo);
    delete missing[table];
    assert.throws(() => assertPublicDemo(missing), /only demo rows/);
  }
  assert.throws(() => assertPublicDemo({ ...demo, meta: { ...demo.meta, quarantined_count: 1 } }), /zero quarantined rows/);
  assert.throws(() => assertPublicDemo({ ...demo, meta: { ...demo.meta, quarantined_count: undefined } }), /zero quarantined rows/);
  const mixed = structuredClone(fixture);
  mixed.transactions[0].data_kind = 'real_public';
  const quarantined = validateDataset(mixed);
  assert.ok(quarantined.meta.quarantined_count > 0);
  assert.throws(() => assertPublicDemo(quarantined), /zero quarantined rows/, 'rejected real rows cannot be silently removed to create a partial public export');
});

test('the CLI resolves relative output from its own project when invoked outside the project directory', async (t) => {
  const directory = await temporaryDirectory(t);
  const outputDirectory = path.join(directory, 'snapshot');
  const relativeOutput = path.relative(WORKSPACE_ROOT, outputDirectory);
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, relativeOutput], {
    cwd: directory,
    env: { ...process.env, BHHS_DATA_DIR: path.join(directory, 'missing-private-source.json') },
  });
  assert.equal(stdout.trim(), 'Exported public demo snapshot: dataset.json and health.json.');
  assert.equal(stderr, '');
  await assertSnapshot(outputDirectory);
});
