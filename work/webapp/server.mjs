import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import crypto, { scryptSync, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { initMasterDataSchema, handleMasterDataApi } from "./modules/master-data.mjs";
import { handleMasterDataImportApi } from "./modules/master-data-import.mjs";
import { initQuotationSchema, handleQuotationApi } from "./modules/quotation.mjs";
import { initQuotationPdfSchema, handleQuotationPdfApi, quotationPdfDocument, listQuotationPdfHistory } from "./modules/quotation-pdf.mjs";
import { initOrganizationSchema, migrateExistingRows, migratePlatformAdmin, currentOrganization } from "./modules/organization.mjs";
import { initReplacementRulesSchema, handleReplacementRulesApi } from "./modules/replacement-rules.mjs";
import { initSupplierImportSchema, handleSupplierImportApi } from "./modules/supplier-import.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const envFile = path.join(HERE, ".env");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) { const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); }
const PUBLIC = path.join(HERE, "public");
const DATA = path.join(HERE, "data");
const PROJECTS = path.join(DATA, "projects");
const ORGANIZATIONS = path.join(DATA, "organizations");
const DB_PATH = process.env.BOM_DB_PATH || path.join(DATA, "bom.sqlite");
const WORK = path.join(ROOT, "work");
const OUT = path.join(ROOT, "outputs");
const PORT = Number(process.env.PORT || 4318);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_SECRET = (process.env.SESSION_SECRET || "").trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be set in .env or the process environment; no default value is provided.");
if (IS_PRODUCTION && (!SESSION_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD)) throw new Error("生产环境必须设置 SESSION_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD");

await fs.mkdir(PROJECTS, { recursive: true });
await fs.mkdir(ORGANIZATIONS, { recursive: true });
await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, platform_role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, current_organization_id TEXT);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, status TEXT NOT NULL, source_filename TEXT, source_size INTEGER, bom_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);
initMasterDataSchema(db);
initQuotationSchema(db);
initQuotationPdfSchema(db);
initOrganizationSchema(db);
initReplacementRulesSchema(db);
initSupplierImportSchema(db);
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) { return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; }
function passwordMatches(password, stored) { const [salt, digest] = String(stored).split(":"); if (!salt || !digest) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(digest, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
if (Number(userCount) === 0 && ADMIN_EMAIL && ADMIN_PASSWORD) { const now = new Date().toISOString(); db.prepare("INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)").run(crypto.randomUUID(), ADMIN_EMAIL, passwordHash(ADMIN_PASSWORD), now); }
migrateExistingRows(db);
migratePlatformAdmin(db, ADMIN_EMAIL);

const json = (res, status, value) => { const body = JSON.stringify(value); res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) }); res.end(body); };
const readBody = async (req) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); };
const safeId = (id) => /^[a-f0-9-]{8,64}$/.test(id);
function projectDir(id, organizationId = null) {
  const organizationPath = organizationId ? path.join(ORGANIZATIONS, organizationId, "projects", id) : "";
  // New projects use the organization path. Existing V1.1 projects remain in
  // data/projects until they are explicitly moved, so historical files stay readable.
  if (organizationPath && existsSync(organizationPath)) return organizationPath;
  return path.join(PROJECTS, id);
}
async function createProjectDir(id, organizationId) { const target = path.join(ORGANIZATIONS, organizationId, "projects", id); await fs.mkdir(target, { recursive: true }); return target; }
const nowIso = () => new Date().toISOString();
function cookieOptions() { return `HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${IS_PRODUCTION ? "; Secure" : ""}`; }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim().split("=")).filter(x => x.length === 2).map(([k, v]) => [k, decodeURIComponent(v)])); }
function sessionKey(raw) { return crypto.createHmac("sha256", SESSION_SECRET).update(raw).digest("hex"); }
function currentUser(req) { const sid = cookies(req).sid; if (!sid) return null; return db.prepare("SELECT users.id, users.email, users.platform_role, sessions.current_organization_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires_at>? AND users.active=1").get(sessionKey(sid), nowIso()) || null; }
function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: "请先登录" }); return null; } return user; }
function projectFromRow(row) { return { id: row.id, name: row.name, status: row.status, organizationId: row.organization_id, createdAt: row.created_at, updatedAt: row.updated_at, source: row.source_filename ? { filename: row.source_filename, size: row.source_size } : null, bom: row.bom_json ? JSON.parse(row.bom_json) : null }; }
function getProject(id, _userId, organizationId) { const row = db.prepare("SELECT * FROM projects WHERE id=? AND organization_id=?").get(id, organizationId); return row ? projectFromRow(row) : null; }
function saveProject(project, _userId, organizationId) { db.prepare("UPDATE projects SET name=?,status=?,source_filename=?,source_size=?,bom_json=?,updated_at=? WHERE id=? AND organization_id=?").run(project.name, project.status, project.source?.filename || null, project.source?.size || null, project.bom ? JSON.stringify(project.bom) : null, nowIso(), project.id, organizationId); }
function run(command, args, options = {}) { return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }, ...options }); const stdout = [], stderr = []; child.stdout?.on("data", d => stdout.push(d)); child.stderr?.on("data", d => stderr.push(d)); child.on("error", reject); child.on("close", code => resolve({ code: code ?? -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") })); }); }

// Keep this pipeline identical to the validated implementation. Productization only wraps it.
async function analyseProject(id, filename, organizationId) {
  const input = path.join(projectDir(id, organizationId), filename); const dxf = path.join(WORK, "input.dxf"); const dwg2dxf = path.join(WORK, "libredwg", "dwg2dxf.exe");
  const conversion = await run(dwg2dxf, ["-y", "-o", dxf, input]); if (conversion.code !== 0 || !existsSync(dxf)) throw new Error(`DWG 转换失败：${conversion.stderr || conversion.stdout}`);
  const python = path.join(WORK, ".venv", "Scripts", "python.exe"); const report = await run(python, [path.join(WORK, "report_current_parse.py")]); if (report.code !== 0) throw new Error(`文字解析失败：${report.stderr || report.stdout}`); await fs.writeFile(path.join(WORK, "report.json"), report.stdout, "utf8");
  for (const script of ["single_cabinet_validation.py", "classify_device_candidates.py"]) { const result = await run(python, [path.join(WORK, script)]); if (result.code !== 0) throw new Error(`${script} 执行失败：${result.stderr || result.stdout}`); }
  const bomBuild = await run("node", [path.join(WORK, "build_dwg_bom.mjs")]); if (bomBuild.code !== 0) throw new Error(`BOM 生成失败：${bomBuild.stderr || bomBuild.stdout}`);
  const bom = JSON.parse(await fs.readFile(path.join(OUT, "dwg_bom.json"), "utf8")); const rows = [];
  for (const cabinet of bom.项目?.[0]?.柜体 ?? []) for (const item of cabinet.BOM ?? []) rows.push({ id: crypto.randomUUID(), cabinet: cabinet.柜名称, category: item.类别 ?? "", spec: item.规格 ?? "", quantity: Number(item.数量 ?? 0), status: "AI识别", rawTexts: item.原始文字列表 ?? [], coords: item.来源坐标列表 ?? [], rules: item.识别规则 ?? [], note: "" });
  return { ...bom, rows, analysis: { conversionLog: `${conversion.stdout}${conversion.stderr}`, textCount: JSON.parse(report.stdout).all_text_count, analysedAt: nowIso() } };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); const pathname = decodeURIComponent(url.pathname);
  try {
    if (req.method === "GET" && pathname === "/api/auth/status") { const user = currentUser(req); const organization = user ? currentOrganization(db, user.id, user.current_organization_id) : null; return json(res, 200, { authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, platformRole: user.platform_role || "user" } : null, organization: organization ? { id: organization.id, name: organization.name, role: organization.role } : null }); }
    if (req.method === "POST" && pathname === "/api/auth/login") { const body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const email = String(body.email || "").trim().toLowerCase(); const row = db.prepare("SELECT * FROM users WHERE email=? AND active=1").get(email); if (!row || !passwordMatches(String(body.password || ""), row.password_hash)) return json(res, 401, { error: "邮箱或密码不正确" }); const sid = crypto.randomUUID(); db.prepare("INSERT INTO sessions (id,user_id,expires_at,created_at,current_organization_id) VALUES (?,?,?,?,NULL)").run(sessionKey(sid), row.id, new Date(Date.now() + 7 * 86400000).toISOString(), nowIso()); res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; ${cookieOptions()}`); return json(res, 200, { authenticated: true, user: { id: row.id, email: row.email, platformRole: row.platform_role || "user" } }); }
    if (req.method === "POST" && pathname === "/api/auth/logout") { const sid = cookies(req).sid; if (sid) db.prepare("DELETE FROM sessions WHERE id=?").run(sessionKey(sid)); res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0"); return json(res, 200, { authenticated: false }); }
    if (req.method === "GET" && !pathname.startsWith("/api/")) { const filePath = pathname === "/" ? path.join(PUBLIC, "index.html") : path.join(PUBLIC, pathname.replace(/^\//, "")); if (!filePath.startsWith(PUBLIC)) return json(res, 404, { error: "Not found" }); try { const data = await fs.readFile(filePath); const ext = path.extname(filePath); const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }; res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" }); return res.end(data); } catch { return json(res, 404, { error: "Not found" }); } }
    const user = requireUser(req, res); if (!user) return;
    const organization = currentOrganization(db, user.id, user.current_organization_id); if (!organization) return json(res, 403, { error: "当前用户未加入任何企业" });
    const organizationId = organization.id;
    const platformRole = user.platform_role || "user";
    if (pathname.startsWith("/api/master-data/import/")) return handleMasterDataImportApi({ req, res, pathname, db, json, readBody, organizationId, platformRole, templatePath: path.join(DATA, "master-data-import-template.xlsx") });
    if (pathname.startsWith("/api/master-data/")) return handleMasterDataApi({ req, res, pathname, url, db, json, readBody, organizationId, platformRole });
    if (pathname === "/api/replacement-rules" || pathname.startsWith("/api/replacement-rules/")) return handleReplacementRulesApi({ req, res, pathname, url, db, json, readBody, organizationId });
    if (pathname === "/api/supplier-import/upload" || pathname === "/api/supplier-import/preview" || pathname === "/api/supplier-import/confirm" || pathname === "/api/supplier-import/batches" || pathname === "/api/supplier-import/profiles") return handleSupplierImportApi({ req, res, pathname, url, db, json, readBody, organizationId, user });
    if (pathname.match(/^\/api\/projects\/[^/]+\/quotation$/)) return handleQuotationApi({ req, res, pathname, db, json, readBody, user, organizationId });
    if (pathname.match(/^\/api\/projects\/[^/]+\/quotation\/pdf(?:-history)?$/)) return handleQuotationPdfApi({ req, res, pathname, db, json, readBody, user, organizationId, run, pythonPath: path.join(WORK, ".venv", "Scripts", "python.exe"), scriptPath: path.join(HERE, "generate_quotation_pdf.py"), projectRoot: HERE, projectDirectory: projectDir });
    const quotationPdfFileMatch = pathname.match(/^\/api\/projects\/([^/]+)\/quotation\/pdf\/([^/]+)$/);
    if (quotationPdfFileMatch && safeId(quotationPdfFileMatch[1]) && safeId(quotationPdfFileMatch[2]) && req.method === "GET") {
      const document = quotationPdfDocument(db, quotationPdfFileMatch[1], user.id, organizationId, quotationPdfFileMatch[2]);
      if (!document) return json(res, 404, { error: "报价 PDF 不存在" });
      const baseDir = projectDir(quotationPdfFileMatch[1], organizationId);
      const filePath = path.resolve(baseDir, document.relativePath);
      if (!filePath.startsWith(path.resolve(baseDir + path.sep))) return json(res, 400, { error: "文件路径无效" });
      const data = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": "application/pdf", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}` });
      return res.end(data);
    }
    if (req.method === "GET" && pathname === "/api/projects") { const rows = db.prepare("SELECT * FROM projects WHERE organization_id=? ORDER BY updated_at DESC").all(organizationId); return json(res, 200, rows.map(projectFromRow)); }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/); const dwgMatch = pathname.match(/^\/api\/projects\/([^/]+)\/dwg$/); const bomMatch = pathname.match(/^\/api\/projects\/([^/]+)\/bom$/); const exportMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export$/); const fileMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export\/file$/);
    if (req.method === "POST" && pathname === "/api/projects") { const input = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const id = crypto.randomUUID(); const now = nowIso(); const project = { id, name: String(input.name || "未命名项目").trim() || "未命名项目", status: "待上传", organizationId, createdAt: now, updatedAt: now, source: null, bom: null }; await createProjectDir(id, organizationId); db.prepare("INSERT INTO projects (id,user_id,organization_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id, user.id, organizationId, project.name, project.status, now, now); return json(res, 201, project); }
    if (projectMatch && safeId(projectMatch[1]) && req.method === "GET") { const project = getProject(projectMatch[1], user.id, organizationId); return project ? json(res, 200, project) : json(res, 404, { error: "项目不存在" }); }
    if (dwgMatch && safeId(dwgMatch[1]) && req.method === "POST") { const id = dwgMatch[1]; const project = getProject(id, user.id, organizationId); if (!project) return json(res, 404, { error: "项目不存在" }); const body = await readBody(req); const filename = path.basename(decodeURIComponent(req.headers["x-file-name"] || "input.dwg")); if (!filename.toLowerCase().endsWith(".dwg")) return json(res, 400, { error: "只接受 .dwg 文件" }); const baseDir = projectDir(id, organizationId); await fs.mkdir(baseDir, { recursive: true }); await fs.writeFile(path.join(baseDir, filename), body); project.status = "已分析"; project.source = { filename, size: body.length }; project.bom = await analyseProject(id, filename, organizationId); saveProject(project, user.id, organizationId); return json(res, 200, project); }
    if (bomMatch && safeId(bomMatch[1]) && req.method === "PUT") { const project = getProject(bomMatch[1], user.id, organizationId); if (!project) return json(res, 404, { error: "项目不存在" }); const payload = JSON.parse((await readBody(req)).toString("utf8") || "{}"); project.bom = { ...(project.bom || {}), rows: Array.isArray(payload.rows) ? payload.rows : [] }; saveProject(project, user.id, organizationId); return json(res, 200, project); }
    if (exportMatch && safeId(exportMatch[1]) && req.method === "POST") { const project = getProject(exportMatch[1], user.id, organizationId); if (!project) return json(res, 404, { error: "项目不存在" }); const payload = JSON.parse((await readBody(req)).toString("utf8") || "{}"); const baseDir = projectDir(project.id, organizationId); const temp = path.join(baseDir, "export.json"); const output = path.join(baseDir, "bom.xlsx"); await fs.writeFile(temp, JSON.stringify({ project: project.name, rows: payload.rows || project.bom?.rows || [] }, null, 2), "utf8"); const result = await run("node", [path.join(HERE, "export_xlsx.mjs"), temp, output]); if (result.code !== 0) throw new Error(result.stderr || result.stdout); return json(res, 200, { url: `/api/projects/${project.id}/export/file`, filename: `${project.name}-BOM.xlsx` }); }
    if (fileMatch && safeId(fileMatch[1]) && req.method === "GET") { const project = getProject(fileMatch[1], user.id, organizationId); if (!project) return json(res, 404, { error: "项目不存在" }); const data = await fs.readFile(path.join(projectDir(project.id, organizationId), "bom.xlsx")); res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename*=UTF-8''bom.xlsx" }); return res.end(data); }
    return json(res, 404, { error: "Not found" });
  } catch (error) { console.error(error); return json(res, 500, { error: error.message || String(error) }); }
}
http.createServer(handle).listen(PORT, "127.0.0.1", () => console.log(`配电系统 BOM 工具已启动：http://127.0.0.1:${PORT}`));
