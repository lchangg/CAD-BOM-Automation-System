# GitHub Release Audit V2 剩余问题处理报告

日期：2026-10-03  
对象：`CAD-BOM-Automation-System` 开源副本  
范围：只处理 V2 审计中剩余的发布整理问题，不修改 CAD 解析、BOM 生成、报价逻辑或数据库结构。未执行 Git add、commit 或 push。

## 1. 已完成的修改

### LibreDWG 外部化

- 删除开源副本中的 `work/libredwg/` 整个目录，共移除其中 63 个 LibreDWG 可执行文件、DLL、编译库、头文件、示例和附带构建文件。
- 删除 `work/libredwg-0.14-win64.zip` 二进制压缩包。
- 保留运行代码原有的相对调用约定：运行者自行安装后，将 `dwg2dxf.exe` 及其所需 DLL 放入本地 `work/libredwg/`。
- 新增 [docs/third-party-tools.md](docs/third-party-tools.md)，说明 LibreDWG 获取、目录放置、版本检查、GPLv3-or-later 和传递运行库许可证边界。
- `.gitignore` 增加 `work/libredwg/`，防止本地安装的第三方二进制被提交。

### Python 依赖清单

新增 [requirements.txt](requirements.txt)，固定当前验证版本：

```text
ezdxf==1.4.4
reportlab==5.0.1
pypdf==6.19.0
```

这三个包分别覆盖 DXF 读取和报价 PDF 生成/验证。没有引入新的解析或报价依赖。

### README 和部署文档

更新：

- `README.md`
- `work/webapp/README.md`
- `work/webapp/DEPLOYMENT.md`
- `THIRD_PARTY_NOTICES.md`
- `OPEN_SOURCE_PREPARATION_REPORT.md`
- `docs/architecture.md`

新增或明确说明：

- Node.js 22+、Python 3.11+、PowerShell 和外部 LibreDWG 要求。
- 从零创建 Python 虚拟环境并安装 `requirements.txt` 的步骤。
- 使用 `npm ci` 安装 Node/Excel 依赖的步骤。
- `.env.example`、`SESSION_SECRET`、管理员账号和配置边界。
- LibreDWG 不随仓库分发，DWG 分析前必须由运行者单独安装转换器。
- 最小启动验证：访问 `/api/auth/status`，预期 HTTP 200。

### 本地生成文件清理

删除：

- `work/webapp/node_modules/`
- 测试期间生成的 `work/webapp/data/`
- 临时 Python 虚拟环境和临时 Node 安装目录（均位于系统临时目录）
- LibreDWG 二进制压缩包和构建目录

未发现并保留任何真实 DWG、DXF、SQLite、`.env`、报价 PDF 或客户项目文件。

### 历史审计归档

- `GITHUB_RELEASE_AUDIT_REPORT.md` 已移动为 [docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md](docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V1.md)。
- 已修正移动后的历史报告到 `FIRST_BLOCKERS_FIX_REPORT.md` 的相对链接。
- `GITHUB_RELEASE_AUDIT_REPORT_V2.md` 也已归档为 [docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V2.md](docs/audits/GITHUB_RELEASE_AUDIT_REPORT_V2.md)，避免根目录的历史结论被误认为当前状态。

## 2. 验证结果

### Python 依赖安装

在干净的 Python 3.12 临时虚拟环境中执行：

```powershell
python -m pip install -r requirements.txt
```

安装成功，并验证导入版本：

```text
ezdxf=1.4.4
reportlab=5.0.1
pypdf=6.19.0
```

验证完成后已删除临时虚拟环境。

### Node 依赖和服务启动

- 使用干净临时目录安装 `package.json` 中的公开 `exceljs` 依赖，成功解析并导入 `exceljs 4.4.0`。
- 在开源副本临时安装依赖后，使用临时 SQLite 路径启动服务成功。
- `GET /api/auth/status` 返回：

  ```text
  HTTP 200
  {"authenticated":false,"user":null,"organization":null}
  ```

- 服务停止后已清除 `node_modules`、运行时 `data/` 和临时数据库；最终开源副本保持干净。

### 语法与文件检查

- Node.js `.mjs` 语法检查：16 个文件，失败 0 个。
- Python AST 语法检查：8 个文件，失败 0 个。
- LibreDWG 目录、`.exe`、`.dll`、二进制压缩包均已从开源副本移除。
- 敏感文件检查未发现 `.dwg`、`.dxf`、SQLite、`.env`、日志、密钥或真实项目数据。
- Markdown 相对链接检查通过。
- 核心比较确认：`report_current_parse.py`、`classify_device_candidates.py`、`modules/quotation.mjs` 和 `modules/quotation-pdf.mjs` 与原生产项目对应文件保持一致；本次没有修改这些核心逻辑。

## 3. 使用上的重要变化

仓库现在不会自带 DWG 转换器。克隆仓库后：

1. 先安装 Python 依赖。
2. 再按 `docs/third-party-tools.md` 安装 LibreDWG，并将 `dwg2dxf.exe` 与所需 DLL 放入本地 `work/libredwg/`。
3. 再安装 Node 依赖、填写 `.env` 并启动服务。

如果没有本地 LibreDWG，服务本身仍可以启动并通过健康接口检查，但上传 DWG 后的转换步骤会失败。这是外部工具未安装的预期提示，不是 CAD 算法改动。

## 4. 原生产项目和 Git 状态

- 原生产目录 `dwg-cad-5-10-cad-mccb-2` 未作为清理目标，保持不变。
- 没有修改生产数据库、项目文件或生产运行逻辑。
- 本次没有执行 Git 提交、推送或 Release 创建。
