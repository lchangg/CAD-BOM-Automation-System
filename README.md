# CAD-BOM-Automation-System

An open-source CAD drawing analysis system for electrical BOM generation.

本项目探索如何从电气 CAD 系统图中提取设备信息，并生成可追溯的结构化配电材料 BOM。它是从内部验证项目整理出的开源工程副本，不包含客户图纸、生产数据库、用户信息或真实报价数据。

## 技术流程

```text
DWG
  |
LibreDWG (dwg2dxf)
  |
DXF
  |
ezdxf
  |
Entity Extraction
  |
Spatial Partition
  |
Material Recognition
  |
BOM Generation
```

核心解析脚本保留在 `work/`，Web 包装和 SQLite 模块保留在 `work/webapp/`。为了不改变已验证的相对路径，开源整理没有强制搬迁运行时代码；顶层 `backend/`、`frontend/` 和 `cad-parser/` 目录提供模块索引，实际入口仍以 `work/` 为准。

## 核心功能

- DWG 转 DXF 与 DXF 读取
- CAD `TEXT`、`MTEXT`、`INSERT`、`ATTRIB`、图层和坐标提取
- 配电柜标题识别与空间区域划分
- 可解释的材料候选规则识别
- 保留原始文字、来源坐标、对象类型和识别规则的 BOM 生成
- 企业内品牌、型号、采购价格匹配
- 报价计算和客户报价 PDF 输出
- SQLite 数据保存与多企业数据隔离
- 供应商 Excel/CSV 字段映射、产品确认和价格历史导入

项目没有加入新的 CAD 算法、AI 推断、价格抓取或商业化功能。此仓库的目标是让开发者阅读架构、查看示例，并在准备好本地运行依赖后复现流程。

## 技术栈

**Backend**

- Node.js（运行时使用 `node:sqlite`）
- Python 辅助解析、BOM 规则和 PDF 生成脚本

**Database**

- SQLite

**CAD**

- 外部安装的 LibreDWG `dwg2dxf`
- Python `ezdxf`

**Frontend**

- HTML
- CSS
- JavaScript

**PDF**

- ReportLab

## 目录概览

```text
CAD-BOM-Automation-System/
├── README.md
├── LICENSE
├── .gitignore
├── docs/
│   ├── architecture.md
│   ├── development-history.md
│   └── screenshots/
├── backend/                 # 运行时代码位置索引，实际入口见 work/webapp
├── frontend/                # 前端资源位置索引，实际资源见 work/webapp/public
├── cad-parser/              # CAD 脚本位置索引，实际脚本见 work/
├── examples/
│   ├── sample_bom.json
│   └── sample_dxf/
├── scripts/
└── work/
    ├── webapp/
    ├── libredwg/             # 本地安装的外部转换器目录，不入库
    └── *.py / *.mjs
```

运行时目录结构被保留，是为了保证开源副本仍能沿用已验证的调用链；`data/`、`outputs/`、项目文件和真实 CAD 文件均不在仓库中。

## 环境要求与从零运行

当前验证链按 Windows 本地/内网环境编写，要求：

- Node.js 22 或更高版本（需要原生 `node:sqlite` 支持）。
- Python 3.11 或更高版本，并能创建虚拟环境。
- LibreDWG `dwg2dxf` 外部安装包；本仓库不分发其二进制和 DLL。
- PowerShell（用于下面的 Windows 启动示例）。

从干净副本开始：

```powershell
# 1. 在仓库根目录创建 Python 环境并安装锁定依赖
py -3 -m venv work/.venv
.\work\.venv\Scripts\python.exe -m pip install --upgrade pip
.\work\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. 按第三方工具说明安装 LibreDWG，并确认本地存在转换器
Test-Path .\work\libredwg\dwg2dxf.exe

# 3. 安装 Node/Excel 依赖
Set-Location .\work\webapp
npm ci

# 4. 创建本地配置（不要把 .env 提交到 Git）
Copy-Item .env.example .env
# 编辑 .env，填写随机 SESSION_SECRET、ADMIN_EMAIL 和 ADMIN_PASSWORD

# 5. 启动服务
node server.mjs
```

第三方转换器的来源、许可证、DLL 放置方式和验证步骤见 [docs/third-party-tools.md](docs/third-party-tools.md)。

最小启动验证：服务启动后，在另一个 PowerShell 窗口执行：

```powershell
$response = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4318/api/auth/status
$response.StatusCode
$response.Content
```

预期状态码为 `200`，未登录时 JSON 中 `authenticated` 为 `false`。上传有权使用的测试 DWG 前，请确认 LibreDWG 转换器和 Python 环境均已准备好。第一次启动会创建本地 SQLite 数据目录；这些文件被 `.gitignore` 忽略。

本仓库不包含真实 DWG/DXF、生产数据库或客户资料。上传文件和生成的报价文件只保存在本地忽略目录中。

## 可追溯性亮点

每条材料记录都尽量保留：

```json
{
  "原始文字": "3P 200A",
  "坐标": {"x": 120.5, "y": 80.25},
  "来源对象": "TEXT",
  "识别规则": "极数 + 电流格式"
}
```

这使得人工审核可以回到图纸位置，理解某个 BOM 行为什么被识别，而不是只得到不可解释的数量。

## 文档

- [架构说明](docs/architecture.md)
- [开发历史](docs/development-history.md)
- [第三方工具安装说明](docs/third-party-tools.md)
- [开源整理报告](OPEN_SOURCE_PREPARATION_REPORT.md)
- [第三方组件声明](THIRD_PARTY_NOTICES.md)
- [原 Web 部署说明](work/webapp/DEPLOYMENT.md)

## 许可证

本项目自有代码使用 [MIT License](LICENSE)。运行时安装到 `work/libredwg/` 的 LibreDWG 工具是独立的 GPLv3（或更高版本）第三方组件，不受本项目 MIT 许可覆盖；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [docs/third-party-tools.md](docs/third-party-tools.md)。
