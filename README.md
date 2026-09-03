# BHHS Gulf Properties 销售辅助 Demo

面向销售的房源库 Demo：整理客户需求 → 手动筛选或规则助手匹配 → 房源详情 → 当前挂牌价、同屋历史与可比成交 → 比较潜在客户 → 辅助销售沟通。客户界面默认英文，开发说明使用中文。

公开代码仓库：[Ksaveworld/bhhs-gulf-properties-demo](https://github.com/Ksaveworld/bhhs-gulf-properties-demo)。主分支为 `main`，本地运行方式见下文。

**在线 Demo：[bhhs-gulf-properties-demo.vercel.app](https://bhhs-gulf-properties-demo.vercel.app)**。用户追加“上线吧，记得 commit”授权后，2026-09-03 UTC 已发布 `30c2ee7` 所含的本机保存、Home、销售身份、客户目录及 Reports 改版。无需 Vercel 登录即可访问；使用私有副本和客户报告时，在应用内选择演示 Sales ID。公开版本继续使用固定的虚构主演示数据，49 条接收批次及其对照报告仍只保留在本地。发布验证见 [开发交接](docs/dev-handoff.md)。

**最新改版：Home 规则助手、演示销售身份、公私客户目录、面积区间与列头排序、Reports。** 私有需求和看房记录按当前浏览器、数据版本与 Sales ID 保存，支持刷新恢复；原件及人工草稿保留。代码已推送并上线；本机与公开地址属于不同浏览器保存范围，不会自动同步副本。范围及未定业务事项见 [改版执行约定](docs/iteration-03-implementation.md)。

**当前默认数据全部虚构。** 项目包含 10 个房源、11 条挂牌快照、8 条交易、9 条关联、6 位客户的 8 份独立需求和 8 条匹配参考。价格、客户陈述、房屋身份和来源都是交互样例，不代表 BHHS 事实或产品已确认规则。

## 本地启动

在 PowerShell 中运行：

```powershell
Set-Location E:\bhhs
npm install --cache .work/npm-cache
npm run dev
```

已有锁文件并需要按锁文件重装时，可以使用 `npm ci --cache .work/npm-cache`。本机默认 npm 缓存目录的 junction 曾失效，因此安装命令显式使用项目 `.work/npm-cache`；该目录不进入 Git。

- 网页：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API：[http://127.0.0.1:8001/api/health](http://127.0.0.1:8001/api/health)
- 数据接口：`GET /api/dataset`，只读，每次请求重新读取输入。
- `Ctrl+C` 停止开发服务。网页与 API 仅绑定本机，不是公网部署。

分别启动时使用 `npm run dev:web` 和 `npm run dev:api`。网页通过 Vite 代理访问本地 API。

## 使用主链路

1. 首页 **Home** 直接显示自然语言需求输入。右上角 **Sign in** 输入 Username 和 Sales ID，按演示身份保存私有副本。该登录是本机演示分区，不是正式认证。
2. 在首页填写或粘贴沟通内容，提取后审核并应用到房源库；已有需求通过 **Review selected requirement** 审核。每次保存独立副本；**Delete local copy** 删除选定副本，**Restore original** 删除当前副本并返回导入原件，其他需求不受影响。
3. 在 **Property library** 即时修改地区、AED 预算、卧室/房型及 sq ft 面积上下限，点击 **More filters** 查看其余条件。价格和更新时间直接用列头箭头排序。原样例的一套 USD 房源不列入 AED 视图，原币种仍保留在 Reports 与详情；默认 active 显示 8 套，缺字段用例保留。
4. 点击候选房源打开详情，查看原币种挂牌价、来源、更新时间及 **Price evidence**。同屋成交图与时间线按唯一交易 ID 计数；修改 **From / To** 筛选日期，点击成交点或时间线按钮定位原始记录和来源。可比成交保持独立。地址包含挂牌与需求 ID，刷新后仍可恢复有效详情和客户上下文。
5. 在 **Potential clients** 查看当前身份可见的客户名单、分组数量及每份需求理由。**Clients & needs** 顶部可按姓名、预算区间、地区及 Company/Private 筛选，条件须同时满足于同一份需求；**Add Private Client** 添加当前销售私有客户，再由 **View properties** 查看候选。
6. **Reports** 提供房屋扫描和客户画像两个 Tab。查看已有成交图，或录入看房记录、明确偏好及反馈，让次数与规则汇总更新。可主动载入明确虚构的看房示例；同预算观察不足时显示空态，详见 [报告口径](docs/report-records.md)。
7. 在 **Data & sources** 查看数据性质及隔离提示。**Refresh data** 重新读取当前数据源；公开地址读取固定演示快照，本地地址读取所配置的输入。

手动筛选与助手最终调用同一个 `filterListings`，使用同一份 AED 房源视图。规则助手没有接入大模型；提取结果是销售审核草稿。应用成功后显示 **Saved in this browser · 已保存到当前浏览器**，刷新或重开同一浏览器配置、地址、数据版本和 Sales ID 后可恢复。未应用的表单不保存；刷新恢复地址中对应的客户需求，临时手动筛选重置。保存不确认业务条件、不写回源文件或 API，清除网站存储会失去本地副本。完整范围见 [本机保存说明](docs/local-requirements.md)。

## Vercel 在线演示

独立项目为 `kwillsaveworld/bhhs-gulf-properties-demo`，已连接上述 GitHub 仓库。推送到 `main` 触发 Production 构建；本次已核对访客 SSO、密码和 IP 保护均未启用，并完成匿名浏览器实测。本地构建使用：

```powershell
npm run build:public
```

此命令先检查类型并构建网页，再从固定的 `data/demo/dataset.json` 导出只读 JSON。导出会忽略 `BHHS_DATA_DIR`，要求模式和所有记录均为 `demo` 且无隔离行；不满足时构建失败。`vercel.json` 将 `/api/dataset` 和 `/api/health` 映射到这份快照，没有部署本地 Node API。

在线刷新不会读取本机产品文件。`Dataset prepared` / `loaded_at` 是快照生成时间，`/api/health` 的 `delivery=static_demo_snapshot` 表示静态发布信息，不是实时服务探活。真实数据接入仍按下节本地流程进行，公开数据源变更需另行审查。

`.vercelignore` 只允许上传构建所需源码、schema 和虚构样例；`.env*`、`.vercel/`、私有输入和临时 QA 文件不发布。Vercel 本机绑定及 CLI 生成的 `.env.local` 不进入 Git。

## 产品数据接入

- [数据契约与字段含义](docs/data-contract.md)
- [空模板说明](data/templates/README.md)、[程序字段 schema](data/templates/schema.json)、[字段字典](data/templates/field_dictionary.csv)
- [v1.1.0 Excel 空模板](outputs/area-basis-v1.1.0/BHHS_数据字段模板_v1.1.0.xlsx)、[v1.1.0 CSV 模板](data/templates/v1.1.0/README.md)、[保留的 v1.0.0 模板](data/templates/v1.0.0/README.md)
- [CSV/JSON 导入指引及隔离规则](docs/import-guide.md)
- [面积口径与中文条件审核规则](docs/requirement-review.md)
- [需求本机保存](docs/local-requirements.md)、[新版本案例复验准备](docs/case-revalidation.md)
- [开发交接与待补输入](docs/dev-handoff.md)

当前所有业务输入与判断统一由用户收口，历史产品 A/B 分工不再作为等待项。挂牌、成交与关联证据、授权脱敏需求和人工参考仍分别填写。真实文件只放在 `data/incoming/` 或 `data/private/`，不覆盖空模板或演示样例：

```powershell
$env:BHHS_DATA_DIR = 'data/incoming/批次名称'
npm run dev
```

支持五份 UTF-8 CSV，或包含五张表数组的 `dataset.json`；首版不直接读取 XLSX。环境变量变更后重启服务，文件内容变更后刷新数据。解析失败时显示错误，不静默切回演示数据或沿用旧缓存。

真实资料缺必填、未核验或未获使用许可时隔离；引用被隔离对象的关联和案例也隔离。先按全部输入确定最新快照，最新不可用或采集时间不明时整个挂牌暂扣，不能用旧 active 冒充当前库存。同屋历史需稳定身份和两侧来源证据；已知同一房屋不能标为周边可比。

本轮接收批次的纯 demo 副本可独立启动，保留默认主演示数据：

```powershell
node tools/prepare-demo-batch.mjs data/incoming/bhhs-v1-cb36120bce00/normalized/demo-prepared/dataset.json cb36120bce00
$env:BHHS_DATA_DIR = 'data/demo/intake-local/cb36120bce00/dataset.json'
$env:BHHS_API_PORT = '8002'
$env:BHHS_WEB_PORT = '5174'
npm run dev
```

地址为 [http://127.0.0.1:5174](http://127.0.0.1:5174)，API 为 `http://127.0.0.1:8002`。原始批次及其运行副本均不进入 Git；复制工具拒绝真实记录、校验失败记录或覆盖不同的已有副本。批次文件由用户保留和交付，仓库克隆不包含这些输入。完整对照命令和恢复默认服务方式见导入指引。

## 实现位置

| 路径 | 职责 |
|---|---|
| `apps/web/src/` | React / Ant Design 首页需求、房源库、客户目录、详情与 Reports |
| `shared/types.ts` | v1.1.0 字段类型及显式客户/房屋身份，兼容 v1.0.0 输入 |
| `shared/matching.ts` | 硬条件过滤、单位换算、排序、双向条件解释 |
| `shared/requirement-area.ts`、`shared/constraint-review.ts` | 新旧面积口径解析、冲突提示与中文条件等价核对 |
| `shared/local-requirements.ts`、`apps/web/src/useLocalRequirements.ts` | 来源/版本隔离、独立副本、校验保存、恢复和失败处理 |
| `shared/sales-identity.ts`、`shared/client-directory.ts` | 演示 Sales ID 保存分区、客户可见范围内的同份需求筛选 |
| `shared/viewing-records.ts`、`apps/web/src/components/Reports.tsx` | 本机看房、来源记录、观察与明确标签统计、同预算样本说明 |
| `shared/assistant.ts` | 可替换的 `AssistantAdapter`；当前为无网络调用的规则实现 |
| `shared/pricing.ts` | 同屋历史、可比成交与不合格价格证据的分类 |
| `shared/client-priorities.ts` | 客户去重、独立需求评估、预算差额和透明排序 |
| `shared/transaction-history.ts` | 成交去重、币种/日期口径分组、实际日期位置及范围过滤 |
| `apps/api/` | Node 原生只读 HTTP API、CSV/JSON 校验和隔离 |
| `data/demo/` | 完全虚构且可重建的样例，和产品数据分开保存 |
| `tools/dev.mjs` | 同时启动本地网页与 API |
| `tools/prepare-demo-batch.mjs`、`tools/compare-match-references.mjs` | 隔离批次副本及人工草稿与确定性结果对照 |
| `tools/export-public-demo.mjs`、`vercel.json` | 固定虚构数据快照与 Vercel 公开构建 |

## 限制与验证状态

- 不提供成交概率或客户资产/购买力推断；购买意愿证据只引用客户明确陈述。
- 透明排序始终先按条件分组。同组预算排序先覆盖报价、再按差额、最后未知；日期排序为最早购买日期优先、未知最后。展示摘要始终来自一份真实存在的需求，不拼接多份需求，不读取人工验收答案生成排名。
- 成交图默认展示所选币种与日期口径的全部收录历史；币种、合同日和登记日分系列。0 笔为空状态，1 笔为单点，多笔直线只便于阅读，不补齐无交易日期的价格。收录笔数不代表完整房产历史。
- 未接入外汇来源，保留原币种；没有已校准估值或成交价预测。挂牌价、历史挂牌快照与成交价分别处理，下架不等于成交。
- v1.1.0 客户需求增加选填 `area_basis`。旧 v1 输入仍可在 `hard_constraints` 明确 `area basis: built_up`（或 `internal` / `gross` / `land`）。明确字段优先，冲突须确认；显式 unknown、缺失口径或缺失单位不能从房源反填。页面显示“面积口径待确认”，此时零候选不能解释为业务上无合适房源。
- 中文预算、最低卧室和最低面积只有与结构字段完全等价时才识别为重复说明。原文、硬条件保留；矛盾、近似值、精确户型、无依据预算下限或不支持条件继续提示审核。结构候选不等于全部条件已满足，人工 draft 不参与过滤与排名。
- 自然语言中的卧室/面积上限及未支持的否定条件不反向填成下限，保留原文、硬条件及提示，交销售确认。本轮面积上限仅增加为手动房源搜索条件，不改客户输入契约。规则无法穷尽自然语言，应用前需要审核。
- 当前不含正式认证、XLSX 直读、服务器备份/跨设备同步、真实模型调用、CRM 写回、自动外发、持续采集及物业管理。本机副本按地址、来源、五表内容版本和 Sales ID 隔离，不自动迁移至新批次；旧无身份副本在退出登录后保留。
- 报告区分到访、主动标记偏好和整次到访反馈。同预算模块只概括可见且预算完整的样本；不足时不输出结论。示例需点击载入并标记虚构，不证明客户真实偏好或系统已训练。

**最新改版验证：150/150 单元测试、最终构建通过；Chrome 共 42 个用例通过，分三组执行为既有回归 28/28、工作区 8/8、Reports 6/6。** 1366×768 实操覆盖 Sales A/B 私客与未保存草稿隔离、面积区间、四向列头排序、详情刷新、客户筛选回跳、删除/恢复、看房统计及失败重试。实际 49 条演示接收批次另完成 7/7 阶段，两次 Chrome 会话覆盖完全关闭后重开恢复、正反向理由与价格来源一致；四份保护文件和原始 API 记录未变，15 条参考仍 draft。具体 SHA、预修复证据、运行命令及未验证范围见 [开发交接](docs/dev-handoff.md)。

**本次公开发布验证：**重新执行 150/150 单元测试及 `npm run build:public` 通过；生产 Ready、GitHub Vercel 状态 success。全新匿名 Chrome 的 Home 和两个 API 均 HTTP 200、无登录跳转，44 条公开记录全为 demo；线上 Workspace 8 项 + Reports 6 项共 **14/14 通过，1.4 分钟**。本机 Node 直连曾超时，按当前系统代理配置回归后通过，未改应用、断言或访问保护；不能据此保证所有地区直连可达。发布证据与保存范围说明见开发交接文末。

本机保存轮验证（历史）：单元测试 **114/114**、构建通过；新增 Chrome 用例 **6/6**；原有 22 项先通过 21 项，另 1 项点击期间受到 Vite 热更新干扰，代码稳定后原样重跑通过。接收批次另完成 **9/9 阶段**，包括同一配置的 Chrome 完全关闭并重开两次，保存前后候选及反向理由一致、恢复原件后删除保持、价格来源可操作。四份原始文件哈希与 49 条 API 原始记录不变，15 条参考仍为 draft。详细日志和限制见开发交接。

第二轮实际验证（历史）：`npm test` **53/53 通过**、`npm run build` **通过**；新增 Chrome 用例 **6/6 通过**，原有主链路回归 **9/9 通过**（分别执行两份测试文件，共 15 项）。覆盖客户去重及独立需求、预算/日期排序、成交 0/1/多笔与来源回跳、日期错误恢复、币种/日期口径分组、键盘聚合点选择，以及原筛选、助手一致性和错误状态。桌面 1440×1000、1366×768 有实际操作验证。

面积口径轮本地验证（历史）：自动测试 **100/100**、构建通过；原有 Chrome 用例 **15/15**，新面积/中文审核用例 **7/7**（分批执行），另用实际批次完成 **6 步无 mock 的浏览器操作**。49 条 demo 接收、28 条公开候选继续隔离；15 条人工参考全部 draft，6 条推荐/备选仍待面积口径确认。案例差异及产品待补项见开发交接，不宣称业务验收全部通过。

已知构建提示：改版主 JS 包约 1,100 kB，gzip 344 kB；未做代码拆分。功能验证不代表公网性能验收。以下早期部署记录为历史结果；最新本机保存与改版的发布验证见开发交接文末。

公开部署增量验证：`npm test` **57/57 通过**（新增 4 项公开导出边界检查），`npm run build:public` **通过**；线上 Chrome 主链路 **5/5 通过，25.6 秒**。独立匿名访问验证首页、两个 JSON 接口均为 HTTP 200，无登录重定向；1366×768 下刷新后仍为 9 个候选、无页面脚本错误。首次静态资源为 200，刷新命中 304 缓存。未执行公网性能、多浏览器及移动端完整验收。

```powershell
npm test
npm run build
npm run test:browser
```

浏览器测试当前使用本机 Chrome（Playwright `channel: 'chrome'`），需先运行本地服务；默认桌面视口为 1440 × 1000。具体最终结果记录在 [开发交接](docs/dev-handoff.md)。

以下是面积口径版本的历史线上验证命令，仅适用于当时的测试代码；当前分支测试已适配 Home 和演示登录，应对本地新版执行，不能直接用于旧线上页面：

```powershell
$env:BHHS_E2E_BASE_URL = 'https://bhhs-gulf-properties-demo.vercel.app'
npx.cmd playwright test --grep 'ordinary filters and reviewed assistant|a property counts|multi-sale history|a single recorded sale|loading and failed refresh' --reporter=list
Remove-Item Env:BHHS_E2E_BASE_URL
```
