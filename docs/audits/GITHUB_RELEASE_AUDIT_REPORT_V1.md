# GitHub Release Audit

> 这是第一批阻断问题处理前的历史审计快照。后续修复结果见 [FIRST_BLOCKERS_FIX_REPORT.md](../../FIRST_BLOCKERS_FIX_REPORT.md)；其中依赖、固定 session secret 和真实项目名称问题已按后续报告处理。

审计对象：`CAD-BOM-Automation-System` 开源副本  
审计日期：2026-10-02  
审计方式：只读文件清单、文本/二进制扩展名扫描、敏感字符串扫描、依赖入口检查、Node/Python 语法检查。未修改代码、运行逻辑或数据库。

## 总结结论

当前副本**不建议直接发布 GitHub Release**。敏感数据文件清理总体通过，但仍存在几个发布阻断项：

1. Web 服务依赖未声明且当前环境无法提供的 `@oai/artifact-tool`，全新副本启动会以 `ERR_MODULE_NOT_FOUND` 失败。
2. 解析脚本中仍保留一个真实项目名称，属于不应进入公开仓库的项目元数据。
3. PDF 生成脚本硬编码 Windows 字体路径，跨机器运行不可靠，也不符合本次本地路径审计要求。
4. 服务端仍有已知的开发环境会话密钥回退值。
5. 部署文档仍引用已从副本删除的生产备份目录。
6. README 将 `INSERT`/`ATTRIB` 描述为已提取，但当前解析脚本主要输出 `TEXT`/`MTEXT` 文字对象，`INSERT`/`ATTRIB` 主要是计数，存在能力描述过宽。
7. 仓库捆绑了 LibreDWG 及其 DLL/压缩包，但第三方许可证声明尚未覆盖所有随附二进制依赖。

建议先处理“必须修改的问题”，再进行一次干净机器验证后发布。

## 1. 敏感数据检查

### 已通过

当前扫描结果：

- `.dwg`：0 个
- `.dxf`：0 个
- `.sqlite` / `.sqlite3` / `.db`：0 个
- `.env`：0 个
- PEM/私钥扩展名：0 个
- 生产备份目录：0 个
- 测试运行目录：0 个
- 用户项目数据目录：0 个
- 旧测试账号字符串：未发现
- 常见 API key、私钥头、JWT、云访问密钥模式：未发现

数据库表中的 `phone`、`address`、`customer_phone` 等只是字段定义和表单字段，不是实际用户数据；供应商模板中的“联系人/电话/地址”也是字段说明，不是客户记录。

### 必须修改的问题

`work/generate_bom.py` 和 `work/single_cabinet_validation.py` 仍然把一个真实项目名称写入默认输出对象。即使真实 DWG 已删除，该项目名称仍属于项目元数据，应替换为通用的 `sample-project` 或由输入文件名动态生成。

### 建议修改的问题

根目录 `.gitignore` 已忽略常见 SQLite 文件，但没有明确覆盖 `*.sqlite-wal`、`*.sqlite-shm`。发布前应补上这些模式，避免运行中的 SQLite 临时文件被提交。

## 2. README 检查

### 做得较好的部分

- 项目名称和英文描述清楚。
- 已说明 DWG → DXF → ezdxf → 空间分区 → 材料识别 → BOM 的流程。
- 已说明 SQLite、多企业隔离、报价、PDF、供应商导入等外围功能。
- 已注明不包含客户数据、生产数据库和真实 CAD 文件。
- 已提醒 LibreDWG 与项目 MIT 许可分离。

### 必须修改的问题

