# BHHS Demo 数据接入契约 v1.1.0

用户已确定主链路与产品/开发分工。本契约是控制塔提供的填写与接入格式，不代表客户已确认所有字段、阈值或预测能力。

## 文件与责任

| 文件 | 负责人 | 一行的含义 |
|---|---|---|
| `listing_snapshots.csv` | 产品 A | 一行是一条挂牌在一个采集时刻的快照；同一挂牌更新另建 snapshot_id，listing_id 保持稳定。 |
| `transactions.csv` | 产品 A | 一行是一条来源中的交易记录；可比关联放到下一表，不能为多个关联重复创建同一交易。 |
| `listing_transaction_links.csv` | 产品 A | 一行关联一个 listing_id 和一个 transaction_id；同一交易可关联多个挂牌，但必须逐条说明 exact_property 或 comparable。 |
| `client_requirements.csv` | 产品 B | 一行是一份客户需求；同一 client_id 可以有不同 requirement_id。仅提供授权脱敏内容。 |
| `match_reference.csv` | 产品 B | 一行是一份需求的人工期望结果；有候选时关联一个挂牌，无匹配时可不填挂牌。仅用于验收，不是模型输出。 |

## 导入约定

- 英文 key 是程序接口；Excel 第 5 行和 CSV 第 1 行一致。Excel 数据从第 6 行开始，忽略全空行。
- `schema.json` 定义类型、要求、枚举、说明；它是字段契约文件，不是应用数据库。字段变更需同时维护导入器、筛选与匹配；运行验收另见开发交接。
- 文本使用 UTF-8；多值用 `|` 分隔，应用内可转换成数组。未知用空单元格/JSON null，未知枚举仅在给定选项允许时使用 unknown。
- 数值不能夹币种/单位/千分位文字；Excel 日期按日期值读取、显示 YYYY-MM-DD。datetime 是含时区 ISO 8601 字符串，避免丢失时区。
- 完整日期未披露时不要补造月日；将原始季度/年份放到备注并保留来源。
- 时间、金额和面积字段按来源口径保存，币种和面积口径不同不能未经处理直接比较。other 币种需在 notes 写明实际币种，完成映射前不进行价格比较。

## ID 与跨表关联

- `snapshot_id`、`transaction_id`、`link_id`、`requirement_id`、`case_id` 在各自表内唯一且稳定。
- 同一挂牌的不同采集时刻可以共用 `listing_id`；同一客户的不同需求共用脱敏 `client_id`。
- `property_id` 只在真实房屋身份已知时填写；不能用 transaction_id 或相似楼名代替。
- 房源成交关联表的 listing_id / transaction_id 必须分别存在于对应表。
- 匹配参考的 requirement_id 必须存在；listing_id 非空时须存在于房源表。no_match 时 listing_id 留空，needs_clarification 可留空；无挂牌时 pricing_link_ids 也须留空。pricing_link_ids 非空时必须属于同一挂牌且满足价格引用条件。
- 关联或案例的任一对象为 demo 时，关联/案例也必须是 demo。

## 条件校验与事实边界

1. verification_status=verified 需要实际 reviewed_by；关联 verified 还需 reviewed_at。
2. 价格非空时需币种；面积非空需单位和口径；客户 area_min 非空需 area_unit；预算上下限须 min <= max。
3. exact_property 必须有稳定房屋身份或授权记录对应证据；只有关联已核验且来源使用允许时才可作为该房屋历史。
4. pricing_eligible=yes 的首版保守门槛：交易为 sale、whole_unit，金额/币种/日期明确，关联非 unresolved，来源与关联均 verified、usage_status=approved；可比记录还要检查地区、物业类型、面积口径、时间和显著差异。阈值由产品补充，不能宣称已校准估值。
5. mortgage、gift、lease、bulk、partial_share 或 unknown 范围不进入首版住宅出售价格对比。下架不是成交，数据有来源不等于来源正确。
6. expected_result=exclude/no_match 需排除或无匹配原因；recommend/alternative/exclude 需 listing_id，recommend/alternative 需匹配理由；非空且非 unknown 的意愿判断需具体证据。review_status=confirmed 才可作为人工验收基准。
7. 演示样例与真实资料分开；usage_status=pending/restricted、未核验或缺必填的真实资料只进入待处理队列，不进入对客已核验展示。
8. 同一 listing_id 的界面默认使用最新采集快照，但保留历史。只有有来源支持的状态才能说明已售；未能再次抓取不自动变更为 sold。

