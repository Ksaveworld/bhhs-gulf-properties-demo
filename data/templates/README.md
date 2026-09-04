# BHHS 产品数据模板 v1.1.0

这是空白填写模板，不含真实房源、客户或成交记录。格式示例仅存在字段字典中。

## 谁填哪些表

- **产品 A**：`listing_snapshots.csv`（Excel：01_房源挂牌）。一行是一条挂牌在一个采集时刻的快照；同一挂牌更新另建 snapshot_id，listing_id 保持稳定。
- **产品 A**：`transactions.csv`（Excel：02_成交记录）。一行是一条来源中的交易记录；可比关联放到下一表，不能为多个关联重复创建同一交易。
- **产品 A**：`listing_transaction_links.csv`（Excel：03_房源成交关联）。一行关联一个 listing_id 和一个 transaction_id；同一交易可关联多个挂牌，但必须逐条说明 exact_property 或 comparable。
- **产品 B**：`client_requirements.csv`（Excel：04_客户需求）。一行是一份客户需求；同一 client_id 可以有不同 requirement_id。仅提供授权脱敏内容。
- **产品 B**：`match_reference.csv`（Excel：05_匹配验收参考）。一行是一份需求的人工期望结果；有候选时关联一个挂牌，无匹配时可不填挂牌。仅用于验收，不是模型输出。

## 填写与导入

- Excel 第 4 行是中文说明，第 5 行是英文 key，第 6 行起填写。开发端跳过全空行，不把说明行当数据。
- CSV 是 UTF-8 BOM + CRLF，只有一行英文表头；从第二行开始填写。
- 日期列写真实日期，显示为 YYYY-MM-DD；时间戳写含时区 ISO 8601 文本。多值用 `|` 分隔。
- 英文 key、顺序和类型见 `schema.json`，完整字段说明见 `field_dictionary.csv`。
- 未知值留空，不填 0 代替未知；必填缺失可保留为采集草稿，不能作为已核验数据导入。
- 真实填写资料另存到 `data/incoming/` 或 `data/private/`；不要覆盖提交空白模板，不将未脱敏资料放入 Git。
- 第一批先交房源挂牌与客户需求；有价格证据时再补成交、关联和人工匹配参考。

详见项目 `docs/data-contract.md`。

## 客户面积口径与旧版兼容

- v1.1.0 在客户需求的 `area_unit` 后新增选填 `area_basis`，可选 `internal`、`gross`、`built_up`、`land`、`unknown`。只填写客户明确说明的口径，不从候选房源反向补齐。
- 明确字段优先用于结构化解释。字段为空或旧记录没有此字段时，兼容 `hard_constraints` 中已有英文口径表达，如 `area basis: built_up`；不要求为旧 CSV/JSON 强行补列或重填。
- 字段和可解析原文表达不同口径时保留双方内容，标记冲突并向产品/销售确认；不能静默覆盖原文、选择有利口径或把冲突算作满足。
- 显式 `unknown` 表示口径待确认，不视为匹配，也不被文本或房源口径自动替换。两种来源都缺失时同样待确认；面积单位换算不能代替口径核对。

## 版本与空模板

- 当前 `data/templates/` 顶层入口与 `data/templates/v1.1.0/` 提供相同的 v1.1.0 schema、五张空 CSV 和字段字典。
- 原 v1.0.0 schema、五张空 CSV、字典及契约保存在 `data/templates/v1.0.0/`，原 v1 Excel 保持不变。
- 本次新版 Excel 另存为 `outputs/area-basis-v1.1.0/BHHS_数据字段模板_v1.1.0.xlsx`。所有填写区为空，字典示例仍只是独立格式说明。

## v1.2.0 增量
当前 schema 已升级 v1.2.0，客户可选 area_max 为同口径面积上限；旧版本保留在 v1.0.0 / v1.1.0，新版空模板见 v1.2.0。当前填写事项由用户统一负责。
