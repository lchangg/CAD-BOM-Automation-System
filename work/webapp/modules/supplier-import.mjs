import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "../spreadsheet-adapter.mjs";

const uploads = new Map();
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const IMPORT_FIELDS = ["supplier_sku", "brand_text", "product_name_text", "model_text", "spec_text", "unit", "purchase_price", "currency", "tax_included", "valid_from"];
const HEADER_ALIASES = {
  supplier_sku: ["货号", "商品编码", "产品编码", "供应商货号", "sku", "supplier_sku", "编码"],
  brand_text: ["品牌", "厂家", "制造商", "brand", "brand_text"],
  product_name_text: ["品名", "商品名称", "产品名称", "名称", "product_name", "product_name_text"],
  model_text: ["型号", "产品型号", "model", "model_text"],
  spec_text: ["规格", "型号规格", "规格型号", "参数", "spec", "spec_text"],
  unit: ["单位", "unit"],
  purchase_price: ["单价", "价格", "结算价", "经销价", "采购价", "含税单价", "采购单价", "purchase_price", "price"],
  currency: ["币种", "货币", "currency"],
  tax_included: ["含税", "是否含税", "税价", "tax_included"],
  valid_from: ["有效期起", "生效日期", "报价日期", "valid_from"],
};

function clean(value) { return value === null || value === undefined ? "" : String(value).replace(/^\uFEFF/, "").trim(); }
function norm(value) { return clean(value).replace(/[\s_\-（）()]/g, "").toLowerCase(); }
function now() { return new Date().toISOString(); }
function jsonNumber(value) { const number = Number(String(value).replace(/[,，￥¥]/g, "")); return Number.isFinite(number) ? number : null; }
function cleanupUploads() { const timestamp = Date.now(); for (const [token, value] of uploads) if (value.expiresAt < timestamp) uploads.delete(token); }
function headerField(value) { const key = norm(value); for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.some(alias => norm(alias) === key)) return field; return ""; }
function headerCandidates(values) { return values.map(row => { const fields = row.map(headerField); const score = fields.filter(Boolean).length; return { row: values.indexOf(row) + 1, score, fields }; }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.row - b.row).slice(0, 5); }

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false; const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) { const char = source[i]; if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(cell); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i += 1; row.push(cell); if (row.some(value => clean(value))) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell); if (row.some(value => clean(value))) rows.push(row); return rows;
}

async function parseFile(buffer, filename) {
  if (String(filename).toLowerCase().endsWith(".csv")) return [{ name: "CSV", index: 0, values: parseCsv(buffer.toString("utf8")) }];
  if (!String(filename).toLowerCase().endsWith(".xlsx")) throw new Error("只支持 .xlsx 或 .csv 文件");
  const temporaryPath = path.join(os.tmpdir(), `supplier-import-${crypto.randomUUID()}.xlsx`); await fs.writeFile(temporaryPath, buffer);
  try { const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(temporaryPath)); return (workbook.worksheets.items || []).map((sheet, index) => { const used = sheet.getUsedRange(true); return { name: sheet.name || `Sheet${index + 1}`, index, values: used?.values || [] }; }); }
  finally { await fs.unlink(temporaryPath).catch(() => {}); }
}

