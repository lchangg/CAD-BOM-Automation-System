# 配电系统 BOM 生产部署说明（V1.2-4）

## 1. 运行前提

生产服务器需要是 Windows，并准备：

- Node.js 22+（当前运行时使用 `node:sqlite`，不需要额外 SQLite npm 包）
- 部署机单独安装的 LibreDWG `dwg2dxf.exe` 及其运行时 DLL；本仓库不携带二进制。安装和许可证说明见 [第三方工具安装说明](../../docs/third-party-tools.md)
- Python 3.11+ 虚拟环境，按仓库根目录 `requirements.txt` 安装锁定的 `ezdxf`、`reportlab` 和 `pypdf`
- 在 `work/webapp` 运行 `npm ci`，安装公开的 ExcelJS 依赖（Excel 导入/导出）
- 足够的磁盘空间保存 DWG、DXF、SQLite 数据库和导出文件

DWG 解析、柜体识别、候选识别和 BOM 汇总仍然调用现有脚本，没有改动核心算法。部署完成后，LibreDWG 转换器应放在 `work/libredwg/dwg2dxf.exe`，以匹配现有运行封装。

## 2. 配置生产环境

复制配置模板：

```powershell
Copy-Item .\work\webapp\.env.example .\work\webapp\.env
```

至少修改：

- `SESSION_SECRET`：随机长字符串
- `ADMIN_EMAIL`：首个管理员邮箱
- `ADMIN_PASSWORD`：首个管理员密码
- `NODE_ENV=production`

第一次启动时，如果数据库中还没有用户，系统会使用这三个管理员配置创建首个账号。后续启动不会覆盖数据库中的密码。

正式服务器应使用新的数据目录或新的 `BOM_DB_PATH`，不要把其他环境里的 SQLite 文件直接当成生产库。管理员账号必须由部署者通过 `.env` 显式配置。

## 3. 启动生产服务

```powershell
powershell -ExecutionPolicy Bypass -File .\work\start_bom_web.ps1
```

服务默认监听：

`http://127.0.0.1:4318`

如果需要让同一内网的其他电脑访问，需要在服务端改为监听内网地址，并在 Windows 防火墙中只开放内网端口。当前版本默认绑定 `127.0.0.1`，不会自动暴露到局域网。

## 4. V1.1 基础资料库

服务启动时会自动创建以下 SQLite 表，已有 V1.0 数据库会保留，不需要手动迁移：

- `materials`：材料编码、名称、类别、单位
- `brands`：品牌名称、编码和说明
- `products`：产品型号，关联材料和品牌
- `prices`：产品单价、币种、供应商及有效期
- `suppliers`：供应商联系资料

管理页面入口是左侧“基础资料”。新增、编辑和删除都要求登录；BOM 审核页面的“选择品牌”会依次读取材料、品牌、产品型号和价格记录，并把 `material_id`、`brand_id`、`product_id`、`price_id` 保存在 BOM JSON 行中。项目中的“报价计算”页面会读取这些 BOM 关联数据，计算材料成本、人工费、运输费、其他费用、利润和最终报价。报价表结构备查文件是 `work/webapp/modules/quotation-schema.sql`，报价 PDF 历史结构是 `work/webapp/modules/quotation-pdf-schema.sql`，运行时代码是 `work/webapp/modules/quotation.mjs`、`work/webapp/modules/quotation-pdf.mjs` 和 `work/webapp/generate_quotation_pdf.py`。PDF 文件保存在对应项目目录的 `quotations` 子目录。报价模块不会参与 DWG 解析或材料识别。

## 5. V1.2 企业租户迁移与数据隔离

V1.2 首次启动会自动执行幂等迁移：创建 `organizations`、`organization_members`，创建“默认企业”，让没有成员关系的已有用户以 `owner` 加入默认企业，并给 `suppliers`、`prices`、`projects`、`quotations`、`quotation_items`、`quotation_documents` 增加 `organization_id` 后回填默认企业。`brands`、`materials`、`products` 不增加该字段。迁移只使用 `ALTER TABLE ADD COLUMN`、更新空值和新增索引，不删除现有数据。

服务器从登录 session 对应的成员关系确定当前企业，浏览器请求中的 `organization_id` 不参与授权。所有企业私有 API 都在 SQL 条件中同时限制当前企业；跨企业手工替换项目、供应商、报价或 PDF ID 会得到 404。

新建项目目录为 `data/organizations/<organization_id>/projects/<project_id>/`。旧项目仍从 `data/projects/<project_id>/` 读取，历史 DWG、Excel 和 PDF 无需搬迁。

