-- 客户报价 PDF 历史记录结构
CREATE TABLE quotation_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
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

CREATE INDEX idx_quotation_documents_project ON quotation_documents(project_id, created_at DESC);
