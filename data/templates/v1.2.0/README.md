# 产品数据模板 v1.2.0

由用户统一填写和确认。五张表的英文 CSV 表头是接入 key；此目录只有空模板。

新增客户可选 area_max，与 area_min 共用 area_unit、area_basis；不能小于 area_min。面积口径未知仍待确认。v1.0/v1.1 文件无需补列即可继续导入。未提供上限等同无上限，不反填 0。

真实资料保存在 data/incoming 或 data/private，不覆盖空模板。需求修订链和客户归属属于浏览器记录，不向原始 CSV 写回。match_reference 的 draft 状态不因保存而改变。