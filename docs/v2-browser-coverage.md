# V2 浏览器验证迁移

本文件把旧 UI 用例按业务意图迁移到 V2。旧测试依赖已取消的 Client Brief、长需求表、独立 Reports 页、潜客排序、日期区间和 Hard Conflict 展示，不能继续作为当前页面的可执行验收。没有使用 `skip`、`testIgnore` 或修改配置隐藏失败。

所有浏览器样本来自固定 demo，或在 Playwright route / 浏览器 localStorage 中独立构造的明确 synthetic 样例；不读取 incoming/private，不修改原始数据，不提升 draft 业务确认状态。领域测试继续验证硬条件、证据准入和兼容规则。

## 当前测试入口

| 文件 | 当前业务意图 |
| --- | --- |
| `tests/browser/home-v2.spec.ts` | 三任务切换、缺失必填、自动填表、中文/英文输入、条件变化、私客二次确认、失败保留、外币提示 |
| `tests/browser/properties-v2.spec.ts` | 区间控件及实时过滤、状态 tooltip、指定入口打开、同屋与可比、分币种/日期口径、来源回跳、潜客分组、本机复核 |
| `tests/browser/clients-v2.spec.ts` | 四项筛选、Unassigned 归属、双页签 Drawer、正反向匹配、版本历史、恢复原始、看房反馈与失败 |
| `tests/browser/exports-v2.spec.ts` | 当前房源/客户 PDF、Word 实际下载及内容、图表、销售隔离、导出失败 |
| `tests/browser/lifecycle-v2.spec.ts` | 本文 LC1–LC12：批次及版本、持久化重开、存储失败、原文与未知项、删除、旧副本、销售切换、加载异常、排序、样例看房及普通筛选/助手一致性 |
| `tests/browser/legacy-owner-v2.spec.ts` | 旧审核者不覆盖公司归属；多来源分配冲突在界面和 Word 均待确认，旧存储字节不变 |
| `tests/browser/viewing-migration-v2.spec.ts` | 旧 USD 看房记录刷新/新页重开、原币种详情、Word 下载与 AED 推荐范围互不影响 |

`lifecycle-v2.spec.ts` 用例索引：

- LC1：保存复核版本后刷新与关闭重开；同 namespace 的 load timestamp 变化保留，namespace 或源表内容变化隔离，回原批次恢复；正反向候选保持。
- LC2：storage 读取失败显示错误、保留原字节，界面重试后恢复原版本。
- LC3：已有版本下遇到 SecurityError 写入失败，保留草稿与前一版；恢复存储后成功重试。
- LC4：明确 unknown 不借旧文本补值；结构化/旧文本冲突持续提示；v1 无字段时仍支持旧 hard_constraints 口径。
- LC5：中文等价重复说明可匹配；编辑造成冲突后降为待澄清；花园、最大卧室、近似面积、未识别限制与原文保留。
- LC6：同客独立计划保留；删除当前版本回到父版本，其他计划不受影响；Restore original 新增恢复版本并保留历史。
- LC7：旧版无 Sales ID 副本通过 Local data notes 访问；不混入 Unassigned 公司客户，不自动归属首次登录销售。
- LC8：第一次登录保留访客草稿；A/B 切换及退出清理未保存草稿；已保存版本按销售隔离并可恢复。
- LC9：加载时不展示旧结果，API 失败可重试；接受空数据时房源和客户均有可恢复空状态。
- LC10：价格和更新时间四向排序跨分页核对，USD 原值、Withdrawn、缺面积及真实历史日期/价格保持。
- LC11：虚构看房用例只在明确点击后生成并标记；A/B 看房隔离，退出后不展示、不允许写入，回原销售恢复。
- LC12：实际操作地区、卧室、户型、现期房与预算组合条件；普通筛选和 Home 审核任务得到相同候选 ID；零结果与重置后可恢复筛选。

## 旧 42 条用例逐项去向

以下编号按照各旧文件内测试的出现顺序；local-persistence 的配额/权限循环分别计一例。