function verifySupplier(db, supplierId, organizationId) { return db.prepare("SELECT id, name, code FROM suppliers WHERE id=? AND organization_id=?").get(supplierId, organizationId); }
function profilesFor(db, supplierId, organizationId) { return db.prepare("SELECT id, supplier_id, profile_name, sheet_name, header_row, mapping_json, created_at, updated_at FROM supplier_import_profiles WHERE supplier_id=? AND organization_id=? ORDER BY updated_at DESC").all(supplierId, organizationId).map(row => ({ ...row, mapping: JSON.parse(row.mapping_json || "{}") })); }
function mapRows(sheet, headerRow, mapping) {
  const headerIndex = Math.max(1, Number(headerRow || 1)) - 1; const header = sheet.values[headerIndex] || []; const rows = [];
  for (let i = headerIndex + 1; i < sheet.values.length; i += 1) { const raw = sheet.values[i] || []; if (!raw.some(value => clean(value))) continue; const mapped = {}; for (const field of IMPORT_FIELDS) { const index = mapping?.[field]; mapped[field] = index === "" || index === null || index === undefined ? "" : clean(raw[Number(index)]); } rows.push({ rowNumber: i + 1, raw: raw.map(clean), mapped }); }
  return { header: header.map(clean), rows };
}
function publicProductMaps(db) {
  const rows = db.prepare(`SELECT p.id, p.material_id, p.brand_id, p.model, p.specification, p.unit, b.name AS brand_name, m.name AS material_name FROM products p LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN materials m ON m.id=p.material_id WHERE p.active=1`).all();
  return { rows, byId: new Map(rows.map(row => [row.id, row])) };
}
function productCandidates(maps, mapped) {
  const brand = norm(mapped.brand_text); const model = norm(mapped.model_text || mapped.product_name_text); const spec = norm(mapped.spec_text);
  if (!model && !spec) return { status: "error", reason: "缺少型号或规格/产品名称" };
  const exactModel = maps.rows.filter(row => model && norm(row.model) === model && (!brand || norm(row.brand_name) === brand));
  if (exactModel.length === 1) return { status: "auto", product: exactModel[0], candidates: exactModel };
  if (exactModel.length > 1) return { status: "candidate", candidates: exactModel };
  const modelAndSpec = maps.rows.filter(row => model && norm(row.model) === model && spec && norm(row.specification) === spec);
  if (modelAndSpec.length === 1) return { status: "auto", product: modelAndSpec[0], candidates: modelAndSpec };
  if (modelAndSpec.length > 1) return { status: "candidate", candidates: modelAndSpec };
  const specOnly = maps.rows.filter(row => spec && norm(row.specification) === spec && (!brand || norm(row.brand_name) === brand));
  if (specOnly.length) return { status: "candidate", candidates: specOnly };
  const specCandidates = maps.rows.filter(row => spec && norm(row.specification) === spec);
  if (specCandidates.length) return { status: "candidate", candidates: specCandidates };
  return { status: "unmatched", reason: "公共产品库中未找到" };
}
function aliasMatch(db, supplierId, organizationId, mapped) {
  const values = [mapped.supplier_sku, mapped.product_name_text, mapped.model_text, mapped.spec_text].map(norm);
  if (!values.some(Boolean)) return null;
  return db.prepare(`SELECT a.product_id FROM supplier_product_aliases a WHERE a.organization_id=? AND a.supplier_id=? AND a.confirmed_by_user=1 AND ((?<>'' AND lower(trim(a.supplier_sku))=?) OR (?<>'' AND lower(trim(a.supplier_product_text))=?) OR (?<>'' AND lower(trim(a.model_text))=?)) ORDER BY a.updated_at DESC LIMIT 1`).get(organizationId, supplierId, values[0], values[0], values[1], values[1], values[2], values[2]) || null;
}
function buildPlan(db, upload, supplierId, organizationId, config) {
  const sheet = upload.sheets[Number(config.sheet_index || 0)]; if (!sheet) throw new Error("工作表不存在");
  const mapped = mapRows(sheet, config.header_row, config.mapping || {}); const maps = publicProductMaps(db); const plan = [];
  for (const item of mapped.rows) {
    const price = jsonNumber(item.mapped.purchase_price); let result = { ...item, status: "unmatched", reason: "", product: null, candidates: [] };
    if (price === null || price < 0) result = { ...result, status: "error", reason: "采购价格不能为空且必须是大于等于 0 的数字" };
    else {
      const alias = aliasMatch(db, supplierId, organizationId, item.mapped);
      if (alias) { result.status = "alias"; result.product = maps.byId.get(alias.product_id) || null; if (!result.product) { result.status = "unmatched"; result.reason = "历史别名指向的公共产品已不存在"; } }
      if (!result.product) { const match = productCandidates(maps, item.mapped); result.status = match.status; result.reason = match.reason || ""; result.product = match.product || null; result.candidates = match.candidates || []; }
    }
    if (result.product) { const current = db.prepare("SELECT id, unit_price, currency FROM prices WHERE organization_id=? AND supplier_id=? AND product_id=? ORDER BY updated_at DESC LIMIT 1").get(organizationId, supplierId, result.product.id); result.currentPrice = current ? Number(current.unit_price) : null; result.priceChange = current ? Number(current.unit_price) !== price : true; }
    plan.push(result);
  }
  const counts = { total: plan.length, autoMatched: plan.filter(x => x.status === "auto").length, aliasMatched: plan.filter(x => x.status === "alias").length, needsConfirmation: plan.filter(x => x.status === "candidate").length, missingProduct: plan.filter(x => x.status === "unmatched").length, newPrices: plan.filter(x => x.product && x.currentPrice === null).length, priceChanges: plan.filter(x => x.product && x.currentPrice !== null && x.priceChange).length, priceSame: plan.filter(x => x.product && x.currentPrice !== null && !x.priceChange).length, errors: plan.filter(x => x.status === "error").length };
  return { sheetName: sheet.name, headerRow: Number(config.header_row || 1), header: mapped.header, mapping: config.mapping || {}, plan, counts };
}
function profileSave(db, organizationId, supplierId, profileName, sheetName, headerRow, mapping) {
  if (!profileName) return null; const existing = db.prepare("SELECT id FROM supplier_import_profiles WHERE organization_id=? AND supplier_id=? AND profile_name=?").get(organizationId, supplierId, profileName); const timestamp = now();
  if (existing) { db.prepare("UPDATE supplier_import_profiles SET sheet_name=?, header_row=?, mapping_json=?, updated_at=? WHERE id=? AND organization_id=?").run(sheetName, headerRow, JSON.stringify(mapping), timestamp, existing.id, organizationId); return existing.id; }
  const id = crypto.randomUUID(); db.prepare("INSERT INTO supplier_import_profiles (id,organization_id,supplier_id,profile_name,sheet_name,header_row,mapping_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, organizationId, supplierId, profileName, sheetName, headerRow, JSON.stringify(mapping), timestamp, timestamp); return id;
}

export function initSupplierImportSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_import_profiles (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, profile_name TEXT NOT NULL, sheet_name TEXT, header_row INTEGER NOT NULL, mapping_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id, supplier_id, profile_name));
    CREATE TABLE IF NOT EXISTS supplier_product_aliases (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, supplier_sku TEXT, supplier_product_text TEXT, brand_text TEXT, model_text TEXT, spec_text TEXT, product_id TEXT NOT NULL REFERENCES products(id), confirmed_by_user INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_alias_identity ON supplier_product_aliases(organization_id, supplier_id, supplier_sku, supplier_product_text, model_text);
    CREATE INDEX IF NOT EXISTS idx_supplier_alias_product ON supplier_product_aliases(organization_id, supplier_id, product_id);
    CREATE TABLE IF NOT EXISTS supplier_import_batches (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, original_filename TEXT NOT NULL, profile_id TEXT, total_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, failure_count INTEGER NOT NULL DEFAULT 0, imported_at TEXT NOT NULL, confirmed_by_user TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_supplier_import_batches_org ON supplier_import_batches(organization_id, imported_at DESC);
  `);
}

export async function handleSupplierImportApi({ req, res, pathname, url, db, json, readBody, organizationId, user }) {
  cleanupUploads();
  if (req.method === "POST" && pathname === "/api/supplier-import/upload") {
    try { const supplierId = String(req.headers["x-supplier-id"] || ""); if (!verifySupplier(db, supplierId, organizationId)) return json(res, 404, { error: "当前企业供应商不存在" }); const filename = decodeURIComponent(String(req.headers["x-file-name"] || "supplier.xlsx")); const buffer = await readBody(req); const sheets = await parseFile(buffer, filename); const token = crypto.randomUUID(); uploads.set(token, { organizationId, supplierId, filename, sheets, expiresAt: Date.now() + UPLOAD_TTL_MS }); return json(res, 200, { token, filename, supplier: verifySupplier(db, supplierId, organizationId), sheets: sheets.map(sheet => ({ name: sheet.name, index: sheet.index, rowCount: sheet.values.length, headerCandidates: headerCandidates(sheet.values.slice(0, 30)), sampleRows: sheet.values.slice(0, 10).map(row => row.map(clean)) })), profiles: profilesFor(db, supplierId, organizationId) }); } catch (error) { return json(res, 400, { error: error.message || String(error) }); }
  }
  if (req.method === "POST" && pathname === "/api/supplier-import/preview") {
    try { const body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const upload = uploads.get(String(body.token || "")); const supplierId = String(body.supplier_id || ""); if (!upload || upload.expiresAt < Date.now() || upload.organizationId !== organizationId || upload.supplierId !== supplierId || !verifySupplier(db, supplierId, organizationId)) return json(res, 400, { error: "上传文件或供应商选择已失效" }); let config = { sheet_index: Number(body.sheet_index || 0), header_row: Number(body.header_row || 1), mapping: body.mapping || {} }; if (body.profile_id) { const profile = db.prepare("SELECT * FROM supplier_import_profiles WHERE id=? AND organization_id=? AND supplier_id=?").get(body.profile_id, organizationId, supplierId); if (!profile) return json(res, 404, { error: "导入映射配置不存在" }); config = { ...config, sheet_index: upload.sheets.findIndex(sheet => sheet.name === profile.sheet_name), header_row: profile.header_row, mapping: JSON.parse(profile.mapping_json || "{}") }; } const preview = buildPlan(db, upload, supplierId, organizationId, config); uploads.set(String(body.token), { ...upload, preview, config, expiresAt: Date.now() + UPLOAD_TTL_MS }); return json(res, 200, { token: body.token, supplierId, filename: upload.filename, ...preview, profiles: profilesFor(db, supplierId, organizationId) }); } catch (error) { return json(res, 400, { error: error.message || String(error) }); }
  }
  if (req.method === "POST" && pathname === "/api/supplier-import/confirm") {
    try { const body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const upload = uploads.get(String(body.token || "")); const supplierId = String(body.supplier_id || ""); if (!upload?.preview || upload.expiresAt < Date.now() || upload.organizationId !== organizationId || upload.supplierId !== supplierId || !verifySupplier(db, supplierId, organizationId)) return json(res, 400, { error: "导入预览已失效，请重新上传并预览" }); const resolutions = new Map((body.resolutions || []).map(item => [Number(item.rowNumber), item])); const batchId = crypto.randomUUID(); const timestamp = now(); const profileId = body.save_profile ? profileSave(db, organizationId, supplierId, clean(body.profile_name) || `${upload.filename} 映射`, upload.preview.sheetName, upload.preview.headerRow, upload.preview.mapping) : (body.profile_id || null); let successCount = 0, failureCount = 0; const errors = []; const imported = []; for (const item of upload.preview.plan) { try { const resolution = resolutions.get(item.rowNumber); const productId = resolution?.product_id || item.product?.id; if (!productId || item.status === "unmatched" || item.status === "error" || item.status === "candidate" && !resolution?.product_id) { failureCount += 1; errors.push({ row: item.rowNumber, reason: item.reason || (item.status === "candidate" ? "需要人工确认产品" : "未匹配公共产品") }); continue; } const product = db.prepare("SELECT id FROM products WHERE id=? AND active=1").get(productId); if (!product) throw new Error("选择的公共产品不存在"); const price = jsonNumber(item.mapped.purchase_price); const priceId = crypto.randomUUID(); db.prepare("INSERT INTO prices (id,organization_id,product_id,supplier_id,unit_price,currency,valid_from,valid_to,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(priceId, organizationId, productId, supplierId, price, item.mapped.currency || "CNY", item.mapped.valid_from || null, null, `供应商导入：${upload.filename} · 批次 ${batchId}`, timestamp, timestamp); if (resolution?.save_alias || item.status === "alias") { const aliasValues = [organizationId, supplierId, item.mapped.supplier_sku || null, item.mapped.product_name_text || null, item.mapped.brand_text || null, item.mapped.model_text || null, item.mapped.spec_text || null, productId]; db.prepare("DELETE FROM supplier_product_aliases WHERE organization_id=? AND supplier_id=? AND IFNULL(supplier_sku,'')=IFNULL(?, '') AND IFNULL(supplier_product_text,'')=IFNULL(?, '') AND IFNULL(model_text,'')=IFNULL(?, '')").run(...aliasValues.slice(0, 5)); db.prepare("INSERT INTO supplier_product_aliases (id,organization_id,supplier_id,supplier_sku,supplier_product_text,brand_text,model_text,spec_text,product_id,confirmed_by_user,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), organizationId, supplierId, item.mapped.supplier_sku || null, item.mapped.product_name_text || null, item.mapped.brand_text || null, item.mapped.model_text || null, item.mapped.spec_text || null, productId, 1, timestamp, timestamp); } successCount += 1; imported.push({ row: item.rowNumber, priceId, productId }); } catch (error) { failureCount += 1; errors.push({ row: item.rowNumber, reason: error.message || String(error) }); } }
      db.prepare("INSERT INTO supplier_import_batches (id,organization_id,supplier_id,original_filename,profile_id,total_count,success_count,failure_count,imported_at,confirmed_by_user) VALUES (?,?,?,?,?,?,?,?,?,?)").run(batchId, organizationId, supplierId, upload.filename, profileId, upload.preview.counts.total, successCount, failureCount, timestamp, user.id); uploads.delete(String(body.token)); return json(res, 200, { batchId, profileId, totalCount: upload.preview.counts.total, successCount, failureCount, errors, imported }); } catch (error) { return json(res, 400, { error: error.message || String(error) }); }
  }
  if (req.method === "GET" && pathname === "/api/supplier-import/batches") { const supplierId = url?.searchParams?.get("supplier_id") || ""; const where = supplierId ? "AND supplier_id=?" : ""; const values = supplierId ? [organizationId, supplierId] : [organizationId]; return json(res, 200, { items: db.prepare(`SELECT * FROM supplier_import_batches WHERE organization_id=? ${where} ORDER BY imported_at DESC`).all(...values) }); }
  if (req.method === "GET" && pathname === "/api/supplier-import/profiles") { const supplierId = url?.searchParams?.get("supplier_id") || ""; if (!verifySupplier(db, supplierId, organizationId)) return json(res, 404, { error: "当前企业供应商不存在" }); return json(res, 200, { items: profilesFor(db, supplierId, organizationId) }); }
  return json(res, 404, { error: "供应商导入接口不存在" });
}

export const supplierImportFields = IMPORT_FIELDS;
