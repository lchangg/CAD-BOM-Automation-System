import crypto from "node:crypto";

/**
 * V1.1 第三阶段报价模块。
 * 报价只读取项目中已经生成并人工审核的 BOM 行，不参与 CAD 解析或 BOM 识别。
 */
export function initQuotationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      organization_id TEXT,
      material_cost REAL NOT NULL DEFAULT 0 CHECK(material_cost >= 0),
      labor_fee REAL NOT NULL DEFAULT 0 CHECK(labor_fee >= 0),
      transport_fee REAL NOT NULL DEFAULT 0 CHECK(transport_fee >= 0),
      other_fee REAL NOT NULL DEFAULT 0 CHECK(other_fee >= 0),
      profit_rate REAL NOT NULL DEFAULT 0 CHECK(profit_rate >= 0),
      profit_amount REAL NOT NULL DEFAULT 0 CHECK(profit_amount >= 0),
      total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT '草稿',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotation_items (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      organization_id TEXT,
      bom_row_id TEXT,
      cabinet TEXT,
      category TEXT,
      spec TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      material_id TEXT,
      brand_id TEXT,
      product_id TEXT,
      price_id TEXT,
      brand_name TEXT,
      product_model TEXT,
      unit_price REAL NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
      material_cost REAL NOT NULL DEFAULT 0 CHECK(material_cost >= 0),
      price_matched INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quotations_project_updated ON quotations(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON quotation_items(quotation_id);
  `);
  db.exec("PRAGMA optimize;");
}

function money(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error("费用必须是大于等于 0 的数字");
  return Math.round(number * 100) / 100;
}

function rate(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > 1000) throw new Error("利润率必须在 0 到 1000 之间");
  return Math.round(number * 100) / 100;
}

function rowUnitPrice(db, row, organizationId) {
  let value = row.price_value ?? row.unit_price;
  if ((value === undefined || value === null || value === "") && row.price_id) value = db.prepare("SELECT unit_price FROM prices WHERE id=? AND organization_id=?").get(row.price_id, organizationId)?.unit_price;
  value ??= 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function buildItems(db, rows, organizationId) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const quantity = Number(row.quantity ?? 0);
    const safeQuantity = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
    const unitPrice = rowUnitPrice(db, row, organizationId);
    return {
      id: crypto.randomUUID(),
      bomRowId: row.id || null,
      cabinet: row.cabinet || "",
      category: row.category || "",
      spec: row.spec || "",
      quantity: safeQuantity,
      materialId: row.material_id || null,
      brandId: row.brand_id || null,
      productId: row.product_id || null,
      priceId: row.price_id || null,
      brandName: row.brand_name || "",
      productModel: row.product_model || "",
      unitPrice,
      materialCost: Math.round(safeQuantity * unitPrice * 100) / 100,
      priceMatched: Boolean(row.price_id || (row.price_value !== undefined && row.price_value !== null && row.price_value !== "")),
    };
  });
}

function projectRow(db, projectId, _userId, organizationId) {
  return db.prepare("SELECT id, name, user_id, organization_id, bom_json FROM projects WHERE id=? AND organization_id=?").get(projectId, organizationId);
}

function quotationResponse(db, quotation, organizationId) {
  if (!quotation) return null;
  const items = db.prepare("SELECT * FROM quotation_items WHERE quotation_id=? AND organization_id=? ORDER BY rowid ASC").all(quotation.id, organizationId).map((item) => ({
    id: item.id,
    bomRowId: item.bom_row_id,
    cabinet: item.cabinet,
    category: item.category,
    spec: item.spec,
    quantity: Number(item.quantity),
    materialId: item.material_id,
    brandId: item.brand_id,
    productId: item.product_id,
    priceId: item.price_id,
    brandName: item.brand_name,
    productModel: item.product_model,
    unitPrice: Number(item.unit_price),
    materialCost: Number(item.material_cost),
    priceMatched: Boolean(item.price_matched),
  }));
  return {
    id: quotation.id,
    projectId: quotation.project_id,
    materialCost: Number(quotation.material_cost),
    laborFee: Number(quotation.labor_fee),
    transportFee: Number(quotation.transport_fee),
    otherFee: Number(quotation.other_fee),
    profitRate: Number(quotation.profit_rate),
    profitAmount: Number(quotation.profit_amount),
    totalAmount: Number(quotation.total_amount),
    currency: quotation.currency,
    status: quotation.status,
    createdAt: quotation.created_at,
    updatedAt: quotation.updated_at,
    items,
  };
}

function saveQuotation(db, project, body, organizationId) {
  const inputRows = Array.isArray(body.rows) ? body.rows : (project.bom_json ? JSON.parse(project.bom_json).rows || [] : []);
  const items = buildItems(db, inputRows, organizationId);
  const materialCost = Math.round(items.reduce((sum, item) => sum + item.materialCost, 0) * 100) / 100;
  const laborFee = money(body.laborFee);
  const transportFee = money(body.transportFee);
  const otherFee = money(body.otherFee);
  const profitRate = rate(body.profitRate);
  const baseCost = Math.round((materialCost + laborFee + transportFee + otherFee) * 100) / 100;
  const profitAmount = Math.round(baseCost * profitRate / 100 * 100) / 100;
  const totalAmount = Math.round((baseCost + profitAmount) * 100) / 100;
  const now = new Date().toISOString();
  const current = db.prepare("SELECT id FROM quotations WHERE project_id=? AND organization_id=?").get(project.id, organizationId);
  const quotationId = current?.id || crypto.randomUUID();
  db.exec("BEGIN");
  try {
    if (current) {
      db.prepare(`UPDATE quotations SET material_cost=?, labor_fee=?, transport_fee=?, other_fee=?, profit_rate=?, profit_amount=?, total_amount=?, updated_at=? WHERE id=?`).run(materialCost, laborFee, transportFee, otherFee, profitRate, profitAmount, totalAmount, now, quotationId);
      db.prepare("DELETE FROM quotation_items WHERE quotation_id=?").run(quotationId);
    } else {
      db.prepare(`INSERT INTO quotations (id, project_id, organization_id, material_cost, labor_fee, transport_fee, other_fee, profit_rate, profit_amount, total_amount, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(quotationId, project.id, organizationId, materialCost, laborFee, transportFee, otherFee, profitRate, profitAmount, totalAmount, now, now);
    }
    const insert = db.prepare(`INSERT INTO quotation_items (id, quotation_id, organization_id, bom_row_id, cabinet, category, spec, quantity, material_id, brand_id, product_id, price_id, brand_name, product_model, unit_price, material_cost, price_matched, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of items) insert.run(item.id, quotationId, organizationId, item.bomRowId, item.cabinet, item.category, item.spec, item.quantity, item.materialId, item.brandId, item.productId, item.priceId, item.brandName, item.productModel, item.unitPrice, item.materialCost, item.priceMatched ? 1 : 0, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return quotationResponse(db, db.prepare("SELECT * FROM quotations WHERE id=? AND organization_id=?").get(quotationId, organizationId), organizationId);
}

export async function handleQuotationApi({ req, res, pathname, db, json, readBody, user, organizationId }) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/quotation$/);
  if (!match) return json(res, 404, { error: "报价地址不存在" });
  const project = projectRow(db, match[1], user.id, organizationId);
  if (!project) return json(res, 404, { error: "项目不存在" });
  try {
    if (req.method === "GET") {
      const quotation = db.prepare("SELECT * FROM quotations WHERE project_id=? AND organization_id=?").get(project.id, organizationId);
      return json(res, 200, { project: { id: project.id, name: project.name }, quotation: quotationResponse(db, quotation, organizationId) });
    }
    if (req.method === "PUT") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return json(res, 200, { project: { id: project.id, name: project.name }, quotation: saveQuotation(db, project, body, organizationId) });
    }
    return json(res, 405, { error: "不支持的报价操作" });
  } catch (error) {
    return json(res, 400, { error: error.message || String(error) });
  }
}
