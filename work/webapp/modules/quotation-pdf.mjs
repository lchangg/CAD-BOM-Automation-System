import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

export function initQuotationPdfSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      organization_id TEXT,
      customer_name TEXT,
      customer_contact TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      notes TEXT,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_documents_project ON quotation_documents(project_id, created_at DESC);
  `);
  db.exec("PRAGMA optimize;");
}

function projectForUser(db, projectId, _userId, organizationId) {
  return db.prepare("SELECT id, name, user_id, organization_id FROM projects WHERE id=? AND organization_id=?").get(projectId, organizationId);
}

function documentView(row) {
  return { id: row.id, projectId: row.project_id, quotationId: row.quotation_id, customerName: row.customer_name || "", customerContact: row.customer_contact || "", customerPhone: row.customer_phone || "", customerAddress: row.customer_address || "", notes: row.notes || "", filename: row.filename, createdAt: row.created_at, downloadUrl: `/api/projects/${row.project_id}/quotation/pdf/${row.id}` };
}

export function listQuotationPdfHistory(db, projectId, userId, organizationId) {
  const project = projectForUser(db, projectId, userId, organizationId);
  if (!project) return null;
  return db.prepare("SELECT * FROM quotation_documents WHERE project_id=? AND organization_id=? ORDER BY created_at DESC").all(projectId, organizationId).map(documentView);
}

export function quotationPdfDocument(db, projectId, userId, organizationId, documentId) {
  const project = projectForUser(db, projectId, userId, organizationId);
  if (!project) return null;
  const row = db.prepare("SELECT * FROM quotation_documents WHERE id=? AND project_id=? AND organization_id=?").get(documentId, projectId, organizationId);
  return row ? { ...documentView(row), relativePath: row.relative_path } : null;
}

async function quotationSnapshot(db, projectId, userId, organizationId) {
  const project = projectForUser(db, projectId, userId, organizationId);
  if (!project) return null;
  const quotation = db.prepare("SELECT * FROM quotations WHERE project_id=? AND organization_id=?").get(projectId, organizationId);
  if (!quotation) throw new Error("请先打开报价计算并保存报价");
  const items = db.prepare("SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY rowid ASC").all(quotation.id).map(item => ({ cabinet: item.cabinet || "", category: item.category || "", spec: item.spec || "", quantity: Number(item.quantity || 0), brandName: item.brand_name || "", productModel: item.product_model || "", unitPrice: Number(item.unit_price || 0), materialCost: Number(item.material_cost || 0), priceMatched: Boolean(item.price_matched) }));
  return { project: { id: project.id, name: project.name }, quotation: { id: quotation.id, materialCost: Number(quotation.material_cost), laborFee: Number(quotation.labor_fee), transportFee: Number(quotation.transport_fee), otherFee: Number(quotation.other_fee), profitRate: Number(quotation.profit_rate), profitAmount: Number(quotation.profit_amount), totalAmount: Number(quotation.total_amount), currency: quotation.currency, status: quotation.status }, items };
}

export async function handleQuotationPdfApi({ req, res, pathname, db, json, readBody, user, organizationId, run, pythonPath, scriptPath, projectRoot, projectDirectory }) {
  const historyMatch = pathname.match(/^\/api\/projects\/([^/]+)\/quotation\/pdf-history$/);
  const generateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/quotation\/pdf$/);
  if (!historyMatch && !generateMatch) return json(res, 404, { error: "报价 PDF 地址不存在" });
  const projectId = (historyMatch || generateMatch)[1];
  const project = projectForUser(db, projectId, user.id, organizationId);
  if (!project) return json(res, 404, { error: "项目不存在" });
  if (req.method === "GET" && historyMatch) return json(res, 200, { items: listQuotationPdfHistory(db, projectId, user.id, organizationId) });
  if (req.method !== "POST" || !generateMatch) return json(res, 405, { error: "不支持的 PDF 操作" });
  try {
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const snapshot = await quotationSnapshot(db, projectId, user.id, organizationId);
    const customer = { name: String(body.customerName || "").trim(), contact: String(body.customerContact || "").trim(), phone: String(body.customerPhone || "").trim(), address: String(body.customerAddress || "").trim(), notes: String(body.notes || "").trim() };
    const id = crypto.randomUUID();
    const relativePath = path.join("quotations", `${id}.pdf`);
    const absoluteDir = projectDirectory ? path.join(projectDirectory(projectId, organizationId), "quotations") : path.join(projectRoot, "data", "projects", projectId, "quotations");
    const absolutePath = path.join(absoluteDir, `${id}.pdf`);
    await fs.mkdir(absoluteDir, { recursive: true });
    const inputPath = path.join(absoluteDir, `${id}.json`);
    await fs.writeFile(inputPath, JSON.stringify({ ...snapshot, customer }, null, 2), "utf8");
    const result = await run(pythonPath, [scriptPath, inputPath, absolutePath]);
    await fs.rm(inputPath, { force: true });
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "PDF 生成失败");
    const filename = `${project.name}-客户报价-${new Date().toISOString().slice(0, 10)}.pdf`;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO quotation_documents (id, project_id, quotation_id, organization_id, customer_name, customer_contact, customer_phone, customer_address, notes, filename, relative_path, snapshot_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, projectId, snapshot.quotation.id, organizationId, customer.name, customer.contact, customer.phone, customer.address, customer.notes, filename, relativePath, JSON.stringify({ ...snapshot, customer }), now);
    return json(res, 201, { document: { id, projectId, quotationId: snapshot.quotation.id, ...customer, filename, createdAt: now, downloadUrl: `/api/projects/${projectId}/quotation/pdf/${id}` } });
  } catch (error) {
    return json(res, 400, { error: error.message || String(error) });
  }
}
