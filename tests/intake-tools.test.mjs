import test from 'node:test';
import assert from 'node:assert/strict';
import { link, lstat, mkdir, readFile, readdir, realpath, symlink, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WORKSPACE_ROOT, validateDataset } from '../apps/api/ingest.mjs';
import { prepareDemoBatch } from '../tools/prepare-demo-batch.mjs';
import { compareReferences, comparisonMarkdown, writeComparisonReport } from '../tools/compare-match-references.mjs';

const fixture = JSON.parse(await readFile(new URL('../data/demo/dataset.json', import.meta.url), 'utf8'));

async function temporaryIntake(t, prefix) {
  const root = path.resolve(WORKSPACE_ROOT, 'data/incoming');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, prefix));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(directory)), await realpath(root));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('preparation preserves pure demo bytes, rejects mixed records and never overwrites a different prepared copy', async t => {
  const sourceRoot = path.resolve(WORKSPACE_ROOT, 'data/incoming');
  const directory = await mkdtemp(path.join(sourceRoot, 'prepare-test-'));
  const key = `test-${randomUUID()}`;
  const targetDirectory = path.resolve(WORKSPACE_ROOT, 'data/demo/intake-local', key);
  t.after(async () => {
    assert.equal(path.dirname(directory), sourceRoot);
    assert.equal(path.dirname(targetDirectory), path.resolve(WORKSPACE_ROOT, 'data/demo/intake-local'));
    await rm(directory, { recursive: true, force: true });
    await rm(targetDirectory, { recursive: true, force: true });
  });
  const source = path.join(directory, 'dataset.json');
  const bytes = `${JSON.stringify(fixture)}\n`;
  await writeFile(source, bytes);
  const result = await prepareDemoBatch(source, key);
  assert.equal(await readFile(source, 'utf8'), bytes);
  assert.equal(await readFile(path.resolve(WORKSPACE_ROOT, result.target), 'utf8'), bytes);
  assert.deepEqual(await prepareDemoBatch(source, key), result);
  const changed = structuredClone(fixture);
  changed.client_requirements[0].area_basis = 'internal';
  await writeFile(source, JSON.stringify(changed));
  await assert.rejects(prepareDemoBatch(source, key), /different batch already exists/);
  changed.client_requirements[0].data_kind = 'real_public';
  await writeFile(source, JSON.stringify(changed));
  await assert.rejects(prepareDemoBatch(source, key), /only explicit demo/);
  assert.equal(await readFile(path.resolve(WORKSPACE_ROOT, result.target), 'utf8'), bytes);
});

test('preparation rejects extra top-level attachments and metadata without copying or changing retained input', async t => {
  const directory = await temporaryIntake(t, 'prepare-keys-test-');
  const source = path.join(directory, 'dataset.json');
  const key = `test-keys-${randomUUID()}`;
  const targetDirectory = path.resolve(WORKSPACE_ROOT, 'data/demo/intake-local', key);
  t.after(async () => {
    assert.equal(path.dirname(targetDirectory), path.resolve(WORKSPACE_ROOT, 'data/demo/intake-local'));
    await rm(targetDirectory, { recursive: true, force: true });
  });
  for (const additional of [
    { unreviewed_attachment: { data_kind: 'real_authorized', note: 'Invented attachment for boundary testing; no personal data.' } },
    { meta: { mode: 'demo', note: 'Validator metadata is not an accepted source table.' } },
  ]) {
    const bytes = `${JSON.stringify({ ...fixture, ...additional })}\n`;
    await writeFile(source, bytes);
    await assert.rejects(prepareDemoBatch(source, key), /only the five contract tables/);
    assert.equal(await readFile(source, 'utf8'), bytes);
    await assert.rejects(readFile(path.join(targetDirectory, 'dataset.json')), { code: 'ENOENT' });
  }
});

test('report writing rejects an output that is the source file and preserves its exact bytes', async t => {
  const directory = await temporaryIntake(t, 'report-source-test-');
  const source = path.join(directory, 'candidate-comparison.json');
  const bytes = `${JSON.stringify(fixture)}\n`;
  await writeFile(source, bytes);
  const report = compareReferences(validateDataset(fixture));
  await assert.rejects(writeComparisonReport(source, directory, report), /overwrite the source file/);
  assert.equal(await readFile(source, 'utf8'), bytes);
  await assert.rejects(readFile(path.join(directory, '候选对照报告.md')), { code: 'ENOENT' });
});

