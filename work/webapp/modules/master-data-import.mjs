import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "../spreadsheet-adapter.mjs";

// The import module is intentionally separate from the existing master-data CRUD
// module. It only writes after a preview token has been explicitly confirmed.
const previews = new Map();
const PREVIEW_TTL_MS = 15 * 60 * 1000;

const TYPE_ALIASES = new Map([
  ["brands", "brands"], ["brand", "brands"], ["品牌", "brands"],
  ["materials", "materials"], ["material", "materials"], ["材料", "materials"],
  ["products", "products"], ["product", "products"], ["产品", "products"],
  ["suppliers", "suppliers"], ["supplier", "suppliers"], ["供应商", "suppliers"],
  ["prices", "prices"], ["price", "prices"], ["价格", "prices"],
]);
const TYPE_ORDER = { brands: 1, materials: 2, suppliers: 3, products: 4, prices: 5 };
const TYPE_LABELS = { brands: "品牌", materials: "材料", products: "产品", suppliers: "供应商", prices: "价格" };
const PUBLIC_TYPES = new Set(["brands", "materials", "products"]);

const HEADER_ALIASES = {
  type: ["数据类型", "类型", "type", "entity"],
  code: ["编码", "代码", "code"],
  name: ["名称", "品牌名称", "材料名称", "供应商名称", "name"],
  category: ["类别", "材料类别", "category"],
  unit: ["单位", "unit"],
  description: ["说明", "描述", "description"],
  brand_code: ["品牌编码", "产品品牌编码", "brand_code"],
  brand_name: ["品牌名称", "产品品牌名称", "brand_name"],
  model: ["型号", "产品型号", "model"],
  specification: ["规格", "产品规格", "规格型号", "specification"],
  material_code: ["材料编码", "产品材料编码", "material_code"],
  material_name: ["材料名称", "产品材料名称", "material_name"],
  supplier_code: ["供应商编码", "supplier_code"],
  supplier_name: ["供应商名称", "supplier_name"],
  unit_price: ["单价", "采购单价", "unit_price", "price"],
  currency: ["币种", "currency"],
  valid_from: ["有效期起", "有效开始", "valid_from"],
  valid_to: ["有效期止", "有效结束", "valid_to"],
  contact_name: ["联系人", "contact_name"],
  phone: ["电话", "手机", "phone"],
  email: ["邮箱", "email"],
  address: ["地址", "address"],
  note: ["备注", "note"],
};

function clean(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/^\uFEFF/, "").trim();
}
function norm(value) { return clean(value).replace(/\s+/g, " ").toLowerCase(); }
function uniqueKey(...parts) { return parts.map((part) => norm(part)).join("|"); }
function parseType(value) { return TYPE_ALIASES.get(norm(value)) || ""; }
function fieldFromHeader(header) {
  const key = norm(header);
  const exact = { "品牌编码": "brand_code", "产品品牌编码": "brand_code", "品牌名称": "brand_name", "产品品牌名称": "brand_name", "材料编码": "material_code", "产品材料编码": "material_code", "材料名称": "material_name", "产品材料名称": "material_name", "供应商编码": "supplier_code", "供应商名称": "supplier_name", "产品型号": "model", "产品规格": "specification" };
  if (exact[key]) return exact[key];
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.some((alias) => norm(alias) === key)) return field;
  return "";
}
function isBlankRow(row) { return !row.some((value) => clean(value) !== ""); }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = ""; if (!isBlankRow(row)) rows.push(row); row = [];
    } else cell += char;
  }
  row.push(cell); if (!isBlankRow(row)) rows.push(row);
  return rows;
}

async function parseUploadedFile(buffer, filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  if (!lower.endsWith(".xlsx")) throw new Error("只支持 .xlsx 或 .csv 文件");
  const temporaryPath = path.join(os.tmpdir(), `master-data-import-${crypto.randomUUID()}.xlsx`);
  await fs.writeFile(temporaryPath, buffer);
  try {
    const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(temporaryPath));
    const sheet = workbook.worksheets.getItemAt(0);
    const used = sheet?.getUsedRange(true);
    if (!used) return [];
    return used.values || [];
  } finally { await fs.unlink(temporaryPath).catch(() => {}); }
}

