import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

// An explicit root permits running an unchanged copy from the bundled runtime's temporary work directory.
const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../../', import.meta.url));
const spec = JSON.parse(await fs.readFile(path.join(root, 'data/templates/schema.json'), 'utf8'));
const outputDir = path.join(root, `outputs/area-basis-v${spec.version}`);
const versionDir = path.join(root, `data/templates/v${spec.version}`);
const qaDir = path.join(root, `.work/template-qa-v${spec.version}`);
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(versionDir, { recursive: true });
await fs.mkdir(qaDir, { recursive: true });
const wb = Workbook.create();
const color = { navy: '#17384D', teal: '#0C716B', pale: '#E9F3F2', ink: '#243747', gray: '#68798A', line: '#DAE3E8', input: '#1453A0', orange: '#FFF2D8' };
const col = (number) => { let n = number; let s = ''; while (n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
const csvCell = (value) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const csv = (rows) => '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
const title = (sheet, text, detail) => {
  sheet.showGridLines = false;
  sheet.getRange('A1:H1').merge();
  sheet.getRange('A1').values = [[text]];
  sheet.getRange('A1:H1').format = { fill: color.navy, font: { bold: true, color: '#FFFFFF' }, rowHeight: 34 };
  sheet.getRange('A2:H3').merge();
  sheet.getRange('A2').values = [[detail]];
  sheet.getRange('A2:H3').format = { fill: color.pale, font: { color: color.ink }, wrapText: true, rowHeight: 25 };
};

const guide = wb.worksheets.add('00_填写说明');
title(guide, `BHHS｜产品数据交付模板 v${spec.version}`, '产品 A：房源、成交与关联证据　／　产品 B：客户需求与匹配验收。先填写房源挂牌和客户需求，再补成交关联及人工参考。模板不含真实客户、房源或交易记录。');
guide.getRange('A1:H32').format.columnWidth = 16;
guide.getRange('A5:H5').merge();
guide.getRange('A5').values = [['填写表与责任人']];
guide.getRange('A5:H5').format = { fill: color.teal, font: { bold: true, color: '#FFFFFF' }, rowHeight: 26 };
let guideRow = 6;
for (const table of spec.tables) {
  guide.getRange(`A${guideRow}:B${guideRow}`).merge();
  guide.getRange(`A${guideRow}`).values = [[table.sheet]];
  guide.getRange(`C${guideRow}`).values = [[table.owner]];
  guide.getRange(`D${guideRow}:H${guideRow}`).merge();
  guide.getRange(`D${guideRow}`).values = [[table.rowRule]];
  guide.getRange(`A${guideRow}:H${guideRow}`).format = { font: { color: color.ink }, wrapText: true, rowHeight: 45, fill: guideRow % 2 ? '#FFFFFF' : '#F4F7F9' };
  guideRow++;
}
const instructions = [
  ['开始填写', '第 4 行为中文说明（* 必填，△ 条件必填），第 5 行为英文 key。第 6 行开始填数据；不要改表名、英文 key 或顺序。横向滚动查看其余字段；如需固定表头，选 C6 后点“视图→冻结窗格”。'],
  ['空值与草稿', '未知填空，不用 0、N/A 或“未知”填数值/日期列。缺少必填项可保留为采集草稿，但不能作为已核验正式样本导入或验收。选填项不是要求推测补齐。'],
  ['数值与时间', '金额与面积填纯数字，币种与单位独立填写；Studio 卧室数为 0。日期为 Excel 日期（显示 YYYY-MM-DD）；采集/核验时间使用含时区的 ISO 8601 文本。'],
  ['多值字段', '多值使用 | 分隔，例如 pool|parking。不要使用逗号替代分隔符；中文别名与来源字段的映射由产品提供。'],
  ['示例说明', '字段字典中的例子只是各字段的格式示例，彼此独立，不是一条可直接拼接使用的完整记录，也不代表真实客户、房源、成交或已确认业务规则。'],
  ['真实与演示', 'data_kind 必填：real_public / real_authorized / demo。真实客户只提供授权脱敏资料；不填真实电话、邮箱或个人身份标识。演示样例不得冒充事实。'],
  ['来源与使用', '每条房源、成交、客户需求填写 source_ref 和 captured_at。公开数据填原文 URL，内部数据填授权脱敏资料编号。usage_status=approved 才进入对客演示。'],
  ['核验边界', 'verified 需要实际核验人。来源核验与关联核验分开；同楼、面积相似不能确认同一套房。价格参考首版排除抵押、赠与、打包、部分份额和范围不明的记录。'],
  ['关联规则', '房源表的 listing_id 与客户表的 requirement_id 可被后续表引用；transaction_id 只代表一次交易。只有 exact_property 且关联已核验，才能显示该房屋历史。'],
  ['客户判断', '意愿需要具体沟通证据，预算来自客户主动说明；不由身份、社媒或报价反推财富。匹配参考是产品人工答案，不是模型产出，不包含精确成交概率。'],
  ['客户面积口径', 'v1.1.0 新增选填 area_basis。明确字段优先；空字段兼容 hard_constraints 中的英文面积口径；冲突须确认，unknown 不算已知口径，不从候选房源反向补齐。旧版无此列仍可接收。'],
  ['交付方式', '可以直接填写本 Excel。开发端按第 5 行 key、第 6 行起读取非空行；也可填写 data/templates 中仅含一行英文表头的 UTF-8 CSV。'],
  ['保存与 Git', '填写后的真实资料放到 data/incoming/ 或 data/private/，两者不进入 Git。请另存文件，不覆盖受版本管理的空白模板。产品资料到位后由开发校验并接入。'],
];
guide.getRange('A12:H12').merge(); guide.getRange('A12').values = [['填写与使用规则']];
guide.getRange('A12:H12').format = { fill: color.teal, font: { bold: true, color: '#FFFFFF' }, rowHeight: 26 };
for (let i = 0; i < instructions.length; i++) {
  const r = 13 + i;
  guide.getRange(`A${r}:B${r}`).merge(); guide.getRange(`A${r}`).values = [[instructions[i][0]]];
  guide.getRange(`C${r}:H${r}`).merge(); guide.getRange(`C${r}`).values = [[instructions[i][1]]];
  guide.getRange(`A${r}:H${r}`).format = { font: { color: color.ink }, wrapText: true, rowHeight: 50, fill: i % 2 ? '#FFFFFF' : '#F4F7F9' };
}
guide.getRange('A27:H27').merge(); guide.getRange('A27').values = [['依据：用户确认的 BHHS Demo 主链路、分工及客户面积口径增量；模板格式不代表客户已验收全部业务规则。']];
guide.getRange('A27:H27').format = { font: { color: color.gray }, wrapText: true, rowHeight: 34 };
guide.getRange('A29:B29').merge(); guide.getRange('A29').values = [['功能讨论逐字稿']]; guide.getRange('C29:H29').merge(); guide.getRange('C29').values = [['https://xqmqf98k8t.feishu.cn/docx/UjbfdecT0oSpTBxlz3mcxHdanpd']];
guide.getRange('A30:B30').merge(); guide.getRange('A30').values = [['主会逐字稿']]; guide.getRange('C30:H30').merge(); guide.getRange('C30').values = [['https://xqmqf98k8t.feishu.cn/docx/GFwidM0aVo4XjmxnPjAcqe1gngc']];
guide.getRange('A29:H30').format = { font: { color: color.gray }, wrapText: true, rowHeight: 32 };

const dictionaryRows = [];
for (const table of spec.tables) {
  const sheet = wb.worksheets.add(table.sheet);
  const count = table.fields.length; const lastCol = col(count);
  title(sheet, `BHHS｜${table.sheet.substring(3)} · ${table.owner}`, `${table.rowRule} 第 6 行开始填写；* 必填、△ 条件必填。英文 key 不要改动，完整说明见“06_字段字典”。`);
  const chinese = table.fields.map(f => `${f.required === '必填' ? '* ' : f.required === '条件必填' ? '△ ' : ''}${f.label}`);
  const keys = table.fields.map(f => f.key);
  sheet.getRange(`A4:${lastCol}4`).values = [chinese];
  sheet.getRange(`A5:${lastCol}5`).values = [keys];
  sheet.getRange(`A4:${lastCol}25`).format = { columnWidth: 22, rowHeight: 28, font: { color: color.input }, wrapText: true };
  const nativeTable = sheet.tables.add(`A5:${lastCol}25`, true, `${table.key}_input`);
  nativeTable.showFilterButton = true;
  nativeTable.showBandedRows = true;
  sheet.getRange(`A4:${lastCol}4`).format = { fill: color.pale, font: { bold: true, color: color.teal }, rowHeight: 38, wrapText: true };
  sheet.getRange(`A5:${lastCol}5`).format = { fill: color.navy, font: { bold: true, color: '#FFFFFF' }, rowHeight: 44, wrapText: true };
  sheet.freezePanes.freezeRows(5);
  sheet.freezePanes.freezeColumns(2);
  for (let i = 0; i < count; i++) {
    const field = table.fields[i]; const column = col(i + 1); const input = sheet.getRange(`${column}6:${column}105`);
    sheet.getRange(`${column}4:${column}25`).format.columnWidth = /description|notes|ref|request|conditions|basis|evidence|questions|action|amenities/.test(field.key) ? 34 : 23;
    if (field.type === 'number') input.setNumberFormat('#,##0.00');
    else if (field.type === 'integer') input.setNumberFormat('0');
    else if (field.type === 'date') input.setNumberFormat('yyyy-mm-dd');
    else input.setNumberFormat('@');
    if (field.options.length) input.dataValidation = { rule: { type: 'list', values: field.options } };
    // Prefix date examples so the exporter does not coerce timezone-bearing text into Excel serials.
    const example = field.example && ['date', 'datetime'].includes(field.type) ? `示例：${field.example}` : field.example;
    dictionaryRows.push([table.sheet, table.owner, field.key, field.label, field.type, field.required, field.description, example, field.options.join(' | ')]);
  }
  const actualKeys = sheet.getRange(`A5:${lastCol}5`).values[0];
  if (JSON.stringify(actualKeys) !== JSON.stringify(keys)) throw new Error(`Header mismatch: ${table.key}`);
  if (sheet.getRange(`A6:${lastCol}25`).values.some(row => row.some(value => value !== null && value !== ''))) throw new Error(`Nonempty input area: ${table.key}`);
  await fs.writeFile(path.join(root, `data/templates/${table.key}.csv`), csv([actualKeys]), 'utf8');
  await fs.writeFile(path.join(versionDir, `${table.key}.csv`), csv([actualKeys]), 'utf8');
}

const dict = wb.worksheets.add('06_字段字典');
dict.showGridLines = false;
dict.getRange('A1:I1').merge(); dict.getRange('A1').values = [[`BHHS｜字段字典 · v${spec.version}`]];
dict.getRange('A1:I1').format = { fill: color.navy, font: { bold: true, color: '#FFFFFF' }, rowHeight: 34 };
dict.getRange('A2:I2').merge(); dict.getRange('A2').values = [['示例仅说明字段格式，不代表真实记录；未知值留空。每张填写表的英文 key 与此字典、CSV 表头和 schema.json 一致。']];
dict.getRange('A2:I2').format = { fill: color.pale, font: { color: color.ink }, wrapText: true, rowHeight: 34 };
const dictHeaders = ['填写表', '负责人', '英文 key', '中文字段', '类型', '要求', '说明与校验', '格式示例（非真实）', '可选值'];
dict.getRange(`A4:I${4 + dictionaryRows.length}`).setNumberFormat('@');
dict.getRange(`A4:I${4 + dictionaryRows.length}`).values = [dictHeaders, ...dictionaryRows];
dict.getRange(`A4:I${4 + dictionaryRows.length}`).format = { rowHeight: 56, wrapText: true, font: { color: color.ink } };
const widths = [24, 12, 34, 25, 16, 15, 70, 42, 70];
widths.forEach((w, i) => { dict.getRange(`${col(i + 1)}4:${col(i + 1)}${4 + dictionaryRows.length}`).format.columnWidth = w; });
dict.tables.add(`A4:I${4 + dictionaryRows.length}`, true, 'FieldDictionary');
dict.getRange('A4:I4').format = { fill: color.teal, font: { bold: true, color: '#FFFFFF' }, rowHeight: 30 };
dict.freezePanes.freezeRows(4); dict.freezePanes.freezeColumns(3);
await fs.writeFile(path.join(root, 'data/templates/field_dictionary.csv'), csv([dictHeaders, ...dictionaryRows]), 'utf8');
await fs.writeFile(path.join(versionDir, 'field_dictionary.csv'), csv([dictHeaders, ...dictionaryRows]), 'utf8');

const readme = `# BHHS 产品数据模板 v${spec.version}\n\n这是空白填写模板，不含真实房源、客户或成交记录。格式示例仅存在字段字典中。\n\n## 谁填哪些表\n\n${spec.tables.map(t => `- **${t.owner}**：\`${t.key}.csv\`（Excel：${t.sheet}）。${t.rowRule}`).join('\n')}\n\n## 填写与导入\n\n- Excel 第 4 行是中文说明，第 5 行是英文 key，第 6 行起填写。开发端跳过全空行，不把说明行当数据。\n- CSV 是 UTF-8 BOM + CRLF，只有一行英文表头；从第二行开始填写。\n- 日期列写真实日期，显示为 YYYY-MM-DD；时间戳写含时区 ISO 8601 文本。多值用 \`|\` 分隔。\n- 英文 key、顺序和类型见 \`schema.json\`，完整字段说明见 \`field_dictionary.csv\`。\n- 未知值留空，不填 0 代替未知；必填缺失可保留为采集草稿，不能作为已核验数据导入。\n- 真实填写资料另存到 \`data/incoming/\` 或 \`data/private/\`；不要覆盖提交空白模板，不将未脱敏资料放入 Git。\n- 第一批先交房源挂牌与客户需求；有价格证据时再补成交、关联和人工匹配参考。\n\n详见项目 \`docs/data-contract.md\`。\n`;
const areaBasisRules = `## 客户面积口径与旧版兼容\n\n- v1.1.0 在客户需求的 \`area_unit\` 后新增选填 \`area_basis\`，可选 \`internal\`、\`gross\`、\`built_up\`、\`land\`、\`unknown\`。只填写客户明确说明的口径，不从候选房源反向补齐。\n- 明确字段优先用于结构化解释。字段为空或旧记录没有此字段时，兼容 \`hard_constraints\` 中已有英文口径表达，如 \`area basis: built_up\`；不要求为旧 CSV/JSON 强行补列或重填。\n- 字段和可解析原文表达不同口径时保留双方内容，标记冲突并向产品/销售确认；不能静默覆盖原文、选择有利口径或把冲突算作满足。\n- 显式 \`unknown\` 表示口径待确认，不视为匹配，也不被文本或房源口径自动替换。两种来源都缺失时同样待确认；面积单位换算不能代替口径核对。\n\n## 版本与空模板\n\n- 当前 \`data/templates/\` 顶层入口与 \`data/templates/v${spec.version}/\` 提供相同的 v${spec.version} schema、五张空 CSV 和字段字典。\n- 原 v1.0.0 schema、五张空 CSV、字典及契约保存在 \`data/templates/v1.0.0/\`，原 v1 Excel 保持不变。\n- 本次新版 Excel 另存为 \`outputs/area-basis-v${spec.version}/BHHS_数据字段模板_v${spec.version}.xlsx\`。所有填写区为空，字典示例仍只是独立格式说明。\n`;
const templateReadme = `${readme}\n${areaBasisRules}`;
await fs.writeFile(path.join(root, 'data/templates/README.md'), templateReadme, 'utf8');
await fs.writeFile(path.join(versionDir, 'README.md'), templateReadme, 'utf8');
await fs.copyFile(path.join(root, 'data/templates/schema.json'), path.join(versionDir, 'schema.json'));
const contract = `# BHHS Demo 数据接入契约 v${spec.version}\n\n用户已确定主链路与产品/开发分工。本契约是控制塔提供的填写与接入格式，不代表客户已确认所有字段、阈值或预测能力。\n\n## 文件与责任\n\n| 文件 | 负责人 | 一行的含义 |\n|---|---|---|\n${spec.tables.map(t => `| \`${t.key}.csv\` | ${t.owner} | ${t.rowRule} |`).join('\n')}\n\n## 导入约定\n\n- 英文 key 是程序接口；Excel 第 5 行和 CSV 第 1 行一致。Excel 数据从第 6 行开始，忽略全空行。\n- \`schema.json\` 定义类型、要求、枚举、说明；它是字段契约文件，不是应用数据库或已运行的校验器。应用导入器由开发任务实现。\n- 文本使用 UTF-8；多值用 \`|\` 分隔，应用内可转换成数组。未知用空单元格/JSON null，未知枚举仅在给定选项允许时使用 unknown。\n- 数值不能夹币种/单位/千分位文字；Excel 日期按日期值读取、显示 YYYY-MM-DD。datetime 是含时区 ISO 8601 字符串，避免丢失时区。\n- 完整日期未披露时不要补造月日；将原始季度/年份放到备注并保留来源。\n- 时间、金额和面积字段按来源口径保存，币种和面积口径不同不能未经处理直接比较。other 币种需在 notes 写明实际币种，完成映射前不进行价格比较。\n\n## ID 与跨表关联\n\n- \`snapshot_id\`、\`transaction_id\`、\`link_id\`、\`requirement_id\`、\`case_id\` 在各自表内唯一且稳定。\n- 同一挂牌的不同采集时刻可以共用 \`listing_id\`；同一客户的不同需求共用脱敏 \`client_id\`。\n- \`property_id\` 只在真实房屋身份已知时填写；不能用 transaction_id 或相似楼名代替。\n- 房源成交关联表的 listing_id / transaction_id 必须分别存在于对应表。\n- 匹配参考的 requirement_id 必须存在；listing_id 非空时须存在于房源表。no_match 时 listing_id 留空，needs_clarification 可留空；无挂牌时 pricing_link_ids 也须留空。pricing_link_ids 非空时必须属于同一挂牌且满足价格引用条件。\n- 关联或案例的任一对象为 demo 时，关联/案例也必须是 demo。\n\n## 条件校验与事实边界\n\n1. verification_status=verified 需要实际 reviewed_by；关联 verified 还需 reviewed_at。\n2. 价格非空时需币种；面积非空需单位和口径；客户 area_min 非空需 area_unit；预算上下限须 min <= max。\n3. exact_property 必须有稳定房屋身份或授权记录对应证据；只有关联已核验且来源使用允许时才可作为该房屋历史。\n4. pricing_eligible=yes 的首版保守门槛：交易为 sale、whole_unit，金额/币种/日期明确，关联非 unresolved，来源与关联均 verified、usage_status=approved；可比记录还要检查地区、物业类型、面积口径、时间和显著差异。阈值由产品补充，不能宣称已校准估值。\n5. mortgage、gift、lease、bulk、partial_share 或 unknown 范围不进入首版住宅出售价格对比。下架不是成交，数据有来源不等于来源正确。\n6. expected_result=exclude/no_match 需排除或无匹配原因；recommend/alternative/exclude 需 listing_id，recommend/alternative 需匹配理由；非空且非 unknown 的意愿判断需具体证据。review_status=confirmed 才可作为人工验收基准。\n7. 演示样例与真实资料分开；usage_status=pending/restricted、未核验或缺必填的真实资料只进入待处理队列，不进入对客已核验展示。\n8. 同一 listing_id 的界面默认使用最新采集快照，但保留历史。只有有来源支持的状态才能说明已售；未能再次抓取不自动变更为 sold。\n\n## 第一批产品交付\n\n- 产品 A 先给一组完整挂牌，能够支持区域、价格、面积、户型筛选。随后补有历史、只有可比、没有可用价格证据、重复挂牌等案例；缺口明确列出。\n- 产品 B 先给授权脱敏需求或明确演示需求，再补一客多房、一房多客、预算冲突、无匹配和缺字段等人工参考结果。\n- 数据数量不作为本次新承诺；先保证案例覆盖和来源可追溯。\n\n## 字段字典\n\n完整说明与独立格式示例见 \`data/templates/field_dictionary.csv\` 和 Excel 的“06_字段字典”。\n\n${spec.tables.map(t => `### ${t.sheet}（${t.owner}）\n\n| key | 中文 | 类型 | 要求 | 说明 |\n|---|---|---|---|---|\n${t.fields.map(f => `| \`${f.key}\` | ${f.label} | ${f.type} | ${f.required} | ${f.description.replaceAll('|', '\\|')} ${f.options.length ? '可选：'+f.options.join(' / ') : ''} |`).join('\n')}`).join('\n\n')}\n`;
const versionedContract = contract
  .replace('它是字段契约文件，不是应用数据库或已运行的校验器。应用导入器由开发任务实现。', '它是字段契约文件，不是应用数据库。字段变更需同时维护导入器、筛选与匹配；运行验收另见开发交接。')
  .replace('## 字段字典', `${areaBasisRules}\n## 字段字典`);
