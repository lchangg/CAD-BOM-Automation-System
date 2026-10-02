import crypto from "node:crypto";

/**
 * V1.1 基础资料模块。
 * 该模块只负责基础资料表和 CRUD API，不参与 DWG -> BOM 分析流程。
 */
const TABLES = {
  materials: {
    table: "materials",
    columns: ["id", "code", "name", "category", "unit", "description", "active", "created_at", "updated_at"],
    required: ["code", "name"],
    order: "name COLLATE NOCASE ASC",
  },
  brands: {
    table: "brands",
    columns: ["id", "name", "code", "description", "active", "created_at", "updated_at"],
    required: ["name"],
    order: "name COLLATE NOCASE ASC",
  },
  products: {
    table: "products",
    columns: ["id", "material_id", "brand_id", "model", "specification", "unit", "description", "active", "created_at", "updated_at"],
    required: ["model"],
    order: "model COLLATE NOCASE ASC",
  },
  prices: {
    table: "prices",
    columns: ["id", "product_id", "supplier_id", "unit_price", "currency", "valid_from", "valid_to", "note", "created_at", "updated_at"],
    required: ["product_id", "unit_price"],
    order: "updated_at DESC",
  },
  suppliers: {
    table: "suppliers",
    columns: ["id", "name", "code", "contact_name", "phone", "email", "address", "active", "created_at", "updated_at"],
    required: ["name"],
    order: "name COLLATE NOCASE ASC",
  },
};

export const MASTER_DATA_ENTITIES = Object.keys(TABLES);
const PRIVATE_ENTITIES = new Set(["suppliers", "prices"]);
const PUBLIC_ENTITIES = new Set(["brands", "materials", "products"]);

export function initMasterDataSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
      brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
      model TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(brand_id, model)
    );
    CREATE TABLE IF NOT EXISTS prices (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      currency TEXT NOT NULL DEFAULT 'CNY',
      valid_from TEXT,
      valid_to TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_material ON products(material_id);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prices_supplier ON prices(supplier_id, updated_at DESC);
  `);
  db.exec("PRAGMA optimize;");
}

function entityConfig(entity) {
  return TABLES[entity] || null;
}

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value.trim() : value;
}

function normalizeInput(entity, body, existing = {}) {
  const allowed = entityConfig(entity).columns.filter((column) => !["id", "created_at", "updated_at"].includes(column));
  const record = {};
  for (const column of allowed) if (Object.prototype.hasOwnProperty.call(body, column)) record[column] = cleanValue(body[column]);
  if ("active" in record) record.active = record.active === false || record.active === 0 || record.active === "0" ? 0 : 1;
  if (entity === "prices" && "unit_price" in record) {
    const number = Number(record.unit_price);
    if (!Number.isFinite(number) || number < 0) throw new Error("单价必须是大于等于 0 的数字");
    record.unit_price = number;
  }
  for (const key of entityConfig(entity).required) {
    const value = record[key] ?? existing[key];
    if (value === null || value === undefined || String(value).trim() === "") throw new Error(`${key} 不能为空`);
  }
  return record;
}

function serializeRow(row) {
  const result = { ...row };
  if ("active" in result) result.active = Boolean(result.active);
  if ("unit_price" in result && result.unit_price !== null) result.unit_price = Number(result.unit_price);
  return result;
}

function listRecords(db, entity, query = new URLSearchParams(), organizationId) {
  const config = entityConfig(entity);
  const materialId = query.get("material_id");
  const brandId = query.get("brand_id");
  const productId = query.get("product_id");
  if (entity === "brands" && materialId) {
    return db.prepare(`SELECT b.id, b.name, b.code, b.description, b.active, b.created_at, b.updated_at
      FROM brands b WHERE b.active=1 AND EXISTS (SELECT 1 FROM products p WHERE p.brand_id=b.id AND p.material_id=? AND p.active=1)
      ORDER BY b.name COLLATE NOCASE ASC`).all(materialId).map(serializeRow);
  }
  if (entity === "products" && (materialId || brandId)) {
    const clauses = ["active=1"], values = [];
    if (materialId) { clauses.push("material_id=?"); values.push(materialId); }
    if (brandId) { clauses.push("brand_id=?"); values.push(brandId); }
    return db.prepare(`SELECT ${config.columns.join(", ")} FROM products WHERE ${clauses.join(" AND ")} ORDER BY model COLLATE NOCASE ASC`).all(...values).map(serializeRow);
  }
  if (entity === "prices" && productId) {
    return db.prepare(`SELECT ${config.columns.join(", ")} FROM prices WHERE product_id=? AND organization_id=? ORDER BY updated_at DESC`).all(productId, organizationId).map(serializeRow);
  }
  if (PRIVATE_ENTITIES.has(entity)) return db.prepare(`SELECT ${config.columns.join(", ")} FROM ${config.table} WHERE organization_id=? ORDER BY ${config.order}`).all(organizationId).map(serializeRow);
  return db.prepare(`SELECT ${config.columns.join(", ")} FROM ${config.table} ORDER BY ${config.order}`).all().map(serializeRow);
}

function findRecord(db, entity, id, organizationId) {
  const config = entityConfig(entity);
  return PRIVATE_ENTITIES.has(entity)
    ? db.prepare(`SELECT ${config.columns.join(", ")} FROM ${config.table} WHERE id=? AND organization_id=?`).get(id, organizationId)
    : db.prepare(`SELECT ${config.columns.join(", ")} FROM ${config.table} WHERE id=?`).get(id);
}

function insertRecord(db, entity, body, now, organizationId) {
  const config = entityConfig(entity);
  const record = normalizeInput(entity, body);
  const id = crypto.randomUUID();
  const values = { id, ...record, ...(PRIVATE_ENTITIES.has(entity) ? { organization_id: organizationId } : {}), created_at: now, updated_at: now };
  const columns = Object.keys(values);
  db.prepare(`INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => values[column] ?? null));
  return serializeRow(findRecord(db, entity, id, organizationId));
}