## 第一批产品交付

- 产品 A 先给一组完整挂牌，能够支持区域、价格、面积、户型筛选。随后补有历史、只有可比、没有可用价格证据、重复挂牌等案例；缺口明确列出。
- 产品 B 先给授权脱敏需求或明确演示需求，再补一客多房、一房多客、预算冲突、无匹配和缺字段等人工参考结果。
- 数据数量不作为本次新承诺；先保证案例覆盖和来源可追溯。

## 客户面积口径与旧版兼容

- v1.1.0 在客户需求的 `area_unit` 后新增选填 `area_basis`，可选 `internal`、`gross`、`built_up`、`land`、`unknown`。只填写客户明确说明的口径，不从候选房源反向补齐。
- 明确字段优先用于结构化解释。字段为空或旧记录没有此字段时，兼容 `hard_constraints` 中已有英文口径表达，如 `area basis: built_up`；不要求为旧 CSV/JSON 强行补列或重填。
- 字段和可解析原文表达不同口径时保留双方内容，标记冲突并向产品/销售确认；不能静默覆盖原文、选择有利口径或把冲突算作满足。
- 显式 `unknown` 表示口径待确认，不视为匹配，也不被文本或房源口径自动替换。两种来源都缺失时同样待确认；面积单位换算不能代替口径核对。

## 版本与空模板

- 当前 `data/templates/` 顶层入口与 `data/templates/v1.1.0/` 提供相同的 v1.1.0 schema、五张空 CSV 和字段字典。
- 原 v1.0.0 schema、五张空 CSV、字典及契约保存在 `data/templates/v1.0.0/`，原 v1 Excel 保持不变。
- 本次新版 Excel 另存为 `outputs/area-basis-v1.1.0/BHHS_数据字段模板_v1.1.0.xlsx`。所有填写区为空，字典示例仍只是独立格式说明。

## 字段字典

完整说明与独立格式示例见 `data/templates/field_dictionary.csv` 和 Excel 的“06_字段字典”。

### 01_房源挂牌（产品 A）

