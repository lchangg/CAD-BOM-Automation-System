# GitHub Release Audit V2

审计日期：2026-10-02  
审计对象：`CAD-BOM-Automation-System` 开源副本  
审计类型：只读发布审计。本轮没有修改代码、数据库结构或运行逻辑；仅新增本报告。

## 结论摘要

当前副本已经通过上一轮阻断项的主要复核：没有发现真实项目数据，运行时不再依赖私有 Excel 包，session secret 不再有固定回退值，服务在显式配置环境变量后可以启动。

但当前版本还不建议直接创建正式 GitHub Release。主要原因是：

1. 仓库直接携带 LibreDWG Windows 二进制和 DLL，现有说明标注了 GPLv3，但没有随副本提供完整的对应源代码/许可证材料，发布合规性仍需人工确认。
2. Python 运行依赖没有 `requirements.txt`、`pyproject.toml` 或锁定版本，陌生开发者无法按仓库内容可靠复现 Python 环境。
3. `docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md` 是第一轮修复前的历史报告，正文仍包含已修复问题，正式发布前应避免把它当作当前状态文档。

因此，本副本适合继续进行代码阅读和内部预发布验证；完成“必须修改的问题”后再打正式 Release。

## 1. 敏感数据检查

### 结果：通过

检查范围包括用户信息、客户名称、电话、地址、DWG、DXF、SQLite、`.env`、密钥和个人本地路径。

已确认：

- 未发现真实 `.dwg`、`.dxf`、`.sqlite`、`.sqlite3`、`.db`、`.env`、证书或私钥文件。
- 未发现真实客户名称、电话、地址、报价历史或用户记录。
- `customer_name`、`customer_phone`、`customer_address` 等仅出现在数据库结构、表单字段和示例标签中，没有对应数据文件。
- `.env.example` 仅包含空的 `SESSION_SECRET` 和示例占位配置，不是可用凭据。
- `scripts/check-sensitive-files.ps1` 扫描通过。
- 真实项目名称已被替换为 `sample-project`；代码和示例中未检出原项目名称。
- 未检出 `C:\Users\...`、`D:\...`、个人姓名或个人 Documents/Codex 路径。

注意：本地工作目录中存在一次依赖安装生成的 `work/webapp/node_modules/`，它被 `.gitignore` 忽略，不应打包或提交到 GitHub。正式打包前应删除该目录或确认发布归档没有包含它。

## 2. README 与运行说明

### 结果：部分通过，需要补充

通过项：

- 根 README 正确描述了 DWG → DXF → 实体提取 → 空间分区 → 材料识别 → BOM 的流程。
- README 明确说明了报价、PDF、多企业隔离、供应商导入等外围功能。
- README 明确说明不包含真实客户数据、生产数据库和真实 CAD 文件。
- README 没有把当前版本描述为 AI 自动等价判断、自动报价采购或已经云部署。
- `work/webapp/README.md` 已说明 `npm install`/`npm ci`、环境变量和本地启动地址。

需要补充的运行说明：

- 没有 `requirements.txt` 或等价安装文件，README 只写“安装 `ezdxf`、`reportlab` 和 `pypdf`”，没有可复制的 Python 安装命令和版本范围。
- 没有明确说明 LibreDWG `dwg2dxf.exe` 的来源、版本、校验方式和 Windows 运行要求；README 只要求把可执行文件放入目录。
- 没有提供从空目录开始的最小验证步骤，例如生成模板、启动服务、访问健康接口或使用示例 DXF。
- 根 README 使用 `npm install`，部署文档建议 `npm ci`；两者都可用，但应明确首次开发安装与可重复部署安装的区别。

这些问题不影响已存在代码的基本结构，但会阻碍陌生开发者按 README 完整复现。

## 3. 依赖与安装检查

### 结果：Node 依赖通过，Python/CAD 依赖待补充

已确认：

- `work/webapp/package.json` 只声明公开依赖 `exceljs` `^4.4.0`。
- `work/webapp/package-lock.json` 存在，lockfile version 为 3，ExcelJS 锁定到 4.4.0，许可元数据为 MIT。
- 运行时代码中不再导入 `@oai/artifact-tool`；Excel 代码统一经 `spreadsheet-adapter.mjs` 使用 ExcelJS。
- ExcelJS 模块可以在当前安装目录被 Node 导入，服务使用显式环境变量后能启动，`/api/auth/status` 返回 HTTP 200。
- 第一批报告记录的干净目录 npm 安装测试成功安装 97 个公开包。

当前审计环境没有可执行的 `npm` 命令，因此本轮没有重新运行 npm CLI；依赖一致性依据现有 lockfile、已完成的第一轮干净安装记录和当前运行时导入测试确认。

需要补充：

- Python 依赖没有版本锁定文件，无法保证不同机器获得相同的 `ezdxf`、`reportlab`、`pypdf` 版本。
- LibreDWG 与其 DLL 不是 npm 依赖，发布包没有自动检查二进制兼容性或文件校验值。
- `package.json` 的 `private: true` 对内部应用是合理的，但它表示该目录不是用于发布 npm 包；README 应继续把它描述为可运行应用，而不是可安装 npm 库。

## 4. 许可证检查

### 结果：项目 MIT 正确；第三方发布材料不足

通过项：