function rowsFromMatrix(matrix) {
  if (!matrix.length) throw new Error("文件没有可导入的记录");
  const header = matrix[0].map(fieldFromHeader);
  if (!header.includes("type")) throw new Error("缺少必填列：数据类型");
  return matrix.slice(1).map((values, index) => {
    const data = {};
    for (let column = 0; column < header.length; column += 1) if (header[column]) data[header[column]] = clean(values[column]);
    const type = parseType(data.type);
    if (type === "brands" && !data.name && data.brand_name) data.name = data.brand_name;
    if (type === "materials" && !data.name && data.material_name) data.name = data.material_name;
    if (type === "suppliers" && !data.name && data.supplier_name) data.name = data.supplier_name;
    return { rowNumber: index + 2, data };
  }).filter(({ data }) => Object.values(data).some((value) => value !== ""));
}

function mapRows(db, organizationId) {
  const brands = db.prepare("SELECT * FROM brands").all();
  const materials = db.prepare("SELECT * FROM materials").all();
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE organization_id=?").all(organizationId);
  const products = db.prepare("SELECT * FROM products").all();
  const prices = db.prepare("SELECT * FROM prices WHERE organization_id=?").all(organizationId);
  return {
    brandsByName: new Map(brands.map((row) => [norm(row.name), row])),
    brandsByCode: new Map(brands.filter((row) => row.code).map((row) => [norm(row.code), row])),
    materialsByCode: new Map(materials.map((row) => [norm(row.code), row])),
    materialsByName: new Map(materials.map((row) => [norm(row.name), row])),
    suppliersByName: new Map(suppliers.map((row) => [norm(row.name), row])),
    suppliersByCode: new Map(suppliers.filter((row) => row.code).map((row) => [norm(row.code), row])),
    productsByKey: new Map(products.map((row) => [uniqueKey(row.brand_id, row.model), row])),
    productsById: new Map(products.map((row) => [row.id, row])),
    pricesByKey: new Map(prices.map((row) => [uniqueKey(row.product_id, row.supplier_id || "", row.valid_from || ""), row])),
  };
}

function ref(mapByCode, mapByName, code, name, label) {
  const result = (code && mapByCode.get(norm(code))) || (name && mapByName.get(norm(name)));
  if (!result) throw new Error(`${label}不存在（编码：${code || "-"}，名称：${name || "-"}）`);
  return result;
}

function required(data, fields) {
  for (const [field, label] of fields) if (!clean(data[field])) throw new Error(`${label}不能为空`);
}