| 旧文件与序号 | 原业务目的 | V2 替代 / 保留位置 |
| --- | --- | --- |
| area-basis 1 | 缺口径、原文与硬条件不丢失 | LC4、Home 面积问题、领域 requirement-area；V2 删除口径选择器，未知值不通过隐藏字段补全 |
| area-basis 2 | v1 fallback 与显式 unknown 区别 | LC4；requirement-area / area-basis-ingestion |
| area-basis 3 | 新旧口径冲突阻止确认 | LC4；requirement-area / area-basis-matching |
| area-basis 4 | 反向客户入口、审核副本、原始需求保留 | properties-v2 潜客、clients-v2 版本历史、LC4/LC6 |
| constraint-review 1 | 原文仅预算上限但结构化有下限 | constraint-review / constraint-matching 领域测试；V2 编辑器与客户详情保留警告入口，LC5 验证警告及原文持久化 |
| constraint-review 2 | 中文等价说明及修改后冲突 | LC5；字段映射明细属于旧 UI，等价识别的字段映射继续由领域测试验证 |
| constraint-review 3 | 硬条件不能被软偏好吞掉 | LC5；constraint-review / constraint-matching |
| iteration-02 1 | 同客多需求去重、反向客户导航 | properties-v2 潜客 + clients-v2 两页签/独立计划 + LC6 |
| iteration-02 2 | 潜客预算/购房日期排序及未知置后 | V2 明确删除潜客排序控件；client-priorities 领域测试保留，UI 不再验旧控件 |
| iteration-02 3 | 多笔历史日期/价格/来源、日期区间 | properties-v2 历史与来源 + LC10；V2 明确删除额外日期过滤，transaction-history 领域日期区间函数测试保留 |
| iteration-02 4 | 单笔/无历史不编曲线 | properties-v2 单点 series 与无历史 |
| iteration-02 5 | 币种/日期口径分系列；重复和不合格记录不入图 | properties-v2 系列；transaction-history / matching 领域证据准入与按交易 ID 去重 |
| iteration-02 6 | 重叠坐标不同成交可键盘访问 | properties-v2 分组 marker 展开每个节点及来源回跳 |
| sales-flow 1 | 预算/地区/现期房/缺字段筛选 | LC12 组合筛选、properties-v2 范围、home-v2 任务条件；LC10 缺字段 |
| sales-flow 2 | 助手和普通筛选一致及可修改预算 | LC12 通过真实普通筛选和 Home 审核任务比对候选 ID，修改预算产生零结果并恢复；home-v2 中英文相同条件 |
| sales-flow 3 | 详情身份/价格单位/两类成交/双向导航 | properties-v2、clients-v2 正反向匹配、LC1/LC10 |
| sales-flow 4 | 无历史/缺面积/Withdrawn | properties-v2 无历史 + LC10 |
| sales-flow 5 | 面积单位换算、未知口径、倒置范围 | LC4、properties-v2 范围恢复；library-filters-v3 / home-tasks 领域换算 |
| sales-flow 6 | Loading/API 错误与重试 | LC9 |
| sales-flow 7 | 1366×768 全链路可操作 | 所有 V2 浏览器文件采用该桌面尺寸；LC 系列检查页面无横向溢出 |
| sales-flow 8 | AED 排序与 USD 原价 | LC10、home-v2 外币不改标 |
| sales-flow 9 | 空数据的房源/客户状态与恢复 | LC9 |
| local-persistence 1 | 新建和审核副本刷新/重开 | home-v2 私客创建 + clients-v2 审核 + LC1；V2 明确版本编辑以最新版本显示，历史不删除 |
| local-persistence 2 | namespace/内容版本隔离，load 时间不改版本 | LC1 |
| local-persistence 3 | 同客多副本删除与恢复不波及他人 | LC6；恢复行为按 V2 留痕新增版本，不再直接删除整条历史 |
| local-persistence 4 | QuotaExceededError 保留草稿和已存副本 | home-v2 保存失败 + clients-v2 看房失败；LC3 同机制的已有版本/重试验证 |
| local-persistence 5 | SecurityError 保留草稿和已存副本并可重试 | LC2/LC3 |
| local-persistence 6 | 恢复后的正反向一致且价格来源不变 | LC1、properties-v2 潜客/价格证据、clients-v2 源数据不变 |
| workspace-v3 1 | 首页/登录职责和共享房源可见 | home-v2 三任务、LC8 登录、exports-v2 私有隔离 |
| workspace-v3 2 | Home→结果→详情可刷新并保留价格证据 | home-v2 找房 + properties-v2 详情刷新 + LC1；V2 找房临时条件不再伪装为持久化客户记录 |
| workspace-v3 3 | 私有客户筛选与双向匹配 | clients-v2 筛选与正反向 + exports-v2 私有客户 + LC1 |
| workspace-v3 4 | Sales A/B 私有数据与深链隔离 | exports-v2 私有报告及其他销售不可见、LC8/LC11 |
| workspace-v3 5 | 回原销售恢复副本、删除/恢复范围 | LC6/LC8 |
| workspace-v3 6 | 面积上下限及倒置范围恢复 | properties-v2 范围，library-filters-v3 领域验证 |
| workspace-v3 7 | 四个排序方向跨分页 | LC10 |
| workspace-v3 8 | 访客首次登录及 A/B 草稿隔离 | LC8 |
| reports-v3 1 | 三笔/单笔/无历史及原单位 | properties-v2 历史 + LC10 + exports-v2 真实导出 |
| reports-v3 2 | 看房表单保存/刷新，事实/偏好/反馈区分 | clients-v2 看房/偏好更新；viewing-records 领域计数测试保留 |
| reports-v3 3 | 示例必须主动生成，群体观察不补预算 | LC11 主动样例；V2 取消独立 Reports 及 cohort 展示，viewing-records 的群体统计/预算完整性测试保留 |
| reports-v3 4 | A/B 看房隔离及退出不泄露/不写入 | LC11 |
| reports-v3 5 | 看房配额失败保留旧记录及草稿 | clients-v2 viewing save failure |
| reports-v3 6 | Reports 上下文、Back、房源来源回跳 | V2 不再保留 Reports 页面；clients-v2 客户→房源 + properties-v2 来源回跳，exports-v2 用当前上下文直接导出 |

