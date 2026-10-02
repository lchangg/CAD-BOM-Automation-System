-- 配电系统 BOM 工具 V1.1 第三阶段报价结构
CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  material_cost REAL NOT NULL DEFAULT 0,
  labor_fee REAL NOT NULL DEFAULT 0,
  transport_fee REAL NOT NULL DEFAULT 0,
  other_fee REAL NOT NULL DEFAULT 0,
  profit_rate REAL NOT NULL DEFAULT 0,
  profit_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT '草稿',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
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
  unit_price REAL NOT NULL DEFAULT 0,
  material_cost REAL NOT NULL DEFAULT 0,
  price_matched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_quotations_project_updated ON quotations(project_id, updated_at DESC);
CREATE INDEX idx_quotation_items_quote ON quotation_items(quotation_id);