function buildPlan(db, rawRows, organizationId, platformRole) {
  const maps = mapRows(db, organizationId);
  const plan = [];
  const staged = { brandNames: new Map(), materialCodes: new Map(), supplierNames: new Map(), productKeys: new Map(), priceKeys: new Map() };
  const errors = [];
  const byType = [...rawRows].sort((a, b) => (TYPE_ORDER[parseType(a.data.type)] || 99) - (TYPE_ORDER[parseType(b.data.type)] || 99) || a.rowNumber - b.rowNumber);
  for (const raw of byType) {
    const data = raw.data;
    const type = parseType(data.type);
    const item = { rowNumber: raw.rowNumber, type, typeLabel: TYPE_LABELS[type] || clean(data.type), data, action: "error", reason: "", existingId: null };
    try {
      if (!type) throw new Error(`不支持的数据类型：${data.type || "空"}`);
      if (PUBLIC_TYPES.has(type) && platformRole !== "platform_admin") throw new Error("只有平台管理员可以导入公共产品资料");
      let identity;
      if (type === "brands") {
        required(data, [["name", "品牌名称"]]); identity = uniqueKey(data.name);
        if (staged.brandNames.has(identity)) { item.action = "duplicate"; item.reason = `与第 ${staged.brandNames.get(identity)} 行重复`; }
        else { const existing = maps.brandsByName.get(norm(data.name)); item.action = existing ? "update" : "new"; item.existingId = existing?.id || null; staged.brandNames.set(identity, raw.rowNumber); maps.brandsByName.set(norm(data.name), existing || { id: `virtual:brands:${raw.rowNumber}`, name: data.name, code: data.code }); if (data.code) maps.brandsByCode.set(norm(data.code), existing || { id: `virtual:brands:${raw.rowNumber}`, name: data.name, code: data.code }); }
      } else if (type === "materials") {
        required(data, [["code", "材料编码"], ["name", "材料名称"]]); identity = uniqueKey(data.code);
        if (staged.materialCodes.has(identity)) { item.action = "duplicate"; item.reason = `与第 ${staged.materialCodes.get(identity)} 行重复`; }
        else { const existing = maps.materialsByCode.get(norm(data.code)); item.action = existing ? "update" : "new"; item.existingId = existing?.id || null; staged.materialCodes.set(identity, raw.rowNumber); maps.materialsByCode.set(norm(data.code), existing || { id: `virtual:materials:${raw.rowNumber}`, code: data.code, name: data.name }); maps.materialsByName.set(norm(data.name), existing || { id: `virtual:materials:${raw.rowNumber}`, code: data.code, name: data.name }); }
      } else if (type === "suppliers") {
        required(data, [["name", "供应商名称"]]); identity = uniqueKey(data.name);
        if (staged.supplierNames.has(identity)) { item.action = "duplicate"; item.reason = `与第 ${staged.supplierNames.get(identity)} 行重复`; }
        else { const existing = maps.suppliersByName.get(norm(data.name)); item.action = existing ? "update" : "new"; item.existingId = existing?.id || null; staged.supplierNames.set(identity, raw.rowNumber); maps.suppliersByName.set(norm(data.name), existing || { id: `virtual:suppliers:${raw.rowNumber}`, name: data.name, code: data.code }); if (data.code) maps.suppliersByCode.set(norm(data.code), existing || { id: `virtual:suppliers:${raw.rowNumber}`, name: data.name, code: data.code }); }
      } else if (type === "products") {
        required(data, [["model", "产品型号"]]); if (!data.brand_code && !data.brand_name) throw new Error("产品品牌编码或品牌名称不能为空");
        const brand = ref(maps.brandsByCode, maps.brandsByName, data.brand_code, data.brand_name || data.brand_code, "品牌");
        const material = ref(maps.materialsByCode, maps.materialsByName, data.material_code, data.material_name || data.material_code, "材料");
        identity = uniqueKey(brand.id, data.model);
        if (staged.productKeys.has(identity)) { item.action = "duplicate"; item.reason = `与第 ${staged.productKeys.get(identity)} 行重复`; }
        else { const existing = maps.productsByKey.get(identity); item.action = existing ? "update" : "new"; item.existingId = existing?.id || null; staged.productKeys.set(identity, raw.rowNumber); const stagedProduct = existing || { id: `virtual:products:${raw.rowNumber}`, brand_id: brand.id, material_id: material.id, model: data.model }; maps.productsByKey.set(identity, stagedProduct); maps.productsById.set(stagedProduct.id, stagedProduct); }
        item.refs = { brandId: brand.id, materialId: material.id };
      } else if (type === "prices") {
        required(data, [["model", "价格对应的产品型号"], ["unit_price", "采购单价"]]); if (!data.brand_code && !data.brand_name) throw new Error("价格对应的品牌编码或品牌名称不能为空"); if (!data.supplier_code && !data.supplier_name) throw new Error("价格对应的供应商编码或供应商名称不能为空");
        const number = Number(data.unit_price); if (!Number.isFinite(number) || number < 0) throw new Error("采购单价必须是大于等于 0 的数字");
        const brand = ref(maps.brandsByCode, maps.brandsByName, data.brand_code, data.brand_name || data.brand_code, "品牌");
        const product = maps.productsByKey.get(uniqueKey(brand.id, data.model)); if (!product) throw new Error(`产品不存在（品牌：${data.brand_name || data.brand_code}，型号：${data.model}）`);
        const supplier = data.supplier_code || data.supplier_name ? ref(maps.suppliersByCode, maps.suppliersByName, data.supplier_code, data.supplier_name || data.supplier_code, "供应商") : null;
        identity = uniqueKey(product.id, supplier?.id || "", data.valid_from || "");
        if (staged.priceKeys.has(identity)) { item.action = "duplicate"; item.reason = `与第 ${staged.priceKeys.get(identity)} 行重复`; }
        else { const existing = maps.pricesByKey.get(identity); item.action = existing ? "update" : "new"; item.existingId = existing?.id || null; staged.priceKeys.set(identity, raw.rowNumber); maps.pricesByKey.set(identity, existing || { id: `virtual:prices:${raw.rowNumber}`, product_id: product.id, supplier_id: supplier?.id || null, valid_from: data.valid_from || "" }); }
        item.refs = { productId: product.id, supplierId: supplier?.id || null };
      }
    } catch (error) { item.action = "error"; item.reason = error.message || String(error); errors.push({ row: item.rowNumber, reason: item.reason }); }
    plan.push(item);
  }
  const counts = { total: rawRows.length, newCount: plan.filter((row) => row.action === "new").length, updateCount: plan.filter((row) => row.action === "update").length, duplicateCount: plan.filter((row) => row.action === "duplicate").length, errorCount: plan.filter((row) => row.action === "error").length };
  return { plan: plan.sort((a, b) => a.rowNumber - b.rowNumber), errors, counts };
}