| key | 中文 | 类型 | 要求 | 说明 |
|---|---|---|---|---|
| `snapshot_id` | 挂牌快照 ID | text | 必填 | 本表唯一且稳定；不得因为改价格复用同一个快照 ID。  |
| `listing_id` | 挂牌 ID | text | 必填 | 同一平台同一挂牌使用同一 ID；不同平台挂牌不要仅凭相似描述合并。  |
| `property_id` | 内部房屋 ID | text | 选填 | 只有可靠证据识别同一物理房屋时才跨记录共用；无法识别留空。  |
| `title` | 房源标题 | text | 必填 | 可复用来源标题；不得加入未披露的地段、设施或景观承诺。  |
| `area_name` | 区域或社区 | text | 必填 | 沿用来源名称；不同来源别名由产品给映射，不自行视为同一区域。  |
| `building_name` | 楼宇或项目名称 | text | 选填 | 来源中的楼宇/项目名称；同楼不等于同一套房。  |
| `unit_ref` | 单元或房屋标识 | text | 选填 | 仅填来源可靠披露且可用于此 Demo 的单元标识；没有则留空。  |
| `property_type` | 物业类型 | enum | 必填 | 与现房/期房和挂牌状态分开。 可选：apartment / villa / townhouse / penthouse / land / other / unknown |
| `bedrooms` | 卧室数 | integer | 选填 | Studio 填 0；未披露留空；不要填“未知”到数值列。  |
| `area_value` | 面积数值 | number | 条件必填 | 如来源披露面积则填数值，同时填写单位和面积口径。  |
| `area_unit` | 面积单位 | enum | 条件必填 | 有面积数值必须填单位；开发端可换算但不能静默改变面积口径。 可选：sqm / sqft |
| `area_basis` | 面积口径 | enum | 条件必填 | 有面积数值必须给出口径；不明时填 unknown。 可选：internal / gross / built_up / land / unknown |
| `market_segment` | 现房或期房 | enum | 必填 | 反映物业当前状态，与新挂牌/旧挂牌不同。 可选：ready / off_plan / unknown |
| `listing_status` | 挂牌状态 | enum | 必填 | active 在售；withdrawn 下架；sold 仅有成交证据时使用；下架不能自动判为成交。 可选：active / withdrawn / sold / unknown |
| `asking_price` | 挂牌价格 | number | 条件必填 | 仅填当前挂牌价；未披露留空。租金不可作为出售价格填入本表。  |
| `currency` | 价格币种 | enum | 条件必填 | 有价格必填，首版按原始币种保留；跨币种比较需要另外提供汇率来源和日期。 可选：AED / USD / EUR / GBP / other |
| `listed_at` | 首次挂牌日期 | date | 选填 | 来源未披露则留空，不以首次抓取日期冒充。  |
| `availability_date` | 可交付或入住日期 | date | 选填 | 仅填明确日期；仅有季度/年份时记录到备注，不补造月日。  |
| `amenities` | 已披露设施与特征 | multi_text | 选填 | 多值用 \| 分隔，例 pool\|parking；客户要求的设施不能反向填成房源已具备。  |
| `evidence_excerpt` | 关键事实证据摘录 | text | 选填 | 支持价格、户型、状态等关键字段的简短原文；注明未覆盖字段。  |
| `data_kind` | 数据性质 | enum | 必填 | 真实公开、真实授权与演示数据必须区分；不能以公开可见替代使用许可。 可选：real_public / real_authorized / demo |
| `source_name` | 来源名称 | text | 必填 | 网站、登记机关或授权脱敏资料名称；演示数据填“演示样例”。  |
| `source_ref` | 来源链接或资料编号 | text | 必填 | 公开数据填可追溯原文 URL；内部资料填脱敏文件编号，不填访问令牌或个人身份信息。  |
| `source_date` | 来源发布日期 | date | 选填 | 仅填原文明确的完整日期；不把采集日期、登记日期或估计日期填在这里。  |
| `captured_at` | 采集或整理时间 | datetime | 必填 | 实际采集/整理时间，采用 ISO 8601 且含时区。  |
| `verification_status` | 核验状态 | enum | 必填 | verified 表示产品已核验相应字段；source-backed 不自动意味着可用。 可选：verified / needs_review / conflict |
| `usage_status` | 使用许可状态 | enum | 必填 | approved 表示已确认可用于本 Demo；pending 待确认；restricted 不可导入演示。 可选：approved / pending / restricted |
| `reviewed_by` | 核验人 | text | 条件必填 | verification_status 为 verified 时填写实际核验人；不得默认已核验。  |
| `notes` | 缺失与限制说明 | text | 选填 | 记录未披露字段、冲突、过期风险等；未知数值留空而不是填 0。  |

### 02_成交记录（产品 A）

