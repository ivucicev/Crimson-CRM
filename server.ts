import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "data", "crimson.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
const SESSION_COOKIE = "crm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Nodemailer Transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!host || !user || !pass) {
      console.warn("Email configuration missing. Emails will not be sent.");
      return null;
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    default_tenant_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tenant_memberships (
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tenant_invites (
    token_hash TEXT PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tenant_id INTEGER,
    name TEXT NOT NULL,
    website TEXT,
    oib TEXT,
    mbs TEXT,
    registry_source TEXT,
    city TEXT,
    county TEXT,
    address TEXT,
    court TEXT,
    legal_form TEXT,
    primary_nkd_code TEXT,
    primary_nkd_name TEXT,
    registry_emails TEXT,
    registry_raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tenant_id INTEGER,
    name TEXT NOT NULL,
    company_id INTEGER,
    company TEXT,
    email TEXT,
    status TEXT DEFAULT 'New',
    title TEXT,
    bio TEXT,
    website TEXT,
    linkedin_url TEXT,
    enriched_at DATETIME,
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    type TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    task TEXT NOT NULL,
    due_at DATETIME NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tenant_id INTEGER,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tenant_id INTEGER,
    label TEXT NOT NULL,
    UNIQUE (user_id, label)
  );

  CREATE TABLE IF NOT EXISTS lead_custom_values (
    lead_id INTEGER,
    field_id INTEGER,
    value TEXT,
    PRIMARY KEY (lead_id, field_id),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    user_email TEXT,
    action TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    linkedin_url TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registry_hr_companies (
    mbs TEXT PRIMARY KEY,
    name TEXT,
    oib TEXT,
    court TEXT,
    status TEXT,
    city TEXT,
    county TEXT,
    address TEXT,
    website TEXT,
    raw_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registry_hr_nkds (
    code TEXT PRIMARY KEY,
    name TEXT,
    raw_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registry_hr_company_nkds (
    mbs TEXT NOT NULL,
    nkd_code TEXT NOT NULL,
    nkd_name TEXT,
    relation_type TEXT,
    PRIMARY KEY (mbs, nkd_code)
  );

  CREATE TABLE IF NOT EXISTS registry_hr_company_emails (
    mbs TEXT NOT NULL,
    email TEXT NOT NULL,
    raw_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mbs, email)
  );
`);

const leadColumns = db.prepare(`PRAGMA table_info(leads)`).all() as Array<{ name: string }>;
if (!leadColumns.some((col) => col.name === "company_id")) {
  db.exec("ALTER TABLE leads ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL");
}
if (!leadColumns.some((col) => col.name === "user_id")) {
  db.exec("ALTER TABLE leads ADD COLUMN user_id INTEGER");
}
if (!leadColumns.some((col) => col.name === "tenant_id")) {
  db.exec("ALTER TABLE leads ADD COLUMN tenant_id INTEGER");
}
const companyColumns = db.prepare(`PRAGMA table_info(companies)`).all() as Array<{ name: string }>;
if (!companyColumns.some((col) => col.name === "user_id")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE companies RENAME TO companies_old;
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      website TEXT,
      oib TEXT,
      mbs TEXT,
      registry_source TEXT,
      city TEXT,
      county TEXT,
      address TEXT,
      court TEXT,
      legal_form TEXT,
      primary_nkd_code TEXT,
      primary_nkd_name TEXT,
      registry_emails TEXT,
      registry_raw_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, name)
    );
    INSERT INTO companies (id, name, website, oib, mbs, registry_source, city, county, address, court, legal_form, primary_nkd_code, primary_nkd_name, registry_emails, registry_raw_json, created_at)
    SELECT id, name, website, oib, mbs, registry_source, city, county, address, court, legal_form, primary_nkd_code, primary_nkd_name, registry_emails, registry_raw_json, created_at
    FROM companies_old;
    DROP TABLE companies_old;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
const companyColumnsAfterMigration = db.prepare(`PRAGMA table_info(companies)`).all() as Array<{ name: string }>;
if (!companyColumnsAfterMigration.some((col) => col.name === "user_id")) {
  db.exec("ALTER TABLE companies ADD COLUMN user_id INTEGER");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "tenant_id")) {
  db.exec("ALTER TABLE companies ADD COLUMN tenant_id INTEGER");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "oib")) {
  db.exec("ALTER TABLE companies ADD COLUMN oib TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "mbs")) {
  db.exec("ALTER TABLE companies ADD COLUMN mbs TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "registry_source")) {
  db.exec("ALTER TABLE companies ADD COLUMN registry_source TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "city")) {
  db.exec("ALTER TABLE companies ADD COLUMN city TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "county")) {
  db.exec("ALTER TABLE companies ADD COLUMN county TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "address")) {
  db.exec("ALTER TABLE companies ADD COLUMN address TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "court")) {
  db.exec("ALTER TABLE companies ADD COLUMN court TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "legal_form")) {
  db.exec("ALTER TABLE companies ADD COLUMN legal_form TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "primary_nkd_code")) {
  db.exec("ALTER TABLE companies ADD COLUMN primary_nkd_code TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "primary_nkd_name")) {
  db.exec("ALTER TABLE companies ADD COLUMN primary_nkd_name TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "registry_emails")) {
  db.exec("ALTER TABLE companies ADD COLUMN registry_emails TEXT");
}
if (!companyColumnsAfterMigration.some((col) => col.name === "registry_raw_json")) {
  db.exec("ALTER TABLE companies ADD COLUMN registry_raw_json TEXT");
}
const templatesColumns = db.prepare(`PRAGMA table_info(templates)`).all() as Array<{ name: string }>;
if (!templatesColumns.some((col) => col.name === "user_id")) {
  db.exec("ALTER TABLE templates ADD COLUMN user_id INTEGER");
}
if (!templatesColumns.some((col) => col.name === "tenant_id")) {
  db.exec("ALTER TABLE templates ADD COLUMN tenant_id INTEGER");
}
const customFieldsColumns = db.prepare(`PRAGMA table_info(custom_field_definitions)`).all() as Array<{ name: string }>;
if (!customFieldsColumns.some((col) => col.name === "user_id")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE custom_field_definitions RENAME TO custom_field_definitions_old;
    CREATE TABLE custom_field_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      label TEXT NOT NULL,
      UNIQUE (user_id, label)
    );
    INSERT INTO custom_field_definitions (id, label)
    SELECT id, label FROM custom_field_definitions_old;
    DROP TABLE custom_field_definitions_old;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
const customFieldsColumnsAfterMigration = db.prepare(`PRAGMA table_info(custom_field_definitions)`).all() as Array<{ name: string }>;
if (!customFieldsColumnsAfterMigration.some((col) => col.name === "tenant_id")) {
  db.exec("ALTER TABLE custom_field_definitions ADD COLUMN tenant_id INTEGER");
}
const userColumns = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
if (!userColumns.some((col) => col.name === "default_tenant_id")) {
  db.exec("ALTER TABLE users ADD COLUMN default_tenant_id INTEGER");
}
const leadsFkList = db.prepare(`PRAGMA foreign_key_list(leads)`).all() as Array<{ table: string }>;
if (leadsFkList.some((fk) => fk.table === "companies_old")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE leads RENAME TO leads_old_fk_fix;
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      tenant_id INTEGER,
      name TEXT NOT NULL,
      company_id INTEGER,
      company TEXT,
      email TEXT,
      status TEXT DEFAULT 'New',
      title TEXT,
      bio TEXT,
      website TEXT,
      linkedin_url TEXT,
      enriched_at DATETIME,
      assigned_to TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );
    INSERT INTO leads (id, user_id, tenant_id, name, company_id, company, email, status, title, bio, website, linkedin_url, enriched_at, assigned_to, created_at)
    SELECT id, user_id, tenant_id, name, company_id, company, email, status, title, bio, website, linkedin_url, enriched_at, assigned_to, created_at
    FROM leads_old_fk_fix;
    DROP TABLE leads_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
const hasBrokenLeadFk = (tableName: string) => {
  const fks = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as Array<{ table: string }>;
  return fks.some((fk) => fk.table === "leads_old_fk_fix" || fk.table === "leads_old");
};
if (hasBrokenLeadFk("communications")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE communications RENAME TO communications_old_fk_fix;
    CREATE TABLE communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      type TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
    INSERT INTO communications (id, lead_id, type, content, created_at)
    SELECT id, lead_id, type, content, created_at FROM communications_old_fk_fix;
    DROP TABLE communications_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
if (hasBrokenLeadFk("reminders")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE reminders RENAME TO reminders_old_fk_fix;
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      task TEXT NOT NULL,
      due_at DATETIME NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
    INSERT INTO reminders (id, lead_id, task, due_at, completed, created_at)
    SELECT id, lead_id, task, due_at, completed, created_at FROM reminders_old_fk_fix;
    DROP TABLE reminders_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
if (hasBrokenLeadFk("activity_logs")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE activity_logs RENAME TO activity_logs_old_fk_fix;
    CREATE TABLE activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      user_email TEXT,
      action TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
    INSERT INTO activity_logs (id, lead_id, user_email, action, old_value, new_value, created_at)
    SELECT id, lead_id, user_email, action, old_value, new_value, created_at FROM activity_logs_old_fk_fix;
    DROP TABLE activity_logs_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
if (hasBrokenLeadFk("contacts")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE contacts RENAME TO contacts_old_fk_fix;
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      linkedin_url TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_url TEXT,
      confidence REAL,
      research_run_id TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
    INSERT INTO contacts (id, lead_id, name, title, email, linkedin_url, bio, created_at, source_url, confidence, research_run_id)
    SELECT id, lead_id, name, title, email, linkedin_url, bio, created_at, source_url, confidence, research_run_id
    FROM contacts_old_fk_fix;
    DROP TABLE contacts_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
if (hasBrokenLeadFk("lead_custom_values")) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    ALTER TABLE lead_custom_values RENAME TO lead_custom_values_old_fk_fix;
    CREATE TABLE lead_custom_values (
      lead_id INTEGER,
      field_id INTEGER,
      value TEXT,
      PRIMARY KEY (lead_id, field_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
    );
    INSERT INTO lead_custom_values (lead_id, field_id, value)
    SELECT lead_id, field_id, value FROM lead_custom_values_old_fk_fix;
    DROP TABLE lead_custom_values_old_fk_fix;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
const registryCompanyNkdColumns = db.prepare(`PRAGMA table_info(registry_hr_company_nkds)`).all() as Array<{ name: string }>;
if (!registryCompanyNkdColumns.some((col) => col.name === "relation_type")) {
  db.exec("ALTER TABLE registry_hr_company_nkds ADD COLUMN relation_type TEXT");
}
const registryCompanyColumns = db.prepare(`PRAGMA table_info(registry_hr_companies)`).all() as Array<{ name: string }>;
if (!registryCompanyColumns.some((col) => col.name === "county")) {
  db.exec("ALTER TABLE registry_hr_companies ADD COLUMN county TEXT");
}
const contactColumns = db.prepare(`PRAGMA table_info(contacts)`).all() as Array<{ name: string }>;
if (!contactColumns.some((col) => col.name === "source_url")) {
  db.exec("ALTER TABLE contacts ADD COLUMN source_url TEXT");
}
if (!contactColumns.some((col) => col.name === "confidence")) {
  db.exec("ALTER TABLE contacts ADD COLUMN confidence REAL");
}
if (!contactColumns.some((col) => col.name === "research_run_id")) {
  db.exec("ALTER TABLE contacts ADD COLUMN research_run_id TEXT");
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
  CREATE INDEX IF NOT EXISTS idx_companies_tenant_id ON companies(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
  CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
  CREATE INDEX IF NOT EXISTS idx_templates_tenant_id ON templates(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_custom_fields_user_id ON custom_field_definitions(user_id);
  CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant_id ON custom_field_definitions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON tenant_memberships(tenant_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_tenant_name ON companies(tenant_id, name);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fields_tenant_label ON custom_field_definitions(tenant_id, label);
`);

const allUsers = db.prepare("SELECT id, email, default_tenant_id FROM users").all() as Array<{ id: number; email: string; default_tenant_id: number | null }>;
for (const user of allUsers) {
  let tenantId = user.default_tenant_id || null;
  if (!tenantId) {
    const info = db.prepare("INSERT INTO tenants (name, created_by) VALUES (?, ?)").run("Organizacija", user.id);
    tenantId = Number(info.lastInsertRowid);
    db.prepare("UPDATE users SET default_tenant_id = ? WHERE id = ?").run(tenantId, user.id);
  }
  db.prepare("INSERT OR IGNORE INTO tenant_memberships (user_id, tenant_id, role) VALUES (?, ?, 'owner')")
    .run(user.id, tenantId);
  db.prepare("UPDATE companies SET tenant_id = ? WHERE user_id = ? AND tenant_id IS NULL").run(tenantId, user.id);
  db.prepare("UPDATE leads SET tenant_id = ? WHERE user_id = ? AND tenant_id IS NULL").run(tenantId, user.id);
  db.prepare("UPDATE templates SET tenant_id = ? WHERE user_id = ? AND tenant_id IS NULL").run(tenantId, user.id);
  db.prepare("UPDATE custom_field_definitions SET tenant_id = ? WHERE user_id = ? AND tenant_id IS NULL").run(tenantId, user.id);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  const parseCookies = (cookieHeader?: string) => {
    const out: Record<string, string> = {};
    for (const part of String(cookieHeader || "").split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!key) continue;
      out[key] = decodeURIComponent(value);
    }
    return out;
  };

  const setSessionCookie = (res: express.Response, token: string, expiresAtIso: string) => {
    const expiresAt = new Date(expiresAtIso);
    const secure = process.env.NODE_ENV === "production";
    const cookie = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Expires=${expiresAt.toUTCString()}`,
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    res.setHeader("Set-Cookie", cookie);
  };

  const clearSessionCookie = (res: express.Response) => {
    const secure = process.env.NODE_ENV === "production";
    const cookie = [
      `${SESSION_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    res.setHeader("Set-Cookie", cookie);
  };

  const issueSession = (userId: number) => {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
      .run(userId, sha256(token), expiresAt);
    return { token, expiresAt };
  };

  const requireAuth: express.RequestHandler = (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE];
    if (!rawToken) return res.status(401).json({ error: "Niste prijavljeni" });

    const session = db.prepare(`
      SELECT
        s.id,
        s.user_id,
        s.expires_at,
        u.email,
        u.default_tenant_id,
        t.name as tenant_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN tenants t ON t.id = u.default_tenant_id
      WHERE s.token_hash = ?
      LIMIT 1
    `).get(sha256(rawToken)) as
      | { id: number; user_id: number; expires_at: string; email: string; default_tenant_id: number | null; tenant_name: string | null }
      | undefined;
    if (!session) return res.status(401).json({ error: "Sesija nije valjana" });
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
      clearSessionCookie(res);
      return res.status(401).json({ error: "Sesija je istekla" });
    }

    if (!session.default_tenant_id) {
      return res.status(403).json({ error: "Korisnik nema aktivan tenant" });
    }
    const membership = db.prepare("SELECT 1 as ok FROM tenant_memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1")
      .get(session.user_id, session.default_tenant_id) as { ok: number } | undefined;
    if (!membership) {
      return res.status(403).json({ error: "Korisnik nije član aktivnog tenanta" });
    }
    (req as any).authUser = {
      id: session.user_id,
      email: session.email,
      tenant_id: session.default_tenant_id,
      tenant_name: session.tenant_name || "Organizacija",
    };
    next();
  };

  const authUser = (req: express.Request): { id: number; email: string; tenant_id: number; tenant_name: string } => (req as any).authUser;

  const openAIModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const openAIKey = process.env.OPENAI_API_KEY;
  const serperApiKey = process.env.SERPER_API_KEY;
  const sudregBaseUrl = process.env.SUDREG_BASE_URL || "https://sudreg-data.gov.hr/api/javni";
  const sudregTokenUrl = process.env.SUDREG_TOKEN_URL || "https://sudreg-data.gov.hr/api/oauth/token";
  const sudregClientId = process.env.SUDREG_CLIENT_ID || 'DwET9gfo1LTWUcxtABNckA..';
  const sudregClientSecret = process.env.SUDREG_CLIENT_SECRET || 'ntRia5zAtXTKJXm6M8utuA..'; 
  let sudregTokenCache: { token: string; expiresAt: number } | null = null;
  let sudregSyncState: {
    running: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    currentPage: number;
    processedCompanies: number;
    importedCompanies: number;
    skippedCompanies: number;
    importedNkds: number;
    lastError: string | null;
  } = {
    running: false,
    startedAt: null,
    finishedAt: null,
    currentPage: 0,
    processedCompanies: 0,
    importedCompanies: 0,
    skippedCompanies: 0,
    importedNkds: 0,
    lastError: null,
  };

  const callOpenAI = async (prompt: string, json = false) => {
    if (!openAIKey) {
      throw new Error("OPENAI_API_KEY nije konfiguriran");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIKey}`,
      },
      body: JSON.stringify({
        model: openAIModel,
        messages: [
          {
            role: "system",
            content: json
              ? "You are a CRM assistant. Return valid JSON only with no markdown wrappers."
              : "You are a CRM assistant. Be concise and practical.",
          },
          { role: "user", content: prompt },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI zahtjev nije uspio: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI je vratio prazan odgovor");
    }
    return text as string;
  };

  const callOpenAIImportExtractor = async (params: {
    sourceType: "text" | "csv" | "screenshot";
    textContent?: string;
    imageDataUrl?: string;
  }) => {
    if (!openAIKey) {
      throw new Error("OPENAI_API_KEY nije konfiguriran");
    }
    const schemaPrompt = `Extract CRM import data. Return JSON only with keys:
records: array of objects where each object has:
- company_name (string, required when possible)
- oib (string|null)
- mbs (string|null)
- website (string|null)
- city (string|null)
- county (string|null)
- address (string|null)
- contacts: array of objects with keys name,title,email,linkedin_url,bio (name required when contact exists)
- raw_excerpt (string|null)
unmatched: array of objects with keys raw, reason.
Rules:
- Leads are always companies.
- Put uncertain entries into unmatched instead of guessing.
- Normalize Croatian data when possible.
- Do not return markdown.`;

    const userParts: any[] = [{ type: "text", text: `${schemaPrompt}\n\nSource type: ${params.sourceType}` }];
    if (params.textContent) {
      userParts.push({ type: "text", text: `Source content:\n${params.textContent.slice(0, 120000)}` });
    }
    if (params.imageDataUrl) {
      userParts.push({
        type: "image_url",
        image_url: { url: params.imageDataUrl },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIKey}`,
      },
      body: JSON.stringify({
        model: openAIModel,
        messages: [
          {
            role: "system",
            content: "You are a CRM data import assistant. Return strict JSON only.",
          },
          {
            role: "user",
            content: userParts,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI import ekstrakcija nije uspjela: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI je vratio prazan odgovor za import");
    return JSON.parse(text);
  };

  const searchWeb = async (query: string) => {
    if (!serperApiKey) {
      throw new Error("SERPER_API_KEY nije konfiguriran za web istraživanje");
    }

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": serperApiKey,
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });

    if (!response.ok) {
      throw new Error(`Serper zahtjev nije uspio: ${await response.text()}`);
    }

    const data = await response.json();
    const organic = Array.isArray(data?.organic) ? data.organic : [];
    return organic.map((item: any) => ({
      title: item?.title || "",
      link: item?.link || "",
      snippet: item?.snippet || "",
    }));
  };

  const getSudregToken = async () => {
    const now = Date.now();
    if (sudregTokenCache && sudregTokenCache.expiresAt > now + 30_000) {
      return sudregTokenCache.token;
    }
    if (!sudregClientId || !sudregClientSecret) {
      throw new Error("SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET su obavezni");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
    });
    const basicAuth = Buffer.from(`${sudregClientId}:${sudregClientSecret}`).toString("base64");
    const response = await fetch(sudregTokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Sudreg zahtjev za token nije uspio: ${await response.text()}`);
    }
    const data = await response.json();
    const token = data?.access_token as string | undefined;
    const expiresIn = Number(data?.expires_in || 3600);
    if (!token) {
      throw new Error("Sudreg odgovor za token nema access_token");
    }
    sudregTokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  };

  const mapSudregCompany = (item: any) => ({
    name:
      item?.tvrtka?.ime ||
      item?.skracena_tvrtka?.ime ||
      item?.naziv ||
      item?.tvrtka ||
      item?.naziv_subjekta ||
      item?.fullName ||
      item?.ime ||
      "",
    oib: item?.oib || item?.OIB || "",
    mbs: item?.mbs || item?.MBS || item?.maticni_broj_subjekta || "",
    court:
      item?.sud_nadlezan?.naziv ||
      item?.sud_sluzba?.naziv ||
      item?.sud ||
      item?.trgovacki_sud ||
      item?.trg_sud ||
      "",
    status: item?.postupak?.postupak?.znacenje || item?.status || item?.status_subjekta || "",
    city:
      item?.sjediste?.naziv_naselja ||
      item?.sjediste?.naziv_opcine ||
      item?.mjesto ||
      item?.grad ||
      item?.city ||
      "",
    county:
      item?.sjediste?.naziv_zupanije ||
      item?.sud_nadlezan?.naziv_zupanije ||
      item?.sud_sluzba?.naziv_zupanije ||
      "",
    address:
      item?.adresa ||
      [
        item?.sjediste?.ulica,
        item?.sjediste?.kucni_broj,
        item?.sjediste?.naziv_naselja,
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
    website: item?.web || item?.website || "",
    raw: item,
  });

  const extractSudregCandidates = (data: any): any[] =>
    Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.rezultati)
          ? data.rezultati
          : Array.isArray(data?.content)
            ? data.content
            : Array.isArray(data?.results)
              ? data.results
              : Array.isArray(data?.data)
                ? data.data
                : [];

  const extractSudregTvrtke = (data: any): any[] =>
    Array.isArray(data)
      ? data
      : Array.isArray(data?.tvrtke)
        ? data.tvrtke
        : extractSudregCandidates(data);

  const extractSudregDetail = (data: any) => data?.detalji_subjekta || data?.detalji || data?.item || data;
  const hasExpandedDetail = (detail: any) => {
    if (!detail || typeof detail !== "object") return false;
    const hasCoreIdentity = !!(detail.mbs && (detail.tvrtka?.ime || detail.skracena_tvrtka?.ime || detail.oib));
    const hasSeat = !!detail.sjediste;
    const hasPrimaryNkd = !!(
      detail.pretezita_djelatnost?.nacionalna_klasifikacija_djelatnosti?.sifra ||
      detail.pretezita_djelatnost?.nacionalna_klasifikacija_djelatnosti?.puni_naziv
    );
    const hasActivities = Array.isArray(detail.evidencijske_djelatnosti);
    const hasReports = Array.isArray(detail.gfi);
    return hasCoreIdentity && hasSeat && hasPrimaryNkd && hasActivities && hasReports;
  };

  const formatError = (error: any) => {
    const message = error?.message ? String(error.message) : String(error);
    const cause = error?.cause?.message ? ` | cause: ${error.cause.message}` : "";
    return `${message}${cause}`;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchSudreg = async (token: string, endpoint: string, retries = 2) => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutMs = Number(process.env.SUDREG_HTTP_TIMEOUT_MS || 45000);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Sudreg zahtjev nije uspio (${response.status}) [attempt ${attempt + 1}/${retries + 1}]: ${endpoint} ${body ? `| body: ${body.slice(0, 500)}` : ""}`);
        }
        return response.json();
      } catch (error: any) {
        clearTimeout(timeout);
        lastError = error;
        if (attempt < retries) {
          await sleep(700 * (attempt + 1));
          continue;
        }
      }
    }
    throw new Error(`Sudreg fetch failed: ${endpoint} | ${formatError(lastError)}`);
  };

  const upsertRegistryCompany = db.prepare(`
    INSERT INTO registry_hr_companies (mbs, name, oib, court, status, city, county, address, website, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(mbs) DO UPDATE SET
      name = excluded.name,
      oib = excluded.oib,
      court = excluded.court,
      status = excluded.status,
      city = excluded.city,
      county = excluded.county,
      address = excluded.address,
      website = excluded.website,
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const upsertRegistryNkd = db.prepare(`
    INSERT INTO registry_hr_nkds (code, name, raw_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const deleteCompanyNkds = db.prepare("DELETE FROM registry_hr_company_nkds WHERE mbs = ?");
  const insertCompanyNkd = db.prepare(`
    INSERT OR IGNORE INTO registry_hr_company_nkds (mbs, nkd_code, nkd_name, relation_type)
    VALUES (?, ?, ?, ?)
  `);
  const deleteCompanyEmails = db.prepare("DELETE FROM registry_hr_company_emails WHERE mbs = ?");
  const insertCompanyEmail = db.prepare(`
    INSERT OR IGNORE INTO registry_hr_company_emails (mbs, email, raw_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const selectCompanyEmails = db.prepare(`
    SELECT email
    FROM registry_hr_company_emails
    WHERE mbs = ?
    ORDER BY email ASC
  `);

  const normalizeNkdCode = (value: string) => value.trim().replace(",", ".").replace(/\s+/g, "");
  const extractNkdCodeName = (item: any): { code: string; name: string } => {
    const code = normalizeNkdCode(
      String(item?.sifra || item?.code || item?.oznaka || item?.nkd || item?.nkd_sifra || "").trim()
    );
    const name = String(
      item?.puni_naziv ||
        item?.naziv ||
        item?.name ||
        item?.opis ||
        item?.description ||
        item?.djelatnost ||
        item?.label ||
        ""
    ).trim();
    return { code, name };
  };
  const selectNkdByCode = db.prepare("SELECT code, name FROM registry_hr_nkds WHERE code = ? LIMIT 1");
  const resolveNkdName = (codeInput: string): string | null => {
    const code = normalizeNkdCode(codeInput);
    if (!code) return null;
    const candidates = Array.from(
      new Set([
        code,
        code.replace(/\.0$/, ""),
        /^\d{2}\.\d{2}$/.test(code) ? `${code}.0` : "",
      ].filter(Boolean))
    );
    for (const c of candidates) {
      const row = selectNkdByCode.get(c) as { code: string; name: string | null } | undefined;
      const name = String(row?.name || "").trim();
      if (name && name !== c) return name;
    }
    return null;
  };

  const formatLegacyNkdCode = (value: any): string | null => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length === 4) {
      return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }
    if (digits.length === 5) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    }
    return null;
  };

  const extractEmailsFromDetail = (detail: any): string[] => {
    const out = new Set<string>();
    const push = (value: any) => {
      const v = String(value || "").trim().toLowerCase();
      if (v.includes("@")) out.add(v);
    };
    if (Array.isArray(detail?.email_adrese)) {
      for (const item of detail.email_adrese) {
        push(item?.adresa);
        push(item?.email);
      }
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  };

  const buildStructuredSubject = (detail: any, emails: string[] = []) => {
    const primaryActivityRaw =
      detail?.pretezita_djelatnost?.nacionalna_klasifikacija_djelatnosti ??
      detail?.pretezita_djelatnost ??
      (detail?.glavna_djelatnost
        ? {
            sifra: formatLegacyNkdCode(detail.glavna_djelatnost) || String(detail.glavna_djelatnost),
            puni_naziv: null,
          }
        : null);
    const primaryActivityCode = String(primaryActivityRaw?.sifra || "").trim();
    const primaryActivityName = String(primaryActivityRaw?.puni_naziv || "").trim();
    const resolvedPrimaryActivity =
      primaryActivityRaw && primaryActivityCode
        ? {
            ...primaryActivityRaw,
            sifra: primaryActivityCode,
            puni_naziv: primaryActivityName || resolveNkdName(primaryActivityCode) || null,
          }
        : primaryActivityRaw;

    return {
    ids: {
      mbs: detail?.mbs ?? null,
      potpuni_mbs: detail?.potpuni_mbs ?? null,
      oib: detail?.oib ?? null,
      potpuni_oib: detail?.potpuni_oib ?? null,
    },
    status: detail?.status ?? null,
    postupak: detail?.postupak?.postupak?.znacenje ?? detail?.postupak ?? null,
    courts: {
      sud_nadlezan: detail?.sud_nadlezan ?? null,
      sud_sluzba: detail?.sud_sluzba ?? null,
    },
    company_name: {
      tvrtka: detail?.tvrtka ?? null,
      skracena_tvrtka: detail?.skracena_tvrtka ?? null,
    },
    seat: detail?.sjediste ?? null,
    legal_form: detail?.pravni_oblik?.vrsta_pravnog_oblika ?? detail?.pravni_oblik ?? null,
    primary_activity: resolvedPrimaryActivity,
    dates: {
      datum_osnivanja: detail?.datum_osnivanja ?? null,
      vrijeme_zadnje_izmjene: detail?.vrijeme_zadnje_izmjene ?? null,
      scn_zadnje_izmjene: detail?.scn_zadnje_izmjene ?? null,
    },
    flags: {
      ino_podruznica: detail?.ino_podruznica ?? null,
      stecajna_masa: detail?.stecajna_masa ?? null,
      likvidacijska_masa: detail?.likvidacijska_masa ?? null,
    },
    activities: {
      evidencijske_djelatnosti: Array.isArray(detail?.evidencijske_djelatnosti)
        ? detail.evidencijske_djelatnosti
        : Array.isArray(detail?.predmeti_poslovanja)
          ? detail.predmeti_poslovanja.map((p: any) => ({
              djelatnost_rbr: p?.djelatnost_rbr ?? null,
              djelatnost_tekst: p?.djelatnost_tekst ?? null,
            }))
          : [],
      nkd_povezane: extractNkdsFromDetail(detail),
    },
    capitals: Array.isArray(detail?.temeljni_kapitali) ? detail.temeljni_kapitali : [],
    status_procedures: Array.isArray(detail?.statusni_postupci) ? detail.statusni_postupci : [],
    branches: Array.isArray(detail?.podruznice) ? detail.podruznice : [],
    financial_reports: Array.isArray(detail?.gfi) ? detail.gfi : [],
    changes: Array.isArray(detail?.promjene) ? detail.promjene : [],
    emails: Array.from(new Set([...(emails || []), ...extractEmailsFromDetail(detail)])).sort((a, b) => a.localeCompare(b)),
    raw: detail || {},
  };
  };

  const extractNkdsFromDetail = (input: any): Array<{ code: string; name: string; relationType: "primary" | "secondary" | "unknown" }> => {
    const out = new Map<string, { name: string; relationType: "primary" | "secondary" | "unknown" }>();
    const isLikelyNkdCode = (code: string) => /^\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/.test(code) || /^\d{4,5}$/.test(code);
    const detectRelationType = (keyPath: string): "primary" | "secondary" | "unknown" => {
      const p = keyPath.toLowerCase();
      if (p.includes("pretez") || p.includes("primarn") || p.includes("glavn")) return "primary";
      if (p.includes("spored") || p.includes("sekund")) return "secondary";
      return "unknown";
    };
    const walk = (node: any, parentKey = "") => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item, parentKey);
        return;
      }
      if (!node || typeof node !== "object") return;

      const keys = Object.keys(node);
      const lowerKeys = keys.map((k) => k.toLowerCase());
      const path = parentKey.toLowerCase();
      const hasNkdContext =
        path.includes("nkd") ||
        path.includes("klasifikacija_djelatnosti") ||
        path.includes("pretezita_djelatnost") ||
        lowerKeys.some((k) => k.includes("nkd")) ||
        lowerKeys.includes("puni_naziv");
      const codeKey =
        keys.find((k) => ["sifra", "code", "oznaka", "nkd", "nkd_sifra"].includes(k.toLowerCase())) || null;
      const nameKey =
        keys.find((k) => ["puni_naziv", "naziv", "name", "opis", "description", "djelatnost"].includes(k.toLowerCase())) || null;

      if (hasNkdContext && codeKey) {
        const rawCode = String(node[codeKey] ?? "").trim();
        const code = normalizeNkdCode(rawCode);
        if (code && isLikelyNkdCode(code)) {
          const normalizedLegacy = /^\d{4,5}$/.test(code) ? (formatLegacyNkdCode(code) || code) : code;
          const name = nameKey ? String(node[nameKey] ?? "").trim() : "";
          const relationType = detectRelationType(parentKey);
          const existing = out.get(normalizedLegacy);
          const existingRank = existing?.relationType === "primary" ? 3 : existing?.relationType === "secondary" ? 2 : 1;
          const currentRank = relationType === "primary" ? 3 : relationType === "secondary" ? 2 : 1;
          if (!existing || currentRank >= existingRank) {
            out.set(normalizedLegacy, { name: name || existing?.name || "", relationType });
          }
        }
      }

      for (const k of keys) {
        walk(node[k], `${parentKey}.${k}`.toLowerCase());
      }
    };
    walk(input, "");
    return Array.from(out.entries()).map(([code, value]) => ({ code, name: value.name, relationType: value.relationType }));
  };

  const normalizeMbs = (value: any) => String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const extractEmailAddressesFromPayload = (input: any, expectedMbs: string): string[] => {
    const outMatched = new Set<string>();
    const outUnknown = new Set<string>();
    const expectedNorm = normalizeMbs(expectedMbs);
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const addEmail = (set: Set<string>, value: string) => {
      const matches = value.match(emailRegex) || [];
      for (const match of matches) set.add(match.trim().toLowerCase());
    };

    const walk = (node: any) => {
      if (node === null || node === undefined) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== "object") return;

      const rec = node as Record<string, any>;
      const mbsCandidate =
        rec.mbs ??
        rec.MBS ??
        rec.potpuni_mbs ??
        rec.maticni_broj_subjekta ??
        rec.identifikator ??
        rec.identifikator_subjekta ??
        null;
      const mbsNorm = normalizeMbs(mbsCandidate);
      const mbsKnown = !!mbsNorm;
      const mbsMatches = mbsKnown && expectedNorm && mbsNorm === expectedNorm;

      for (const [key, value] of Object.entries(rec)) {
        const keyLower = key.toLowerCase();
        if (typeof value === "string") {
          const looksLikeEmailField =
            keyLower.includes("mail") ||
            keyLower.includes("email") ||
            keyLower === "adresa" ||
            keyLower === "address";
          const hasEmailPattern = value.includes("@");
          if ((looksLikeEmailField || hasEmailPattern) && mbsMatches) {
            addEmail(outMatched, value);
          } else if ((looksLikeEmailField || hasEmailPattern) && !mbsKnown) {
            addEmail(outUnknown, value);
          }
        }
      }

      for (const value of Object.values(rec)) walk(value);
    };

    walk(input);
    if (outMatched.size) return Array.from(outMatched).sort((a, b) => a.localeCompare(b));
    return Array.from(outUnknown).sort((a, b) => a.localeCompare(b));
  };

  const fetchSudregEmailsByMbs = async (token: string, mbs: string, oib?: string | null) => {
    const normalizedMbs = normalizeMbs(mbs);
    const paddedMbs = normalizedMbs ? normalizedMbs.padStart(9, "0") : mbs;
    const variants = Array.from(new Set([String(mbs), normalizedMbs, paddedMbs].filter(Boolean)));
    const normalizedOib = String(oib || "").replace(/\D/g, "");
    const candidates = [
      ...variants.map((v) => `${sudregBaseUrl}/email_adrese?mbs=${encodeURIComponent(v)}`),
      ...variants.map((v) => `${sudregBaseUrl}/email_adrese?tip_identifikatora=mbs&identifikator=${encodeURIComponent(v)}`),
      ...(normalizedOib ? [`${sudregBaseUrl}/email_adrese?tip_identifikatora=oib&identifikator=${encodeURIComponent(normalizedOib)}`] : []),
    ];
    let lastError: Error | null = null;
    for (const endpoint of candidates) {
      try {
        const data = await fetchSudreg(token, endpoint);
        const emails = extractEmailAddressesFromPayload(data, mbs);
        if (!emails.length) {
          const fallback = extractEmailAddressesFromPayload(data, "");
          if (fallback.length && candidates.indexOf(endpoint) < candidates.length - 1) {
            continue;
          }
        }
        return { emails, raw: data };
      } catch (error: any) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return { emails: [] as string[], raw: null };
  };

  app.post("/api/auth/register", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const inviteToken = String(req.body?.invite_token || "").trim();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Unesite ispravan email" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Lozinka mora imati barem 8 znakova" });
    }
    try {
      const info = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hashPassword(password));
      const userId = Number(info.lastInsertRowid);
      let tenantId: number | null = null;
      if (inviteToken) {
        const invite = db.prepare(`
          SELECT tenant_id, expires_at
          FROM tenant_invites
          WHERE token_hash = ?
          LIMIT 1
        `).get(sha256(inviteToken)) as { tenant_id: number; expires_at: string | null } | undefined;
        if (!invite) {
          db.prepare("DELETE FROM users WHERE id = ?").run(userId);
          return res.status(400).json({ error: "Pozivnica nije valjana" });
        }
        if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
          db.prepare("DELETE FROM users WHERE id = ?").run(userId);
          return res.status(400).json({ error: "Pozivnica je istekla" });
        }
        tenantId = invite.tenant_id;
      } else {
        const tenantInfo = db.prepare("INSERT INTO tenants (name, created_by) VALUES (?, ?)").run("Organizacija", userId);
        tenantId = Number(tenantInfo.lastInsertRowid);
      }
      db.prepare("INSERT OR IGNORE INTO tenant_memberships (user_id, tenant_id, role) VALUES (?, ?, ?)")
        .run(userId, tenantId, inviteToken ? "member" : "owner");
      db.prepare("UPDATE users SET default_tenant_id = ? WHERE id = ?").run(tenantId, userId);
      const session = issueSession(userId);
      setSessionCookie(res, session.token, session.expiresAt);
      const tenant = db.prepare("SELECT id, name FROM tenants WHERE id = ?").get(tenantId) as { id: number; name: string };
      res.json({ user: { id: userId, email, tenant } });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return res.status(409).json({ error: "Korisnik s tim emailom već postoji" });
      }
      res.status(500).json({ error: "Registracija nije uspjela" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "Email i lozinka su obavezni" });
    }
    const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1").get(email) as
      | { id: number; email: string; password_hash: string }
      | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Neispravan email ili lozinka" });
    }
    const tenant = db.prepare(`
      SELECT t.id, t.name
      FROM users u
      JOIN tenants t ON t.id = u.default_tenant_id
      JOIN tenant_memberships m ON m.user_id = u.id AND m.tenant_id = t.id
      WHERE u.id = ?
      LIMIT 1
    `).get(user.id) as { id: number; name: string } | undefined;
    if (!tenant) {
      return res.status(403).json({ error: "Korisnik nema aktivan tenant" });
    }
    const session = issueSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: { id: user.id, email: user.email, tenant } });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE];
    if (rawToken) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(rawToken));
    }
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = authUser(req);
    res.json({ user: { id: user.id, email: user.email, tenant: { id: user.tenant_id, name: user.tenant_name } } });
  });

  app.get("/api/auth/invite/:token", (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ error: "Nedostaje token pozivnice" });
    const invite = db.prepare(`
      SELECT i.expires_at, t.id as tenant_id, t.name as tenant_name
      FROM tenant_invites i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token_hash = ?
      LIMIT 1
    `).get(sha256(token)) as { expires_at: string | null; tenant_id: number; tenant_name: string } | undefined;
    if (!invite) return res.status(404).json({ error: "Pozivnica nije pronađena" });
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "Pozivnica je istekla" });
    }
    res.json({ valid: true, tenant: { id: invite.tenant_id, name: invite.tenant_name } });
  });

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  app.post("/api/tenants/invites", (req, res) => {
    const user = authUser(req);
    const expiresDays = Math.max(1, Math.min(30, Number(req.body?.expires_days || 14)));
    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO tenant_invites (token_hash, tenant_id, created_by, expires_at) VALUES (?, ?, ?, ?)")
      .run(sha256(token), user.tenant_id, user.id, expiresAt);

    const origin = String(req.headers.origin || "").trim() || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${origin}/?invite=${encodeURIComponent(token)}`;
    res.json({ invite_url: inviteUrl, token, expires_at: expiresAt });
  });

  app.get("/api/tenants/members", (req, res) => {
    const user = authUser(req);
    const members = db.prepare(`
      SELECT u.id, u.email, m.role, m.created_at
      FROM tenant_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ?
      ORDER BY u.email ASC
    `).all(user.tenant_id);
    res.json({ results: members });
  });

  app.delete("/api/tenants/members/:userId", (req, res) => {
    const user = authUser(req);
    const targetUserId = Number(req.params.userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Neispravan korisnik" });
    }
    if (targetUserId === user.id) {
      return res.status(400).json({ error: "Ne možete ukloniti sami sebe" });
    }

    const actorMembership = db.prepare(
      "SELECT role FROM tenant_memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1"
    ).get(user.id, user.tenant_id) as { role: string } | undefined;
    if (!actorMembership || actorMembership.role !== "owner") {
      return res.status(403).json({ error: "Samo vlasnik organizacije može uklanjati članove" });
    }

    const targetMembership = db.prepare(
      "SELECT user_id FROM tenant_memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1"
    ).get(targetUserId, user.tenant_id) as { user_id: number } | undefined;
    if (!targetMembership) {
      return res.status(404).json({ error: "Član nije pronađen" });
    }

    db.prepare("DELETE FROM tenant_memberships WHERE user_id = ? AND tenant_id = ?").run(targetUserId, user.tenant_id);
    const replacement = db.prepare(
      "SELECT tenant_id FROM tenant_memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1"
    ).get(targetUserId) as { tenant_id: number } | undefined;
    db.prepare("UPDATE users SET default_tenant_id = ? WHERE id = ?")
      .run(replacement?.tenant_id ?? null, targetUserId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId);

    res.json({ success: true });
  });

  app.patch("/api/tenants/current", (req, res) => {
    const user = authUser(req);
    const rawName = String(req.body?.name || "").trim();
    if (!rawName) return res.status(400).json({ error: "Naziv organizacije je obavezan" });
    const name = rawName.slice(0, 80);
    db.prepare("UPDATE tenants SET name = ? WHERE id = ?").run(name, user.tenant_id);
    res.json({ success: true, tenant: { id: user.tenant_id, name } });
  });

  app.post("/api/import/ai", async (req, res) => {
    const user = authUser(req);
    const inputType = String(req.body?.input_type || "").trim().toLowerCase();
    const textContent = typeof req.body?.content === "string" ? req.body.content : "";
    const imageDataUrl = typeof req.body?.image_data_url === "string" ? req.body.image_data_url : "";

    if (!["text", "csv", "screenshot", "excel"].includes(inputType)) {
      return res.status(400).json({ error: "Nepodržan tip uvoza" });
    }
    if (inputType === "excel") {
      return res.status(400).json({
        error: "Excel trenutno nije direktno podržan u ovoj verziji. Spremite datoteku kao CSV i ponovno uvezite.",
      });
    }
    if ((inputType === "text" || inputType === "csv") && !textContent.trim()) {
      return res.status(400).json({ error: "Nedostaje tekstualni sadržaj za uvoz" });
    }
    if (inputType === "screenshot" && !imageDataUrl.trim()) {
      return res.status(400).json({ error: "Nedostaje slika za uvoz" });
    }

    try {
      const extracted = await callOpenAIImportExtractor({
        sourceType: inputType as "text" | "csv" | "screenshot",
        textContent: textContent || undefined,
        imageDataUrl: imageDataUrl || undefined,
      }) as {
        records?: Array<any>;
        unmatched?: Array<{ raw?: string; reason?: string }>;
      };

      const records = Array.isArray(extracted?.records) ? extracted.records : [];
      const unmatched = Array.isArray(extracted?.unmatched) ? extracted.unmatched : [];

      const summary = {
        companies_created: 0,
        companies_matched: 0,
        leads_created: 0,
        contacts_created: 0,
        contacts_matched: 0,
        unmatched_count: 0,
      };
      const imported: Array<{ company: string; lead_id: number; company_id: number; contacts_created: number; contacts_matched: number }> = [];

      for (const rec of records) {
        const companyName = String(rec?.company_name || "").trim();
        const oib = String(rec?.oib || "").replace(/\D/g, "") || null;
        const mbs = String(rec?.mbs || "").replace(/\D/g, "") || null;
        const website = String(rec?.website || "").trim() || null;
        const city = String(rec?.city || "").trim() || null;
        const county = String(rec?.county || "").trim() || null;
        const address = String(rec?.address || "").trim() || null;
        if (!companyName) {
          summary.unmatched_count += 1;
          continue;
        }

        let company = null as { id: number } | null;
        if (oib) {
          company = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND REPLACE(CAST(oib AS TEXT), '.0', '') = ? LIMIT 1")
            .get(user.tenant_id, oib) as { id: number } | undefined || null;
        }
        if (!company && mbs) {
          company = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND ltrim(REPLACE(CAST(mbs AS TEXT), '.0', ''), '0') = ltrim(?, '0') LIMIT 1")
            .get(user.tenant_id, mbs) as { id: number } | undefined || null;
        }
        if (!company) {
          company = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1")
            .get(user.tenant_id, companyName) as { id: number } | undefined || null;
        }

        if (!company) {
          const info = db.prepare(`
            INSERT INTO companies (user_id, tenant_id, name, website, oib, mbs, city, county, address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(user.id, user.tenant_id, companyName, website, oib, mbs, city, county, address);
          company = { id: Number(info.lastInsertRowid) };
          summary.companies_created += 1;
        } else {
          summary.companies_matched += 1;
          db.prepare(`
            UPDATE companies
            SET
              website = COALESCE(?, website),
              oib = COALESCE(?, oib),
              mbs = COALESCE(?, mbs),
              city = COALESCE(?, city),
              county = COALESCE(?, county),
              address = COALESCE(?, address)
            WHERE id = ? AND tenant_id = ?
          `).run(website, oib, mbs, city, county, address, company.id, user.tenant_id);
        }

        let lead = db.prepare("SELECT id FROM leads WHERE tenant_id = ? AND company_id = ? LIMIT 1")
          .get(user.tenant_id, company.id) as { id: number } | undefined;
        if (!lead) {
          const leadInfo = db.prepare(`
            INSERT INTO leads (user_id, tenant_id, name, company_id, company, website, status)
            VALUES (?, ?, ?, ?, ?, ?, 'New')
          `).run(user.id, user.tenant_id, companyName, company.id, companyName, website);
          lead = { id: Number(leadInfo.lastInsertRowid) };
          summary.leads_created += 1;
        }

        const contacts = Array.isArray(rec?.contacts) ? rec.contacts : [];
        let localCreated = 0;
        let localMatched = 0;
        for (const c of contacts) {
          const name = String(c?.name || "").trim();
          if (!name) continue;
          const email = String(c?.email || "").trim() || null;
          const existing = db.prepare(`
            SELECT id
            FROM contacts
            WHERE lead_id = ?
              AND (LOWER(name) = LOWER(?) OR (? IS NOT NULL AND email = ?))
            LIMIT 1
          `).get(lead.id, name, email, email) as { id: number } | undefined;
          if (existing) {
            localMatched += 1;
            continue;
          }
          db.prepare(`
            INSERT INTO contacts (lead_id, name, title, email, linkedin_url, bio)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            lead.id,
            name,
            String(c?.title || "").trim() || null,
            email,
            String(c?.linkedin_url || "").trim() || null,
            String(c?.bio || "").trim() || null
          );
          localCreated += 1;
        }
        summary.contacts_created += localCreated;
        summary.contacts_matched += localMatched;
        imported.push({
          company: companyName,
          lead_id: lead.id,
          company_id: company.id,
          contacts_created: localCreated,
          contacts_matched: localMatched,
        });
      }

      summary.unmatched_count += unmatched.length;
      res.json({
        success: true,
        summary,
        imported,
        unmatched,
      });
    } catch (error: any) {
      console.error("AI import failed:", error);
      res.status(500).json({ error: "AI import nije uspio: " + error.message });
    }
  });

  app.post("/api/ai/generate", async (req, res) => {
    const { prompt, json } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Potreban je prompt u tekstualnom obliku" });
    }

    try {
      const text = await callOpenAI(prompt, !!json);
      res.json({ text });
    } catch (error: any) {
      console.error("OpenAI generation failed:", error);
      const status = error.message.includes("OPENAI_API_KEY") ? 503 : 500;
      res.status(status).json({ error: "OpenAI generiranje nije uspjelo: " + error.message });
    }
  });

  const startSudregSync = () => {
    if (sudregSyncState.running) return false;
    const startedAtMs = Date.now();
    console.log("[Sudreg] Sync started");
    sudregSyncState = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      currentPage: 0,
      processedCompanies: 0,
      importedCompanies: 0,
      skippedCompanies: 0,
      importedNkds: 0,
      lastError: null,
    };
    (async () => {
      try {
        const token = await getSudregToken();
        const configuredPageSize = Math.max(1, Math.min(9999, Number(process.env.SUDREG_SYNC_PAGE_SIZE || 5000)));
        let activePageSize = configuredPageSize;
        console.log(`[Sudreg] Using page size: ${configuredPageSize}`);
        const nkdEndpoint = `${sudregBaseUrl}/nacionalna_klasifikacija_djelatnosti`;
        try {
          console.log("[Sudreg] Syncing NKD codes...");
          const nkdData = await fetchSudreg(token, nkdEndpoint);
          const nkdList = Array.isArray(nkdData)
            ? nkdData
            : Array.isArray(nkdData?.items)
              ? nkdData.items
              : Array.isArray(nkdData?.rezultati)
                ? nkdData.rezultati
                : [];
          for (const nkd of nkdList) {
            const { code, name } = extractNkdCodeName(nkd);
            if (!code) continue;
            upsertRegistryNkd.run(code, name || null, JSON.stringify(nkd));
            sudregSyncState.importedNkds += 1;
          }
          console.log(`[Sudreg] NKD sync done: ${sudregSyncState.importedNkds} records`);
        } catch (error: any) {
          sudregSyncState.lastError = `NKD sync warning: ${error.message}`;
          console.error("[Sudreg] NKD sync warning:", error.message);
        }

        const existingRows = db.prepare("SELECT mbs FROM registry_hr_companies WHERE mbs IS NOT NULL").all() as Array<{ mbs: string }>;
        const knownMbs = new Set(existingRows.map((row) => String(row.mbs).trim()).filter(Boolean));
        const pendingMbs = new Set<string>();
        let listedCompanies = 0;
        console.log(`[Sudreg] Existing cached companies: ${knownMbs.size}`);

        // Phase 1: fetch all companies pages and cache lightweight rows first.
        for (let offset = 0; ; offset += activePageSize) {
          sudregSyncState.currentPage += 1;
          let listEndpoint = `${sudregBaseUrl}/tvrtke?offset=${offset}&limit=${activePageSize}`;
          console.log(`[Sudreg] [Phase 1/2] Fetching page ${sudregSyncState.currentPage} (offset=${offset}, limit=${activePageSize})`);
          let listData: any;
          try {
            listData = await fetchSudreg(token, listEndpoint);
          } catch (error: any) {
            const canFallback = activePageSize > 1000;
            if (!canFallback) throw error;
            const fallbackSize = 1000;
            console.warn(
              `[Sudreg] Page fetch failed at limit=${activePageSize}. Falling back to limit=${fallbackSize}. Error: ${formatError(error)}`
            );
            activePageSize = fallbackSize;
            listEndpoint = `${sudregBaseUrl}/tvrtke?offset=${offset}&limit=${activePageSize}`;
            console.log(`[Sudreg] [Phase 1/2] Retrying page ${sudregSyncState.currentPage} (offset=${offset}, limit=${activePageSize})`);
            listData = await fetchSudreg(token, listEndpoint);
          }
          const list = extractSudregTvrtke(listData);
          if (!list.length) {
            console.log(`[Sudreg] [Phase 1/2] No data on page ${sudregSyncState.currentPage}; pagination complete.`);
            break;
          }
          console.log(`[Sudreg] [Phase 1/2] Page ${sudregSyncState.currentPage} returned ${list.length} companies`);
          for (const item of list) {
            const mapped = mapSudregCompany(item);
            const mbs = String(mapped.mbs || "").trim();
            if (!mbs) continue;
            listedCompanies += 1;

            // Cache lightweight row immediately from list endpoint.
            upsertRegistryCompany.run(
              mbs,
              mapped.name || null,
              mapped.oib || null,
              mapped.court || null,
              mapped.status || null,
              mapped.city || null,
              mapped.county || null,
              mapped.address || null,
              mapped.website || null,
              JSON.stringify(item)
            );

            if (knownMbs.has(mbs)) {
              sudregSyncState.skippedCompanies += 1;
              continue;
            }
            knownMbs.add(mbs);
            pendingMbs.add(mbs);
            sudregSyncState.importedCompanies += 1;
          }
          console.log(
            `[Sudreg] [Phase 1/2] Completed page ${sudregSyncState.currentPage}: listed=${listedCompanies}, newQueued=${pendingMbs.size}, skippedKnown=${sudregSyncState.skippedCompanies}`
          );
        }

        // Phase 2: enrich queued companies with detailed endpoint one-by-one.
        sudregSyncState.processedCompanies = 0;
        let detailFailures = 0;
        const pendingList = Array.from(pendingMbs);
        console.log(`[Sudreg] [Phase 2/2] Starting detail enrichment for ${pendingList.length} companies...`);
        for (const mbs of pendingList) {
          const cached = db.prepare(`
            SELECT name, oib, court, status, city, county, address, website
            FROM registry_hr_companies
            WHERE mbs = ?
            LIMIT 1
          `).get(mbs) as
            | { name: string | null; oib: string | null; court: string | null; status: string | null; city: string | null; county: string | null; address: string | null; website: string | null }
            | undefined;
          try {
            const detailEndpoint = `${sudregBaseUrl}/detalji_subjekta?tip_identifikatora=mbs&identifikator=${encodeURIComponent(mbs)}&expand_relations=1`;
            const detailData = await fetchSudreg(token, detailEndpoint);
            const detailMapped = mapSudregCompany(extractSudregDetail(detailData));
            upsertRegistryCompany.run(
              mbs,
              detailMapped.name || cached?.name || null,
              detailMapped.oib || cached?.oib || null,
              detailMapped.court || cached?.court || null,
              detailMapped.status || cached?.status || null,
              detailMapped.city || cached?.city || null,
              detailMapped.county || cached?.county || null,
              detailMapped.address || cached?.address || null,
              detailMapped.website || cached?.website || null,
              JSON.stringify(detailData)
            );
            const nkds = extractNkdsFromDetail(detailData);
            deleteCompanyNkds.run(mbs);
            for (const nkd of nkds) {
              insertCompanyNkd.run(mbs, nkd.code, nkd.name || null, nkd.relationType);
            }
          } catch (error: any) {
            detailFailures += 1;
            console.warn(`[Sudreg] [Phase 2/2] Detail fetch failed for mbs=${mbs}: ${formatError(error)}`);
          }
          sudregSyncState.processedCompanies += 1;
          if (sudregSyncState.processedCompanies % 250 === 0 || sudregSyncState.processedCompanies === pendingList.length) {
            console.log(
              `[Sudreg] [Phase 2/2] Progress: processedDetails=${sudregSyncState.processedCompanies}/${pendingList.length}, detailFailures=${detailFailures}`
            );
          }
        }
        console.log(
          `[Sudreg] [Phase 2/2] Detail enrichment complete: processedDetails=${sudregSyncState.processedCompanies}, detailFailures=${detailFailures}`
        );
      } catch (error: any) {
        sudregSyncState.lastError = error.message || "Unknown sync error";
        console.error("[Sudreg] Sync error:", formatError(error));
      } finally {
        sudregSyncState.running = false;
        sudregSyncState.finishedAt = new Date().toISOString();
        const durationSec = Math.round((Date.now() - startedAtMs) / 1000);
        console.log(
          `[Sudreg] Sync finished in ${durationSec}s. processed=${sudregSyncState.processedCompanies}, imported=${sudregSyncState.importedCompanies}, skipped=${sudregSyncState.skippedCompanies}, nkd=${sudregSyncState.importedNkds}, error=${sudregSyncState.lastError || "none"}`
        );
      }
    })();
    return true;
  };

  const scheduleDailySudregSync = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(4, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const firstDelay = next.getTime() - now.getTime();
    setTimeout(() => {
      startSudregSync();
      setInterval(() => {
        startSudregSync();
      }, 24 * 60 * 60 * 1000);
    }, firstDelay);
  };
  const initializeSudregSync = () => {
    const cachedCompanies = db.prepare("SELECT COUNT(*) as count FROM registry_hr_companies").get() as { count: number };
    console.log(`[Sudreg] Cached companies on startup: ${cachedCompanies.count}`);
    if (cachedCompanies.count === 0) {
      console.log("[Sudreg] Cache is empty; starting initial sync immediately.");
      startSudregSync();
    }
    console.log("[Sudreg] Daily sync scheduled for 04:00 server local time.");
    scheduleDailySudregSync();
  };
  initializeSudregSync();

  app.post("/api/registry/hr/sync/start", (req, res) => {
    const started = startSudregSync();
    if (!started) {
      return res.status(409).json({ error: "Sinkronizacija je već u tijeku", state: sudregSyncState });
    }
    res.json({ success: true, state: sudregSyncState });
  });

  app.get("/api/registry/hr/sync/status", (req, res) => {
    const totalCached = db.prepare("SELECT COUNT(*) as count FROM registry_hr_companies").get() as { count: number };
    const totalNkds = db.prepare("SELECT COUNT(*) as count FROM registry_hr_nkds").get() as { count: number };
    res.json({ ...sudregSyncState, cachedCompanies: totalCached.count, cachedNkds: totalNkds.count });
  });

  app.get("/api/registry/hr/companies/search", (req, res) => {
    const q = String(req.query.q || "").trim();
    const nkdSingle = normalizeNkdCode(String(req.query.nkd || "").trim());
    const nkdCodesRaw = String(req.query.nkd_codes || "").trim();
    const nkdCodes = nkdCodesRaw
      ? nkdCodesRaw
          .split(",")
          .map((x) => normalizeNkdCode(x))
          .filter(Boolean)
      : nkdSingle
        ? [nkdSingle]
        : [];
    const nkdModeRaw = String(req.query.nkd_mode || "any").trim().toLowerCase();
    const nkdMode: "any" | "primary" | "secondary" =
      nkdModeRaw === "primary" || nkdModeRaw === "secondary" ? (nkdModeRaw as "primary" | "secondary") : "any";
    const city = String(req.query.city || "").trim();
    const county = String(req.query.county || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
    const like = `%${q}%`;
    const cityLike = `%${city}%`;
    const hasQ = !!q;
    const hasNkd = nkdCodes.length > 0;
    const hasCity = !!city;
    const hasCounty = !!county;
    let rows: any[] = [];
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (hasQ) {
      where += " AND (c.name LIKE ? OR c.oib LIKE ? OR c.mbs LIKE ?)";
      params.push(like, like, like);
    }
    if (hasCity) {
      where += " AND c.city LIKE ?";
      params.push(cityLike);
    }
    if (hasCounty) {
      where += " AND (c.county = ? OR c.raw_json LIKE ?)";
      params.push(county, `%${county}%`);
    }
    if (!hasNkd) {
      rows = db
        .prepare(`
          SELECT DISTINCT c.mbs, c.name, c.oib, c.court, c.status, c.city, c.county, c.address, c.website, c.updated_at
          FROM registry_hr_companies c
          ${where}
          ORDER BY c.updated_at DESC
          LIMIT ?
        `)
        .all(...params, limit);
      return res.json({ query: q, nkd_codes: nkdCodes, nkd_mode: nkdMode, city, county, total: rows.length, results: rows });
    }

    let nkdSql = "";
    const nkdSqlParams: any[] = [];
    if (nkdMode === "any") {
      const rawParts = nkdCodes.map(() => "c.raw_json LIKE ?");
      nkdSql = ` AND (${rawParts.join(" OR ")} OR EXISTS (SELECT 1 FROM registry_hr_company_nkds cn WHERE cn.mbs = c.mbs AND cn.nkd_code IN (${nkdCodes.map(() => "?").join(", ")})))`;
      nkdSqlParams.push(...nkdCodes.map((code) => `%${code}%`), ...nkdCodes);
    } else {
      // For primary/secondary we still parse payloads for precision, but prefilter rows first.
      const rawParts = nkdCodes.map(() => "c.raw_json LIKE ?");
      nkdSql = ` AND (${rawParts.join(" OR ")} OR EXISTS (SELECT 1 FROM registry_hr_company_nkds cn WHERE cn.mbs = c.mbs AND cn.nkd_code IN (${nkdCodes.map(() => "?").join(", ")}) AND cn.relation_type = ?))`;
      nkdSqlParams.push(...nkdCodes.map((code) => `%${code}%`), ...nkdCodes, nkdMode);
    }

    if (nkdMode === "any") {
      rows = db
        .prepare(`
          SELECT DISTINCT c.mbs, c.name, c.oib, c.court, c.status, c.city, c.county, c.address, c.website, c.updated_at
          FROM registry_hr_companies c
          ${where}
          ${nkdSql}
          ORDER BY c.updated_at DESC
          LIMIT ?
        `)
        .all(...params, ...nkdSqlParams, limit);
      return res.json({ query: q, nkd_codes: nkdCodes, nkd_mode: nkdMode, city, county, total: rows.length, results: rows });
    }

    const matches: any[] = [];
    const seen = new Set<string>();
    const batchSize = 2000;
    let offset = 0;

    for (;;) {
      const batch = db
        .prepare(`
          SELECT c.mbs, c.name, c.oib, c.court, c.status, c.city, c.county, c.address, c.website, c.updated_at, c.raw_json
          FROM registry_hr_companies c
          ${where}
          ${nkdSql}
          ORDER BY c.updated_at DESC
          LIMIT ? OFFSET ?
        `)
        .all(...params, ...nkdSqlParams, batchSize, offset) as Array<any>;
      if (!batch.length) break;

      for (const row of batch) {
        const mbs = String(row.mbs || "").trim();
        if (!mbs || seen.has(mbs)) continue;
        seen.add(mbs);

        let parsed: any = null;
        try {
          parsed = row.raw_json ? JSON.parse(row.raw_json) : null;
        } catch {
          parsed = null;
        }
        const detail = extractSudregDetail(parsed || {});
        const nkds = extractNkdsFromDetail(detail);
        const hit = nkds.some((n) => {
          if (!nkdCodes.includes(n.code)) return false;
          return n.relationType === nkdMode;
        });
        if (!hit) continue;

        matches.push({
          mbs: row.mbs,
          name: row.name,
          oib: row.oib,
          court: row.court,
          status: row.status,
          city: row.city,
          county: row.county,
          address: row.address,
          website: row.website,
          updated_at: row.updated_at,
        });
        if (matches.length >= limit) {
          return res.json({ query: q, nkd_codes: nkdCodes, nkd_mode: nkdMode, city, county, total: matches.length, results: matches });
        }
      }

      offset += batchSize;
    }

    return res.json({ query: q, nkd_codes: nkdCodes, nkd_mode: nkdMode, city, county, total: matches.length, results: matches });
  });

  const countyLabels: Record<string, string> = {
    "bjelovarsko-bilogorska-zupanija": "Bjelovarsko-bilogorska županija",
    "brodsko-posavska-zupanija": "Brodsko-posavska županija",
    "dubrovacko-neretvanska-zupanija": "Dubrovačko-neretvanska županija",
    "grad-zagreb": "Grad Zagreb",
    "istarska-zupanija": "Istarska županija",
    "karlovacka-zupanija": "Karlovačka županija",
    "koprivnicko-krizevacka-zupanija": "Koprivničko-križevačka županija",
    "krapinsko-zagorska-zupanija": "Krapinsko-zagorska županija",
    "licko-senjska-zupanija": "Ličko-senjska županija",
    "medimurska-zupanija": "Međimurska županija",
    "osjecko-baranjska-zupanija": "Osječko-baranjska županija",
    "pozesko-slavonska-zupanija": "Požeško-slavonska županija",
    "primorsko-goranska-zupanija": "Primorsko-goranska županija",
    "sibensko-kninska-zupanija": "Šibensko-kninska županija",
    "sisacko-moslavacka-zupanija": "Sisačko-moslavačka županija",
    "splitsko-dalmatinska-zupanija": "Splitsko-dalmatinska županija",
    "varazdinska-zupanija": "Varaždinska županija",
    "viroviticko-podravska-zupanija": "Virovitičko-podravska županija",
    "vukovarsko-srijemska-zupanija": "Vukovarsko-srijemska županija",
    "zadarska-zupanija": "Zadarska županija",
    "zagrebacka-zupanija": "Zagrebačka županija",
  };
  const countyGeoSlugs = Object.keys(countyLabels).sort((a, b) => a.localeCompare(b));
  const countyGeoDirs = [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "geojson", "hr-counties"),
  ];

  const resolveCountyGeoPath = (slug: string): string | null => {
    const file = `${slug}.geojson`;
    for (const dir of countyGeoDirs) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  app.get("/api/registry/hr/counties", (req, res) => {
    const results = countyGeoSlugs.map((slug) => ({
      slug,
      name: countyLabels[slug] || slug,
      file: `${slug}.geojson`,
      available: !!resolveCountyGeoPath(slug),
    }));
    res.json({ total: results.length, results });
  });

  app.get("/api/registry/hr/counties/geojson", (req, res) => {
    const features: any[] = [];

    for (const slug of countyGeoSlugs) {
      const countyName = countyLabels[slug] || slug;
      const fullPath = resolveCountyGeoPath(slug);
      if (!fullPath) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        const parsedFeatures = Array.isArray(parsed?.features) ? parsed.features : [];
        for (const f of parsedFeatures) {
          features.push({
            type: "Feature",
            geometry: f?.geometry || null,
            properties: {
              ...(f?.properties || {}),
              county_slug: slug,
              county_name: countyName,
            },
          });
        }
      } catch {
        // Ignore malformed county files and continue.
      }
    }

    res.json({
      type: "FeatureCollection",
      features,
    });
  });

  app.get("/api/registry/hr/nkds", (req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
    const rowsRaw = q
      ? db
          .prepare(`
            SELECT code, name, raw_json, updated_at
            FROM registry_hr_nkds
            WHERE code LIKE ? OR name LIKE ?
            ORDER BY code ASC
            LIMIT ?
          `)
          .all(`%${q}%`, `%${q}%`, limit)
      : db
          .prepare(`
            SELECT code, name, raw_json, updated_at
            FROM registry_hr_nkds
            ORDER BY code ASC
            LIMIT ?
          `)
          .all(limit);
    const rows = rowsRaw.map((row: any) => {
      const normalizedName = String(row.name || "").trim();
      const nameLooksInvalid = !normalizedName || normalizedName === String(row.code || "").trim();
      if (!nameLooksInvalid) return { code: row.code, name: normalizedName, updated_at: row.updated_at };
      try {
        const parsed = row.raw_json ? JSON.parse(row.raw_json) : null;
        const fallback = extractNkdCodeName(parsed);
        return { code: row.code, name: fallback.name || row.code, updated_at: row.updated_at };
      } catch {
        return { code: row.code, name: row.code, updated_at: row.updated_at };
      }
    });
    res.json({ query: q, total: rows.length, results: rows });
  });

  app.get("/api/registry/hr/companies/:mbs/detail", (req, res) => {
    const requestedMbs = String(req.params.mbs || "").trim();
    const row = db
      .prepare(`
        SELECT mbs, name, oib, court, status, city, county, address, website, raw_json, updated_at
        FROM registry_hr_companies
        WHERE mbs = ? OR ltrim(mbs, '0') = ltrim(?, '0')
        LIMIT 1
      `)
      .get(requestedMbs, requestedMbs) as
      | {
          mbs: string;
          name: string | null;
          oib: string | null;
          court: string | null;
          status: string | null;
          city: string | null;
          county: string | null;
          address: string | null;
          website: string | null;
          raw_json: string | null;
          updated_at: string;
        }
      | undefined;
    if (!row) return res.status(404).json({ error: "Detalj tvrtke nije pronađen u cacheu" });
    (async () => {
      let parsed: any = null;
      try {
        parsed = row.raw_json ? JSON.parse(row.raw_json) : null;
      } catch {
        parsed = row.raw_json;
      }

      const mbsKey = String(row.mbs || requestedMbs).trim();
      let detail = extractSudregDetail(parsed);
      const shouldRefresh = !hasExpandedDetail(detail);
      if (shouldRefresh) {
        try {
          const token = await getSudregToken();
          const endpoint = `${sudregBaseUrl}/detalji_subjekta?tip_identifikatora=mbs&identifikator=${encodeURIComponent(mbsKey)}&expand_relations=1`;
          const liveData = await fetchSudreg(token, endpoint);
          detail = extractSudregDetail(liveData);
          const mapped = mapSudregCompany(detail);
          upsertRegistryCompany.run(
            mbsKey,
            mapped.name || row.name || null,
            mapped.oib || row.oib || null,
            mapped.court || row.court || null,
            mapped.status || row.status || null,
            mapped.city || row.city || null,
            mapped.county || row.county || null,
            mapped.address || row.address || null,
            mapped.website || row.website || null,
            JSON.stringify(liveData)
          );
          const nkds = extractNkdsFromDetail(liveData);
          deleteCompanyNkds.run(mbsKey);
          for (const nkd of nkds) {
            insertCompanyNkd.run(mbsKey, nkd.code, nkd.name || null, nkd.relationType);
          }
          parsed = liveData;
        } catch (error) {
          // Keep cached data when live refresh is unavailable.
        }
      }

      detail = extractSudregDetail(detail || parsed || {});
      let emails = (selectCompanyEmails.all(mbsKey) as Array<{ email: string }>).map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean);
      try {
        const token = await getSudregToken();
        const emailData = await fetchSudregEmailsByMbs(token, mbsKey, row.oib);
        deleteCompanyEmails.run(mbsKey);
        for (const email of emailData.emails) {
          insertCompanyEmail.run(mbsKey, email, JSON.stringify(emailData.raw || null));
        }
        emails = emailData.emails;
      } catch {
        // Keep cached emails if live email lookup is unavailable.
      }

      const structured = buildStructuredSubject(detail || {}, emails);
      res.json({ ...row, detail, emails, structured });
    })().catch((error: any) => {
      res.status(500).json({ error: "Učitavanje detalja tvrtke nije uspjelo: " + error.message });
    });
  });

  app.post("/api/registry/hr/companies/import", (req, res) => {
    const user = authUser(req);
    const normalizeDigits = (value: any) => String(value ?? "").replace(/\D/g, "");
    const deriveRegistryDataByMbs = (mbsInput: string) => {
      const row = db
        .prepare(`
          SELECT name, website, oib, mbs, city, county, address, court, raw_json
          FROM registry_hr_companies
          WHERE mbs = ? OR ltrim(mbs, '0') = ltrim(?, '0')
          LIMIT 1
        `)
        .get(mbsInput, mbsInput) as
        | {
            name: string;
            website: string | null;
            oib: string | null;
            mbs: string;
            city: string | null;
            county: string | null;
            address: string | null;
            court: string | null;
            raw_json: string | null;
          }
        | undefined;
      if (!row) return null;

      let legalForm: string | null = null;
      let primaryNkdCode: string | null = null;
      let primaryNkdName: string | null = null;
      let city = row.city || null;
      let county = row.county || null;
      let address = row.address || null;
      let court = row.court || null;

      try {
        const parsed = row.raw_json ? JSON.parse(row.raw_json) : null;
        const detail = extractSudregDetail(parsed || {});
        const mapped = mapSudregCompany(detail || {});
        const structured = buildStructuredSubject(detail || {}, []);
        city = city || mapped.city || null;
        county = county || mapped.county || null;
        address = address || mapped.address || null;
        court = court || mapped.court || null;
        legalForm = String(structured?.legal_form?.naziv || structured?.legal_form || "").trim() || null;
        primaryNkdCode = String(structured?.primary_activity?.sifra || "").trim() || null;
        primaryNkdName = String(structured?.primary_activity?.puni_naziv || "").trim() || null;
      } catch {
        // Keep best-effort registry fields from cached flat columns.
      }

      const emailsRows = db
        .prepare("SELECT email FROM registry_hr_company_emails WHERE mbs = ? ORDER BY email ASC")
        .all(row.mbs) as Array<{ email: string }>;
      const emails = emailsRows.map((r) => String(r.email || "").trim()).filter(Boolean);

      return {
        name: row.name,
        website: row.website,
        oib: normalizeDigits(row.oib),
        mbs: String(row.mbs || "").trim(),
        city,
        county,
        address,
        court,
        legalForm,
        primaryNkdCode,
        primaryNkdName,
        rawJson: row.raw_json || null,
        emails,
      };
    };

    const { name, website, oib, mbs } = req.body ?? {};
    let normalizedName = String(name || "").trim();
    let resolvedWebsite = website ? String(website).trim() : null;
    let resolvedOib = normalizeDigits(oib) || null;
    let resolvedMbs = mbs ? String(mbs).trim() : null;
    let registryCity: string | null = null;
    let registryCounty: string | null = null;
    let registryAddress: string | null = null;
    let registryCourt: string | null = null;
    let registryLegalForm: string | null = null;
    let registryPrimaryNkdCode: string | null = null;
    let registryPrimaryNkdName: string | null = null;
    let registryRawJson: string | null = null;
    let registryEmails: string[] = [];

    if (resolvedMbs) {
      const fromCache = deriveRegistryDataByMbs(resolvedMbs);
      if (fromCache) {
        normalizedName = normalizedName || fromCache.name || normalizedName;
        resolvedWebsite = fromCache.website || resolvedWebsite;
        resolvedOib = fromCache.oib || resolvedOib;
        resolvedMbs = fromCache.mbs || resolvedMbs;
        registryCity = fromCache.city;
        registryCounty = fromCache.county;
        registryAddress = fromCache.address;
        registryCourt = fromCache.court;
        registryLegalForm = fromCache.legalForm;
        registryPrimaryNkdCode = fromCache.primaryNkdCode;
        registryPrimaryNkdName = fromCache.primaryNkdName;
        registryRawJson = fromCache.rawJson;
        registryEmails = fromCache.emails;
      }
    }
    if (!resolvedMbs && resolvedOib) {
      const fromCacheByOib = db
        .prepare(`
          SELECT mbs
          FROM registry_hr_companies
          WHERE REPLACE(CAST(oib AS TEXT), '.0', '') = ?
          LIMIT 1
        `)
        .get(resolvedOib) as { mbs: string } | undefined;
      if (fromCacheByOib?.mbs) {
        const fromCache = deriveRegistryDataByMbs(fromCacheByOib.mbs);
        if (fromCache) {
          normalizedName = normalizedName || fromCache.name || normalizedName;
          resolvedWebsite = fromCache.website || resolvedWebsite;
          resolvedOib = fromCache.oib || resolvedOib;
          resolvedMbs = fromCache.mbs || resolvedMbs;
          registryCity = fromCache.city;
          registryCounty = fromCache.county;
          registryAddress = fromCache.address;
          registryCourt = fromCache.court;
          registryLegalForm = fromCache.legalForm;
          registryPrimaryNkdCode = fromCache.primaryNkdCode;
          registryPrimaryNkdName = fromCache.primaryNkdName;
          registryRawJson = fromCache.rawJson;
          registryEmails = fromCache.emails;
        }
      }
    }
    if (!resolvedMbs && normalizedName) {
      const fromCacheByName = db
        .prepare(`
          SELECT mbs
          FROM registry_hr_companies
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
          ORDER BY updated_at DESC
          LIMIT 1
        `)
        .get(normalizedName) as { mbs: string } | undefined;
      if (fromCacheByName?.mbs) {
        const fromCache = deriveRegistryDataByMbs(fromCacheByName.mbs);
        if (fromCache) {
          normalizedName = normalizedName || fromCache.name || normalizedName;
          resolvedWebsite = fromCache.website || resolvedWebsite;
          resolvedOib = fromCache.oib || resolvedOib;
          resolvedMbs = fromCache.mbs || resolvedMbs;
          registryCity = fromCache.city;
          registryCounty = fromCache.county;
          registryAddress = fromCache.address;
          registryCourt = fromCache.court;
          registryLegalForm = fromCache.legalForm;
          registryPrimaryNkdCode = fromCache.primaryNkdCode;
          registryPrimaryNkdName = fromCache.primaryNkdName;
          registryRawJson = fromCache.rawJson;
          registryEmails = fromCache.emails;
        }
      }
    }

    if (!normalizedName) return res.status(400).json({ error: "Naziv tvrtke je obavezan" });

    try {
      let company = null as { id: number } | null;
      if (resolvedOib) {
        company = db
          .prepare("SELECT id FROM companies WHERE tenant_id = ? AND REPLACE(CAST(oib AS TEXT), '.0', '') = ?")
          .get(user.tenant_id, resolvedOib) as { id: number } | undefined || null;
      }
      if (!company && resolvedMbs) {
        company = db
          .prepare("SELECT id FROM companies WHERE tenant_id = ? AND ltrim(REPLACE(CAST(mbs AS TEXT), '.0', ''), '0') = ltrim(?, '0')")
          .get(user.tenant_id, resolvedMbs) as { id: number } | undefined || null;
      }

      if (!company) {
        db.prepare("INSERT OR IGNORE INTO companies (user_id, tenant_id, name, website) VALUES (?, ?, ?, ?)")
          .run(user.id, user.tenant_id, normalizedName, website ? String(website).trim() : null);
        company = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND name = ?").get(user.tenant_id, normalizedName) as { id: number } | undefined || null;
      }

      if (!company) {
        return res.status(500).json({ error: "Spremanje tvrtke nije uspjelo" });
      }

      db.prepare(
        `
        UPDATE companies
        SET
          website = COALESCE(?, website),
          oib = COALESCE(?, oib),
          mbs = COALESCE(?, mbs),
          city = COALESCE(?, city),
          county = COALESCE(?, county),
          address = COALESCE(?, address),
          court = COALESCE(?, court),
          legal_form = COALESCE(?, legal_form),
          primary_nkd_code = COALESCE(?, primary_nkd_code),
          primary_nkd_name = COALESCE(?, primary_nkd_name),
          registry_emails = COALESCE(?, registry_emails),
          registry_raw_json = COALESCE(?, registry_raw_json),
          registry_source = 'sudreg'
        WHERE id = ? AND tenant_id = ?
        `
      ).run(
        resolvedWebsite,
        resolvedOib,
        resolvedMbs,
        registryCity,
        registryCounty,
        registryAddress,
        registryCourt,
        registryLegalForm,
        registryPrimaryNkdCode,
        registryPrimaryNkdName,
        registryEmails.length ? JSON.stringify(registryEmails) : null,
        registryRawJson,
        company.id,
        user.tenant_id
      );

      let lead = db.prepare("SELECT id FROM leads WHERE tenant_id = ? AND company_id = ? LIMIT 1").get(user.tenant_id, company.id) as { id: number } | undefined;
      if (!lead) {
        const info = db
          .prepare("INSERT INTO leads (user_id, tenant_id, name, company_id, company, website, status) VALUES (?, ?, ?, ?, ?, ?, 'New')")
          .run(user.id, user.tenant_id, normalizedName, company.id, normalizedName, resolvedWebsite);
        lead = { id: Number(info.lastInsertRowid) };
      } else if (resolvedWebsite) {
        db.prepare("UPDATE leads SET website = COALESCE(website, ?) WHERE id = ? AND tenant_id = ?").run(resolvedWebsite, lead.id, user.tenant_id);
      }

      res.json({ success: true, company_id: company.id, lead_id: lead.id });
    } catch (error: any) {
      console.error("Sudreg import failed:", error);
      res.status(500).json({ error: "Sudreg uvoz nije uspio: " + error.message });
    }
  });

  // API Routes
  app.get("/api/companies", (req, res) => {
    const user = authUser(req);
    const companies = db.prepare(`
      SELECT c.*, COUNT(ct.id) as contact_count
      FROM companies c
      LEFT JOIN leads l ON l.company_id = c.id
      LEFT JOIN contacts ct ON ct.lead_id = l.id
      WHERE c.tenant_id = ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all(user.tenant_id);
    res.json(companies);
  });

  app.post("/api/companies", (req, res) => {
    const user = authUser(req);
    const { name, website } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Naziv tvrtke je obavezan" });
    }
    try {
      const info = db
        .prepare("INSERT INTO companies (user_id, tenant_id, name, website) VALUES (?, ?, ?, ?)")
        .run(user.id, user.tenant_id, name.trim(), website || null);
      const companyId = Number(info.lastInsertRowid);
      const leadInfo = db
        .prepare("INSERT INTO leads (user_id, tenant_id, name, company_id, company, status) VALUES (?, ?, ?, ?, ?, 'New')")
        .run(user.id, user.tenant_id, name.trim(), companyId, name.trim());
      res.json({ id: companyId, lead_id: Number(leadInfo.lastInsertRowid) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", (req, res) => {
    const user = authUser(req);
    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as
      | { id: number; name: string; website: string | null }
      | undefined;
    if (!company) return res.status(404).json({ error: "Tvrtka nije pronađena" });

    const { name, website } = req.body ?? {};
    const newName = typeof name === "string" && name.trim() ? name.trim() : company.name;
    const newWebsite = website !== undefined ? website : company.website;

    db.prepare("UPDATE companies SET name = ?, website = ? WHERE id = ? AND tenant_id = ?").run(newName, newWebsite, req.params.id, user.tenant_id);
    db.prepare("UPDATE leads SET company = ? WHERE company_id = ? AND tenant_id = ?").run(newName, req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.post("/api/companies/:id/research-contacts", async (req, res) => {
    const user = authUser(req);
    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as
      | { id: number; name: string; website: string | null }
      | undefined;
    if (!company) return res.status(404).json({ error: "Tvrtka nije pronađena" });

    if (!company.website || !company.website.trim()) {
      return res.status(400).json({ error: "Postavite web stranicu tvrtke prije istraživanja kontakata." });
    }

    try {
      const domain = new URL(company.website).hostname.replace(/^www\./, "");
      const queries = [
        `site:linkedin.com/in "${company.name}" (${domain})`,
        `site:${domain} team leadership ${company.name}`,
        `"${company.name}" "VP" OR "Head of" OR "Director"`,
        `site:linkedin.com "${company.name}" "Account Executive" OR "Sales"`,
      ];
      const webResultsNested = await Promise.all(queries.map((q) => searchWeb(q)));
      const resultMap = new Map<string, { title: string; link: string; snippet: string }>();
      for (const list of webResultsNested) {
        for (const r of list) {
          if (!r.link) continue;
          if (!resultMap.has(r.link)) resultMap.set(r.link, r);
        }
      }
      const webResults = Array.from(resultMap.values()).slice(0, 40);
      if (!webResults.length) {
        return res.status(502).json({ error: "Nema web rezultata za ovu tvrtku." });
      }

      const text = await callOpenAI(
        `You are extracting company contacts from externally gathered web search results.
Target company: ${company.name}
Company website/domain: ${company.website} (${domain})

Search results (JSON):
${JSON.stringify(webResults)}

Return JSON object with key: contacts.
contacts must be an array (0-10) with keys:
name (required), title, email, linkedin_url, bio, source_url (required), confidence (number 0-1), company_match (boolean).

Hard rules:
- Use ONLY people supported by the provided search results.
- source_url must be a URL present in the provided results.
- company_match must be true only when current-company match is explicit.
- Exclude uncertain people.`,
        true
      );

      const parsed = JSON.parse(text.replace(/```json|```/gi, "").trim()) as {
        contacts?: Array<{
          name?: string;
          title?: string;
          email?: string;
          linkedin_url?: string;
          bio?: string;
          source_url?: string;
          confidence?: number;
          company_match?: boolean;
        }>;
      };

      const contacts = (parsed.contacts || [])
        .map((c) => ({
          name: c.name?.trim() || "",
          title: c.title?.trim() || "",
          email: c.email?.trim() || "",
          linkedin_url: c.linkedin_url?.trim() || "",
          bio: c.bio?.trim() || "",
          source_url: c.source_url?.trim() || "",
          confidence: typeof c.confidence === "number" ? c.confidence : 0,
          company_match: c.company_match !== false,
        }))
        .filter((c) => c.name && c.source_url && c.company_match);

      res.json({
        success: true,
        run_id: `${Date.now()}-${company.id}`,
        contacts,
      });
    } catch (error: any) {
      console.error("Company contact research failed:", error);
      const status = error.message.includes("OPENAI_API_KEY") ? 503 : 500;
      res.status(status).json({ error: "Istraživanje kontakata nije uspjelo: " + error.message });
    }
  });

  app.get("/api/custom-fields", (req, res) => {
    const user = authUser(req);
    const fields = db.prepare("SELECT * FROM custom_field_definitions WHERE tenant_id = ? ORDER BY label ASC").all(user.tenant_id);
    res.json(fields);
  });

  app.post("/api/custom-fields", (req, res) => {
    const user = authUser(req);
    const { label } = req.body;
    try {
      const info = db.prepare("INSERT INTO custom_field_definitions (user_id, tenant_id, label) VALUES (?, ?, ?)").run(user.id, user.tenant_id, label);
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Polje već postoji" });
    }
  });

  app.delete("/api/custom-fields/:id", (req, res) => {
    const user = authUser(req);
    db.prepare("DELETE FROM custom_field_definitions WHERE id = ? AND tenant_id = ?").run(req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.get("/api/templates", (req, res) => {
    const user = authUser(req);
    const templates = db.prepare("SELECT * FROM templates WHERE tenant_id = ? ORDER BY name ASC").all(user.tenant_id);
    res.json(templates);
  });

  app.post("/api/templates", (req, res) => {
    const user = authUser(req);
    const { name, content } = req.body;
    const info = db.prepare(
      "INSERT INTO templates (user_id, tenant_id, name, content) VALUES (?, ?, ?, ?)"
    ).run(user.id, user.tenant_id, name, content);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/templates/:id", (req, res) => {
    const user = authUser(req);
    db.prepare("DELETE FROM templates WHERE id = ? AND tenant_id = ?").run(req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.get("/api/leads", (req, res) => {
    const user = authUser(req);
    const leads = db.prepare(`
      SELECT
        l.*,
        COALESCE(c.name, l.company) as company,
        c.website as company_website,
        REPLACE(CAST(c.oib AS TEXT), '.0', '') as company_oib,
        REPLACE(CAST(c.mbs AS TEXT), '.0', '') as company_mbs,
        c.city as company_city,
        c.county as company_county,
        c.address as company_address,
        c.court as company_court,
        c.legal_form as company_legal_form,
        c.primary_nkd_code as company_primary_nkd_code,
        c.primary_nkd_name as company_primary_nkd_name,
        c.registry_emails as company_registry_emails,
        c.registry_raw_json as company_registry_raw_json,
        (SELECT COUNT(*) FROM contacts ct WHERE ct.lead_id = l.id) as contact_count,
        (SELECT MIN(created_at) FROM communications cm WHERE cm.lead_id = l.id) as first_contacted_at,
        (SELECT MIN(due_at) FROM reminders r WHERE r.lead_id = l.id AND r.completed = 0) as next_task_due_at,
        (SELECT COUNT(*) FROM reminders r2 WHERE r2.lead_id = l.id AND r2.completed = 0) as open_task_count,
        CASE
          WHEN EXISTS (SELECT 1 FROM communications cm2 WHERE cm2.lead_id = l.id)
            OR EXISTS (SELECT 1 FROM activity_logs al WHERE al.lead_id = l.id)
          THEN 1
          ELSE 0
        END as has_activity,
        MAX(
          COALESCE((SELECT MAX(created_at) FROM communications cm3 WHERE cm3.lead_id = l.id), ''),
          COALESCE((SELECT MAX(created_at) FROM activity_logs al2 WHERE al2.lead_id = l.id), ''),
          COALESCE(l.created_at, '')
        ) as last_activity_at
      FROM leads l
      LEFT JOIN companies c ON c.id = l.company_id AND c.tenant_id = l.tenant_id
      WHERE l.tenant_id = ?
      ORDER BY l.created_at DESC
    `).all(user.tenant_id);
    res.json(leads);
  });

  app.post("/api/leads", (req, res) => {
    const user = authUser(req);
    const { name, company, company_id, email, status } = req.body;
    const actorEmail = user.email;
    if (!name) return res.status(400).json({ error: "Ime kontakta je obavezno" });

    let resolvedCompanyName = company;
    let resolvedCompanyId = company_id;
    if (company_id) {
      const existingCompany = db.prepare("SELECT name FROM companies WHERE id = ? AND tenant_id = ?").get(company_id, user.tenant_id) as
        | { name: string }
        | undefined;
      if (existingCompany) {
        resolvedCompanyName = existingCompany.name;
      } else {
        resolvedCompanyId = null;
      }
    } else if (company && typeof company === "string" && company.trim()) {
      db.prepare("INSERT OR IGNORE INTO companies (user_id, tenant_id, name) VALUES (?, ?, ?)").run(user.id, user.tenant_id, company.trim());
      const c = db.prepare("SELECT id, name FROM companies WHERE tenant_id = ? AND name = ?").get(user.tenant_id, company.trim()) as
        | { id: number; name: string }
        | undefined;
      if (c) {
        resolvedCompanyId = c.id;
        resolvedCompanyName = c.name;
      }
    }

    const info = db.prepare(
      "INSERT INTO leads (user_id, tenant_id, name, company_id, company, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(user.id, user.tenant_id, name, resolvedCompanyId || null, resolvedCompanyName || null, email, status || "New");
    const leadId = info.lastInsertRowid;
    
    if (actorEmail) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, new_value) VALUES (?, ?, ?, ?)")
        .run(leadId, actorEmail, 'Lead Created', name);
    }
    
    res.json({ id: leadId });
  });

  app.get("/api/leads/:id", (req, res) => {
    const user = authUser(req);
    const readLead = db.prepare(`
      SELECT
        l.*,
        COALESCE(c.name, l.company) as company,
        c.website as company_website,
        REPLACE(CAST(c.oib AS TEXT), '.0', '') as company_oib,
        REPLACE(CAST(c.mbs AS TEXT), '.0', '') as company_mbs,
        c.city as company_city,
        c.county as company_county,
        c.address as company_address,
        c.court as company_court,
        c.legal_form as company_legal_form,
        c.primary_nkd_code as company_primary_nkd_code,
        c.primary_nkd_name as company_primary_nkd_name,
        c.registry_emails as company_registry_emails,
        c.registry_raw_json as company_registry_raw_json
      FROM leads l
      LEFT JOIN companies c ON c.id = l.company_id AND c.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ?
    `);
    let lead = readLead.get(req.params.id, user.tenant_id) as any;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });

    const missingRegistryProfile =
      !!lead.company_id &&
      (!lead.company_city || !lead.company_county || !lead.company_address || !lead.company_court || !lead.company_legal_form || !lead.company_primary_nkd_code);
    if (missingRegistryProfile && lead.company_mbs) {
      const fromCache = db
        .prepare(`
          SELECT mbs, city, county, address, court, raw_json
          FROM registry_hr_companies
          WHERE mbs = ? OR ltrim(mbs, '0') = ltrim(?, '0')
          LIMIT 1
        `)
        .get(lead.company_mbs, lead.company_mbs) as
        | {
            mbs: string;
            city: string | null;
            county: string | null;
            address: string | null;
            court: string | null;
            raw_json: string | null;
          }
        | undefined;
      if (fromCache) {
        let legalForm: string | null = null;
        let primaryNkdCode: string | null = null;
        let primaryNkdName: string | null = null;
        let city = fromCache.city || null;
        let county = fromCache.county || null;
        let address = fromCache.address || null;
        let court = fromCache.court || null;
        try {
          const parsed = fromCache.raw_json ? JSON.parse(fromCache.raw_json) : null;
          const detail = extractSudregDetail(parsed || {});
          const mapped = mapSudregCompany(detail || {});
          const structured = buildStructuredSubject(detail || {}, []);
          city = city || mapped.city || null;
          county = county || mapped.county || null;
          address = address || mapped.address || null;
          court = court || mapped.court || null;
          legalForm = String(structured?.legal_form?.naziv || structured?.legal_form || "").trim() || null;
          primaryNkdCode = String(structured?.primary_activity?.sifra || "").trim() || null;
          primaryNkdName = String(structured?.primary_activity?.puni_naziv || "").trim() || null;
        } catch {
          // Keep best effort values from flat registry cache columns.
        }
        const emailsRows = db
          .prepare("SELECT email FROM registry_hr_company_emails WHERE mbs = ? ORDER BY email ASC")
          .all(fromCache.mbs) as Array<{ email: string }>;
        const emails = emailsRows.map((r) => String(r.email || "").trim()).filter(Boolean);

        db.prepare(`
          UPDATE companies
          SET
            city = COALESCE(?, city),
            county = COALESCE(?, county),
            address = COALESCE(?, address),
            court = COALESCE(?, court),
            legal_form = COALESCE(?, legal_form),
            primary_nkd_code = COALESCE(?, primary_nkd_code),
            primary_nkd_name = COALESCE(?, primary_nkd_name),
            registry_emails = COALESCE(?, registry_emails),
            registry_raw_json = COALESCE(?, registry_raw_json)
          WHERE id = ? AND tenant_id = ?
        `).run(
          city,
          county,
          address,
          court,
          legalForm,
          primaryNkdCode,
          primaryNkdName,
          emails.length ? JSON.stringify(emails) : null,
          fromCache.raw_json || null,
          lead.company_id,
          user.tenant_id
        );
        lead = readLead.get(req.params.id, user.tenant_id) as any;
      }
    }

    let companyRegistryDetail: any = null;
    let companyRegistryStructured: any = null;
    try {
      if (lead?.company_registry_raw_json) {
        const parsed = JSON.parse(lead.company_registry_raw_json);
        const detail = extractSudregDetail(parsed || {});
        const parsedEmails = (() => {
          try {
            const e = lead.company_registry_emails ? JSON.parse(lead.company_registry_emails) : [];
            return Array.isArray(e) ? e : [];
          } catch {
            return [];
          }
        })();
        companyRegistryDetail = detail;
        companyRegistryStructured = buildStructuredSubject(detail || {}, parsedEmails);
      }
    } catch {
      companyRegistryDetail = null;
      companyRegistryStructured = null;
    }
    
    const comms = db.prepare("SELECT * FROM communications WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    const reminders = db.prepare("SELECT * FROM reminders WHERE lead_id = ? ORDER BY due_at ASC").all(req.params.id);
    const contacts = db.prepare("SELECT * FROM contacts WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    const customValues = db.prepare(`
      SELECT d.id as field_id, d.label, v.value 
      FROM custom_field_definitions d
      LEFT JOIN lead_custom_values v ON d.id = v.field_id AND v.lead_id = ?
      WHERE d.tenant_id = ?
    `).all(req.params.id, user.tenant_id);
    const activityLogs = db.prepare("SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    
    res.json({
      ...lead,
      company_registry_detail: companyRegistryDetail,
      company_registry_structured: companyRegistryStructured,
      communications: comms,
      reminders,
      contacts,
      custom_fields: customValues,
      activity_logs: activityLogs,
    });
  });

  app.post("/api/leads/:id/contacts", (req, res) => {
    const user = authUser(req);
    const { name, title, email, linkedin_url, bio, source_url, confidence, research_run_id } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Ime kontakta je obavezno" });
    }
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });

    const info = db.prepare(
      "INSERT INTO contacts (lead_id, name, title, email, linkedin_url, bio, source_url, confidence, research_run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      req.params.id,
      name.trim(),
      title || null,
      email || null,
      linkedin_url || null,
      bio || null,
      source_url || null,
      typeof confidence === "number" ? confidence : null,
      research_run_id || null
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/leads/:id/contacts/bulk", (req, res) => {
    const user = authUser(req);
    const { contacts, research_run_id } = req.body ?? {};
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: "Potreban je barem jedan kontakt" });
    }
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });

    const existingContact = db.prepare("SELECT id FROM contacts WHERE lead_id = ? AND LOWER(name) = LOWER(?)");
    const insertContact = db.prepare(
      "INSERT INTO contacts (lead_id, name, title, email, linkedin_url, bio, source_url, confidence, research_run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    let created = 0;
    for (const c of contacts) {
      const name = (c?.name || "").trim();
      if (!name) continue;
      const already = existingContact.get(req.params.id, name) as { id: number } | undefined;
      if (already) continue;
      insertContact.run(
        req.params.id,
        name,
        (c?.title || "").trim() || null,
        (c?.email || "").trim() || null,
        (c?.linkedin_url || "").trim() || null,
        (c?.bio || "").trim() || null,
        (c?.source_url || "").trim() || null,
        typeof c?.confidence === "number" ? c.confidence : null,
        research_run_id || null
      );
      created += 1;
    }
    res.json({ success: true, created });
  });

  app.patch("/api/contacts/:id", (req, res) => {
    const user = authUser(req);
    const contact = db.prepare(`
      SELECT c.*
      FROM contacts c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.id = ? AND l.tenant_id = ?
    `).get(req.params.id, user.tenant_id) as
      | { id: number; name: string; title: string | null; email: string | null; linkedin_url: string | null; bio: string | null }
      | undefined;
    if (!contact) return res.status(404).json({ error: "Kontakt nije pronađen" });
    const { name, title, email, linkedin_url, bio } = req.body ?? {};
    db.prepare(
      "UPDATE contacts SET name = ?, title = ?, email = ?, linkedin_url = ?, bio = ? WHERE id = ?"
    ).run(
      name ?? contact.name,
      title ?? contact.title,
      email ?? contact.email,
      linkedin_url ?? contact.linkedin_url,
      bio ?? contact.bio,
      req.params.id
    );
    res.json({ success: true });
  });

  app.delete("/api/contacts/:id", (req, res) => {
    const user = authUser(req);
    db.prepare(`
      DELETE FROM contacts
      WHERE id = ?
        AND lead_id IN (SELECT id FROM leads WHERE tenant_id = ?)
    `).run(req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const user = authUser(req);
    const { status, name, company, company_id, email, title, bio, website, linkedin_url, enriched_at, assigned_to } = req.body;
    const actorEmail = user.email;
    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id);
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });

    let resolvedCompanyName = company ?? lead.company;
    let resolvedCompanyId = company_id ?? lead.company_id;
    if (company_id !== undefined && company_id !== null) {
      const selectedCompany = db.prepare("SELECT name FROM companies WHERE id = ? AND tenant_id = ?").get(company_id, user.tenant_id) as
        | { name: string }
        | undefined;
      if (selectedCompany) {
        resolvedCompanyName = selectedCompany.name;
        resolvedCompanyId = company_id;
      }
    } else if (company !== undefined && typeof company === "string" && company.trim()) {
      db.prepare("INSERT OR IGNORE INTO companies (user_id, tenant_id, name) VALUES (?, ?, ?)").run(user.id, user.tenant_id, company.trim());
      const c = db.prepare("SELECT id, name FROM companies WHERE tenant_id = ? AND name = ?").get(user.tenant_id, company.trim()) as
        | { id: number; name: string }
        | undefined;
      if (c) {
        resolvedCompanyId = c.id;
        resolvedCompanyName = c.name;
      }
    }

    let normalizedAssignedTo = assigned_to;
    if (assigned_to !== undefined && assigned_to !== null) {
      const candidate = String(assigned_to).trim().toLowerCase();
      if (!candidate) {
        normalizedAssignedTo = "";
      } else {
        const member = db.prepare(`
          SELECT 1 as ok
          FROM tenant_memberships m
          JOIN users u ON u.id = m.user_id
          WHERE m.tenant_id = ? AND LOWER(u.email) = ?
          LIMIT 1
        `).get(user.tenant_id, candidate) as { ok: number } | undefined;
        if (!member) {
          return res.status(400).json({ error: "Korisnik za dodjelu nije član organizacije" });
        }
        normalizedAssignedTo = candidate;
      }
    }

    // Log status change
    if (status && status !== lead.status && actorEmail) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, actorEmail, 'Status Changed', lead.status, status);
    }

    // Log assignment change
    if (normalizedAssignedTo !== undefined && normalizedAssignedTo !== lead.assigned_to && actorEmail) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, actorEmail, 'Lead Assigned', lead.assigned_to || 'Unassigned', normalizedAssignedTo || 'Unassigned');
    }

    db.prepare(
      "UPDATE leads SET status = ?, name = ?, company_id = ?, company = ?, email = ?, title = ?, bio = ?, website = ?, linkedin_url = ?, enriched_at = ?, assigned_to = ? WHERE id = ? AND tenant_id = ?"
    ).run(
      status ?? lead.status,
      name ?? lead.name,
      resolvedCompanyId ?? null,
      resolvedCompanyName ?? null,
      email ?? lead.email,
      title ?? lead.title,
      bio ?? lead.bio,
      website ?? lead.website,
      linkedin_url ?? lead.linkedin_url,
      enriched_at ?? lead.enriched_at,
      normalizedAssignedTo !== undefined ? normalizedAssignedTo : lead.assigned_to,
      req.params.id,
      user.tenant_id
    );
    res.json({ success: true });
  });

  app.delete("/api/leads/:id", (req, res) => {
    const user = authUser(req);
    db.prepare("DELETE FROM leads WHERE id = ? AND tenant_id = ?").run(req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.post("/api/leads/:id/communications", (req, res) => {
    const user = authUser(req);
    const { type, content } = req.body;
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });
    const info = db.prepare(
      "INSERT INTO communications (lead_id, type, content) VALUES (?, ?, ?)"
    ).run(req.params.id, type, content);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/leads/:id/reminders", (req, res) => {
    const user = authUser(req);
    const { task, due_at } = req.body;
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });
    const info = db.prepare(
      "INSERT INTO reminders (lead_id, task, due_at) VALUES (?, ?, ?)"
    ).run(req.params.id, task, due_at);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/reminders/:id", (req, res) => {
    const user = authUser(req);
    const { completed } = req.body;
    db.prepare(`
      UPDATE reminders
      SET completed = ?
      WHERE id = ?
        AND lead_id IN (SELECT id FROM leads WHERE tenant_id = ?)
    `).run(completed ? 1 : 0, req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.delete("/api/reminders/:id", (req, res) => {
    const user = authUser(req);
    db.prepare(`
      DELETE FROM reminders
      WHERE id = ?
        AND lead_id IN (SELECT id FROM leads WHERE tenant_id = ?)
    `).run(req.params.id, user.tenant_id);
    res.json({ success: true });
  });

  app.post("/api/send-email", async (req, res) => {
    const user = authUser(req);
    const { lead_id, to, subject, content } = req.body;
    const actorEmail = user.email;
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(lead_id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });
    
    const mailTransporter = getTransporter();
    if (!mailTransporter) {
      return res.status(503).json({ error: "Servis za e-mail nije konfiguriran" });
    }

    try {
      await mailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        text: content,
        html: content.replace(/\n/g, '<br>'),
      });

      // Log as communication
      const info = db.prepare(
        "INSERT INTO communications (lead_id, type, content) VALUES (?, ?, ?)"
      ).run(lead_id, 'Email', content);

      // Log activity
      if (actorEmail) {
        db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, new_value) VALUES (?, ?, ?, ?)")
          .run(lead_id, actorEmail, 'Email Sent', `To: ${to}`);
      }

      res.json({ success: true, id: info.lastInsertRowid });
    } catch (error: any) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Slanje e-maila nije uspjelo: " + error.message });
    }
  });

  app.post("/api/leads/:id/custom-values", (req, res) => {
    const user = authUser(req);
    const { field_id, value } = req.body;
    const actorEmail = user.email;
    const lead = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, user.tenant_id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead nije pronađen" });
    const ownedField = db.prepare("SELECT id, label FROM custom_field_definitions WHERE id = ? AND tenant_id = ?").get(field_id, user.tenant_id) as
      | { id: number; label: string }
      | undefined;
    if (!ownedField) return res.status(404).json({ error: "Polje nije pronađeno" });
    
    // Get old value for logging
    const oldVal = db.prepare("SELECT value FROM lead_custom_values WHERE lead_id = ? AND field_id = ?").get(req.params.id, field_id);
    const fieldDef = ownedField;

    if (actorEmail && oldVal?.value !== value) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, actorEmail, `Field Updated: ${fieldDef.label}`, oldVal?.value || 'None', value || 'None');
    }

    db.prepare(`
      INSERT INTO lead_custom_values (lead_id, field_id, value) 
      VALUES (?, ?, ?)
      ON CONFLICT(lead_id, field_id) DO UPDATE SET value = excluded.value
    `).run(req.params.id, field_id, value);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
