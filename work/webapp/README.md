# 配电系统 BOM 内部工具

这是现有 DWG → DXF → 文字/坐标 → 柜体分区 → 候选材料 → BOM 流程的 Web 包装，不改变已有解析与识别规则。V1.1 在外围增加了 SQLite 基础资料库、品牌匹配和项目报价计算；V1.2 增加企业租户与数据隔离基础架构；V1.2-2 将平台公共资料与企业私有采购资料分离；V1.2-3 增加企业私有默认匹配规则；V1.2-4 增加供应商任意 Excel/CSV 映射导入。

## 启动

先按仓库根目录的 [第三方工具安装说明](../../docs/third-party-tools.md) 准备 Python 虚拟环境和 LibreDWG 转换器，然后在 `work/webapp` 目录运行：

```powershell
npm install
node server.mjs
```

`npm install` 会从公开 npm registry 安装并锁定 ExcelJS 及其依赖；仓库已提交 `package-lock.json`，部署时建议使用 `npm ci` 进行可重复安装。

然后打开 `http://127.0.0.1:4318`。首次启动前请复制 `.env.example` 为 `.env`，并设置自己的管理员邮箱、强密码和会话密钥；仓库不提供可直接登录的默认账号。

## 业务流程

1. 新建项目，上传 `.dwg`。
2. 服务端调用本地安装的 `work/libredwg/dwg2dxf.exe`、Python 解析脚本与现有 BOM 汇总脚本。
3. 在 BOM 审核表中修改、删除或添加材料；原始文字、坐标、识别规则只读保留。
4. 点击某一行的“选择品牌”，按材料 → 品牌 → 型号 → 采购价格完成匹配。匹配结果保存到该 BOM 行的 `material_id`、`brand_id`、`product_id`、`price_id`。
5. 点击保存修改，项目记录保存在 `work/webapp/data/projects`。
6. 点击导出 Excel，生成按审核结果整理的 `BOM审核` 工作表。

7. 点击项目中的“报价计算”，维护人工费、运输费、其他费用和利润率，系统按 BOM 已匹配价格计算材料成本和最终报价。
8. 在报价页面填写客户信息并点击“生成客户报价 PDF”。每次生成会保存一条历史报价，也可以从历史列表重新下载。

## 基础资料（V1.1）

登录后点击左侧“基础资料”，可分别维护材料库、品牌库、产品型号库、价格库和供应商库。每个库支持新增、编辑、删除；产品型号和价格可关联品牌、材料、供应商。BOM 审核中的品牌替换会读取这些资料，并把选择结果保存到当前 BOM 行。报价页面使用 BOM 行上的采购价格快照计算材料成本，未匹配价格的材料会提示并按 0 计入。报价数据保存在 `quotations` 和 `quotation_items` 表中，客户 PDF 历史保存在 `quotation_documents` 表和项目目录的 `quotations` 子目录中，不会自动改写原有 CAD→BOM 识别流程。

## 运行边界

工具按内部单机/内网使用设计：DWG 文件和项目历史保存在运行解析流程的电脑上。数据库文件为 `data/bom.sqlite`，上传文件和导出文件保存在 `data/projects`。基础资料表由 `modules/master-data.mjs` 在启动时自动创建，结构备查文件为 `modules/master-data-schema.sql`。不含自动报价、品牌替换、库存、采购或新的 AI 能力。服务端使用根目录 `requirements.txt` 创建的 Python 虚拟环境，确保 `ezdxf`、`reportlab` 和 `pypdf` 可用；Excel 导入/导出使用公开的 MIT 许可 `exceljs` 依赖。LibreDWG 不随仓库分发，需由运行者单独安装。

生产部署请参阅 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## V1.2 企业租户与数据隔离

启动时会以幂等迁移方式创建 `organizations` 和 `organization_members`，并为已有用户创建一个“默认企业”。已有项目、供应商、价格、报价和报价 PDF 记录会自动补上默认企业 ID；迁移只增加字段和索引，不删除旧数据。`brands`、`materials`、`products` 继续作为平台公共资料。

当前企业由服务器根据登录 session 对应的用户成员关系确定，浏览器不能提交或切换 `organization_id`。项目、供应商、价格、报价、报价明细和报价 PDF 历史的查询、写入、删除都会带当前企业条件。新项目文件写入 `data/organizations/<organization_id>/projects/<project_id>/`；旧项目继续从 `data/projects/<project_id>/` 读取，因此已有 DWG、Excel 和 PDF 不需要搬迁即可继续使用。

