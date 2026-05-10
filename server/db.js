// ============================================================
// NutriCare Database — SQLite (better-sqlite3)
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'nutricare.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    console.log(`  Database: ${path.basename(DB_PATH)} (SQLite — dados persistem até restart do Render)`);
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS premium_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      stripe_session_id TEXT,
      activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      profile_json TEXT NOT NULL,
      plan_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_device ON users(device_id);
    CREATE INDEX IF NOT EXISTS idx_premium_tokens_user ON premium_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_consultations_user ON consultations(user_id);
  `);
}

// ---- User ----
function findOrCreateUser(deviceId, email) {
  const d = getDb();
  let user = d.prepare('SELECT * FROM users WHERE device_id = ?').get(deviceId);
  if (!user) {
    const id = crypto.randomUUID();
    d.prepare('INSERT INTO users (id, device_id, email) VALUES (?, ?, ?)').run(id, deviceId, email || null);
    user = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else {
    if (email && email !== user.email) {
      d.prepare('UPDATE users SET email = ?, last_seen_at = datetime(\'now\') WHERE id = ?').run(email, user.id);
      user.email = email;
    }
    d.prepare('UPDATE users SET last_seen_at = datetime(\'now\') WHERE id = ?').run(user.id);
  }
  return user;
}

// ---- Premium ----
function activatePremium(userId, stripeSessionId, durationDays = 30) {
  const d = getDb();
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  d.prepare(
    'INSERT INTO premium_tokens (user_id, stripe_session_id, expires_at) VALUES (?, ?, ?)'
  ).run(userId, stripeSessionId || null, expiresAt);
}

function isPremiumActive(userId) {
  const d = getDb();
  const row = d.prepare(
    "SELECT COUNT(*) as count FROM premium_tokens WHERE user_id = ? AND is_active = 1 AND expires_at > datetime('now')"
  ).get(userId);
  return row.count > 0;
}

// ---- Consultations ----
function saveConsultation(userId, profile, planJson) {
  const d = getDb();
  d.prepare(
    'INSERT INTO consultations (user_id, profile_json, plan_json) VALUES (?, ?, ?)'
  ).run(userId, JSON.stringify(profile), planJson ? JSON.stringify(planJson) : null);
}

function getConsultations(userId, limit = 50, offset = 0) {
  const d = getDb();
  return d.prepare(
    'SELECT id, profile_json, plan_json, created_at FROM consultations WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(userId, limit, offset);
}

function getConsultationCount(userId) {
  const d = getDb();
  const row = d.prepare('SELECT COUNT(*) as count FROM consultations WHERE user_id = ?').get(userId);
  return row.count;
}

function deleteConsultation(id, userId) {
  const d = getDb();
  d.prepare('DELETE FROM consultations WHERE id = ? AND user_id = ?').run(id, userId);
}

function deleteUserData(userId) {
  const d = getDb();
  d.prepare('DELETE FROM consultations WHERE user_id = ?').run(userId);
  d.prepare('DELETE FROM premium_tokens WHERE user_id = ?').run(userId);
  d.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

function findUserByEmail(email) {
  const d = getDb();
  return d.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

module.exports = {
  getDb,
  findOrCreateUser,
  activatePremium,
  isPremiumActive,
  saveConsultation,
  getConsultations,
  getConsultationCount,
  deleteConsultation,
  deleteUserData,
  findUserByEmail
};