function updateRecord(db, entity, id, body, now, organizationId) {
  const config = entityConfig(entity);
  const existing = findRecord(db, entity, id, organizationId);
  if (!existing) return null;
  const record = normalizeInput(entity, body, existing);
  const columns = Object.keys(record);
  if (!columns.length) return serializeRow(existing);
  const where = PRIVATE_ENTITIES.has(entity) ? "WHERE id=? AND organization_id=?" : "WHERE id=?";
  const values = [...columns.map((column) => record[column] ?? null), now, id]; if (PRIVATE_ENTITIES.has(entity)) values.push(organizationId);
  db.prepare(`UPDATE ${config.table} SET ${columns.map((column) => `${column}=?`).join(",")}, updated_at=? ${where}`).run(...values);
  return serializeRow(findRecord(db, entity, id, organizationId));
}

export async function handleMasterDataApi({ req, res, pathname, url, db, json, readBody, organizationId, platformRole = "user" }) {
  const match = pathname.match(/^\/api\/master-data\/([^/]+)(?:\/([^/]+))?$/);
  if (!match || !entityConfig(match[1])) return json(res, 404, { error: "基础资料类型不存在" });
  const entity = match[1];
  const id = match[2];
  try {
    if (PUBLIC_ENTITIES.has(entity) && req.method !== "GET" && platformRole !== "platform_admin") return json(res, 403, { error: "只有平台管理员可以维护公共产品资料" });
    if (req.method === "GET" && !id) return json(res, 200, { entity, items: listRecords(db, entity, url?.searchParams, organizationId) });
    if (req.method === "POST" && !id) {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return json(res, 201, insertRecord(db, entity, body, new Date().toISOString(), organizationId));
    }
    if (req.method === "PUT" && id) {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const updated = updateRecord(db, entity, id, body, new Date().toISOString(), organizationId);
      return updated ? json(res, 200, updated) : json(res, 404, { error: "记录不存在" });
    }
    if (req.method === "DELETE" && id) {
      const where = PRIVATE_ENTITIES.has(entity) ? "WHERE id=? AND organization_id=?" : "WHERE id=?";
      const values = PRIVATE_ENTITIES.has(entity) ? [id, organizationId] : [id];
      const result = db.prepare(`DELETE FROM ${entityConfig(entity).table} ${where}`).run(...values);
      return result.changes ? json(res, 200, { deleted: id }) : json(res, 404, { error: "记录不存在" });
    }
    return json(res, 405, { error: "不支持的操作" });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) return json(res, 409, { error: "已存在相同的唯一值" });
    if (String(error.message).includes("FOREIGN KEY constraint failed")) return json(res, 400, { error: "关联记录不存在或无法删除" });
    return json(res, 400, { error: error.message || String(error) });
  }
}
