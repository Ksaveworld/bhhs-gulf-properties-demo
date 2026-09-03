import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_NAMES, WORKSPACE_ROOT, validateDataset } from '../apps/api/ingest.mjs';

const within = (file, root) => {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Copy only a wholly synthetic, validated batch. Existing content is never silently replaced. */
export async function prepareDemoBatch(source, batchKey) {
  if (!/^[a-zA-Z0-9_-]+$/.test(batchKey ?? '')) throw new Error('Use a simple batch key with letters, digits, hyphens or underscores.');
  const sourcePath = await realpath(path.resolve(WORKSPACE_ROOT, source));
  if (!['data/incoming', 'data/private'].some(folder => within(sourcePath, path.resolve(WORKSPACE_ROOT, folder)))) {
    throw new Error('Prepare a retained JSON batch from data/incoming or data/private.');
  }
  const bytes = await readFile(sourcePath);
  const raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  // Retained source JSON contains the five contract tables. Validator output (including meta)
  // and arbitrary attachments are not copied into the runtime demo directory.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !TABLE_NAMES.includes(key))) {
    throw new Error('Batch JSON must contain only the five contract tables; metadata and unknown top-level keys are not accepted.');
  }
  if (TABLE_NAMES.some(table => !Array.isArray(raw[table]) || raw[table].some(row => row?.data_kind !== 'demo'))) {
    throw new Error('Batch must contain only explicit demo records in all five tables.');
  }
  const accepted = validateDataset(raw, { mode: 'demo' });
  if (accepted.meta.quarantined_count) throw new Error('Resolve demo import issues before preparing the runtime copy. No statuses were changed.');
  const outputRoot = path.resolve(WORKSPACE_ROOT, 'data/demo/intake-local');
  await mkdir(outputRoot, { recursive: true });
  if (await realpath(outputRoot) !== outputRoot) throw new Error('The local demo root cannot be a redirected path.');
  const directory = path.join(outputRoot, batchKey);
  await mkdir(directory, { recursive: true });
  if (await realpath(directory) !== directory) throw new Error('The batch directory cannot be a redirected path.');
  const target = path.join(directory, 'dataset.json');
  const existing = await readFile(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && digest(existing) !== digest(bytes)) throw new Error('A different batch already exists. Choose a new batch key; original copies are preserved.');
  if (!existing) await writeFile(target, bytes, { flag: 'wx' });
  return { target: path.relative(WORKSPACE_ROOT, target), sha256: digest(bytes), counts: Object.fromEntries(TABLE_NAMES.map(table => [table, accepted[table].length])) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareDemoBatch(process.argv[2], process.argv[3]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof SyntaxError ? 'Batch JSON could not be parsed.' : error.message);
    process.exitCode = 1;
  });
}