function insertOrUpdate(db, table, uniqueWhere, values, idField = "id") {
  const existing = db.prepare(`SELECT * FROM ${table} WHERE ${uniqueWhere.sql}`).get(...uniqueWhere.values);
  const now = new Date().toISOString();
  if (existing) {
    const columns = Object.keys(values).filter((column) => column !== idField && column !== "created_at");
    db.prepare(`UPDATE ${table} SET ${columns.map((column) => `${column}=?`).join(",")}, updated_at=? WHERE id=?`).run(...columns.map((column) => values[column] ?? null), now, existing[idField]);
    return { id: existing[idField], updated: true };
  }
  const id = crypto.randomUUID(); const record = { id, ...values, created_at: now, updated_at: now }; const columns = Object.keys(record);
  db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => record[column] ?? null));
  return { id, updated: false };
}

function applyPlan(db, stored, organizationId) {
  const maps = mapRows(db, organizationId); const result = { successCount: 0, failureCount: 0, added: 0, updated: 0, duplicateCount: stored.counts.duplicateCount, errors: [] };
  const rows = stored.plan.filter((row) => row.action === "new" || row.action === "update").sort((a, b) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99) || a.rowNumber - b.rowNumber);
  for (const item of rows) {
    try {
      const { data, type } = item; let applied;
      if (type === "brands") { applied = insertOrUpdate(db, "brands", { sql: "name=?", values: [data.name] }, { name: data.name, code: data.code || null, description: data.description || null, active: 1 }); const row = db.prepare("SELECT * FROM brands WHERE id=?").get(applied.id); maps.brandsByName.set(norm(row.name), row); if (row.code) maps.brandsByCode.set(norm(row.code), row); }
      if (type === "materials") { applied = insertOrUpdate(db, "materials", { sql: "code=?", values: [data.code] }, { code: data.code, name: data.name, category: data.category || null, unit: data.unit || null, description: data.description || null, active: 1 }); const row = db.prepare("SELECT * FROM materials WHERE id=?").get(applied.id); maps.materialsByCode.set(norm(row.code), row); maps.materialsByName.set(norm(row.name), row); }
      if (type === "suppliers") { applied = insertOrUpdate(db, "suppliers", { sql: "name=? AND organization_id=?", values: [data.name, organizationId] }, { organization_id: organizationId, name: data.name, code: data.code || null, contact_name: data.contact_name || null, phone: data.phone || null, email: data.email || null, address: data.address || null, active: 1 }); const row = db.prepare("SELECT * FROM suppliers WHERE id=? AND organization_id=?").get(applied.id, organizationId); maps.suppliersByName.set(norm(row.name), row); if (row.code) maps.suppliersByCode.set(norm(row.code), row); }
      if (type === "products") { const brand = ref(maps.brandsByCode, maps.brandsByName, data.brand_code, data.brand_name || data.brand_code, "品牌"); const material = ref(maps.materialsByCode, maps.materialsByName, data.material_code, data.material_name || data.material_code, "材料"); applied = insertOrUpdate(db, "products", { sql: "brand_id=? AND model=?", values: [brand.id, data.model] }, { material_id: material.id, brand_id: brand.id, model: data.model, specification: data.specification || null, unit: data.unit || null, description: data.description || null, active: 1 }); const row = db.prepare("SELECT * FROM products WHERE id=?").get(applied.id); maps.productsByKey.set(uniqueKey(brand.id, data.model), row); maps.productsById.set(row.id, row); }
      if (type === "prices") { const brand = ref(maps.brandsByCode, maps.brandsByName, data.brand_code, data.brand_name || data.brand_code, "品牌"); const product = maps.productsByKey.get(uniqueKey(brand.id, data.model)); if (!product) throw new Error(`产品不存在（型号：${data.model}）`); const supplier = data.supplier_code || data.supplier_name ? ref(maps.suppliersByCode, maps.suppliersByName, data.supplier_code, data.supplier_name || data.supplier_code, "供应商") : null; applied = insertOrUpdate(db, "prices", { sql: "product_id=? AND organization_id=? AND IFNULL(supplier_id,'')=IFNULL(?, '') AND IFNULL(valid_from,'')=IFNULL(?, '')", values: [product.id, organizationId, supplier?.id || null, data.valid_from || null] }, { organization_id: organizationId, product_id: product.id, supplier_id: supplier?.id || null, unit_price: Number(data.unit_price), currency: data.currency || "CNY", valid_from: data.valid_from || null, valid_to: data.valid_to || null, note: data.note || null }); }
      if (!applied) throw new Error("无法识别的数据类型");
      result.successCount += 1; if (applied.updated) result.updated += 1; else result.added += 1;
    } catch (error) { result.failureCount += 1; result.errors.push({ row: item.rowNumber, reason: error.message || String(error) }); }
  }
  return result;
}