| key | 中文 | 类型 | 要求 | 说明 |
|---|---|---|---|---|
| `transaction_id` | 内部交易 ID | text | 必填 | 本表唯一；交易 ID 不能当作房屋 ID。  |
| `source_record_id` | 来源交易记录 ID | text | 选填 | 保留原始登记/来源编号，用于去重；未知留空。  |
| `property_id` | 内部房屋 ID | text | 选填 | 有独立可靠的物理房屋身份依据才填写；不能仅以楼宇、面积匹配生成。  |
| `record_type` | 记录类型 | enum | 必填 | 出售、租赁、抵押、赠与分别记录；价格对比首版只使用符合条件的出售记录。 可选：sale / lease / mortgage / gift / other / unknown |
| `transaction_scope` | 交易范围 | enum | 必填 | 整套、部分份额、打包交易要区分，不能直接混算单套价格。 可选：whole_unit / partial_share / bulk / unknown |
| `transaction_date` | 成交或登记日期 | date | 必填 | 以来源口径为准，date_basis 指明这是成交日期还是登记日期；缺失时留空并标待核验，不进入时间轴。  |
| `date_basis` | 日期口径 | enum | 必填 | source_date 另存来源发布时间。 可选：contract / registration / unknown |
| `amount` | 交易金额 | number | 必填 | 以原始交易金额填写；不要填估值、挂牌价或 AI 推断。  |
| `currency` | 交易币种 | enum | 必填 | 按来源原币种填写。 可选：AED / USD / EUR / GBP / other |
| `area_name` | 区域或社区 | text | 必填 | 沿用来源名称；不同来源别名由产品给映射，不自行视为同一区域。  |
| `building_name` | 楼宇或项目名称 | text | 选填 | 来源中的楼宇/项目名称；同楼不等于同一套房。  |
| `unit_ref` | 单元或房屋标识 | text | 选填 | 仅填来源可靠披露且可用于此 Demo 的单元标识；没有则留空。  |
| `property_type` | 物业类型 | enum | 必填 | 与现房/期房和挂牌状态分开。 可选：apartment / villa / townhouse / penthouse / land / other / unknown |
| `bedrooms` | 卧室数 | integer | 选填 | Studio 填 0；未披露留空；不要填“未知”到数值列。  |
| `area_value` | 面积数值 | number | 条件必填 | 如来源披露面积则填数值，同时填写单位和面积口径。  |
| `area_unit` | 面积单位 | enum | 条件必填 | 有面积数值必须填单位；开发端可换算但不能静默改变面积口径。 可选：sqm / sqft |
| `area_basis` | 面积口径 | enum | 条件必填 | 有面积数值必须给出口径；不明时填 unknown。 可选：internal / gross / built_up / land / unknown |
| `registration_segment` | 登记时现房或期房 | enum | 选填 | 交易发生时的现房/期房类别，不自动等于当前挂牌状态。 可选：ready / off_plan / unknown |
| `evidence_excerpt` | 交易证据摘录 | text | 条件必填 | 已核验记录需记录金额、日期与类型的证据位置/摘录；内部资料可以使用页码或行号。  |
| `data_kind` | 数据性质 | enum | 必填 | 真实公开、真实授权与演示数据必须区分；不能以公开可见替代使用许可。 可选：real_public / real_authorized / demo |
| `source_name` | 来源名称 | text | 必填 | 网站、登记机关或授权脱敏资料名称；演示数据填“演示样例”。  |
| `source_ref` | 来源链接或资料编号 | text | 必填 | 公开数据填可追溯原文 URL；内部资料填脱敏文件编号，不填访问令牌或个人身份信息。  |
| `source_date` | 来源发布日期 | date | 选填 | 仅填原文明确的完整日期；不把采集日期、登记日期或估计日期填在这里。  |
| `captured_at` | 采集或整理时间 | datetime | 必填 | 实际采集/整理时间，采用 ISO 8601 且含时区。  |
| `verification_status` | 核验状态 | enum | 必填 | verified 表示产品已核验相应字段；source-backed 不自动意味着可用。 可选：verified / needs_review / conflict |
| `usage_status` | 使用许可状态 | enum | 必填 | approved 表示已确认可用于本 Demo；pending 待确认；restricted 不可导入演示。 可选：approved / pending / restricted |
| `reviewed_by` | 核验人 | text | 条件必填 | verification_status 为 verified 时填写实际核验人；不得默认已核验。  |
| `notes` | 缺失与限制说明 | text | 选填 | 记录未披露字段、冲突、过期风险等；未知数值留空而不是填 0。  |

### 03_房源成交关联（产品 A）

| key | 中文 | 类型 | 要求 | 说明 |
|---|---|---|---|---|
| `link_id` | 关联 ID | text | 必填 | 本表唯一；作为匹配参考和价格证据的引用 ID。  |
| `listing_id` | 挂牌 ID | text | 必填 | 必须已存在于房源挂牌表。  |
| `transaction_id` | 交易 ID | text | 必填 | 必须已存在于成交记录表。  |
| `relation_type` | 关联类型 | enum | 必填 | exact_property 同一房屋且有证据；comparable 可比对象；unresolved 尚不能判断。 可选：exact_property / comparable / unresolved |
| `match_basis` | 关联或可比依据 | text | 必填 | exact_property 需说明稳定单元标识/授权记录如何对应；同楼或面积相近只能作为可比依据。  |
| `differences` | 差异与不可比因素 | text | 选填 | 面积口径、楼层、朝向、交易时间、装修、份额等差异。  |
| `pricing_eligible` | 是否可用于价格参考 | enum | 必填 | yes 仅在交易类型、范围、币种、时间、面积口径和来源核验满足首版规则时使用；不代表估值预测。 可选：yes / no / pending |
| `evidence_refs` | 关联证据引用 | text | 必填 | 填写两侧来源引用或授权内部资料编号；多个用 \| 分隔。  |
| `verification_status` | 关联核验状态 | enum | 必填 | 此列专门表示关联是否核验，不能继承单条交易的核验状态。 可选：verified / needs_review / conflict |
| `reviewed_by` | 关联核验人 | text | 条件必填 | verified 时必须填写。  |
| `reviewed_at` | 关联核验时间 | datetime | 条件必填 | verified 时记录带时区的真实时间。  |
| `data_kind` | 数据性质 | enum | 必填 | 任一关联对象为演示时，关联也必须标 demo。 可选：real_public / real_authorized / demo |
| `notes` | 备注 | text | 选填 | 未解决的关联问题和排除原因。  |