1. README 的核心功能列表写成可以提取 `TEXT`、`MTEXT`、`INSERT`、`ATTRIB`、图层和坐标。当前 `work/report_current_parse.py` 的结构化文字列表只对 `TEXT`/`MTEXT` 生成文字、图层、布局和坐标；`INSERT`/`ATTRIB` 当前主要出现在实体计数中，没有形成同等粒度的对象/属性输出。README 应改为“统计/读取相关实体；当前 BOM 文字链主要基于 TEXT/MTEXT”。
2. README 没有提供实际的 Python 环境创建命令、依赖版本或 `requirements.txt`。当前写法不足以让陌生开发者可靠复现。
3. README 提到准备 `@oai/artifact-tool` 兼容实现，但没有说明该包名称、来源、版本或公开安装方法；这不是可执行的安装说明。
4. README 链接到 `work/webapp/DEPLOYMENT.md`，而该文档仍引用已删除的 `work/production-backups/...` 路径，会误导使用者以为备份仍在仓库中。

### 建议修改的问题

- 明确当前项目是 Windows 优先验证版本，LibreDWG 二进制不是跨平台安装器。
- 将 Excel 导入/导出标记为“需要额外 spreadsheet adapter”，直到有公开依赖可安装。
- 增加最小可运行矩阵：Node 版本、Python 版本、Windows 版本、LibreDWG 版本和验证过的 `ezdxf/reportlab/pypdf` 版本。
- 增加“当前没有公开测试 DWG/DXF，因此只能运行到空数据库/界面或使用自有授权样例”的说明。

## 3. 依赖和 `npm install` 检查

### 发现

`work/webapp/package.json` 只有：

- `name`
- `private: true`
- `type: module`
- `start` 脚本

没有 `dependencies`、`devDependencies`、`engines` 或 lockfile。

代码实际导入了：

```text
@oai/artifact-tool
```

位置包括：

- `work/webapp/modules/master-data-import.mjs`
- `work/webapp/modules/supplier-import.mjs`
- `work/webapp/export_xlsx.mjs`
- `work/webapp/export_import_template.mjs`
- `work/build_dwg_bom.mjs`

