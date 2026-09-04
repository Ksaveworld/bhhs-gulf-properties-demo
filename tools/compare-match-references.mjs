import { lstat, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, WORKSPACE_ROOT } from '../apps/api/ingest.mjs';
import { evaluateMatch, filterListings, latestListings, requirementsToFilters, requirementTextReview } from '../shared/matching.ts';
import { requirementAreaWarnings, resolveRequirementArea } from '../shared/requirement-area.ts';
import { getPriceEvidence } from '../shared/pricing.ts';

/** Reference labels are compared after deterministic results, and never feed the calculation. */
export function compareReferences(dataset) {
  const listings = latestListings(dataset.listing_snapshots);
  const requirements = dataset.client_requirements.map(requirement => {
    const area = resolveRequirementArea(requirement);
    const text = requirementTextReview(requirement);
    const candidates = filterListings(listings, requirementsToFilters(requirement)).map(row => row.listing_id);
    const missing = [
      ...((requirement.area_min !== null || requirement.area_max != null) && area.status !== 'known' ? ['area_basis'] : []),
      ...((requirement.area_min !== null || requirement.area_max != null) && !requirement.area_unit ? ['area_unit'] : []),
      ...(!requirement.currency ? ['currency'] : []),
      ...(requirement.budget_min === null && requirement.budget_max === null ? ['budget_min/budget_max'] : []),
      ...(!requirement.purchase_by ? ['purchase_by'] : []), ...(!requirement.move_in_by ? ['move_in_by'] : []),
      ...(text.warnings.length ? ['raw_request / hard_constraints 与结构字段确认'] : []),
    ];
    return {
      requirement_id: requirement.requirement_id, area, candidates, missing_fields: missing,
      warnings: [...requirementAreaWarnings(requirement), ...text.warnings], equivalent_conditions: text.equivalents,
      evaluations: listings.map(listing => evaluateMatch(listing, requirement)),
    };
  });
  const cases = dataset.match_reference.map(reference => {
    const requirement = requirements.find(row => row.requirement_id === reference.requirement_id);
    const assessment = requirement?.evaluations.find(row => row.listing_id === reference.listing_id) ?? null;
    const candidate = reference.listing_id ? requirement?.candidates.includes(reference.listing_id) ?? false : null;
    const differences = [];
    if (reference.review_status !== 'confirmed') differences.push('人工参考仍为 draft；本次不计算业务验收通过率。');
    if (!requirement) differences.push('需求缺失或已隔离，无法对照。');
    else {
      if (['recommend', 'alternative'].includes(reference.expected_result) && !candidate) differences.push('推荐/备选目标未进入当前结构筛选候选。');
      if (['recommend', 'alternative'].includes(reference.expected_result) && assessment?.status !== 'match') differences.push('目标仍有冲突或待确认信息，不能表述为全部条件满足。');
      if (reference.expected_result === 'exclude') differences.push(candidate ? '人工排除的目标仍是结构候选，需核对排除理由及硬性程度。' : '目标不在结构候选中；这不等于已确认人工排除理由正确。');
      if (reference.expected_result === 'no_match') differences.push(requirement.candidates.length ? '存在结构候选，人工 no_match 需复核。' : '结构候选为空；缺口径或其他未确认条件时，不能据此确认业务上无房可选。');
      if (reference.expected_result === 'needs_clarification') differences.push('展示当前候选和待补字段供人工确认，不将草稿标签当作已签字结论。');
    }
    return {
      case_id: reference.case_id, requirement_id: reference.requirement_id, listing_id: reference.listing_id,
      expected_result: reference.expected_result, review_status: reference.review_status,
      actual_candidates: requirement?.candidates ?? [], target_is_candidate: candidate,
      assessment, differences, missing_fields: requirement?.missing_fields ?? ['requirement_id'],
      requirement_warnings: requirement?.warnings ?? [],
      draft_matched_conditions: reference.matched_conditions,
      draft_conflicting_conditions: reference.conflicting_conditions,
      draft_follow_up_questions: reference.follow_up_questions,
    };
  });
  return {
    generated_at: new Date().toISOString(), data_mode: dataset.meta.mode,
    quarantined_count: dataset.meta.quarantined_count,
    summary: {
      references: cases.length, drafts: cases.filter(row => row.review_status === 'draft').length,
      recommended_targets_outside_candidates: cases.filter(row => ['recommend', 'alternative'].includes(row.expected_result) && !row.target_is_candidate).length,
      requirements_missing_area_basis: requirements.filter(row => row.missing_fields.includes('area_basis')).length,
    }, requirements, cases,
    history: listings.map(listing => {
      const evidence = getPriceEvidence(listing, dataset);
      return { listing_id: listing.listing_id, same_property_sales: [...new Set(evidence.history.map(row => row.transaction.transaction_id))], comparable_sales: [...new Set(evidence.comparables.map(row => row.transaction.transaction_id))] };
    }),
  };
}

