# 第三方工具安装说明

本仓库不再携带 LibreDWG 的可执行文件、DLL、编译库或 Python 扩展。这样可以避免把 GPL 组件的构建产物和传递组件直接打进开源仓库；使用者需要根据自己的平台和许可证要求单独安装。

## LibreDWG（DWG → DXF）

CAD 分析流程需要 LibreDWG 的 `dwg2dxf` 命令行工具。当前 Windows 启动流程会从以下位置调用它：

```text
work/libredwg/dwg2dxf.exe
```

安装步骤：

1. 从 [GNU LibreDWG 官方页面](https://www.gnu.org/software/libredwg/) 或 [Savannah 项目页](https://savannah.gnu.org/projects/libredwg/) 获取与当前 Windows 架构匹配的构建版本，或自行从源码构建。
2. 阅读并遵守 LibreDWG 的 GPLv3-or-later 许可证，以及构建包中 `libiconv`、PCRE2 等运行库各自的许可证要求。
3. 在仓库根目录创建本地目录 `work/libredwg/`。
4. 将 `dwg2dxf.exe` 和该构建版本要求的运行时 DLL 放入同一目录。不要把这些文件提交到 Git；该目录已被 `.gitignore` 忽略。
5. 用命令行确认文件存在并查看帮助或版本信息：

   ```powershell
   Test-Path .\work\libredwg\dwg2dxf.exe
   & .\work\libredwg\dwg2dxf.exe --help
   ```

   如果发行版本不支持 `--help`，按该版本文档使用对应的版本检查命令。

当前 Web 包装保留了已验证的 Windows 相对路径，不会自动下载或联网安装 LibreDWG。Linux/macOS 使用者需要自行准备兼容的转换器并调整本地运行封装；这不改变仓库中的 CAD 解析和 BOM 规则。

## Python 依赖

在仓库根目录创建虚拟环境并安装锁定版本：

```powershell
py -3 -m venv work/.venv
.\work\.venv\Scripts\python.exe -m pip install --upgrade pip
.\work\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`requirements.txt` 中的依赖分别用于 DXF 读取（`ezdxf`）和报价 PDF 生成/验证（`reportlab`、`pypdf`）。

## Node.js 依赖

Excel 导入/导出依赖公开的 ExcelJS：

```powershell
Set-Location .\work\webapp
npm ci
```

仓库提供 `package-lock.json`。如果是首次开发且需要更新依赖，使用 `npm install`；部署或复现时优先使用 `npm ci`。

## 许可证和发布边界

- 根目录 MIT 许可证只覆盖本项目自有代码和文档。
- LibreDWG 及其运行库不由本仓库重新授权。正式分发 LibreDWG 时，必须一并满足对应 GPL 和传递组件的源代码、版权和许可证通知义务。
- 本仓库只提供安装说明，不提供 LibreDWG 二进制下载、不自动联网抓取厂家或工具文件。