在清理依赖缓存后的副本中执行 `node server.mjs`，结果为：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@oai/artifact-tool'
```

当前环境也没有可执行的 `npm` 命令，因此无法验证真实的安装过程；不过即使 `npm install` 在一个空依赖 manifest 上成功，也不会安装这个未声明的包。

### 必须修改的问题

1. 提供可公开安装、可再分发的 spreadsheet 依赖，并在 `package.json` 中声明版本；或者把 Excel 功能拆成明确的可选模块，使基础 Web 服务不因该包缺失而无法启动。
2. 添加 `package-lock.json`（或明确使用的其他锁文件）并在干净环境执行安装/启动验证。
3. 添加 Python 依赖清单（例如 `requirements.txt` 或 `pyproject.toml`），至少覆盖 `ezdxf`、`reportlab`、`pypdf`，并记录已验证版本。

## 4. 许可证检查

### 已通过

- 根目录 `LICENSE` 是完整的标准 MIT License 文本，包含授权范围、版权保留要求和免责声明。
- `THIRD_PARTY_NOTICES.md` 已明确说明项目自有代码与 LibreDWG 的许可边界。
- `work/libredwg/README.txt` 本身包含 LibreDWG GPLv3-or-later 说明。

### 必须修改的问题

`work/libredwg/` 不仅包含 LibreDWG 可执行文件，也包含：

- `libiconv-2.dll`
- `libpcre2-8-0.dll`
- `libpcre2-16-0.dll`
- `libredwg-0.14-win64.zip`

当前 `THIRD_PARTY_NOTICES.md` 只明确写了 LibreDWG，未逐项声明这些随附 DLL/压缩包中的第三方许可、来源和对应源码/通知义务。发布包含这些二进制的 GitHub Release 前，应补齐许可证清单和再分发材料，或改为不捆绑二进制、要求用户自行安装。

### 建议修改的问题

- 将 LibreDWG 的版本、来源 URL、构建时间和二进制清单写入第三方声明。
- 审核压缩包和展开目录是否重复包含同一第三方组件；若不需要，发布包可避免重复。
- 明确 MIT 许可不覆盖 `work/libredwg` 以及未来加入的 Python/Node 第三方包。

## 5. 代码、账号和本地路径检查

### 已通过

- 未发现旧开发账号或旧测试密码字面量。
- `.env.example` 使用的是占位值，不是实际账号或密钥。
- 没有发现用户目录形式的个人绝对路径。
- Node/Python 语法检查均通过。

### 必须修改的问题

1. `work/webapp/server.mjs` 仍有：

   ```js
   process.env.SESSION_SECRET || (IS_PRODUCTION ? "" : "development-only-session-secret-change-me")
   ```

   这是一个公开可知的开发会话密钥回退值。公开版本应要求所有环境显式设置随机 `SESSION_SECRET`，不能用固定字符串继续运行。

2. `work/webapp/generate_quotation_pdf.py` 中硬编码了：

   ```text
   C:\Windows\Fonts\msyh.ttc
   C:\Windows\Fonts\simhei.ttf
   C:\Windows\Fonts\NotoSansSC-VF.ttf
   ```

   虽然不是用户个人路径，但它是机器特定路径，会导致非 Windows 或没有这些字体的环境生成 PDF 失败/回退。应改为可配置的相对资源路径，或明确记录这是 Windows-only 的已知限制。

3. `work/webapp/DEPLOYMENT.md` 保留了多处已删除生产备份目录和回滚说明。公开仓库不应继续保留这些内部部署路径、版本备份名称和内部回滚流程。

### 建议修改的问题

- `work/start_bom_web.ps1` 中的 Codex 运行时缓存回退路径是开发环境专用逻辑；公开版本应优先要求系统 Node.js，或改成显式 `NODE_PATH`/配置。
- 对 `.env.example` 增加“不得提交 `.env`”和随机密钥生成示例，但不要提供任何默认可登录密码。
- 在发布前执行一次全仓库 secret scanner，并审查第三方二进制的字符串表，而不是只扫描文本源码。

## 6. 可以发布的问题

以下部分目前可以作为开源工程内容发布：

- 目录结构、README、架构文档、开发历史文档。
- 合成的 `examples/sample_bom.json`，其中没有生产图纸或客户资料。
- `examples/sample_dxf/README.md` 占位说明。
- MIT License 文件本身。
- 解析、空间分区、规则识别、BOM、企业隔离、报价和 PDF 模块的源代码（在修复上述元数据/依赖/配置阻断项后）。
- 已删除数据库、真实 CAD、项目历史、报价历史和生产备份的事实。
- 敏感文件检查脚本和 `.gitignore` 基础规则。

## 发布前验收清单

- [ ] 删除两个脚本中的真实项目名称。
- [ ] 移除固定开发会话密钥回退值。
- [ ] 处理 PDF 字体路径的跨环境问题。
- [ ] 清理公开部署文档中的内部备份/回滚路径。
- [ ] 修正 README 对 INSERT/ATTRIB 能力的描述。
- [ ] 提供公开可安装的 `@oai/artifact-tool` 替代/依赖，加入 `package.json` 和 lockfile。
- [ ] 提供 Python 依赖清单和版本。
- [ ] 补充 LibreDWG、libiconv、PCRE2 等第三方组件的许可证和来源声明。
- [ ] 将 `*.sqlite-wal`、`*.sqlite-shm` 等运行时数据库文件加入 `.gitignore`。
- [ ] 在干净 Windows 环境创建 `.env`、虚拟环境并完成启动冒烟测试。
- [ ] 再次执行敏感文件扫描、依赖扫描和 `git diff --cached` 审查。

## 审计结论分级

- **必须修改**：存在真实项目元数据、固定开发密钥、不可安装私有依赖、硬编码字体路径、过期内部部署文档和不完整第三方许可证覆盖；当前不建议创建正式 GitHub Release。
- **建议修改**：依赖版本矩阵、锁文件、跨平台说明、启动脚本和更严格的忽略规则。
- **可以发布**：敏感生产文件已清除，MIT 文本正确，核心源码和文档框架完整，且当前语法检查通过。