## V2 对照清单覆盖位置

以下对应 `docs/iteration-04-v2-checklist.md` 的编号；测试位置表示已建立的验证入口，具体通过结果须看当次执行记录。

| V2 编号 | 实现与验证入口 |
| --- | --- |
| H1–H4 | Home 三任务、字段提取/修改、缺失状态、Continue；home-v2 1–3、LC12 |
| H5 | 创建完整预览、Back / Edit、二次确认及自动打开客户；home-v2 4–5 |
| H6–H7 | CoreRequirementFields、home-tasks；home-v2 外币与上限口径、LC4–LC5、area-basis/home-tasks 领域验证 |
| L1–L2 | PropertyLibrary 控件及排序；properties-v2 1、LC10、LC12 |
| L3–L5 | building_name 显示、状态 Hover/Focus、仅名称/箭头打开、无 Client Brief；properties-v2 1 |
| L6 | 每行当前房源格式选择与下载；exports-v2 房源 Word/PDF |
| P1–P2 | 来源精简与按批次/销售/房源的本机确认；properties-v2 1、5、listing-confirmation 领域测试 |
| P3–P4 | 单一同屋及可比区、折线与展开节点、不同币种/日期依据、来源回跳；properties-v2 2、4、LC10 |
| P5–P6 | 同一匹配结果的两类潜客、短摘要与客户端联动；properties-v2 3、clients-v2 2、LC1 |
| C1–C2 | 四筛选、预算外框、公司/私有/未分配语义；clients-v2 1、LC7、exports-v2 销售隔离 |
| C3–C4 | 两业务页签、当前归属、两档推荐与导出；clients-v2 2、exports-v2 客户报告 |
| C5–C6 | 明确编辑链、当前版本及增删改差异、反馈须经保存；clients-v2 3–5、LC3–LC6 |
| C7 | home-v2 4 从客户页 Add Private Client 进入专属流程，实际验证二次确认、返回编辑、自动开详情和刷新恢复 |
| E1–E3 | Reports 移除，客户内保留看房，Word/PDF 当前上下文与精简字段；exports-v2、LC11、viewing-migration-v2 旧外币看房回归 |
| G1 | 英文系统 UI 与原始输入区分；home-v2 中英文输入、LC5。完整中文版/切换仍未实现，不能据此声称中英页面已同等验收 |
| G2 | 本轮只用 demo / synthetic；该矩阵和用例不改批次数据、draft 或核验/授权状态 |
| G3 | LC1–LC12 与其余四个 V2 spec，覆盖实际桌面操作、持久化、异常、双向一致和下载 |

## 验证记录

执行命令：`npx playwright test tests/browser/lifecycle-v2.spec.ts --reporter=list --output .work/lifecycle-v2-complete`。

迁移过程中发现 storage 读取失败时空副本数组引用反复变化，导致 App 的看房读取 effect 重复更新；由主任务修复稳定空集合。迁移测试预期按 V2 同时显示 Best Matches / Worth Considering 更新：缺挂牌价的 DEMO-L-007 保留待澄清，不能把它当成已确认房源或为减少数量修改规则。

测试定位修正保留实际行为断言：存储重试前先关闭遮挡后台按钮的客户抽屉；图标参与的按钮按可见文本定位。写失败恢复用例额外确认保存按钮不再处于真实 loading 状态，避免 AntD 离场动画留下的透明图标造成 accessible name 假失败；恢复后仍必须实际点击并核对两个持久化版本。

最终完整执行：Chrome，1366×768，12/12 通过，耗时 1.2 分钟。每例核对 pageerror 与页面横向溢出；批次/身份隔离、刷新重开、读写失败、原文冲突、删除恢复和双向结果均通过实际操作验证。`npm run check` 通过。默认 `playwright test --list` 已不再发现旧 7 个文件，配置与 helpers 保留原样。

QA 产物留在忽略目录。先前失败记录留在 `.work/lifecycle-v2`、`.work/lifecycle-v2-final`，分别记录图标名称定位及透明离场图标问题；最终证据以 `.work/lifecycle-v2-complete` 为准。旧测试删除保留 Git 历史。上述结果是功能与技术验证，不构成 15 条 draft 参考或真实业务数据的验收确认。

### 最终全量执行

V2 全部 7 个 spec 统一执行：`npx playwright test --reporter=list --output .work/v2-final-browser`，**37/37 通过、0 跳过、耗时 2.5 分钟**。日志 `.work/v2-final-browser.log`。其中 Home 7、Clients 5、Exports 5、Lifecycle 12、Properties 5、Legacy owner 2、USD viewing 1。

客户页 Add Private Client、旧公司副本归属、来源归属冲突及 USD 看房完整下载均已纳入此批实际操作。没有以截图或构建代替交互验证。最终版本代码 `0a5b733`、测试迁移 `bd3e431`，之后仅更新交接文档。
