-- V1.2-4 供应商原始文件导入相关表；运行时由 supplier-import.mjs 幂等初始化。
CREATE TABLE supplier_import_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL,
  sheet_name TEXT,
  header_row INTEGER NOT NULL,
  mapping_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, supplier_id, profile_name)
);

CREATE TABLE supplier_product_aliases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  supplier_product_text TEXT,
  brand_text TEXT,
  model_text TEXT,
  spec_text TEXT,
  product_id TEXT NOT NULL REFERENCES products(id),
  confirmed_by_user INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE supplier_import_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  profile_id TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  confirmed_by_user TEXT NOT NULL
);