function cleanupPreviews() { const now = Date.now(); for (const [token, value] of previews) if (value.expiresAt < now) previews.delete(token); }

export async function handleMasterDataImportApi({ req, res, pathname, db, json, readBody, templatePath, organizationId, platformRole = "user" }) {
  cleanupPreviews();
  if (req.method === "GET" && pathname === "/api/master-data/import/template") {
    const data = await fs.readFile(templatePath);
    res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename*=UTF-8''master-data-import-template.xlsx" });
    return res.end(data);
  }
  if (req.method === "POST" && pathname === "/api/master-data/import/preview") {
    try {
      const body = await readBody(req); if (!body.length) return json(res, 400, { error: "上传文件为空" });
      const filename = decodeURIComponent(String(req.headers["x-file-name"] || "import.xlsx")); const matrix = await parseUploadedFile(body, filename); const rawRows = rowsFromMatrix(matrix); const preview = buildPlan(db, rawRows, organizationId, platformRole); const token = crypto.randomUUID(); previews.set(token, { ...preview, filename, organizationId, platformRole, expiresAt: Date.now() + PREVIEW_TTL_MS });
      return json(res, 200, { token, filename, ...preview.counts, counts: preview.counts, errors: preview.errors, rows: preview.plan });
    } catch (error) { return json(res, 400, { error: error.message || String(error) }); }
  }
  if (req.method === "POST" && pathname === "/api/master-data/import/confirm") {
    try { const body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const stored = previews.get(String(body.token || "")); if (!stored || stored.expiresAt < Date.now() || stored.organizationId !== organizationId || stored.platformRole !== platformRole) return json(res, 400, { error: "预览已失效，请重新上传文件" }); const result = applyPlan(db, stored, organizationId); previews.delete(String(body.token)); return json(res, 200, { filename: stored.filename, ...result }); }
    catch (error) { return json(res, 400, { error: error.message || String(error) }); }
  }
  return json(res, 404, { error: "批量导入接口不存在" });
}

export const importTypeLabels = TYPE_LABELS;
