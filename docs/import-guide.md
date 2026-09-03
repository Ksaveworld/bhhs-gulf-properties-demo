# BHHS 本地样本导入指引

## 准备文件

字段模板及含义以 `docs/data-contract.md`、`data/templates/schema.json` 为准，导入器不改字段 key。产品 A 填 `listing_snapshots.csv`、`transactions.csv`、`listing_transaction_links.csv`；产品 B 填 `client_requirements.csv`、`match_reference.csv`。

1. 把空模板复制到 `data/incoming/批次名称/` 或 `data/private/批次名称/` 后填写。两目录已经忽略 Git；不覆盖模板或 `data/demo/`。
2. 每份文件保留英文表头，UTF-8 编码，可带 BOM。多值字段用 `|`；文本含逗号、引号或换行时由 Excel 的 CSV 导出正确转义。
3. 未知保留空值，金额与面积填纯数字。保留币种、面积单位、面积口径；完整日期为 `YYYY-MM-DD`，采集和审核时间为含时区 ISO 8601，如 `2026-09-02T12:00:00+04:00`。日期不可补造。
4. 一条快照一个 `snapshot_id`，更新后新建快照 ID，`listing_id` 不变。先按全部输入的采集时间确定最新快照，再判断是否可用；最新快照不合格或时间顺序无法确认时，整个挂牌暂不显示，不能退回旧 active 冒充当前状态。旧挂牌快照仍不是成交记录。
5. 客户只填写授权脱敏代号、需求与证据。不放电话、邮箱、证件或未脱敏原始聊天。

缺少某张 CSV 时该表为空并产生提示，其他合格表继续载入。若目录里有 CSV，优先按 CSV 读取；只有没有任何契约 CSV 时才回退到目录里的 `dataset.json`。可以直接指定包含五个表数组的 JSON 文件。首版没有直接解析 XLSX，需要另存为五份 CSV。

## 切换并启动

在项目根目录打开 PowerShell：

```powershell
$env:BHHS_DATA_DIR = 'data/incoming/批次名称'
npm run dev
```

本地 API 为 `http://127.0.0.1:8001`，网页为 `http://127.0.0.1:5173`。只单独运行 API 时使用 `npm run dev:api`。API 默认只绑定本机地址；没有上传、CRM 写回或外发接口。

修改输入文件后，网页执行刷新会重新请求数据；API 每个 GET 也重新读取文件。改变 `BHHS_DATA_DIR` 环境变量后需重启服务。建议一次替换完整批次，避免写文件期间读到半成品。解析失败会显示错误，不沿用旧缓存或自动切回 demo。

恢复演示模式：

```powershell
Remove-Item Env:BHHS_DATA_DIR -ErrorAction SilentlyContinue
npm run dev
```

默认 `data/demo/dataset.json` 全为 `data_kind=demo`，所有房源、交易、客户和证据均虚构。真实模式只接受 `real_public`/`real_authorized`；两个模式不混装。路径及符号链接必须保持在项目的 `data/demo/`、`data/incoming/`、`data/private/` 范围内。

## 接收和隔离规则

- 类型、必填、枚举、日期/时区、有限非负数、预算上下限及金额/面积条件不合格：整行隔离。重复稳定主键的所有重复行都隔离，不任意挑一行。
- 真实资料 `usage_status=pending/restricted`、`verification_status=needs_review/conflict` 或已核验但缺审核人：隔离。真实人工验收参考须 `review_status=confirmed`。
- 关联对象被隔离或不存在：对应关联隔离；引用该关联的人工案例也隔离，不能出现失去来源的价格依据。
- 最新挂牌快照被隔离或任一快照缺少有效采集时间时，同一 `listing_id` 的其他快照也暂不通过 API 返回，等待产品纠正最新状态或时间。较旧快照的一般字段错误不会阻止合格最新快照。
- `exact_property` 需两侧相同且非空的稳定 `property_id`，`evidence_refs` 同时引用两侧 `source_ref`，单元标识不得冲突。若只有授权人工映射，产品先核验映射，再给两侧分配同一内部 `property_id`；开发不从楼名、面积或交易 ID 猜身份。
- 两侧已知且相同的 `property_id` 不能标为 `comparable`；矛盾关联会隔离，由产品复核关系，程序不擅自改为同屋历史。
- `pricing_eligible=yes` 保守要求 `sale`、`whole_unit`、正数金额、明确日期及日期口径，房源与交易来源均 verified/approved，关联 verified，币种一致且不是未映射的 other，正数面积和一致的已知面积口径。可比还要求同区域、同物业类型并说明时间/楼层/装修等差异。抵押、赠与、租赁、打包、部分份额、未解决关联不能作为售价参考。
- `pricing_eligible=no/pending` 的合格来源记录可保留来解释排除原因，但不进入价格计算。通过门槛不表示完成估值校准；可比距离、时间跨度、面积偏差、装修调整等业务阈值仍待产品确认。
- 人工参考推荐需要满足条件，排除/无匹配需要原因，意愿判断需要证据；价格关联必须属于该案例房源且已经合格。意愿不是成交概率。

`GET /api/dataset` 返回五张表，以及 `meta.mode`、`label`、`loaded_at`、`warnings`、`quarantined_count`。提示只含固定字段名、表名、从 1 开始的数据行号及原因，不含被隔离原始字段值。数据行号不含 CSV 表头，全空行会跳过。原资料由产品保管并按提示修改，API 不另存原始隔离副本。文件级格式错误返回 503 和安全错误说明。`GET /api/health` 同样实时检查数据源。

## 待产品补充

| 输入 | 负责人 | 用途与缺口 |
|---|---|---|
| 真实可使用挂牌、快照、来源核验和许可 | 产品 A | 当前全部为虚构样例；需要实际字段和完整来源引用 |
| 稳定房屋身份或授权关联证据 | 产品 A | 只能凭证据建立同一房屋历史；不能从同楼同面积合并 |
| 整套出售、可比交易及关联核验 | 产品 A | 补充时间、面积口径、差异说明及可比阈值；无依据不做估值 |
| 授权脱敏需求与人工匹配案例 | 产品 B | 验证一客多房、一房多客、预算冲突、无匹配和信息缺失 |
| 硬条件、可协商偏好、面积口径及验收规则 | 产品 B | 文本硬条件需销售确认；业务参考不能由开发默认已确认 |

未接入外汇来源和汇率日期前只保留原币种，不跨币种排序或计算价格差。没有真实模型配置时助手为规则演示模式；API 的 `assistant_mode=rules` 如实标识。