const escape = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
export function comparisonMarkdown(report) {
  const lines = [
    '# 草稿人工参考与实际候选对照', '',
    `生成时间：${report.generated_at}。数据模式：${report.data_mode}；隔离：${report.quarantined_count}。`, '',
    `本报告含 ${report.summary.references} 条参考，${report.summary.drafts} 条 draft。推荐/备选未进入结构候选：${report.summary.recommended_targets_outside_candidates} 条；有面积条件但口径未确认：${report.summary.requirements_missing_area_basis} 份需求。`, '',
    '结构筛选候选与“条件已全部满足”分开。原文、硬条件、产品草稿均保留；不根据预期标签回填字段或放宽规则。此处不提供业务通过率。', '',
    '| 案例 | 人工预期 / 状态 | 目标挂牌 | 实际结构候选 | 目标评估 | 产品待补字段 |', '|---|---|---|---|---|---|',
    ...report.cases.map(row => `| ${row.case_id} | ${row.expected_result} / ${row.review_status} | ${row.listing_id ?? '—'} | ${row.actual_candidates.join(', ') || '无'} | ${row.assessment?.status ?? '无指定目标'} | ${row.missing_fields.join(', ')} |`),
  ];
  for (const row of report.cases) lines.push('', `## ${row.case_id}`, '',
    `需求：${row.requirement_id}；目标：${row.listing_id ?? '无'}。`, '',
    ...row.differences.map(value => `- ${value}`),
    `- 当前候选：${row.actual_candidates.join('、') || '无'}。`,
    `- 需要产品补充：${row.missing_fields.join('、') || '依原文逐项确认'}。`,
    `- 草稿“满足”理由：${escape(row.draft_matched_conditions)}`,
    `- 草稿“冲突”理由：${escape(row.draft_conflicting_conditions)}`,
    ...[...(row.assessment?.conflicts ?? []), ...(row.assessment?.unknowns ?? row.requirement_warnings)].map(value => `- 实际原因 / 待确认：${escape(value)}`));
  lines.push('', '## 成交历史覆盖', '', '| 挂牌 | 同屋成交ID | 可比成交ID |', '|---|---|---|',
    ...report.history.map(row => `| ${row.listing_id} | ${row.same_property_sales.join(', ') || '无'} | ${row.comparable_sales.join(', ') || '无'} |`), '',
    '购房/入住日期留空就保持 Unknown；本批无多笔同屋成交时，沿用既有主演示用例验证日期排序与多笔成交图，不向本批补造记录。', '');
  return lines.join('\n');
}

/** Write derived reports locally without overwriting a source file or following an existing output link. */
export async function writeComparisonReport(source, outputDirectory, report) {
  const requestedDirectory = path.resolve(WORKSPACE_ROOT, outputDirectory);
  const directory = await realpath(requestedDirectory);
  if (path.relative(requestedDirectory, directory) !== '') throw new Error('Report directory cannot be a redirected path.');
  if (!['data/incoming', 'data/private', '.work'].some(folder => {
    const relative = path.relative(path.resolve(WORKSPACE_ROOT, folder), directory);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  })) throw new Error('Case reports must remain in an existing local intake/private/work subdirectory.');
  if (!(await stat(directory)).isDirectory()) throw new Error('Report output must be an existing directory.');
  const sourcePath = await realpath(path.resolve(WORKSPACE_ROOT, source));
  const sourceIsFile = (await stat(sourcePath)).isFile();
  const outputs = [
    { target: path.join(directory, 'candidate-comparison.json'), contents: `${JSON.stringify(report, null, 2)}\n` },
    { target: path.join(directory, '候选对照报告.md'), contents: comparisonMarkdown(report) },
  ];
  async function checkOutput(target) {
    if (sourceIsFile && path.relative(sourcePath, target) === '') throw new Error('Report output would overwrite the source file.');
    const entry = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!entry) return;
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink > 1) throw new Error('Existing report output must be a regular file without symbolic links, hard links or redirection.');
    const actual = await realpath(target);
    if (path.relative(target, actual) !== '') throw new Error('Existing report output cannot be a redirected path.');
    if (sourceIsFile && path.relative(sourcePath, actual) === '') throw new Error('Report output would overwrite the source file.');
  }
  // Validate both destinations before writing either report; a bad second destination preserves the first.
  for (const { target } of outputs) await checkOutput(target);
  const temporary = [];
  try {
    for (const output of outputs) {
      const temp = path.join(directory, `.${path.basename(output.target)}.${randomUUID()}.tmp`);
      await writeFile(temp, output.contents, { encoding: 'utf8', flag: 'wx' });
      temporary.push(temp);
    }
    for (const { target } of outputs) await checkOutput(target);
    for (let index = 0; index < outputs.length; index++) await rename(temporary[index], outputs[index].target);
  } finally {
    await Promise.all(temporary.map(temp => unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; })));
  }
  return { json: outputs[0].target, markdown: outputs[1].target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node --import tsx tools/compare-match-references.mjs <data-path> <existing-private-output-dir>');
    const report = compareReferences(await loadDataset(process.argv[2]));
    await writeComparisonReport(process.argv[2], process.argv[3], report);
    console.log(JSON.stringify(report.summary, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