### 04_客户需求（产品 B）

| key | 中文 | 类型 | 要求 | 说明 |
|---|---|---|---|---|
| `requirement_id` | 客户需求 ID | text | 必填 | 本表唯一；修改需求版本时保留旧版本并分配新 ID。  |
| `client_id` | 脱敏客户 ID | text | 必填 | 使用脱敏代号，禁止以电话号码、邮箱或真实姓名当作 ID。  |
| `client_alias` | 客户代称 | text | 必填 | 例如客户 A；不得填真实联系方式。  |
| `sales_owner` | 负责销售 | text | 选填 | 内部允许使用的姓名或代号；未知留空。  |
| `raw_request` | 脱敏需求原文 | text | 必填 | 客户主动提供的需求或授权脱敏沟通摘要，作为结构化条件的依据。  |
| `budget_min` | 预算下限 | number | 选填 | 仅填客户明确表达的预算；未知留空，不推断财富。  |
| `budget_max` | 预算上限 | number | 选填 | 若有上下限，必须下限不大于上限。  |
| `currency` | 预算币种 | enum | 条件必填 | 有预算数值时填写。 可选：AED / USD / EUR / GBP / other |
| `budget_constraint` | 预算约束 | enum | 必填 | hard 硬性上限；flexible 可协商；未表态填 unknown。 可选：hard / flexible / unknown |
| `preferred_areas` | 偏好区域 | multi_text | 选填 | 多值用 \| 分隔；保留客户原话及与区域字典的映射。  |
| `property_types` | 偏好物业类型 | multi_text | 选填 | 使用房源物业类型英文 key，多值用 \| 分隔。  |
| `bedrooms_min` | 最少卧室数 | integer | 选填 | Studio 为 0，未知留空。  |
| `area_min` | 最小面积 | number | 选填 | 同时记录单位；已明确的客户面积口径填 area_basis，未明确时留空或 unknown，不能从候选房源反向补齐。  |
| `area_unit` | 面积单位 | enum | 条件必填 | 有最小面积时填写。 可选：sqm / sqft |
| `area_basis` | 客户面积口径 | enum | 选填 | 客户明确说明的面积口径。新字段优先；空字段兼容 hard_constraints 中的英文口径表达，如 area basis: built_up。字段与文本冲突需确认；unknown 不算已知口径，不能回填候选房源口径。 可选：internal / gross / built_up / land / unknown |
| `purchase_purpose` | 购买目的 | enum | 必填 | 客户主动说明的目的；未知用 unknown。 可选：self_use / investment / mixed / unknown |
| `market_preference` | 现房期房偏好 | enum | 必填 | 客户未表态填 unknown，不把未表态当作均可。 可选：ready / off_plan / either / unknown |
| `purchase_by` | 计划购买日期 | date | 选填 | 仅明确完整日期时填；“尽快”“本季度”保留在原文/备注。  |
| `move_in_by` | 最晚入住日期 | date | 选填 | 未知留空；与计划购买日期分开。  |
| `hard_constraints` | 其他硬性条件 | text | 选填 | 如必须带车位；只采用客户明确表达的条件。  |
| `soft_preferences` | 可协商偏好 | text | 选填 | 如偏好高楼层、泳池等；不自动升级成排除条件。  |
| `intent_evidence` | 购买意愿证据 | text | 选填 | 记录主动约看、报价、时间计划等实际信号，不填凭空推断的意愿分数。  |
| `missing_questions` | 尚需追问 | text | 选填 | 列影响推荐的缺口，例如预算是否含费用。  |
| `data_kind` | 数据性质 | enum | 必填 | 真实公开、真实授权与演示数据必须区分；不能以公开可见替代使用许可。 可选：real_public / real_authorized / demo |
| `source_name` | 来源名称 | text | 必填 | 网站、登记机关或授权脱敏资料名称；演示数据填“演示样例”。  |
| `source_ref` | 来源链接或资料编号 | text | 必填 | 公开数据填可追溯原文 URL；内部资料填脱敏文件编号，不填访问令牌或个人身份信息。  |
| `source_date` | 来源发布日期 | date | 选填 | 仅填原文明确的完整日期；不把采集日期、登记日期或估计日期填在这里。  |
| `captured_at` | 采集或整理时间 | datetime | 必填 | 实际采集/整理时间，采用 ISO 8601 且含时区。  |
| `verification_status` | 核验状态 | enum | 必填 | verified 表示产品已核验相应字段；source-backed 不自动意味着可用。 可选：verified / needs_review / conflict |
| `usage_status` | 使用许可状态 | enum | 必填 | approved 表示已确认可用于本 Demo；pending 待确认；restricted 不可导入演示。 可选：approved / pending / restricted |
| `reviewed_by` | 核验人 | text | 条件必填 | verification_status 为 verified 时填写实际核验人；不得默认已核验。  |
| `notes` | 缺失与限制说明 | text | 选填 | 记录未披露字段、冲突、过期风险等；未知数值留空而不是填 0。  |

