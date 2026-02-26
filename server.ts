import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "data", "crimson.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

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
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE
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
`);

const leadColumns = db.prepare(`PRAGMA table_info(leads)`).all() as Array<{ name: string }>;
if (!leadColumns.some((col) => col.name === "company_id")) {
  db.exec("ALTER TABLE leads ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL");
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

// Backfill companies from existing lead.company values.
const distinctCompanies = db
  .prepare("SELECT DISTINCT company FROM leads WHERE company IS NOT NULL AND TRIM(company) <> ''")
  .all() as Array<{ company: string }>;
const insertCompanyStmt = db.prepare("INSERT OR IGNORE INTO companies (name) VALUES (?)");
const lookupCompanyStmt = db.prepare("SELECT id FROM companies WHERE name = ?");
const setLeadCompanyIdStmt = db.prepare(
  "UPDATE leads SET company_id = ? WHERE company = ? AND (company_id IS NULL OR company_id = 0)"
);
for (const row of distinctCompanies) {
  insertCompanyStmt.run(row.company.trim());
  const company = lookupCompanyStmt.get(row.company.trim()) as { id: number } | undefined;
  if (company?.id) {
    setLeadCompanyIdStmt.run(company.id, row.company.trim());
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  const openAIModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const openAIKey = process.env.OPENAI_API_KEY;
  const serperApiKey = process.env.SERPER_API_KEY;

  const callOpenAI = async (prompt: string, json = false) => {
    if (!openAIKey) {
      throw new Error("OPENAI_API_KEY is not configured");
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
      throw new Error(`OpenAI request failed: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI returned an empty response");
    }
    return text as string;
  };

  const searchWeb = async (query: string) => {
    if (!serperApiKey) {
      throw new Error("SERPER_API_KEY is not configured for web research");
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
      throw new Error(`Serper request failed: ${await response.text()}`);
    }

    const data = await response.json();
    const organic = Array.isArray(data?.organic) ? data.organic : [];
    return organic.map((item: any) => ({
      title: item?.title || "",
      link: item?.link || "",
      snippet: item?.snippet || "",
    }));
  };

  app.post("/api/ai/generate", async (req, res) => {
    const { prompt, json } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "A prompt string is required" });
    }

    try {
      const text = await callOpenAI(prompt, !!json);
      res.json({ text });
    } catch (error: any) {
      console.error("OpenAI generation failed:", error);
      const status = error.message.includes("OPENAI_API_KEY") ? 503 : 500;
      res.status(status).json({ error: "OpenAI generation failed: " + error.message });
    }
  });

  // API Routes
  app.get("/api/companies", (req, res) => {
    const companies = db.prepare(`
      SELECT c.*, COUNT(ct.id) as contact_count
      FROM companies c
      LEFT JOIN leads l ON l.company_id = c.id
      LEFT JOIN contacts ct ON ct.lead_id = l.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();
    res.json(companies);
  });

  app.post("/api/companies", (req, res) => {
    const { name, website } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Company name is required" });
    }
    try {
      const info = db
        .prepare("INSERT INTO companies (name, website) VALUES (?, ?)")
        .run(name.trim(), website || null);
      const companyId = Number(info.lastInsertRowid);
      const leadInfo = db
        .prepare("INSERT INTO leads (name, company_id, company, status) VALUES (?, ?, ?, 'New')")
        .run(name.trim(), companyId, name.trim());
      res.json({ id: companyId, lead_id: Number(leadInfo.lastInsertRowid) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", (req, res) => {
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id) as
      | { id: number; name: string; website: string | null }
      | undefined;
    if (!company) return res.status(404).json({ error: "Company not found" });

    const { name, website } = req.body ?? {};
    const newName = typeof name === "string" && name.trim() ? name.trim() : company.name;
    const newWebsite = website !== undefined ? website : company.website;

    db.prepare("UPDATE companies SET name = ?, website = ? WHERE id = ?").run(newName, newWebsite, req.params.id);
    db.prepare("UPDATE leads SET company = ? WHERE company_id = ?").run(newName, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/companies/:id/research-contacts", async (req, res) => {
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id) as
      | { id: number; name: string; website: string | null }
      | undefined;
    if (!company) return res.status(404).json({ error: "Company not found" });

    if (!company.website || !company.website.trim()) {
      return res.status(400).json({ error: "Set a company website before researching contacts." });
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
        return res.status(502).json({ error: "No web results found for this company." });
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
      res.status(status).json({ error: "Failed to research contacts: " + error.message });
    }
  });

  app.get("/api/custom-fields", (req, res) => {
    const fields = db.prepare("SELECT * FROM custom_field_definitions ORDER BY label ASC").all();
    res.json(fields);
  });

  app.post("/api/custom-fields", (req, res) => {
    const { label } = req.body;
    try {
      const info = db.prepare("INSERT INTO custom_field_definitions (label) VALUES (?)").run(label);
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Field already exists" });
    }
  });

  app.delete("/api/custom-fields/:id", (req, res) => {
    db.prepare("DELETE FROM custom_field_definitions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/templates", (req, res) => {
    const templates = db.prepare("SELECT * FROM templates ORDER BY name ASC").all();
    res.json(templates);
  });

  app.post("/api/templates", (req, res) => {
    const { name, content } = req.body;
    const info = db.prepare(
      "INSERT INTO templates (name, content) VALUES (?, ?)"
    ).run(name, content);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/templates/:id", (req, res) => {
    db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/leads", (req, res) => {
    const leads = db.prepare(`
      SELECT l.*, COALESCE(c.name, l.company) as company
      FROM leads l
      LEFT JOIN companies c ON c.id = l.company_id
      ORDER BY l.created_at DESC
    `).all();
    res.json(leads);
  });

  app.post("/api/leads", (req, res) => {
    const { name, company, company_id, email, status, user_email } = req.body;
    if (!name) return res.status(400).json({ error: "Contact name is required" });

    let resolvedCompanyName = company;
    let resolvedCompanyId = company_id;
    if (company_id) {
      const existingCompany = db.prepare("SELECT name FROM companies WHERE id = ?").get(company_id) as
        | { name: string }
        | undefined;
      if (existingCompany) {
        resolvedCompanyName = existingCompany.name;
      } else {
        resolvedCompanyId = null;
      }
    } else if (company && typeof company === "string" && company.trim()) {
      db.prepare("INSERT OR IGNORE INTO companies (name) VALUES (?)").run(company.trim());
      const c = db.prepare("SELECT id, name FROM companies WHERE name = ?").get(company.trim()) as
        | { id: number; name: string }
        | undefined;
      if (c) {
        resolvedCompanyId = c.id;
        resolvedCompanyName = c.name;
      }
    }

    const info = db.prepare(
      "INSERT INTO leads (name, company_id, company, email, status) VALUES (?, ?, ?, ?, ?)"
    ).run(name, resolvedCompanyId || null, resolvedCompanyName || null, email, status || "New");
    const leadId = info.lastInsertRowid;
    
    if (user_email) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, new_value) VALUES (?, ?, ?, ?)")
        .run(leadId, user_email, 'Lead Created', name);
    }
    
    res.json({ id: leadId });
  });

  app.get("/api/leads/:id", (req, res) => {
    const lead = db.prepare(`
      SELECT l.*, COALESCE(c.name, l.company) as company
      FROM leads l
      LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.id = ?
    `).get(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    
    const comms = db.prepare("SELECT * FROM communications WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    const reminders = db.prepare("SELECT * FROM reminders WHERE lead_id = ? ORDER BY due_at ASC").all(req.params.id);
    const contacts = db.prepare("SELECT * FROM contacts WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    const customValues = db.prepare(`
      SELECT d.id as field_id, d.label, v.value 
      FROM custom_field_definitions d
      LEFT JOIN lead_custom_values v ON d.id = v.field_id AND v.lead_id = ?
    `).all(req.params.id);
    const activityLogs = db.prepare("SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    
    res.json({ ...lead, communications: comms, reminders, contacts, custom_fields: customValues, activity_logs: activityLogs });
  });

  app.post("/api/leads/:id/contacts", (req, res) => {
    const { name, title, email, linkedin_url, bio, source_url, confidence, research_run_id } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Contact name is required" });
    }
    const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead not found" });

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
    const { contacts, research_run_id } = req.body ?? {};
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: "At least one contact is required" });
    }
    const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id) as { id: number } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead not found" });

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
    const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id) as
      | { id: number; name: string; title: string | null; email: string | null; linkedin_url: string | null; bio: string | null }
      | undefined;
    if (!contact) return res.status(404).json({ error: "Contact not found" });
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
    db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { status, name, company, company_id, email, title, bio, website, linkedin_url, enriched_at, assigned_to, user_email } = req.body;
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    let resolvedCompanyName = company ?? lead.company;
    let resolvedCompanyId = company_id ?? lead.company_id;
    if (company_id !== undefined && company_id !== null) {
      const selectedCompany = db.prepare("SELECT name FROM companies WHERE id = ?").get(company_id) as
        | { name: string }
        | undefined;
      if (selectedCompany) {
        resolvedCompanyName = selectedCompany.name;
        resolvedCompanyId = company_id;
      }
    } else if (company !== undefined && typeof company === "string" && company.trim()) {
      db.prepare("INSERT OR IGNORE INTO companies (name) VALUES (?)").run(company.trim());
      const c = db.prepare("SELECT id, name FROM companies WHERE name = ?").get(company.trim()) as
        | { id: number; name: string }
        | undefined;
      if (c) {
        resolvedCompanyId = c.id;
        resolvedCompanyName = c.name;
      }
    }

    // Log status change
    if (status && status !== lead.status && user_email) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, user_email, 'Status Changed', lead.status, status);
    }

    // Log assignment change
    if (assigned_to !== undefined && assigned_to !== lead.assigned_to && user_email) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, user_email, 'Lead Assigned', lead.assigned_to || 'Unassigned', assigned_to || 'Unassigned');
    }

    db.prepare(
      "UPDATE leads SET status = ?, name = ?, company_id = ?, company = ?, email = ?, title = ?, bio = ?, website = ?, linkedin_url = ?, enriched_at = ?, assigned_to = ? WHERE id = ?"
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
      assigned_to ?? lead.assigned_to,
      req.params.id
    );
    res.json({ success: true });
  });

  app.delete("/api/leads/:id", (req, res) => {
    db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/leads/:id/communications", (req, res) => {
    const { type, content } = req.body;
    const info = db.prepare(
      "INSERT INTO communications (lead_id, type, content) VALUES (?, ?, ?)"
    ).run(req.params.id, type, content);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/leads/:id/reminders", (req, res) => {
    const { task, due_at } = req.body;
    const info = db.prepare(
      "INSERT INTO reminders (lead_id, task, due_at) VALUES (?, ?, ?)"
    ).run(req.params.id, task, due_at);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/reminders/:id", (req, res) => {
    const { completed } = req.body;
    db.prepare("UPDATE reminders SET completed = ? WHERE id = ?").run(completed ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/reminders/:id", (req, res) => {
    db.prepare("DELETE FROM reminders WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/send-email", async (req, res) => {
    const { lead_id, to, subject, content, user_email } = req.body;
    
    const mailTransporter = getTransporter();
    if (!mailTransporter) {
      return res.status(503).json({ error: "Email service not configured" });
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
      if (user_email) {
        db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, new_value) VALUES (?, ?, ?, ?)")
          .run(lead_id, user_email, 'Email Sent', `To: ${to}`);
      }

      res.json({ success: true, id: info.lastInsertRowid });
    } catch (error: any) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Failed to send email: " + error.message });
    }
  });

  app.post("/api/leads/:id/custom-values", (req, res) => {
    const { field_id, value, user_email } = req.body;
    
    // Get old value for logging
    const oldVal = db.prepare("SELECT value FROM lead_custom_values WHERE lead_id = ? AND field_id = ?").get(req.params.id, field_id);
    const fieldDef = db.prepare("SELECT label FROM custom_field_definitions WHERE id = ?").get(field_id);

    if (user_email && oldVal?.value !== value) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
        .run(req.params.id, user_email, `Field Updated: ${fieldDef.label}`, oldVal?.value || 'None', value || 'None');
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