回滚 V1.1：先停止服务，保留当前 `data/bom.sqlite` 与 `data/organizations` 目录，然后使用升级前备份目录中的 `bom.sqlite` 和 `projects` 目录恢复到 `work/webapp/data/`，再启动 V1.1 版本代码。V1.2 新增字段不会影响备份中的 V1.1 数据。

## 基础资料批量导入

基础资料页面提供“下载导入模板.xlsx”和“批量导入”按钮。统一模板的“导入数据”页使用“数据类型”区分 `brands`、`materials`、`products`、`suppliers`、`prices` 五类记录；“填写说明”页列出必填字段和关联规则。也可以将相同表头保存为 `.csv` 上传。

上传后先进入预览，显示总记录数、新增、更新、重复和错误行。产品会校验品牌与材料，价格会校验产品与供应商；错误会保留行号和原因，确认按钮只写入有效的新增/更新行，重复行不会重复写入。预览 token 15 分钟内有效，未点击确认不会修改 SQLite。

## V1.2-2 公共资料与企业采购资料权限

用户表的 `platform_role` 与企业成员的 `organization_members.role` 是两套独立角色。平台角色支持 `user`、`platform_admin`；企业角色仍支持 `owner`、`admin`、`member`。启动迁移会把 `.env` 中配置的 `ADMIN_EMAIL` 设为 `platform_admin`。

`brands`、`materials`、`products` 是平台公共资料：所有登录企业可以查询和用于品牌匹配，只有 `platform_admin` 可以新增、编辑、删除和导入。`suppliers`、`prices` 是企业私有采购资料：每次查询、写入、修改和删除都由服务器从 session → user → organization_members 确定 `organization_id`，浏览器提交的组织字段会被忽略。

基础资料页面分为“公共产品资料”和“我的采购资料”。普通企业在公共资料页只有只读操作；批量导入公共资料需要平台管理员。企业用户可以继续使用同一预览/确认流程导入自己的供应商和价格，模板中不允许指定企业。当前企业选择优先读取 session 的 `current_organization_id`，并验证该用户确实是该企业成员；没有选择时才使用兼容性的首个活动成员关系，为未来企业切换保留安全入口。

## V1.2-3 企业默认匹配规则

`organization_replacement_rules` 保存企业自己的“标准材料 + BOM 规格 → 公共品牌 + 公共产品型号”规则。规则必须属于当前 session 企业，创建时由服务器写入 `organization_id`，不接受浏览器提交的企业 ID。规则只有在用户主动保存后才标记为 `verified_by_user=1`；系统不会根据极数或电流推断品牌等价关系。

BOM 品牌匹配抽屉会读取当前企业已确认且启用的精确材料/规格规则，显示“企业默认匹配”、品牌、型号和当前企业采购价格。用户点击“应用推荐”后才会写入 BOM；没有当前企业价格时显示“已匹配产品，未匹配本企业价格”，不估算价格。项目页的“应用本项目全部已确认规则”用于批量处理，同样不会静默修改未匹配的行。

基础资料的“我的采购资料”区域提供“我的匹配规则”管理页，可新增、编辑、删除、启用和停用当前企业规则。平台管理员仍然只是公共 brands/materials/products 的平台角色，不能绕过 replacement rules 的企业隔离。

## V1.2-4 供应商任意 Excel/CSV 价格导入

基础资料页面的“供应商价格导入”支持选择当前企业供应商、上传 `.xlsx`/`.csv`、选择工作表、检测表头、人工调整字段映射和预览产品匹配。第一版支持 `supplier_sku`、`brand_text`、`product_name_text`、`model_text`、`spec_text`、`unit`、`purchase_price`、`currency`、`tax_included`、`valid_from` 字段；采购价格必填，产品识别信息至少要有型号、品名或规格之一。

产品匹配顺序是当前企业供应商已确认别名、公共产品品牌/型号精确匹配、品牌/型号候选匹配，无法确认的行不会导入。公共产品库不存在的产品只显示“公共产品库中未找到”，不会自动创建 products，也不会凭模糊信息绑定安全相关产品。确认写入时每一条供应商价格都追加为新价格记录，不覆盖历史价格；供应商映射模板、产品别名和导入批次均按当前企业隔离。
