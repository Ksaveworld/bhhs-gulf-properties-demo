# 对客 Demo 修改与验收（2026-09-07）

依据：用户提供的 `F:/Downloads/BHHS对客Demo修改建议清单_2026-09-07.md`。本轮用户明确要求“严格遵守 md 修改，并提交线上、上线”，授权在现有 BHHS 项目正式发布。文档中的“建议清单不直接修改代码”是材料描述，不替代本次执行要求。

## 修改与范围

| 清单 | 实现 |
| --- | --- |
| P0 推荐房源详情 | 原卡片只切换价格策略状态，未打开详情；现接入现有详情导航。三套原型房源通过独立适配器提供已有名称、地址、挂牌价、户型和说明，不误关联房源库里的其他记录。复用 PropertyDetail 和全部页签。 |
| P0 返回与状态 | 房源 Drawer 覆盖在客户详情之上；原客户组件保留挂载，不清除编辑与临时状态。普通客户推荐房源的名称和详情按钮都可打开；客户原模块、来源高亮、滚动位置和未保存看房备注保留。 |
| P1 历史成交 | 右侧 880px（最大 96vw）Drawer，固定标题、导出与页脚，内容独立滚动。六个分区：成交概览、当时画像、看房决策、难点与解法、参考／经验、来源摘要。 |
| P1 本人入口 | 已成交客户姓名附近的原 Past sale 统一为 Past deal，打开同一案例与 Drawer；普通客户不新增此按钮。 |
| P1 导出 | 顶部 Export 提供 Export as PDF / Export as Word；复用已有报告生成器，Drawer 和下载读取同一份报告内容。文件名带历史客户姓名与已知成交期间。 |
| 暂缓 | 不新增普通客户通用画像导出，不增加多交易管理。 |

未定细节采用清单建议：PDF 与 Word 两种格式、单笔案例、Past deal、单页分区 Drawer。

## 数据边界

- 历史成交内容来自既有 `shared/prototype-cases.ts` 和原相似客户摘要；看房与决策过程只整理已有记录。经验部分为基于现有案例的建议。
- Haddad 的三次看房来自原客户页摘要；金额、全款、11 周和难点来自既有案例。Okonjo 仅保留已知年份，不补造成交月份、预算、卧室数或看房次数。
- Okonjo 原过程叙事继续明确标记为已有演示叙事，非真实客户记录。不存在原始历史邮件、聊天或录音附件时，来源区如实说明。
- 仅已存在的 Khalid 案例关系显示 Relevance to Current Client；本人或无明确关系的客户显示 Key takeaways，避免串用客户事实。
- 三套原型推荐不新增面积、真实物业身份或成交关联；无关联的价格证据页显示缺少记录，不能把主页面已有价格策略冒充已核验成交。
- 公共构建仍仅导出固定 demo 快照；真实输入、隔离数据和本地临时文件不发布。

## 本地验证

- P0 提交 `736adf4`：A／B／C 三条浏览器链路通过，三套原型房源分别核对名称、价格、地址；普通房源验证按钮及名称点击；保留编辑内容、来源高亮、模块与未提交看房备注。3 项导航及适配器检查通过。
- `npm test`：202/202 通过。
- 浏览器回归：`client-agent.spec.ts`、`second-round.spec.ts`、`property-v3.spec.ts`、`customer-demo-release.spec.ts`，23/23 通过。
- PDF 排版检查发现 Haddad 本人报告因重复预算行产生一行尾页；移除重复显示，画像中的原预算完整保留。调整后历史导出两场景重新通过，并重新通过 2 项报告模型检查与 `npm run build:public`。
- 两位客户 × 两个入口 × 两种格式，8 份真实下载通过。Word 解包核对所有标题与正文，PDF 用 pypdf 读取并通过 Poppler 渲染；四份最终 PDF 均为完整的一页，已逐份查看，无空白、文字截断或多余尾页。
- 已查看历史 Drawer 顶部、参考区和 PDF 页面。QA 产物存于忽略目录 `.work/customer-release-regression/`、`.work/customer-deal-final/` 与 `.work/customer-deal-pdf-final/`。
- 初次浏览器断言在 Drawer 入场动画结束前读取位置；已改为等待实际停靠右侧后再核对。没有修改应用动画以绕过检查。
- 以上为本地 Chrome 演示验收，不代替真实业务数据验收或全浏览器兼容性认证。线上状态另记在发布回执中。

## 正式发布回执

- 已发布应用版本：`b3a6d0086a5008f879922df3b3253e8971b99c7d`，包含 P0 的 `736adf4`。两个应用提交均已推送到 `origin/codex/client-agent-workspace`，无历史重写。
- Vercel 项目：`bhhs-gulf-properties-demo`；部署 ID：`dpl_DzcP2ydTqKn3duoytDcgPRxWYX5Z`，target=production，状态 READY。
- 正式网址：[BHHS Gulf Properties Demo](https://bhhs-gulf-properties-demo.vercel.app/)。部署地址：`bhhs-gulf-properties-demo-f8iyceizk-kwillsaveworld.vercel.app`。
- 自动发布仅更新了带团队后缀的默认别名，原对客网址最初仍指向上次部署。已显式将原对客网址关联到本次部署；随后 `vercel inspect` 对原网址解析到本次部署 ID，匿名浏览器读取到本次主资源 `/assets/index-rsrgE0pj.js`，与本地最终构建一致。
- 原正式网址匿名检查：首页、health、dataset 均 HTTP 200；44 条公开记录全部为 demo，quarantined_count=0；检查期间页面异常 0，非读取网络请求 0。
- 原网址 A～E 五条链路最终全部通过：Home 与客户库的三套推荐逐个打开、现有房源→潜在客户→推荐房源逐层返回、两位相似成交、两位本人 Past deal。线上再次完成 8 份 PDF／Word 下载及内容核对。
- 首次线上 A／B 的精确滚动断言发现 3px 差异。当时未等待外部字体加载；补充等待 `document.fonts.ready` 后两场景再次通过，原像素级断言保留。C／D／E 已在同一应用版本通过，应用代码没有为测试发生修改。
- 已查看线上历史 Drawer。线上检查和下载记录在 `.work/customer-production/`。最终补充提交仅含本回执与测试等待，不改变已发布应用。
