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
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    status TEXT DEFAULT 'New',
    title TEXT,
    bio TEXT,
    website TEXT,
    linkedin_url TEXT,
    enriched_at DATETIME,
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
`);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  app.post("/api/ai/generate", async (req, res) => {
    const { prompt, json } = req.body ?? {};
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
    }

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "A prompt string is required" });
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
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
        const errorText = await response.text();
        return res.status(response.status).json({ error: `OpenAI request failed: ${errorText}` });
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        return res.status(502).json({ error: "OpenAI returned an empty response" });
      }

      res.json({ text });
    } catch (error: any) {
      console.error("OpenAI generation failed:", error);
      res.status(500).json({ error: "OpenAI generation failed: " + error.message });
    }
  });

  // API Routes
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
    const leads = db.prepare("SELECT * FROM leads ORDER BY created_at DESC").all();
    res.json(leads);
  });

  app.post("/api/leads", (req, res) => {
    const { name, company, email, status, user_email } = req.body;
    const info = db.prepare(
      "INSERT INTO leads (name, company, email, status) VALUES (?, ?, ?, ?)"
    ).run(name, company, email, status || 'New');
    const leadId = info.lastInsertRowid;
    
    if (user_email) {
      db.prepare("INSERT INTO activity_logs (lead_id, user_email, action, new_value) VALUES (?, ?, ?, ?)")
        .run(leadId, user_email, 'Lead Created', name);
    }
    
    res.json({ id: leadId });
  });

  app.get("/api/leads/:id", (req, res) => {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    
    const comms = db.prepare("SELECT * FROM communications WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    const reminders = db.prepare("SELECT * FROM reminders WHERE lead_id = ? ORDER BY due_at ASC").all(req.params.id);
    const customValues = db.prepare(`
      SELECT d.id as field_id, d.label, v.value 
      FROM custom_field_definitions d
      LEFT JOIN lead_custom_values v ON d.id = v.field_id AND v.lead_id = ?
    `).all(req.params.id);
    const activityLogs = db.prepare("SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC").all(req.params.id);
    
    res.json({ ...lead, communications: comms, reminders, custom_fields: customValues, activity_logs: activityLogs });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { status, name, company, email, title, bio, website, linkedin_url, enriched_at, assigned_to, user_email } = req.body;
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

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
      "UPDATE leads SET status = ?, name = ?, company = ?, email = ?, title = ?, bio = ?, website = ?, linkedin_url = ?, enriched_at = ?, assigned_to = ? WHERE id = ?"
    ).run(
      status ?? lead.status,
      name ?? lead.name,
      company ?? lead.company,
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
