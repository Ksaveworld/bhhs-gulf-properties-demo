# 完全虚构的交互样例

本目录没有真实 BHHS 房源、客户、成交或来源。价格、日期、户型、楼名和客户陈述均为虚构；Dubai 地区名称只用于展示筛选。`verified`、`approved`、`confirmed` 在这些 demo 行中仅代表演示样例已做技术检查，不表示产品人员、客户或真实来源已核验。

- 默认数据：`dataset.json`；生成方式：根目录运行 `node data/demo/generate.mjs`。
- 10 个挂牌、11 个快照：`DEMO-L-001` 最新挂牌为 AED 2,450,000、1,280 sqft built_up；旧挂牌快照为 AED 2,550,000，旧挂牌不是成交。
- 默认需求 `DEMO-R-001`：Marina、ready、apartment、至少 2 卧室、AED 2.2m–2.8m、至少 1,100 sqft built_up，匹配 `DEMO-L-001` 与 `DEMO-L-002`。
- 6 位虚构客户、8 份独立需求。`DEMO-R-007/008` 分别是客户 A/B 的第二份需求，验证客户人数去重、独立预算和不同冲突状态；不合并需求字段，也不替换原需求。
- `DEMO-LINK-001` 为虚构同屋历史；`DEMO-LINK-002` 为不同房屋的虚构可比；`DEMO-LINK-003/005` 因抵押/部分份额不能引用为售价参考。
- 缺字段：`DEMO-L-007` 无价格，`DEMO-L-008` 无面积，`DEMO-R-006` 需求不完整。`DEMO-L-009` 下架但未断言成交；`DEMO-L-010` 为 USD 原币种。
- `DEMO-R-004` 明确无匹配；`DEMO-R-001/002` 可对应同一个 `DEMO-L-001`。`DEMO-L-005/006` 无成交历史。

真实资料只存 `data/incoming/` 或 `data/private/`，通过 `BHHS_DATA_DIR` 切换，不能覆盖本目录。
