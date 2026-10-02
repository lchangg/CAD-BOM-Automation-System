import crypto from "node:crypto";

/**
 * V1.2 tenant foundation.
 * The migration is additive and idempotent: old V1.1 rows are retained and
 * assigned to one default organization. Public catalog tables are deliberately
 * not included in PRIVATE_TABLES.
 */
export const PRIVATE_TABLES = ["suppliers", "prices", "projects", "quotations", "quotation_items", "quotation_documents"];

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function hasColumn(db, table, column) {
  return tableExists(db, table) && db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function ensureColumn(db, table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (tableExists(db, table) && !hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export function initOrganizationSchema(db) {
  ensureColumn(db, "users", "platform_role TEXT NOT NULL DEFAULT 'user'");
  ensureColumn(db, "sessions", "current_organization_id TEXT");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id, role);
  `);

  // Tables created by V1.1 may already contain rows. ADD COLUMN is safe for
  // existing SQLite databases and does not rewrite or delete their data.
  for (const table of PRIVATE_TABLES) ensureColumn(db, table, "organization_id TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suppliers_organization ON suppliers(organization_id, name);
    CREATE INDEX IF NOT EXISTS idx_prices_organization ON prices(organization_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotations_organization ON quotations(organization_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotation_items_organization ON quotation_items(organization_id, quotation_id);
    CREATE INDEX IF NOT EXISTS idx_quotation_documents_organization ON quotation_documents(organization_id, created_at DESC);
  `);
  migrateExistingRows(db);
}

export function migrateExistingRows(db) {
  const now = new Date().toISOString();
  let organization = db.prepare("SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1").get();
  if (!organization) {
    organization = { id: crypto.randomUUID(), name: "默认企业", status: "active", created_at: now, updated_at: now };
    db.prepare("INSERT INTO organizations (id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)").run(organization.id, organization.name, organization.status, organization.created_at, organization.updated_at);
  }

  // Every existing user is placed in the default organization. Existing rows
  // are then assigned to it only when organization_id was previously absent.
  const users = db.prepare("SELECT id FROM users").all();
  const addMember = db.prepare("INSERT OR IGNORE INTO organization_members (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)");
  for (const user of users) {
    const membership = db.prepare("SELECT 1 FROM organization_members WHERE user_id=? LIMIT 1").get(user.id);
    if (!membership) addMember.run(crypto.randomUUID(), organization.id, user.id, "owner", now);
  }
  for (const table of ["suppliers", "prices", "projects", "quotations", "quotation_items", "quotation_documents"]) {
    if (!tableExists(db, table) || !hasColumn(db, table, "organization_id")) continue;
    if (table === "quotation_items") {
      db.prepare("UPDATE quotation_items SET organization_id=(SELECT organization_id FROM quotations WHERE quotations.id=quotation_items.quotation_id) WHERE organization_id IS NULL").run();
    } else if (table === "quotation_documents") {
      db.prepare("UPDATE quotation_documents SET organization_id=(SELECT organization_id FROM quotations WHERE quotations.id=quotation_documents.quotation_id) WHERE organization_id IS NULL").run();
    }
    db.prepare(`UPDATE ${table} SET organization_id=? WHERE organization_id IS NULL`).run(organization.id);
  }
  return organization;
}

export function migratePlatformAdmin(db, adminEmail) {
  if (!adminEmail) return;
  db.prepare("UPDATE users SET platform_role='platform_admin' WHERE lower(email)=lower(?)").run(adminEmail);
}

export function currentOrganization(db, userId, preferredOrganizationId = null) {
  if (preferredOrganizationId) {
    const selected = db.prepare(`
      SELECT o.id, o.name, o.status, o.created_at, o.updated_at, om.role
      FROM organization_members om JOIN organizations o ON o.id=om.organization_id
      WHERE om.user_id=? AND om.organization_id=? AND o.status='active'
    `).get(userId, preferredOrganizationId);
    if (selected) return selected;
  }
  return db.prepare(`
    SELECT o.id, o.name, o.status, o.created_at, o.updated_at, om.role
    FROM organization_members om JOIN organizations o ON o.id=om.organization_id
    WHERE om.user_id=? AND o.status='active'
    ORDER BY om.created_at ASC
    LIMIT 1
  `).get(userId) || null;
}

export function userCanAccessOrganization(db, userId, organizationId) {
  if (!organizationId) return false;
  return Boolean(db.prepare(`SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id WHERE om.user_id=? AND om.organization_id=? AND o.status='active'`).get(userId, organizationId));
}
