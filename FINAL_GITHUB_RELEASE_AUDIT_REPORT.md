# CAD-BOM-Automation-System 最终 GitHub Release Audit

审计日期：2026-10-03  
审计对象：`CAD-BOM-Automation-System` 开源副本  
目标：判断当前版本是否适合创建 `v1.0.0` GitHub Release  
范围：只读审计。本轮没有修改代码、数据库、运行逻辑，也没有执行 Git 操作。

## 最终结论

**建议创建 `v1.0.0` Release，但应在发布说明中明确：LibreDWG 是使用者自行安装的外部依赖，仓库不是开箱即用的 DWG 转换器二进制包。**

当前没有发现会阻断源码/文档 Release 的敏感数据、私有运行时依赖、固定密钥、破损文档链接或无法安装的直接依赖。DWG 全链路测试需要本地另行安装 LibreDWG；由于本仓库已经移除 LibreDWG 二进制，本次只能验证服务启动和基础 API，不能在当前干净副本中执行真实 DWG 转换。

## 1. GitHub 公开安全检查

### 结果：通过

检查项目：

- 用户信息、客户名称、电话、地址和报价历史。
- `.dwg`、`.dxf`、SQLite、`.env`、日志、证书、私钥和常见 API key 格式。
- `C:\Users\...`、`D:\...`、个人姓名、个人 Documents/Codex 路径。
- `admin123456`、`admin@local` 等历史测试凭据。
- LibreDWG 可执行文件、DLL、ZIP 和其他本地二进制。

检查结果：

- `scripts/check-sensitive-files.ps1` 通过。
- 未发现敏感扩展名文件。
- 未发现固定密钥、私钥、真实客户数据或个人本地路径。
- `work/libredwg/`、LibreDWG ZIP、`node_modules/`、`data/`、`.venv/`、`outputs/`、`tmp/` 和生产备份目录均不存在。
- `.env.example` 只有空的 `SESSION_SECRET` 和示例占位字段，不包含可用凭据。

## 2. 依赖检查

### Node.js

检查文件：

- `work/webapp/package.json`
- `work/webapp/package-lock.json`

结果：

- package name：`dwg-bom-internal-tool`。
- Node 要求：`>=22`。
- 直接依赖只有公开的 `exceljs ^4.4.0`。
- lockfile version：3。
- lockfile 根依赖与 `package.json` 一致。
- ExcelJS 锁定版本：4.4.0，许可证元数据为 MIT。
- 未发现 `@oai/artifact-tool` 或其他私有运行时导入。

干净环境测试：

- 使用 npm 10.9.2 在临时目录执行 `npm ci --ignore-scripts --no-audit --no-fund`，成功安装 97 个包。
- 安装后成功导入 ExcelJS，`Workbook` 类型可用。
- 测试完成后已删除临时目录。
- 安装过程出现若干传递依赖 deprecated warning，但没有安装失败或私有包错误；不构成当前 Release 阻断。

### Python

检查文件：

- `requirements.txt`

固定依赖：

```text
ezdxf==1.4.4
reportlab==5.0.1
pypdf==6.19.0
```

干净环境测试：

- 使用 Python 3.12 创建临时虚拟环境。
- `pip install -r requirements.txt` 成功。
- 成功导入并确认版本：`ezdxf 1.4.4`、`reportlab 5.0.1`、`pypdf 6.19.0`。
- 测试完成后已删除临时虚拟环境。

## 3. 文档检查

### 结果：通过

根 README 已覆盖：

- 项目目标和实际 CAD → BOM 流程。
- Node.js 22+、Python 3.11+、PowerShell 和外部 LibreDWG 环境要求。
- 从零创建 Python 虚拟环境、安装 `requirements.txt`、安装 Node 依赖和创建 `.env` 的步骤。
- `SESSION_SECRET`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 配置说明。
- 最小启动验证 `/api/auth/status`。
- LibreDWG 外部安装位置和不随仓库分发的边界。

同时检查了：

