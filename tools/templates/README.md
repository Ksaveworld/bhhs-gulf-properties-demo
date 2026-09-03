# 数据模板生成

源数据是 `data/templates/schema.json`；生成器同时输出 Excel、五张空白 CSV、字段字典和开发契约，保证英文 key 一致。

生成器依赖 Codex 工作区提供的 Node.js 和 `@oai/artifact-tool`，不是 Demo 应用的运行依赖。使用 `load_workspace_dependencies` 返回的 Node.js 和包目录，在本轮临时工作目录建立指向该包目录的 `node_modules` junction；将同一生成器复制到临时目录执行，并传入项目根路径：

```text
<bundled-node> <temporary-directory>/build-data-template.mjs E:/bhhs
```

生成器从项目根目录的 `data/templates/schema.json` 读取版本。当前入口的空 CSV、字典、README 和开发契约会同步更新，另生成 `data/templates/v<version>/` 版本副本；新版 Excel 保存到 `outputs/area-basis-v<version>/`，检查截图位于 Git 忽略的 `.work/template-qa-v<version>/`。CSV 为 UTF-8 BOM + CRLF，只有英文表头；Excel 第 5 行是 key，第 6 行起的填写区为空。

首次升级已将原 v1.0.0 schema、五张 CSV、字典、说明及契约逐文件复制到 `data/templates/v1.0.0/` 并核对 SHA-256；原 `outputs/01a06522-fb17-7d92-9e65-14eaf803b75e/BHHS_数据字段模板_v1.xlsx` 不变。后续升级前保留上一个版本，不能让生成器覆盖历史原件。真实填写资料始终另存到 `data/incoming/` 或 `data/private/`。

当前导出器没有保留冻结窗格设置。填写说明提供 Excel 中选择 C6 后冻结的操作步骤，不将未导出的设置宣称为已完成。

修改 schema 后需要重新生成并核对表头、枚举、格式与空白填写区；关联语义变化时一并更新生成器内的契约说明。应用导入器和真实样本校验由开发任务实现。
