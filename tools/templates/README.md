# 数据模板生成

源数据是 `data/templates/schema.json`；生成器同时输出 Excel、五张空白 CSV、字段字典和开发契约，保证英文 key 一致。

生成器依赖 Codex 工作区提供的 Node.js 和 `@oai/artifact-tool`，不是 Demo 应用的运行依赖。配置此模块的解析路径后，在项目根目录执行：

```text
node tools/templates/build-data-template.mjs
```

输出目录由脚本中的 `outputDir` 指定，检查截图放在被 Git 忽略的 `.work/template-qa/`。CSV 为 UTF-8 BOM，行尾 CRLF；Excel 以第 5 行作为字段 key，第 6 行开始填写。生成器会覆盖空白模板，真实填写资料应另存。

当前导出器没有保留冻结窗格设置。填写说明提供 Excel 中选择 C6 后冻结的操作步骤，不将未导出的设置宣称为已完成。

修改 schema 后需要重新生成并核对表头、枚举、格式与空白填写区；关联语义变化时一并更新生成器内的契约说明。应用导入器和真实样本校验由开发任务实现。
