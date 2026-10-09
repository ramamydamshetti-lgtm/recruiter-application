import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "metaforge.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'recruiter',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    source_file TEXT,
    full_name TEXT,
    contact TEXT,
    email TEXT,
    linkedin TEXT,
    qualification TEXT,
    total_experience TEXT,
    skills TEXT NOT NULL DEFAULT '[]',
    technology TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);
  CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
`);

const candidateCols = db.prepare("PRAGMA table_info(candidates)").all().map((c) => c.name);
const migrations = [
  ["relevant_experience", "TEXT DEFAULT ''"],
  ["total_experience_months", "INTEGER DEFAULT 0"],
  ["relevant_experience_months", "INTEGER DEFAULT 0"],
];
for (const [col, def] of migrations) {
  if (!candidateCols.includes(col)) {
    db.exec(`ALTER TABLE candidates ADD COLUMN ${col} ${def}`);
  }
}

export function ensureAdminUser(username, password) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return;

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')"
  ).run(username, hash);
}

export function findUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function saveCandidate(userId, candidate) {
  const stmt = db.prepare(`
    INSERT INTO candidates (
      id, user_id, source_file, full_name, contact, email, linkedin,
      qualification, total_experience, relevant_experience,
      total_experience_months, relevant_experience_months,
      skills, technology, updated_at
    ) VALUES (
      @id, @userId, @sourceFile, @fullName, @contact, @email, @linkedin,
      @qualification, @totalExperience, @relevantExperience,
      @totalExperienceMonths, @relevantExperienceMonths,
      @skills, @technology, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      source_file = excluded.source_file,
      full_name = excluded.full_name,
      contact = excluded.contact,
      email = excluded.email,
      linkedin = excluded.linkedin,
      qualification = excluded.qualification,
      total_experience = excluded.total_experience,
      relevant_experience = excluded.relevant_experience,
      total_experience_months = excluded.total_experience_months,
      relevant_experience_months = excluded.relevant_experience_months,
      skills = excluded.skills,
      technology = excluded.technology,
      updated_at = datetime('now')
  `);

  stmt.run({
    id: candidate.id,
    userId,
    sourceFile: candidate.source_file || null,
    fullName: candidate.full_name || "",
    contact: candidate.contact || "",
    email: candidate.email || "",
    linkedin: candidate.linkedin || "",
    qualification: candidate.qualification || "",
    totalExperience: candidate.total_experience || "",
    relevantExperience: candidate.relevant_experience || "",
    totalExperienceMonths: candidate.total_experience_months || 0,
    relevantExperienceMonths: candidate.relevant_experience_months || 0,
    skills: JSON.stringify(candidate.skills || []),
    technology: JSON.stringify(candidate.technology || []),
  });

  return getCandidateById(candidate.id, userId);
}

export function getCandidateById(id, userId) {
  const row = db
    .prepare("SELECT * FROM candidates WHERE id = ? AND user_id = ?")
    .get(id, userId);
  return row ? mapCandidate(row) : null;
}

export function listCandidates(userId, { limit = 100, offset = 0 } = {}) {
  const rows = db
    .prepare(
      "SELECT * FROM candidates WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    )
    .all(userId, limit, offset);
  return rows.map(mapCandidate);
}

export function deleteCandidate(id, userId) {
  return db
    .prepare("DELETE FROM candidates WHERE id = ? AND user_id = ?")
    .run(id, userId).changes;
}

export function logAudit(userId, action, details, ipAddress) {
  db.prepare(
    "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)"
  ).run(userId, action, details ? JSON.stringify(details) : null, ipAddress || null);
}

function mapCandidate(row) {
  return {
    id: row.id,
    source_file: row.source_file,
    full_name: row.full_name,
    contact: row.contact,
    email: row.email,
    linkedin: row.linkedin,
    qualification: row.qualification,
    total_experience: row.total_experience,
    relevant_experience: row.relevant_experience || "",
    total_experience_months: row.total_experience_months || 0,
    relevant_experience_months: row.relevant_experience_months || 0,
    skills: JSON.parse(row.skills || "[]"),
    technology: JSON.parse(row.technology || "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export default db;
