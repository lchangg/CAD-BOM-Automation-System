import crypto from "node:crypto";

const RULE_COLUMNS = [
  "id", "organization_id", "source_material_id", "source_spec", "target_brand_id",
  "target_product_id", "priority", "enabled", "verified_by_user", "note", "created_at", "updated_at",
];

export function initReplacementRulesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_replacement_rules (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_material_id TEXT NOT NULL REFERENCES materials(id),
      source_spec TEXT NOT NULL,
      target_brand_id TEXT NOT NULL REFERENCES brands(id),
      target_product_id TEXT NOT NULL REFERENCES products(id),
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      verified_by_user INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_replacement_rules_org_lookup
      ON organization_replacement_rules(organization_id, source_material_id, source_spec, enabled, verified_by_user, priority DESC);
    CREATE INDEX IF NOT EXISTS idx_replacement_rules_target_product
      ON organization_replacement_rules(target_product_id);
  `);
}

function clean(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function bool(value, fallback = true) { if (value === undefined || value === null || value === "") return fallback ? 1 : 0; return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0; }
function integer(value, fallback = 0) { const number = Number(value); return Number.isInteger(number) ? number : fallback; }

function enrichRule(db, row, organizationId) {
  if (!row) return null;
  const material = db.prepare("SELECT id, code, name FROM materials WHERE id=?").get(row.source_material_id);
  const brand = db.prepare("SELECT id, name, code FROM brands WHERE id=?").get(row.target_brand_id);
  const product = db.prepare("SELECT id, material_id, brand_id, model, specification, unit FROM products WHERE id=?").get(row.target_product_id);
  const price = db.prepare(`
    SELECT p.id, p.product_id, p.supplier_id, p.unit_price, p.currency, p.valid_from, p.valid_to,
           s.name AS supplier_name
    FROM prices p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.organization_id=?
    WHERE p.product_id=? AND p.organization_id=?
    ORDER BY p.updated_at DESC
    LIMIT 1
  `).get(organizationId, row.target_product_id, organizationId) || null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceMaterialId: row.source_material_id,
    sourceMaterialCode: material?.code || "",
    sourceMaterialName: material?.name || "",
    sourceSpec: row.source_spec,
    targetBrandId: row.target_brand_id,
    targetBrandName: brand?.name || "",
    targetProductId: row.target_product_id,
    targetProductModel: product?.model || "",
    targetProductSpecification: product?.specification || "",
    priority: Number(row.priority || 0),
    enabled: Boolean(row.enabled),
    verifiedByUser: Boolean(row.verified_by_user),
    note: row.note || "",
    price: price ? { id: price.id, supplierId: price.supplier_id, supplierName: price.supplier_name || "", unitPrice: Number(price.unit_price), currency: price.currency || "CNY", validFrom: price.valid_from || "", validTo: price.valid_to || "" } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ruleRow(db, id, organizationId) {
  return db.prepare(`SELECT ${RULE_COLUMNS.join(",")} FROM organization_replacement_rules WHERE id=? AND organization_id=?`).get(id, organizationId);
}

function validateTarget(db, body) {
  const sourceMaterialId = clean(body.source_material_id ?? body.sourceMaterialId);
  const sourceSpec = clean(body.source_spec ?? body.sourceSpec);
  const targetBrandId = clean(body.target_brand_id ?? body.targetBrandId);
  const targetProductId = clean(body.target_product_id ?? body.targetProductId);
  if (!sourceMaterialId || !sourceSpec || !targetBrandId || !targetProductId) throw new Error("材料、规格、目标品牌和目标产品均不能为空");
  const material = db.prepare("SELECT id FROM materials WHERE id=?").get(sourceMaterialId);
  if (!material) throw new Error("来源材料不存在");
  const brand = db.prepare("SELECT id FROM brands WHERE id=?").get(targetBrandId);
  if (!brand) throw new Error("目标品牌不存在");
  const product = db.prepare("SELECT id, material_id, brand_id FROM products WHERE id=?").get(targetProductId);
  if (!product) throw new Error("目标产品不存在");
  if (product.brand_id !== targetBrandId) throw new Error("目标产品不属于所选品牌");
  if (product.material_id && product.material_id !== sourceMaterialId) throw new Error("目标产品不属于来源材料");
  return { sourceMaterialId, sourceSpec, targetBrandId, targetProductId };
}

export async function handleReplacementRulesApi({ req, res, pathname, url, db, json, readBody, organizationId }) {
  if (req.method === "GET" && pathname === "/api/replacement-rules/recommend") {
    const materialId = url?.searchParams?.get("material_id") || "";
    const sourceSpec = url?.searchParams?.get("spec") || "";
    return json(res, 200, { recommendation: recommendationResponse(db, organizationId, materialId, sourceSpec) });
  }
  const match = pathname.match(/^\/api\/replacement-rules(?:\/([^/]+))?$/);
  const id = match?.[1] || "";
  if (!match) return json(res, 404, { error: "匹配规则地址不存在" });
  try {
    if (req.method === "GET" && !id) {
      const rows = db.prepare(`SELECT ${RULE_COLUMNS.join(",")} FROM organization_replacement_rules WHERE organization_id=? ORDER BY priority DESC, updated_at DESC`).all(organizationId);
      return json(res, 200, { items: rows.map(row => enrichRule(db, row, organizationId)) });
    }
    if (req.method === "GET" && id) {
      const row = ruleRow(db, id, organizationId);
      return row ? json(res, 200, enrichRule(db, row, organizationId)) : json(res, 404, { error: "匹配规则不存在" });
    }
    if (req.method === "POST" && !id) {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const target = validateTarget(db, body);
      const now = new Date().toISOString(); const ruleId = crypto.randomUUID();
      db.prepare(`INSERT INTO organization_replacement_rules (${RULE_COLUMNS.join(",")}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(ruleId, organizationId, target.sourceMaterialId, target.sourceSpec, target.targetBrandId, target.targetProductId, integer(body.priority, 0), bool(body.enabled, true), 1, clean(body.note), now, now);
      return json(res, 201, enrichRule(db, ruleRow(db, ruleId, organizationId), organizationId));
    }
    if (req.method === "PUT" && id) {
      const existing = ruleRow(db, id, organizationId); if (!existing) return json(res, 404, { error: "匹配规则不存在" });
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const target = validateTarget(db, { ...existing, ...body }); const now = new Date().toISOString();
      db.prepare(`UPDATE organization_replacement_rules SET source_material_id=?, source_spec=?, target_brand_id=?, target_product_id=?, priority=?, enabled=?, note=?, updated_at=? WHERE id=? AND organization_id=?`).run(target.sourceMaterialId, target.sourceSpec, target.targetBrandId, target.targetProductId, integer(body.priority, existing.priority), bool(body.enabled, Boolean(existing.enabled)), clean(body.note ?? existing.note), now, id, organizationId);
      return json(res, 200, enrichRule(db, ruleRow(db, id, organizationId), organizationId));
    }
    if (req.method === "DELETE" && id) {
      const result = db.prepare("DELETE FROM organization_replacement_rules WHERE id=? AND organization_id=?").run(id, organizationId);
      return result.changes ? json(res, 200, { deleted: id }) : json(res, 404, { error: "匹配规则不存在" });
    }
    return json(res, 405, { error: "不支持的匹配规则操作" });
  } catch (error) {
    if (String(error.message).includes("FOREIGN KEY constraint failed")) return json(res, 400, { error: "公共材料或产品不存在" });
    return json(res, 400, { error: error.message || String(error) });
  }
}

export function findReplacementRecommendation(db, organizationId, sourceMaterialId, sourceSpec) {
  const materialId = clean(sourceMaterialId); const spec = clean(sourceSpec);
  if (!materialId || !spec) return null;
  const row = db.prepare(`SELECT ${RULE_COLUMNS.join(",")} FROM organization_replacement_rules WHERE organization_id=? AND source_material_id=? AND source_spec=? AND enabled=1 AND verified_by_user=1 ORDER BY priority DESC, updated_at DESC LIMIT 1`).get(organizationId, materialId, spec);
  return row ? enrichRule(db, row, organizationId) : null;
}

export function recommendationResponse(db, organizationId, sourceMaterialId, sourceSpec) {
  return findReplacementRecommendation(db, organizationId, sourceMaterialId, sourceSpec);
}
