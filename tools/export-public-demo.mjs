import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, TABLE_NAMES } from '../apps/api/ingest.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultOutputDirectory = fileURLToPath(new URL('../apps/web/dist/api/', import.meta.url));

/** Public build output contains only validated synthetic examples; the local API stays independent. */
export function assertPublicDemo(dataset) {
  if (dataset?.meta?.mode !== 'demo') {
    throw new Error('Public export requires demo mode.');
  }
  if (dataset.meta.quarantined_count !== 0) {
    throw new Error('Public export requires zero quarantined rows.');
  }
  for (const table of TABLE_NAMES) {
    if (!Array.isArray(dataset[table]) || dataset[table].some((row) => !row || row.data_kind !== 'demo')) {
      throw new Error(`Public export requires only demo rows in ${table}.`);
    }
  }
}

export async function exportPublicDemo(outputDirectory = defaultOutputDirectory) {
  // Never inherit BHHS_DATA_DIR: a developer's local product data is not a public-build source.
  const dataset = await loadDataset('data/demo/dataset.json');
  assertPublicDemo(dataset);
  const health = {
    status: 'ok',
    mode: dataset.meta.mode,
    assistant_mode: 'rules',
    quarantined_count: dataset.meta.quarantined_count,
    loaded_at: dataset.meta.loaded_at,
    delivery: 'static_demo_snapshot',
  };
  const directory = path.resolve(projectRoot, outputDirectory);
  const datasetPath = path.join(directory, 'dataset.json');
  const healthPath = path.join(directory, 'health.json');
  await mkdir(directory, { recursive: true });
  await writeFile(datasetPath, `${JSON.stringify(dataset)}\n`, 'utf8');
  await writeFile(healthPath, `${JSON.stringify(health)}\n`, 'utf8');
  return { directory, datasetPath, healthPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportPublicDemo(process.argv[2]).then(() => {
    console.log('Exported public demo snapshot: dataset.json and health.json.');
  }).catch(() => {
    // Source contents, configured private paths and raw parser errors never enter deployment logs.
    console.error('Public demo export failed. Check the synthetic fixture and writable build output directory.');
    process.exitCode = 1;
  });
}
