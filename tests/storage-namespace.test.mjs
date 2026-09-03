import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { loadDataset, WORKSPACE_ROOT } from '../apps/api/ingest.mjs';

test('API source identity separates identical batches without disclosing paths or changing source records', async t => {
  const root = path.join(WORKSPACE_ROOT, 'data/demo');
  const directory = await mkdtemp(path.join(root, 'storage-scope-test-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(directory)), await realpath(root));
    await rm(directory, { recursive: true, force: true });
  });
  const bytes = await readFile(path.join(root, 'dataset.json'));
  await mkdir(path.join(directory, 'one'));
  await mkdir(path.join(directory, 'two'));
  const first = path.join(directory, 'one/dataset.json');
  const second = path.join(directory, 'two/dataset.json');
  await writeFile(first, bytes); await writeFile(second, bytes);
  const a = await loadDataset(first);
  const refreshed = await loadDataset(path.dirname(first));
  const b = await loadDataset(second);
  assert.match(a.meta.storage_namespace, /^bhhs-source-v1:[a-f0-9]{64}$/);
  assert.equal(a.meta.storage_namespace, refreshed.meta.storage_namespace);
  assert.notEqual(a.meta.storage_namespace, b.meta.storage_namespace);
  assert.deepEqual(a.client_requirements, b.client_requirements);
  assert.equal(a.meta.quarantined_count, 0);
  assert.deepEqual(await readFile(first), bytes);
  const changed = JSON.parse(bytes.toString('utf8'));
  changed.client_requirements[0].notes = 'Independent synthetic version change.';
  await writeFile(first, JSON.stringify(changed));
  const version = await loadDataset(first);
  assert.equal(a.meta.storage_namespace, version.meta.storage_namespace, 'source identity is stable; browser content fingerprint isolates versions');
  assert.notDeepEqual(a.client_requirements, version.client_requirements);
});
