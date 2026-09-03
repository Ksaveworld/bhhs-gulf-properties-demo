# BHHS 产品数据模板 v1.0.0

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