- `work/webapp/README.md`
- `work/webapp/DEPLOYMENT.md`
- `docs/third-party-tools.md`
- `docs/architecture.md`
- `docs/development-history.md`

上述文档与当前目录结构一致。Markdown 相对链接检查结果：0 个断链。

历史审计报告已归档到：

- `docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md`
- `docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V2.md`

根目录保留当前修复报告和本最终审计报告，避免历史阻断结论被误认为当前状态。

## 4. License 检查

### 结果：通过，保留发布注意事项

- 根目录 `LICENSE` 为完整标准 MIT License。
- README 明确 MIT 只覆盖本项目自有代码和文档。
- LibreDWG 二进制、DLL、编译库和 ZIP 已移除，不随本仓库重新分发 GPL 组件。
- `THIRD_PARTY_NOTICES.md` 已说明 LibreDWG 为 GPLv3-or-later 外部依赖、ExcelJS 为 MIT 依赖、Python 依赖位于 `requirements.txt`。
- `docs/third-party-tools.md` 已说明 LibreDWG、libiconv、PCRE2 的许可证边界和使用者自行安装责任。

发布时仍应保留以下说明：如果用户自行分发 LibreDWG 构建版本，必须自行满足 GPL 和其传递运行库的源码、版权和许可证通知义务。该事项不阻断本仓库源码 Release，因为仓库本身不携带这些二进制。

## 5. 运行检查

### 服务启动

- 使用 Node.js 24.19.0 运行时。
- 临时安装 Node 依赖后，`node server.mjs` 启动成功。
- 服务输出启动地址：`http://127.0.0.1:4318`。
- `GET /api/auth/status` 返回 HTTP 200：

  ```json
  {"authenticated":false,"user":null,"organization":null}
  ```

- 不设置 `SESSION_SECRET` 时，服务以退出码 1 终止，并输出明确错误：

  ```text
  SESSION_SECRET must be set in .env or the process environment; no default value is provided.
  ```

- 测试使用临时 SQLite 路径；测试结束后临时数据库、运行目录和 `node_modules` 均已清理。

### 静态检查

- Node.js `.mjs` 语法检查：16 个文件，失败 0 个。
- Python AST 语法检查：8 个文件，失败 0 个。
- 敏感文件脚本：通过。

### 未执行的运行项

真实 DWG → DXF 转换未在本次干净副本中执行，因为 LibreDWG 按发布要求已移除，需要用户先按 `docs/third-party-tools.md` 安装。此限制已在 README 和部署文档中明确，不属于代码故障。

## 6. 必须修改的问题

**没有发现必须修改才能创建源码/文档版 `v1.0.0` Release 的问题。**

创建 Release 时必须确保：

- 不把本地 `work/libredwg/`、`node_modules/`、`.venv/` 或 `data/` 打进 Release 压缩包。
- Release notes 明确 LibreDWG 是外部依赖，不包含在仓库中。
- 如果另行发布 LibreDWG 二进制，单独完成 GPL 和传递组件合规流程。

## 7. 建议修改的问题

这些项目不阻断 `v1.0.0`，但可作为后续维护任务：

1. 为 Python 依赖增加更严格的传递依赖锁定或哈希文件，以获得比 `requirements.txt` 更强的可重复构建能力。
2. 在 `THIRD_PARTY_NOTICES.md` 中补充当前 Python 版本对应的具体许可证名称和上游链接。
3. 为外部 LibreDWG 增加版本/校验值记录模板，方便部署者确认工具来源。
4. 处理 ExcelJS 传递依赖的 deprecated warning，并在升级前重新验证 Excel 读写。
5. 为非 Windows 环境补充字体和 LibreDWG 适配说明；当前运行封装主要面向 Windows。

## 8. 最终发布建议

**建议发布 `v1.0.0`，发布类型应定位为“可阅读、可安装依赖后运行的开源工程版本”，而不是包含所有第三方二进制的开箱即用安装包。**

发布前只需进行一次人工打包检查，确认压缩包中不含本地依赖、运行数据和外部 LibreDWG 文件；不需要修改 CAD、BOM、报价或数据库代码。

