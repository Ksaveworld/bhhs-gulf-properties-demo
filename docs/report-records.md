# 上下文报告与本机看房记录

V3 延续取消独立 Reports 页面和导航。**Property Details** 顶部的 **Export Report** 对应当前房源，房源列表不再有导出列；**Client Details** 顶部的 **Export Report** 对应当前客户及选中方案。导出弹窗选择 PDF 或 Word，点击 **Download report** 下载文件，不需要重新选择客户或房源。旧 Reports 地址回到房源库，不再提供旧报告工作区。

房源报告包含当前价格与基础信息、**Property Transaction History**、**Comparable Property Transactions**，以及 **Condition Met / Needs Clarification** 潜客。价格折线与成交节点来自同屋历史，可比成交单独列出；币种、面积口径、合同/登记日期不混用。无历史保留空态，不补造交易。有效来源引用保留，重复 Original Evidence 段落不再平铺，原始记录不变；不输出 Hard Conflict 分组或内部 Snapshot / Link 等编号。

客户报告包含归属、选中方案的当前需求及变更历史、**Best Matches / Worth Considering** 推荐和 **Viewing History**。同客独立方案不拼接为新的预算或偏好；报告使用当前页面已选上下文与同一套匹配结果。公司客户的本地修订仍为公司客户，归属沿用原件；其他销售的私客或本地修订不会被放入当前身份的导出。

PDF 通过浏览器字体渲染为图像页面，保留中英文显示和图表，但不能选取或搜索正文文字；Word 文件包含可编辑文字与内嵌图表。报告生成失败时保留弹窗并提示错误，不把失败显示为已下载。涉及演示数据的文件保留明确虚构声明；文件可下载不意味着来源、许可或业务结果已确认，也不自动外发。

## 客户看房记录

在 **Clients & needs → View Client Details** 打开客户抽屉。抽屉固定两个页签：**Recommended Properties** 显示当前需求、方案选择、需求历史与分组推荐；**Viewing History** 显示已看房源、评价和看房录入，不另设报告页或第三个业务页签。

登录演示 Sales ID 后，在 **Viewing History → Add a Viewing Record** 填写房源、本机看房时间、反馈及明确偏好标签，通过 **Save Viewing Record** 保存。成功写入并回读后更新时间线和记录数；刷新、重开同一浏览器配置/地址/批次版本/销售身份后恢复。未填写的反馈不推断为正面；正面到访评价不自动生成偏好标签。

推荐范围使用当前 AED 房源口径。看房记录及其关联房源则保留来源库中的原币种，包括原有 USD 房源；可以从看房历史打开对应详情，不因其不在 AED 推荐列表中就删除记录或把价格改标为 AED。

看房条目的 **Review as Preference Update** 将该次反馈与明确标签带入当前方案的编辑草稿。销售复核并点击 **Save requirements** 后才追加显式需求修订，变化进入 **Requirement History**。仅保存看房记录不会自动改需求、把偏好升级为硬条件或改变原始导入记录。修订的删除、恢复与归属规则见 [需求本机保存](local-requirements.md)。

| 内部字段 | 含义 |
|---|---|
| `record_id`、`client_id`、`listing_id`、`sales_id` | 独立看房记录及其客户、挂牌与记录者身份 |
| `viewed_at`、`created_at` | 销售输入的看房时间与浏览器记录时间，均保存 UTC ISO；表单注明本机时间，时间线按浏览器本地时间显示；不替代客户计划购房日期 |
| `feedback`、`feedback_signal` | 销售原文与主动选择的 positive / mixed / negative / not_recorded |
| `preference_tags` | 仅主动勾选的地区、类型或面积偏好；正面到访反馈不自动生成标签 |
| `source_kind`、`source_ref` | sales_entered 或 fictional_example，来源为本机销售记录 ID 或虚构示例 ID |
| `data_kind` | 涉及虚构客户/房源为 demo；真实资料的人工录入为 sales_recorded，标记为销售记录不代表已核验 |

存储版本为 1，键包含批次范围和 Sales ID。追加写入检查修订号、关联、字段及写后回读，失败保留表单并提示。删除该客户最后一份可见需求后，其看房记录不可见，但原存储不被连带抹除；仍有同客原件或其他副本时继续显示。之后另加记录不会覆盖被暂时隐藏的记录。此功能不写回原有五表，也不进入命令行人工案例对照。

## 当前展示边界与演示假设

当前界面展示逐条看房记录、明确反馈和记录数；旧 Reports 中按地区/类型/面积统计到访、偏好及同预算客群的汇总不再作为当前入口。历史统计函数或旧用例不能被描述为本版仍展示的功能，也不能作为已确认的业务规则。

观察到访不等于偏好，正面反馈不证明客户喜欢所有维度。需求中的缺失口径、冲突原文、未知购买日期和待澄清项，以及看房记录中的销售原文继续保留。保存、恢复原条件或导出均不改变人工参考的 draft 状态。现有规则助手没有训练或调用模型，不推断资产、购买力或成交概率。

**Viewing History → Viewing Examples → Load Fictional Viewings** 必须主动点击，仅为当前符合演示数据条件的客户选择 demo 房源并追加虚构记录；不为包含真实需求的客户生成示例。每条标记 **Fictional example**，来源、看房时间和反馈只用于交互演示，不代表真实到访。已存在虚构示例时按钮不再重复追加。原始需求与人工 draft 不变，该按钮不能代替业务假设、真实证据或授权确认。

演示身份仅用于本机界面分区，不是正式认证；同一浏览器使用者可以选择其他 Sales ID 或检查本机存储。当前没有服务器备份、跨设备同步或真实客户权限管理。真实业务数据需另行提供授权、访问范围和看房记录依据。