### 05_匹配验收参考（产品 B）

| key | 中文 | 类型 | 要求 | 说明 |
|---|---|---|---|---|
| `case_id` | 验收案例 ID | text | 必填 | 本表唯一。  |
| `requirement_id` | 客户需求 ID | text | 必填 | 必须存在于客户需求表。  |
| `listing_id` | 挂牌 ID | text | 条件必填 | recommend/alternative/exclude 时必填且须存在于房源表；no_match 时留空，needs_clarification 可留空。同一房源可有多个客户案例。  |
| `expected_result` | 人工期望结果 | enum | 必填 | recommend 推荐；alternative 备选；exclude 排除；needs_clarification 需补充信息；no_match 无匹配房源。 可选：recommend / alternative / exclude / needs_clarification / no_match |
| `expected_rank` | 人工参考顺序 | integer | 选填 | 只在同一需求的候选之间比较；不是成交概率。  |
| `matched_conditions` | 满足的条件 | text | 条件必填 | recommend/alternative 时说明客户条件与房源字段如何对应。  |
| `conflicting_conditions` | 冲突条件 | text | 条件必填 | exclude/no_match 时必须解释排除或无匹配依据；其余情况有冲突也需记录。  |
| `intent_assessment` | 客户意愿参考 | enum | 选填 | 只有客户主动表达或经纪人记录作为依据时填写；无依据用 unknown。 可选：high / medium / low / unknown |
| `intent_basis` | 意愿判断依据 | text | 条件必填 | intent_assessment 非 unknown 时需引述具体沟通证据，不从身份/财富推断。  |
| `pricing_link_ids` | 价格证据关联 ID | multi_text | 选填 | 引用房源成交关联表的 link_id；多个用 \| 分隔。只能使用同一 listing_id 的已审核合格关联。  |
| `price_reference_note` | 价格参考说明 | text | 选填 | 说明挂牌与可比成交的关系及限制；无依据不填区间。不是客户成交价预测。  |
| `follow_up_questions` | 期望追问 | text | 选填 | 需求不完整时应该询问什么。  |
| `next_action` | 期望下一步 | text | 选填 | 供经纪人确认使用的建议，不触发外发或自动联系。  |
| `case_type` | 覆盖场景 | enum | 必填 | 补齐一客多房、一房多客、预算冲突、无历史、无匹配、信息缺失等验收情形。 可选：standard / multiple_properties / multiple_clients / budget_conflict / no_history / no_match / missing_fields / other |
| `business_reviewer` | 业务核验人 | text | 必填 | 人工参考结果的实际确认人。  |
| `review_status` | 业务确认状态 | enum | 必填 | draft 仅草案；confirmed 才可作为验收基准。 可选：draft / confirmed |
| `reference_evidence` | 参考答案依据 | text | 必填 | 引用客户原文、房源/交易字段及产品规则，不填“AI 认为”作为唯一依据。  |
| `data_kind` | 数据性质 | enum | 必填 | 任一关联对象为演示，则案例也为 demo。 可选：real_public / real_authorized / demo |
| `notes` | 备注 | text | 选填 | 尚未确认的规则和例外情况。  |
