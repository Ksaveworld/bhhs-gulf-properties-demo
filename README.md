# BHHS Gulf Properties 销售辅助 Demo

面向销售的本地房源库：整理客户需求 → 手动筛选或规则助手匹配 → 房源详情 → 当前挂牌价、同屋历史与可比成交 → 比较潜在客户 → 辅助销售沟通。客户界面默认英文，开发说明使用中文。

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
2. 点击 **Client requirements**，由销售填写需求或粘贴沟通内容，运行规则提取，检查并修改结构化条件后应用；也可以直接选择已提供的客户需求。
3. 点击候选房源打开详情，查看原币种挂牌价、来源、更新时间及 **Price evidence**。同屋成交图与时间线按唯一交易 ID 计数；修改 **From / To** 筛选日期，点击成交点或时间线按钮定位原始记录和来源。可比成交保持独立。
4. 在 **Potential clients** 查看按客户去重的满足条件、待补信息和折叠的硬冲突名单。**Sort clients** 可按条件、预算覆盖或购买日期排序，页面解释排序依据。展开 **Review requirements** 查看每份原始需求，点击相应 **View properties** 返回其候选；**Clients & needs** 也保留反向入口。
5. 在 **Data & sources** 查看数据性质及隔离提示。**Refresh data** 重新读取本地输入文件。

手动筛选与助手最终调用同一个 `filterListings`，使用同一份房源数据。规则助手没有接入大模型；提取结果是销售审核草稿。页面输入仅保存在当前页面会话中，**重新加载整个页面后清除**；点击 Refresh data 只是重新读取数据源。

## 产品数据接入

- [数据契约与字段含义](docs/data-contract.md)
- [空模板说明](data/templates/README.md)、[程序字段 schema](data/templates/schema.json)、[字段字典](data/templates/field_dictionary.csv)
- [CSV/JSON 导入指引及隔离规则](docs/import-guide.md)
- [开发交接与待补输入](docs/dev-handoff.md)

产品 A 填挂牌、成交与关联证据；产品 B 填授权脱敏需求和人工匹配参考。真实文件只放在 `data/incoming/` 或 `data/private/`，不覆盖空模板或演示样例：

```powershell
$env:BHHS_DATA_DIR = 'data/incoming/批次名称'
npm run dev
```

支持五份 UTF-8 CSV，或包含五张表数组的 `dataset.json`；首版不直接读取 XLSX。环境变量变更后重启服务，文件内容变更后刷新数据。解析失败时显示错误，不静默切回演示数据或沿用旧缓存。

真实资料缺必填、未核验或未获使用许可时隔离；引用被隔离对象的关联和案例也隔离。先按全部输入确定最新快照，最新不可用或采集时间不明时整个挂牌暂扣，不能用旧 active 冒充当前库存。同屋历史需稳定身份和两侧来源证据；已知同一房屋不能标为周边可比。

## 实现位置

| 路径 | 职责 |
|---|---|
| `apps/web/src/` | React / Ant Design 房源入口、需求审核、详情与客户比较 |
| `shared/types.ts` | 与 v1 模板一致的字段类型及显式客户/房屋身份 |
| `shared/matching.ts` | 硬条件过滤、单位换算、排序、双向条件解释 |
| `shared/assistant.ts` | 可替换的 `AssistantAdapter`；当前为无网络调用的规则实现 |
| `shared/pricing.ts` | 同屋历史、可比成交与不合格价格证据的分类 |
| `shared/client-priorities.ts` | 客户去重、独立需求评估、预算差额和透明排序 |
| `shared/transaction-history.ts` | 成交去重、币种/日期口径分组、实际日期位置及范围过滤 |
| `apps/api/` | Node 原生只读 HTTP API、CSV/JSON 校验和隔离 |
| `data/demo/` | 完全虚构且可重建的样例，和产品数据分开保存 |
| `tools/dev.mjs` | 同时启动本地网页与 API |

## 限制与验证状态

- 不提供成交概率或客户资产/购买力推断；购买意愿证据只引用客户明确陈述。
- 透明排序始终先按条件分组。同组预算排序先覆盖报价、再按差额、最后未知；日期排序为最早购买日期优先、未知最后。展示摘要始终来自一份真实存在的需求，不拼接多份需求，不读取人工验收答案生成排名。
- 成交图默认展示所选币种与日期口径的全部收录历史；币种、合同日和登记日分系列。0 笔为空状态，1 笔为单点，多笔直线只便于阅读，不补齐无交易日期的价格。收录笔数不代表完整房产历史。
- 未接入外汇来源，保留原币种；没有已校准估值或成交价预测。挂牌价、历史挂牌快照与成交价分别处理，下架不等于成交。
- v1 客户需求没有独立面积口径字段。需要面积条件时，在 `hard_constraints` 明确 `area basis: built_up`（或 `internal` / `gross` / `land`）；口径或单位不明时保持 Unknown。
- 卧室/面积上限及未支持的否定条件不反向填成下限，保留原文、硬条件及提示，交销售确认。规则无法穷尽自然语言，应用前需要审核。
- 当前不含 XLSX 直读、客户需求持久化、真实模型调用、CRM 写回、自动外发、持续采集、物业管理及公网发布。

第二轮实际验证：`npm test` **53/53 通过**、`npm run build` **通过**；新增 Chrome 用例 **6/6 通过**，原有主链路回归 **9/9 通过**（分别执行两份测试文件，共 15 项）。覆盖客户去重及独立需求、预算/日期排序、成交 0/1/多笔与来源回跳、日期错误恢复、币种/日期口径分组、键盘聚合点选择，以及原筛选、助手一致性和错误状态。桌面 1440×1000、1366×768 有实际操作验证。最终业务验收仍由控制塔结合产品 A/B 输入完成。

已知构建提示：主 JS 包约 1,029 kB，gzip 323 kB；本轮未做代码拆分。本地交互验证通过，不把此结果当作公网性能验收。

```powershell
npm test
npm run build
npm run test:browser
```

浏览器测试当前使用本机 Chrome（Playwright `channel: 'chrome'`），需先运行本地服务；默认桌面视口为 1440 × 1000。具体最终结果记录在 [开发交接](docs/dev-handoff.md)。
