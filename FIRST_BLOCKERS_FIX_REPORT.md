# 第一批 GitHub Release 阻断问题处理报告

日期：2026-10-02

本报告记录开源副本 `CAD-BOM-Automation-System` 的第一批发布阻断问题处理结果。所有修改均发生在开源副本中，原生产项目和生产数据未修改。

## 处理范围

本批次只处理三项问题：

1. 移除不可公开安装的 `@oai/artifact-tool`，保留 Excel 导入/导出能力。
2. 移除 `server.mjs` 中固定的开发环境 session secret。
3. 清理真实项目名称，改为通用示例名称。

未修改 CAD 解析、DWG 转换、柜体识别、材料识别、BOM 汇总、报价计算、PDF 生成或数据库结构。

## 修改文件

### Excel 依赖与兼容层

- `work/webapp/package.json`
  - 删除私有 `@oai/artifact-tool` 依赖。
  - 增加公开 npm 依赖 `exceljs` `^4.4.0`。
- `work/webapp/package-lock.json`
  - 使用 npm lockfile v3 生成，锁定 ExcelJS 4.4.0 及其传递依赖。
- `work/webapp/spreadsheet-adapter.mjs`
  - 新增 ExcelJS 兼容层，承接原有工作簿、工作表、范围、格式、导入和导出调用。
  - 现有 Excel 模板、基础资料批量导入、供应商价格导入和 BOM 导出入口继续使用同一调用方式。
- 以下文件的导入路径改为本地兼容层：
  - `work/webapp/modules/master-data-import.mjs`
  - `work/webapp/modules/supplier-import.mjs`
  - `work/webapp/export_import_template.mjs`
  - `work/webapp/export_xlsx.mjs`
  - `work/build_dwg_bom.mjs`
  - `work/build_stage5_bom.mjs`
  - `work/verify_dwg_bom.mjs`
  - `work/verify_stage5_bom.mjs`
  - `work/test_stage5_override.mjs`
- `README.md`、`THIRD_PARTY_NOTICES.md`、`OPEN_SOURCE_PREPARATION_REPORT.md`、`work/webapp/README.md`、`work/webapp/DEPLOYMENT.md`：更新公开依赖和安装说明，并移除开源文档中的内部备份名称。

### session secret

- `work/webapp/server.mjs`
  - `SESSION_SECRET` 现在只能从环境变量读取并去除首尾空白。
  - 未配置时立即抛出明确错误：
    `SESSION_SECRET must be set in .env or the process environment; no default value is provided.`
  - 不再保留任何公开默认 secret。
  - 生产环境仍要求同时配置 `SESSION_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`。
- `work/webapp/.env.example`
  - `SESSION_SECRET` 留空并标注为部署者必须填写的值，不提供可直接使用的公开 secret。

### 示例名称

- `work/generate_bom.py`
- `work/single_cabinet_validation.py`

上述脚本中的真实项目名称已替换为 `sample-project`，只影响示例输出标签，不改变解析或 BOM 规则。

## 验证结果

### 依赖安装

- 在干净临时目录使用仓库的 `package.json` 和 `package-lock.json` 执行 npm 安装，成功安装 97 个公开 npm 包。
- `package-lock.json` 为 lockfile v3，ExcelJS 4.4.0 及其依赖均来自公开 npm registry；ExcelJS 声明为 MIT 许可。
- 代码中不再存在 `@oai/artifact-tool` 的运行时导入。

### Excel 功能

- 成功生成导入模板 `.xlsx` 文件。
- 成功执行 `.xlsx` 导出后再导入的往返测试，表格内容保持可读。
- 现有 Excel 工作表、样式和导入/导出入口使用兼容层，不需要修改 CAD→BOM 流程。

### 服务启动

- 配置 `SESSION_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 后，`node server.mjs` 成功启动并返回 `/api/auth/status` HTTP 200。
- 不配置 `SESSION_SECRET` 时，服务在启动阶段明确失败，并输出上述错误；没有回退到公开默认值。

### 静态检查

- 修改后的 JavaScript 模块通过 Node 语法检查。
- 修改后的 Python 脚本通过 AST 语法检查。
- 原项目中与 CAD、BOM、报价和数据库结构相关的核心文件未发生逻辑修改；仅发生 Excel 依赖导入路径或示例项目显示名称调整。
- 开源副本当前未包含 `data/`、生产备份、真实 DWG/DXF、SQLite 数据库或 `.env` 文件。

## 使用方式

在 `work/webapp` 目录：

```powershell
npm ci
Copy-Item .env.example .env
# 编辑 .env，至少设置 SESSION_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD
node server.mjs
```

没有配置 `SESSION_SECRET` 时不要启动服务；这是有意的安全阻断。

## 未在本批次处理的问题

本报告不扩展到下一阶段优化。历史审计中提到的字体路径可移植性、完整第三方许可证逐项核对、部署环境加固等问题仍需单独评估；本批次没有修改它们。
