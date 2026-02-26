import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("crimson.db");

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
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
    const { name, company, email, status } = req.body;
    const info = db.prepare(
      "INSERT INTO leads (name, company, email, status) VALUES (?, ?, ?, ?)"
    ).run(name, company, email, status || 'New');
    res.json({ id: info.lastInsertRowid });
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
    
    res.json({ ...lead, communications: comms, reminders, custom_fields: customValues });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { status, name, company, email, title, bio, website, linkedin_url, enriched_at } = req.body;
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    db.prepare(
      "UPDATE leads SET status = ?, name = ?, company = ?, email = ?, title = ?, bio = ?, website = ?, linkedin_url = ?, enriched_at = ? WHERE id = ?"
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

  app.post("/api/leads/:id/custom-values", (req, res) => {
    const { field_id, value } = req.body;
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