## 6. 数据与备份

正式项目数据包括：

- `work/webapp/data/bom.sqlite`：用户、登录会话、项目元数据和 BOM 审核结果
- `work/webapp/data/projects/<项目ID>/`：上传的 DWG 和导出的 Excel
- `work/webapp/data/organizations/<企业ID>/projects/<项目ID>/`：V1.2 新项目及其 DWG、Excel、报价 PDF

备份时需要同时备份 SQLite 文件、`data/projects` 和 `data/organizations` 目录。建议在服务停止后复制，或使用文件系统快照。

## 7. 生产进程管理

当前启动脚本会以隐藏后台进程启动 Node 服务，并自动检查 4318 端口。正式服务器可以将该脚本加入 Windows 任务计划程序的“开机时启动”，并使用专用 Windows 服务账号运行。

如果服务异常，先查看 Node 进程和端口，再检查 `work/webapp/server.mjs` 的错误输出。不要删除 SQLite 文件来解决登录问题；这会删除项目历史。

## 8. 安全边界

- 当前登录是内部工具的邮箱/密码登录，密码只保存为 scrypt 哈希。
- 项目和 BOM API 按当前企业隔离，同一企业成员共享该企业私有数据。
- 不包含库存和采购功能；V1.1 的报价只使用已关联的采购价格，不做价格预测或品牌自动替换。
- 生产环境不要使用模板中的默认密码，也不要把 `.env` 提交到代码仓库。

## 9. 稳定版本与回滚

开源副本不包含生产数据库、客户文件或内部备份目录。正式部署前请由部署者在受控位置保存代码包、`data/bom.sqlite`、`data/projects` 和 `data/organizations` 的带日期备份，并记录对应版本号。

回滚时先停止服务，另存当前数据用于审计，再恢复目标版本代码和匹配的数据快照。不要使用仓库中的示例文件替换生产数据库，也不要删除 SQLite 文件来解决登录问题。

## 10. V1.2-2 权限边界

`users.platform_role` 只表达平台权限（`user` / `platform_admin`）；`organization_members.role` 只表达企业内部角色（`owner` / `admin` / `member`），不能互相替代。服务启动时会幂等迁移当前 `ADMIN_EMAIL` 为 `platform_admin`。

公共资料 `brands`、`materials`、`products` 不带 `organization_id`，普通商户只能 GET 查询；所有写入和批量导入在服务端要求 `platform_admin`。企业私有 `suppliers`、`prices` 带 `organization_id`，服务端只返回和操作当前 session 成员所属企业的行；请求体中的 `organization_id` 不参与授权。

开源副本不携带本阶段开发前的内部数据库与项目文件备份。部署者如需阶段性回滚，应使用自己的版本化数据快照和代码包。

## 11. V1.2-3 企业默认匹配规则

服务启动时幂等创建 `organization_replacement_rules`。规则字段包括来源材料、来源规格、目标公共品牌、目标公共产品、优先级、启用状态、用户确认状态和备注。规则表带 `organization_id`，所有 CRUD 和推荐查询都以当前 session 成员所属企业为条件；平台管理员身份不扩大该企业范围。

BOM 页面只展示精确匹配 `source_material_id + source_spec`、且 `enabled=1`、`verified_by_user=1` 的推荐。用户需要明确点击“应用推荐”或“应用本项目全部已确认规则”；规则保存也必须在品牌/产品人工确认后主动勾选保存选项。产品价格查询仍然附加当前企业 `organization_id`，无价格时不估算。

开源副本不携带本阶段开发前的内部备份。回滚应恢复部署者保存的完整数据库、项目目录和对应代码包，不要只删除规则表或直接在生产库执行回滚 SQL。

## 12. V1.2-4 供应商价格导入

服务启动时幂等创建：

- `supplier_import_profiles`：当前企业/供应商的工作表、表头行和字段映射记忆
- `supplier_product_aliases`：当前企业/供应商原始叫法到公共产品的用户确认绑定
- `supplier_import_batches`：文件名、供应商、记录数、成功/失败数和确认用户审计

上传文件只保存在内存导入会话中，必须经过映射、产品确认和影响预览后才写入 SQLite。价格写入 `prices` 时始终使用当前 session 企业和当前选择的供应商，并追加新的价格记录，不覆盖旧价格。公共产品库缺失的行不会自动创建产品；候选产品必须人工确认。

开源副本不携带本阶段开发前的内部备份。回滚时恢复部署者保存的完整数据快照和 V1.2-3 代码包。
