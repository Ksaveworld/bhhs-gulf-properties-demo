# BHHS Gulf Properties 销售辅助 Demo

销售整理需求 → 房源库筛选或规则助手匹配 → 房源详情 → 当前挂牌价、同屋历史和可比成交 → 潜客比较与销售沟通。

当前本地为 **V3**：按新会议精简文案和来源，房产报告移入详情，客户 / 房产连续查看逐层返回，客户页内创建私客，日期统一英文输入。需求见 [V3 改版清单](docs/iteration-05-v3-requirements.md)，实际验证见 [V3 验收记录](docs/iteration-05-v3-acceptance.md) 与 [开发交接](docs/dev-handoff.md)。

既有 [在线 Demo](https://bhhs-gulf-properties-demo.vercel.app) 的上次发布记录为 V2，本轮未推送或部署；应用内 Sales ID 仍为本机演示分区。

代码仓库：[Ksaveworld/bhhs-gulf-properties-demo](https://github.com/Ksaveworld/bhhs-gulf-properties-demo)，本地分支 `main`。开发说明中文，界面英文，支持中英文规则输入；没有新增完整中文界面。

**默认样本全部虚构**：10 个房源、11 条挂牌快照、8 条交易、9 条关联、6 位客户的 8 份需求及 8 条匹配参考，共 44 条记录。价格、来源、客户和房屋身份均是交互演示，不代表 BHHS 事实。

## 本地启动

```powershell
Set-Location E:\bhhs
npm ci --cache .work/npm-cache
npm run dev
```

已安装依赖时直接 `npm run dev`。本机默认 npm cache 的 junction 曾失效，因此使用项目缓存；不修改全局配置。

- 网页：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API：[http://127.0.0.1:8001/api/health](http://127.0.0.1:8001/api/health)
- `GET /api/dataset`：只读，每次请求重新读取配置的输入。
- `Ctrl+C` 停止；可用 `npm run dev:web` / `npm run dev:api` 分别启动。
- 服务只绑定本机。地址、端口、浏览器配置不同，本机保存范围也不同。

## 操作流程

1. **Home** 选择 Find a Property / Find a Client / Create a Private Client，输入内容并发送；检查自动填写的字段。必填项不足时显示数量和红框，补齐后点击 Continue。
2. 找房、找客户直接进入相应的条件结果。创建私客需要演示登录，再经 Back / Edit 或 Confirm & Create 二次确认，成功后打开新客户详情。仅搜索不保存客户。
3. **Property library** 即时修改地区、Price Range、Size Range、类型和卧室等条件；用 Asking price / Updated 表头上下箭头排序。Status 的信息按钮支持 Hover 和键盘 Focus。
4. 点击房源名称打开详情；整行不触发抽屉。Overview 合并来源入口，保留有效链接；原始证据仍在数据中。访客点击人工确认先选择销售身份，再由销售主动确认。
5. **Price evidence** 先展示同屋成交图和可展开节点，再展示可比成交。合同日期、登记日期和币种分别成系列；0 笔显示空态，1 笔仅显示点，未知历史不补造。
6. **Potential clients** 显示 Condition Met / Needs Clarification，排除项不放入潜客名单。右上 **View Client Details** 在原页查看客户；进一步打开其他房产，关闭时逐层返回，保留父层页签和原筛选。
7. **Clients & needs** 按姓名、地区、预算、房型及 Company / Private / Unassigned 筛选。详情只有 Recommended Properties / Viewing History 两个页签；推荐基于当前需求，独立购房方案可切换。
8. **Edit Current Needs** 保存完整新修订，历史显示新增、修改及取消条件。Delete local copy 删除当前本机版本；Restore original 把原始条件保存成新版本，保留此前历史。看房评价仅在销售带入编辑并保存后成为新偏好。
9. 房产详情和客户详情右上角的 **Export Report** 下载实际 PDF 或 DOCX 文件。房源简报含价格证据和潜客；客户简报使用选中方案、修订、推荐和看房记录。

**Clients & needs → Add Private Client** 在当前页复用创建 / 二次确认流程。访客可先准备草稿，选择身份后继续保存。日期按英文 `YYYY-MM-DD` 输入；看房本机时间使用 `YYYY-MM-DDTHH:mm`，非法日期保留并提示修正。

需求、本机销售确认和看房记录按数据来源、内容版本及 Sales ID 保存。写入并回读成功才报告成功；失败保留草稿并提示。公司客户的本机审核副本仍属于公司客户，审核者不自动成为来源分配人。历史无身份副本在退出登录后的 Local data notes 中保留。详见 [本机保存](docs/local-requirements.md) 和 [看房及简报](docs/report-records.md)。

## 数据与案例接入

- [数据契约](docs/data-contract.md)、[导入指引](docs/import-guide.md)、[审核口径](docs/requirement-review.md)
- [v1.2.0 空 CSV 模板](data/templates/v1.2.0/README.md)、[schema](data/templates/schema.json)、[字段字典](data/templates/field_dictionary.csv)
- [保留的 v1.1.0 模板](data/templates/v1.1.0/README.md)、[v1.0.0 模板](data/templates/v1.0.0/README.md)
- [案例复验准备](docs/case-revalidation.md)、[开发交接](docs/dev-handoff.md)

v1.2 新增客户可选 `area_max`，与 `area_min` 共用单位和口径；旧 v1.0/v1.1 缺列仍兼容。空上限表示未提供，不补 0。英文 CSV 表头是字段 key；模板不代表业务规则或数据库结构冻结。

真实资料只放 `data/incoming/` 或 `data/private/`，不覆盖空模板，不进入 Git。支持五份 UTF-8 CSV 或包含五表的 `dataset.json`，不直接读取 XLSX。缺必填、未核验、未获使用许可的资料及依赖关联被隔离；解析失败显示错误，不静默回退。

```powershell
$env:BHHS_DATA_DIR = 'data/incoming/批次名称'
npm run dev
```

切换环境变量后重启服务；文件内容变更后点击 Refresh data。返回默认样例前移除 `BHHS_DATA_DIR`。接收批次纯 demo 副本可用独立端口运行：

```powershell
$env:BHHS_DATA_DIR = 'data/demo/intake-local/cb36120bce00'
$env:BHHS_API_PORT = '8002'
$env:BHHS_WEB_PORT = '5174'
npm run dev
```

该忽略目录需已通过批次准备工具生成。49 条接收 demo、28 条待核验公开资料和 15 条人工 draft 仍分开；6 条推荐/备选涉及面积口径等缺口，不能宣称业务验收全部通过。业务补充与判断统一由用户收口。

## 技术与验证

| 位置 | 职责 |
|---|---|
| `shared/matching.ts`、`requirement-area.ts` | 共享硬条件过滤、计算、排序与未知提示 |
| `shared/assistant.ts`、`home-tasks.ts` | 规则助手适配接口与三任务表单，不调用模型 |
| `shared/local-requirements.ts`、`client-requirement-history.ts` | 按批次/身份保存、显式版本链、兼容旧独立方案 |
| `shared/pricing.ts`、`transaction-history.ts` | 同屋/可比证据、交易去重、日期与币种分组 |
| `shared/viewing-records.ts`、`listing-confirmation.ts` | 本机看房和销售确认 |
| `shared/sales-report.ts`、`apps/web/src/report-export.ts` | 当前上下文简报、浏览器 PDF 和 DOCX 生成 |
| `apps/api/` | 本机只读 API、CSV/JSON 校验与隔离 |
| `tools/compare-match-references.mjs` | 草稿与实际结果对照；不把人工答案输入匹配算法 |

```powershell
npm test
npm run build:public
npm run test:browser
```

浏览器测试需先启动服务，使用本机 Chrome、1366×768。V3 保留并迁移 V2 用例，增加本轮交互验证；当前结果见 [V3 验收记录](docs/iteration-05-v3-acceptance.md)，最终 SHA 见 [开发交接](docs/dev-handoff.md)。旧 42 条界面用例迁移情况见 [V2 历史覆盖记录](docs/v2-browser-coverage.md)，未用 `skip` 或 `testIgnore` 隐藏失败。

V2 历史结果：**188/188 领域测试、37/37 Chrome 实操通过，TypeScript 与公开构建通过**。当时浏览器全批耗时 2.5 分钟，涵盖实际下载、保存失败、刷新/重开、身份/批次隔离、双向匹配和旧数据兼容。

V2 历史发布验证：当时重新执行 188/188 领域测试与公开构建；生产 Ready、GitHub Vercel success；全新匿名 Chrome 首页及两个 API 均 HTTP 200，44 条纯 demo。线上 Home 7 + Clients 5 + Exports 5 共 **17/17 通过，82.7 秒**，包含实际 PDF/DOCX 下载；0 跳过。独立匿名探针验证预算改变候选、同屋/可比价格、详情刷新及前端资源与当时本地构建一致。这些是 V2 发布证据，不代表 V3 已上线。

`build:public` 本身只构建，不执行部署。它从固定主演示数据生成 44 条纯 demo 静态快照，忽略 `BHHS_DATA_DIR`；不把接收批次带入公开构建。Vercel 已关联 GitHub main，V2 曾按追加授权推送并触发 Production 发布；本轮 V3 只在本地提交，没有 push 或部署。本地与线上 origin 的浏览器副本不自动同步。

## 已知限制

- 规则提取不等于完整自然语言理解；未知口径、矛盾、未支持条件继续待确认，原文保留。新流程 AED / sq ft 不反填面积口径，不改标原 USD 记录。
- 无综合评分、成交百分比、客户购买力推断、估值或外汇换算。排除项隐藏只改变展示，未放松匹配规则。
- 演示 Sales ID 是本机分区，不是正式认证。没有服务端备份、跨设备同步、CRM 写回、自动外发或持续采集。
- PDF 为分页图像，不能搜索或选择文字；DOCX 文字可编辑，含价格图。已验证下载与内容，未验证所有 Word/WPS 版本的排版兼容。
- 主界面打包仍有大文件提示，导出模块按需加载；V3 验证范围为本机 Chrome 指定功能流程，V2 线上验证为历史记录，未做公网性能、多浏览器和移动端验收。
