# 第二轮修改与验证记录

日期：2026-09-06。依据：`F:/Downloads/BHHS-Demo-修改方案-第二轮.md`；沿用第一轮 HTML 的英文界面与主链路。

## 已实现

| 文档要求 | 实现与检查 |
| --- | --- |
| P0 每步回退 | 身份确认、冲突选择、缺失信息和完成消息提供轻量回退；清除对应及后续选择，收起后续消息；重新选择不继承先前 Keep CRM 的结果。详情顶部可返回 Home。 |
| P0 自适应 | Home 和详情正文最大宽度 960px、水平居中。1440px、1920px 的几何检查与截图查看通过。 |
| P0 重复标题 | 客户库保留一个标题；房源库原有标题、副标题保留。 |
| P1 分类 | 通话、WhatsApp、邮件、图片、笔记、CRM 分组折叠；类内时间倒序、时间前置，初始只展开最近一组。9 条来源记录包含一个 4 图相册；图片组明确显示 4 images。 |
| P1 原文 | 右侧宽抽屉：通话元信息、滚动转写及关键句；47 条聊天气泡及起止时间；邮件完整字段、正文与可展开附件；四图网格、上传者及时间；笔记原文；CRM 原始字段。抽屉顶部固定录入时间、录入者及渠道。 |
| P1 联动 | 字段点击展开对应组并高亮来源；手动收起后再点同一字段仍能重新展开。新增通话和销售记录按类别归入，保存的编辑内容可回看。 |
| P2 相似成交 | 两条相似客户右侧新增 View sale；弹窗包含结果、画像、难点、解法和对 Khalid 的参考。Haddad 内容按第二轮方案实现。 |
| P2 本人入口 | 弹窗可进入现有客户库的本人详情；同一个详情组件在姓名旁显示 Past sale，打开同一份成交案例；保留返回上一客户。 |

## 实际验证

- `npm run build`：通过。存在原有的大文件体积提示；本轮没有扩大为打包优化项目。
- `npm test`：199/199 通过。
- `npx playwright test tests/browser/client-agent.spec.ts tests/browser/second-round.spec.ts tests/browser/property-v3.spec.ts`：18/18 通过。
- 收起后重复点击同一字段的修复后，重新构建和来源场景复验通过；历史弹窗补做稳定截图、滚动参考区可见性和本人入口复验通过。
- 浏览器场景覆盖身份分支、Adopt/Keep、付款缺失、回退、原文六类入口、通话放弃和保存、联动预算与付款、预约预填、编辑、普通客户独立记录及房源库四条回归。
- 已查看 1440px、1920px Home/详情截图、图片抽屉、历史案例及其参考区。完整回归截图位于忽略目录 `.work/round2-full-regression/`；最终成交截图位于 `.work/browser-results/`。
- 未声称跑过全部历史浏览器测试。PropertyLibrary、PropertyDetail 组件与房源数据未修改；本轮未新增列表排序、标签、批量操作或跨类别时间流。

## 演示素材与真实能力边界

原附件未提供实际通话录音、聊天导出、邮件附件或客户照片。本轮增加的原文、时间和参与人属于明确标注的演示样本，不能用作真实客户事实或真实数据接入证明。通话抽屉显示已存的演示转写；新增外呼显示销售审核后的演示通话记录。

Haddad 案例来自第二轮方案。Okonjo 的价格、房源及六周全款成交来自第一轮原型；补充的难点、解法和参考为演示叙事，弹窗已注明。历史样例原始创建时间未提供，显示未记录。

电话灰字逐字保留：`Outbound calling — flow preview. Telephony connection is in development.` 通话、CRM 保存和邀请继续为 Demo 行为；本轮没有接入真实电话、CRM 或外发消息。

## 图片生成记录

使用内置 `image_gen` 工具生成一张四象限室内示例图，在图片网格中按象限显示；不是客户或真实房源图片。最终项目路径：`E:/bhhs/apps/web/src/assets/demo-interiors.png`。

最终提示词：

> Create one square photorealistic interior photography contact sheet for a fictional luxury real-estate software demo. Exact 2 by 2 grid, four equal square quadrants, zero gutters, no text, no labels, no border, no people. Upper left: modern airy living room, pale limestone, cream sofa, floor to ceiling glass with palm trees beyond. Upper right: contemporary open kitchen with light oak cabinetry and pale marble island, daylight. Lower left: calm pale stone interior architectural detail, minimal staircase with glass balustrade and natural sunlight. Lower right: minimalist cream bedroom with open coastal light, plain wood furnishings. All four photographs distinct views, understated modern minimal taste, realistic materials, natural midday light. Entire image strictly a four-quadrant photo grid suitable for CSS quadrant display in a demo material gallery; no real property claims, no logos.

## 交付状态

本轮本地修改与验证完成，使用 `npm run dev`，预览地址 `http://127.0.0.1:5173/`。最初交付仅包含本地修改；用户随后明确要求“上线”，已于 2026-09-06 发布。

P0 提交：`c2a46c7`。来源模型与独立素材组件提交：`a6073f9`。本记录随最后的详情集成和成交案例提交一起保存。

## 第二轮上线验证

- 发布应用版本：`77f83ac`。Vercel 项目：`bhhs-gulf-properties-demo`，production 状态 READY。
- 部署 ID：`dpl_HzrzgQeu4Esqqu1THYmXiBpNv5S5`。
- 正式网址：[BHHS Gulf Properties Demo](https://bhhs-gulf-properties-demo.vercel.app/)。已核对该别名指向本次部署 `bhhs-gulf-properties-demo-dbby0xivt-kwillsaveworld.vercel.app`。
- 云端 `npm run build:public` 通过，公开快照导出成功；线上主文件 `index-CZIrvzLO.js` 与本地已验证应用构建一致。
- 无登录浏览器验证：首页、健康接口、数据接口及图片均为 HTTP 200；所有五张数据表均为 demo，隔离记录数为 0，页面异常为 0。示例图片实际加载为 1254×1254。
- 正式网址六项浏览器场景最终通过：外呼保存与预约预填、逐步回退、1440px/1920px 居中与标题、六类素材与字段联动、两位历史成交及客户库本人入口。
- 首次来源场景检查发生在图片加载完成之前而失败；测试改为等待图片真实加载（最多 15 秒）后，对正式网址专项复验通过。应用代码未因此变化。
- 发布回执和截图在忽略目录 `.work/round2-release/`；发布后的提交仅记录验证并修正测试等待方式，无需再次发布应用。
