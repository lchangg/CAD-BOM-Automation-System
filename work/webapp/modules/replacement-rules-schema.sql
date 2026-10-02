-- V1.2-3 企业私有默认匹配规则；运行时由 replacement-rules.mjs 幂等初始化。
CREATE TABLE organization_replacement_rules (
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

CREATE INDEX idx_replacement_rules_org_lookup
  ON organization_replacement_rules(organization_id, source_material_id, source_spec, enabled, verified_by_user, priority DESC);
CREATE INDEX idx_replacement_rules_target_product
  ON organization_replacement_rules(target_product_id);