- 根目录 `LICENSE` 是标准 MIT License 文本。
- README 明确说明 MIT 只覆盖本项目自有代码和文档。
- `THIRD_PARTY_NOTICES.md` 已声明 ExcelJS 使用 MIT，并声明 LibreDWG 使用 GPLv3 或更高版本。

必须在正式 Release 前确认：

- `work/libredwg/` 实际包含约 50.81 MB 的 LibreDWG 可执行文件和 DLL，包括 `dwg2dxf.exe`、`libredwg-0.dll`、`libiconv-2.dll`、PCRE2 DLL 等。
- 仓库中只看到 `work/libredwg/README.txt` 的 GPL 说明，没有随该目录提供完整的 GPL `COPYING` 文本和对应的 LibreDWG 源代码或合规的源码获取承诺。
- `THIRD_PARTY_NOTICES.md` 没有逐项列出随 LibreDWG 二进制一起分发的 iconv、PCRE2 及其他组件的许可证和来源。
- Python 依赖没有许可证清单或版本记录。即使这些依赖通常有公开许可证，发布者仍应以实际版本为准完成核对。

在许可证材料补齐前，最安全的发布方式是不要把 LibreDWG 二进制直接打进 Release，改为文档化安装步骤；如果继续分发二进制，必须先完成 GPL 及其传递组件的合规材料确认。

## 5. 代码与配置检查

### 结果：通过，存在可移植性建议

已确认：

- `server.mjs` 从 `SESSION_SECRET` 环境变量读取 secret，缺少配置时启动失败，不包含固定开发 secret。
- `.env.example` 中 `SESSION_SECRET` 为空，不提供可直接使用的公开值。
- 未发现 `admin123456`、`admin@local` 或硬编码 API key、私钥内容。
- 没有发现包含个人 Windows 用户目录的代码路径；运行路径使用相对项目目录和环境变量。
- Node.js 模块通过语法检查，Python 脚本通过 AST 语法检查。

建议但不构成当前敏感数据阻断：

- `work/webapp/generate_quotation_pdf.py` 包含 Windows 字体候选路径，例如 `C:\Windows\Fonts\...`。这是系统字体兼容性问题，不是个人路径泄露；非 Windows 环境可能无法生成中文 PDF。
- 服务默认绑定 `127.0.0.1`，适合本机验证；如要内网部署，应提供可配置监听地址，而不是手工改代码。
- `work/start_bom_web.ps1` 会尝试使用用户目录下的 Codex runtime 作为 Node fallback。它是通用 fallback，但陌生开发者机器通常不存在该目录，启动脚本应优先使用系统 Node 并在缺失时给出安装提示。

## 6. 历史文档与发布包卫生

### 结果：需要发布前整理

- `docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md` 已归档为“第一批修复前的历史审计快照”，但正文仍包含 `@oai/artifact-tool`、固定 secret 和真实项目名称等旧问题。它不应被误认为当前审计结论。
- `FIRST_BLOCKERS_FIX_REPORT.md` 是有效的修复记录，但包含旧私有包名称作为历史说明；这不是运行时依赖，却可能被简单的关键字扫描误报。
- `node_modules/` 当前存在于本地工作目录，但已被 `.gitignore` 排除。GitHub 提交或压缩归档前应确认没有把它一并上传。
- 没有发现 Markdown 相对链接断裂。

## 7. 必须修改的问题

以下项目建议在正式 GitHub Release 前完成：

1. 明确 LibreDWG 二进制的分发策略：补齐 GPL、传递组件和源码/源码获取材料，或从 Release 中移除二进制并改为安装说明。
2. 增加 Python 依赖清单，至少记录 `ezdxf`、`reportlab`、`pypdf` 的可验证版本和许可证。
3. 补充从空环境开始的安装和最小运行验证文档，包括 Python 环境、LibreDWG、Excel 依赖和服务启动检查。
4. 在正式发布包中删除 `node_modules/`，并确认没有把本地生成目录打入压缩包。
5. 对历史 `docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md` 保持发布归档标记，避免旧阻断结论被误读。

## 8. 建议修改的问题

- 为 LibreDWG、Python 包和 ExcelJS 生成更完整的第三方依赖清单。
- 为 DWG 转换器和示例输入增加校验值或版本信息。
- 为服务提供健康检查/最小 smoke test 文档。
- 将监听地址、Python 路径、LibreDWG 路径和字体路径改为环境变量或启动参数，提高跨机器可移植性。
- 在 README 中明确“这是可运行的内部工具整理版，不保证任意 DWG 版本和所有 CAD 对象都能解析”。

## 9. 可以发布的问题

以下内容已达到开源副本的基本要求：

- 项目自有 MIT 许可证文件存在且文本完整。
- 没有发现真实用户、客户、项目文件、CAD 文件、数据库或可用密钥。
- Excel 导入/导出已替换为公开依赖并有 lockfile。
- session secret 已强制显式配置。
- README、架构文档和开发历史文档存在，核心技术链路描述基本准确。
- Node 模块和 Python 脚本静态语法检查通过，服务在测试环境中可启动。
- CAD、BOM、报价和数据库核心逻辑没有因本轮审计发生修改。

## 10. 审计结论

**当前状态：适合内部预发布和代码审阅；完成第 7 节的许可证、Python 依赖、运行文档和发布包整理后，再创建正式 GitHub Release。**
