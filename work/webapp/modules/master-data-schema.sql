-- 配电系统 BOM 工具 V1.1 基础资料结构
-- 运行时由 modules/master-data.mjs 自动初始化；本文件用于审阅和部署备查。
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
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

CREATE TABLE materials (
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

CREATE TABLE products (
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

CREATE TABLE prices (
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

CREATE INDEX idx_products_material ON products(material_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_prices_product ON prices(product_id, updated_at DESC);
CREATE INDEX idx_prices_supplier ON prices(supplier_id, updated_at DESC);