await fs.writeFile(path.join(root, 'docs/data-contract.md'), versionedContract, 'utf8');
await fs.writeFile(path.join(versionDir, 'data-contract.md'), versionedContract, 'utf8');

console.log((await wb.inspect({ kind: 'sheet', include: 'id,name', maxChars: 1800 })).ndjson);
console.log((await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 10 }, maxChars: 1000, summary: 'Template formula-error check; no calculation formulas are used.' })).ndjson);
const previews = [];
for (const [sheetName, range, filename] of [
  ['00_填写说明', 'A1:H16', '00-guide-top.png'],
  ['00_填写说明', 'A17:H30', '00-guide-bottom.png'],
  ...spec.tables.map(t => [t.sheet, 'A1:H9', `${t.key}.png`]),
  ['04_客户需求', 'L4:T9', 'client-area-basis.png'],
  ['06_字段字典', 'A1:I9', '06-dictionary.png'],
]) {
  const preview = await wb.render({ sheetName, range, scale: 1.25, format: 'png' });
  const file = path.join(qaDir, filename);
  await fs.writeFile(file, new Uint8Array(await preview.arrayBuffer()));
  previews.push(file);
}
const workbookPath = path.join(outputDir, `BHHS_数据字段模板_v${spec.version}.xlsx`);
await (await SpreadsheetFile.exportXlsx(wb)).save(workbookPath);
await fs.writeFile(path.join(qaDir, 'build-summary.json'), JSON.stringify({ sheets: 7, tables: spec.tables.map(t => ({ name: t.key, fields: t.fields.length })), fieldCount: dictionaryRows.length, previews }, null, 2));
console.log(JSON.stringify({ output: workbookPath, fieldCount: dictionaryRows.length, previews }));