test('report writing rejects symbolic output redirection without touching the linked original', async t => {
  const directory = await temporaryIntake(t, 'report-symlink-test-');
  const retained = path.join(directory, 'retained');
  await mkdir(retained);
  const source = path.join(retained, 'source.json');
  const bytes = `${JSON.stringify(fixture)}\n`;
  await writeFile(source, bytes);
  const redirected = path.join(directory, 'candidate-comparison.json');
  try {
    await symlink(source, redirected, 'file');
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    // Windows without file-symlink privileges still supports directory junctions, which must also be rejected.
    await symlink(retained, redirected, 'junction');
    t.diagnostic('File symlink privilege unavailable; verified rejection with a Windows junction.');
  }
  assert.equal((await lstat(redirected)).isSymbolicLink(), true);
  await assert.rejects(writeComparisonReport(source, directory, compareReferences(validateDataset(fixture))), /symbolic links.*redirection/);
  assert.equal(await readFile(source, 'utf8'), bytes);
  assert.equal((await lstat(redirected)).isSymbolicLink(), true);
  await assert.rejects(readFile(path.join(directory, '候选对照报告.md')), { code: 'ENOENT' });
});

test('both report destinations are checked before writing and hard-linked originals stay unchanged', async t => {
  const directory = await temporaryIntake(t, 'report-hardlink-test-');
  const source = path.join(directory, 'dataset.json');
  const sourceBytes = `${JSON.stringify(fixture)}\n`;
  const priorReportBytes = 'Previous derived report, preserved when the other destination is unsafe.\n';
  await writeFile(source, sourceBytes);
  await writeFile(path.join(directory, 'candidate-comparison.json'), priorReportBytes);
  await link(source, path.join(directory, '候选对照报告.md'));
  await assert.rejects(writeComparisonReport(source, directory, compareReferences(validateDataset(fixture))), /hard links/);
  assert.equal(await readFile(source, 'utf8'), sourceBytes);
  assert.equal(await readFile(path.join(directory, 'candidate-comparison.json'), 'utf8'), priorReportBytes);
  assert.equal(await readFile(path.join(directory, '候选对照报告.md'), 'utf8'), sourceBytes);
});

test('a directory source can receive and refresh derived reports alongside unchanged original data', async t => {
  const directory = await temporaryIntake(t, 'report-directory-test-');
  const source = path.join(directory, 'dataset.json');
  const bytes = `${JSON.stringify(fixture)}\n`;
  await writeFile(source, bytes);
  const report = compareReferences(validateDataset(fixture));
  const result = await writeComparisonReport(directory, directory, report);
  assert.equal(await readFile(source, 'utf8'), bytes);
  assert.deepEqual(JSON.parse(await readFile(result.json, 'utf8')), report);
  assert.match(await readFile(result.markdown, 'utf8'), /不提供业务通过率/);
  const updated = { ...report, generated_at: '2027-01-02T00:00:00.000Z' };
  await writeComparisonReport(directory, directory, updated);
  assert.deepEqual(JSON.parse(await readFile(result.json, 'utf8')), updated);
  assert.equal(await readFile(source, 'utf8'), bytes);
  assert.deepEqual((await readdir(directory)).sort(), ['candidate-comparison.json', 'dataset.json', '候选对照报告.md'].sort());
});

test('all reference rows receive explanations while draft labels cannot influence candidates or mutate data', () => {
  const dataset = validateDataset(fixture);
  const before = structuredClone(dataset);
  const report = compareReferences(dataset);
  assert.equal(report.cases.length, dataset.match_reference.length);
  const changed = structuredClone(dataset);
  for (const row of changed.match_reference) { row.expected_result = 'recommend'; row.expected_rank = 1; row.review_status = 'draft'; row.matched_conditions = 'Invented review label only'; }
  const second = compareReferences(changed);
  assert.deepEqual(second.requirements, report.requirements);
  assert.equal(second.summary.drafts, changed.match_reference.length);
  assert.ok(second.cases.every(row => row.differences.some(reason => reason.includes('draft'))));
  assert.match(comparisonMarkdown(second), /不提供业务通过率/);
  assert.deepEqual(dataset, before);
});

test('a suggested target lacking area basis is reported as pending rather than a fabricated match', () => {
  const input = structuredClone(fixture);
  input.client_requirements[0].area_basis = null;
  input.client_requirements[0].hard_constraints = '必须带停车位';
  input.match_reference = [{ ...input.match_reference[0], review_status: 'draft', expected_result: 'recommend', requirement_id: input.client_requirements[0].requirement_id, listing_id: 'DEMO-L-001', pricing_link_ids: null }];
  const report = compareReferences(validateDataset(input));
  assert.equal(report.summary.recommended_targets_outside_candidates, 1);
  assert.ok(report.cases[0].missing_fields.includes('area_basis'));
  assert.equal(report.cases[0].target_is_candidate, false);
  assert.equal(report.cases[0].assessment.status, 'review');
  assert.ok(report.cases[0].assessment.unknowns.some(message => message.includes('Area basis needs confirmation')));
});

test('case comparison reports missing basis for a maximum-only size requirement', () => {
  const input = structuredClone(fixture);
  Object.assign(input.client_requirements[0], { area_min: null, area_max: 1500, area_basis: null, area_unit: 'sqft', hard_constraints: null });
  const report = compareReferences(validateDataset(input));
  const requirement = report.requirements.find(row => row.requirement_id === input.client_requirements[0].requirement_id);
  assert.ok(requirement.missing_fields.includes('area_basis'));
  assert.equal(requirement.candidates.length, 0);
});
