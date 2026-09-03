# BHHS Gulf Properties 销售辅助 Demo

面向销售的房源库 Demo：整理客户需求 → 手动筛选或规则助手匹配 → 房源详情 → 当前挂牌价、同屋历史与可比成交 → 比较潜在客户 → 辅助销售沟通。客户界面默认英文，开发说明使用中文。

公开代码仓库：[Ksaveworld/bhhs-gulf-properties-demo](https://github.com/Ksaveworld/bhhs-gulf-properties-demo)。主分支为 `main`，本地运行方式见下文。

**此前发布的在线 Demo：[bhhs-gulf-properties-demo.vercel.app](https://bhhs-gulf-properties-demo.vercel.app)**。2026-09-03 UTC 部署时已用全新匿名 Chrome 实际验证，无需访客登录。**本轮面积口径与样本联调仅在本地完成，未 push 或部署；在线版本不包含本轮修改。**

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

1. 在 **Property library** 修改地区、预算、面积、卧室、现房/期房等条件。点击 **More filters** 查看更多条件。
2. 点击 **Client requirements**，由销售填写需求或粘贴沟通内容，运行规则提取，检查并修改结构化条件后应用；也可以选择已有需求并点击 **Review selected requirement** 审核面积口径和原文条件。应用审核会新增同客户的会话需求，保留原需求和原文。
3. 点击候选房源打开详情，查看原币种挂牌价、来源、更新时间及 **Price evidence**。同屋成交图与时间线按唯一交易 ID 计数；修改 **From / To** 筛选日期，点击成交点或时间线按钮定位原始记录和来源。可比成交保持独立。
4. 在 **Potential clients** 查看按客户去重的满足条件、待补信息和折叠的硬冲突名单。**Sort clients** 可按条件、预算覆盖或购买日期排序，页面解释排序依据。展开 **Review requirements** 查看每份原始需求，点击相应 **View properties** 返回其候选；**Clients & needs** 也保留反向入口。
5. 在 **Data & sources** 查看数据性质及隔离提示。**Refresh data** 重新读取当前数据源：本地服务读取输入文件，在线 Demo 读取已发布的演示快照。

手动筛选与助手最终调用同一个 `filterListings`，使用同一份房源数据。规则助手没有接入大模型；提取结果是销售审核草稿。页面输入仅保存在当前页面会话中，**重新加载整个页面后清除**；点击 Refresh data 只是重新读取数据源。

## Vercel 在线演示

独立项目为 `kwillsaveworld/bhhs-gulf-properties-demo`，已连接上述 GitHub 仓库。推送到 `main` 会触发该项目的 Production 构建；访客 SSO、密码和 IP 保护均未启用。本地构建使用：

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
- [开发交接与待补输入](docs/dev-handoff.md)

产品 A 填挂牌、成交与关联证据；产品 B 填授权脱敏需求和人工匹配参考。真实文件只放在 `data/incoming/` 或 `data/private/`，不覆盖空模板或演示样例：

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

地址为 [http://127.0.0.1:5174](http://127.0.0.1:5174)，API 为 `http://127.0.0.1:8002`。原始批次及其运行副本均不进入 Git；复制工具拒绝真实记录、校验失败记录或覆盖不同的已有副本。批次文件需由控制塔另行交付，仓库克隆不包含这些输入。完整对照命令和恢复默认服务方式见导入指引。

## 实现位置

| 路径 | 职责 |
|---|---|
| `apps/web/src/` | React / Ant Design 房源入口、需求审核、详情与客户比较 |
| `shared/types.ts` | v1.1.0 字段类型及显式客户/房屋身份，兼容 v1.0.0 输入 |
| `shared/matching.ts` | 硬条件过滤、单位换算、排序、双向条件解释 |
| `shared/requirement-area.ts`、`shared/constraint-review.ts` | 新旧面积口径解析、冲突提示与中文条件等价核对 |
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
- 卧室/面积上限及未支持的否定条件不反向填成下限，保留原文、硬条件及提示，交销售确认。规则无法穷尽自然语言，应用前需要审核。
- 当前不含 XLSX 直读、客户需求持久化、真实模型调用、CRM 写回、自动外发、持续采集及物业管理。

第二轮实际验证：`npm test` **53/53 通过**、`npm run build` **通过**；新增 Chrome 用例 **6/6 通过**，原有主链路回归 **9/9 通过**（分别执行两份测试文件，共 15 项）。覆盖客户去重及独立需求、预算/日期排序、成交 0/1/多笔与来源回跳、日期错误恢复、币种/日期口径分组、键盘聚合点选择，以及原筛选、助手一致性和错误状态。桌面 1440×1000、1366×768 有实际操作验证。最终业务验收仍由控制塔结合产品 A/B 输入完成。

本轮本地验证：自动测试 **100/100**、构建通过；原有 Chrome 用例 **15/15**，新面积/中文审核用例 **7/7**（分批执行），另用实际批次完成 **6 步无 mock 的浏览器操作**。49 条 demo 接收、28 条公开候选继续隔离；15 条人工参考全部 draft，6 条推荐/备选仍待面积口径确认。案例差异及产品待补项见开发交接，不宣称业务验收全部通过。

已知构建提示：本轮主 JS 包约 1,043 kB，gzip 328 kB；未做代码拆分。本地交互验证通过，不把此结果当作公网性能验收。

公开部署增量验证：`npm test` **57/57 通过**（新增 4 项公开导出边界检查），`npm run build:public` **通过**；线上 Chrome 主链路 **5/5 通过，25.6 秒**。独立匿名访问验证首页、两个 JSON 接口均为 HTTP 200，无登录重定向；1366×768 下刷新后仍为 9 个候选、无页面脚本错误。首次静态资源为 200，刷新命中 304 缓存。未执行公网性能、多浏览器及移动端完整验收。

```powershell
npm test
npm run build
npm run test:browser
```

浏览器测试当前使用本机 Chrome（Playwright `channel: 'chrome'`），需先运行本地服务；默认桌面视口为 1440 × 1000。具体最终结果记录在 [开发交接](docs/dev-handoff.md)。

复现已执行的线上 5 项验证（无需先启动本地服务）：

```powershell
$env:BHHS_E2E_BASE_URL = 'https://bhhs-gulf-properties-demo.vercel.app'
npx.cmd playwright test --grep 'ordinary filters and reviewed assistant|a property counts|multi-sale history|a single recorded sale|loading and failed refresh' --reporter=list
Remove-Item Env:BHHS_E2E_BASE_URL
```
