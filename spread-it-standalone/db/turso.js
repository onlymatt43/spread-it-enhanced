const fs = require('fs');
const path = require('path');
let db = null;

function init() {
  const dbPath = process.env.TURSO_DB_PATH || path.join(__dirname, '..', 'data', 'turso.db');
  // Ensure data dir exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Lazy-require better-sqlite3 to avoid startup errors if not installed
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  return db;
}

function migrate() {
  if (!db) init();
  const migFile = path.join(__dirname, 'migrations.sql');
  if (!fs.existsSync(migFile)) return;
  const sql = fs.readFileSync(migFile, 'utf8');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(sql);
}

function run(stmt, params) {
  if (!db) init();
  return db.prepare(stmt).run(params);
}

function get(stmt, params) {
  if (!db) init();
  return db.prepare(stmt).get(params);
}

function all(stmt, params) {
  if (!db) init();
  return db.prepare(stmt).all(params);
}

async function migrateCloud() {
  if (!process.env.TURSO_LIBSQL_URL || !process.env.TURSO_LIBSQL_TOKEN) {
    return;
  }
  try {
    const { createClient } = require('@libsql/client');
    const client = createClient({
      url: process.env.TURSO_LIBSQL_URL,
      auth: { token: process.env.TURSO_LIBSQL_TOKEN }
    });

    const migFile = path.join(__dirname, 'migrations.sql');
    if (!fs.existsSync(migFile)) return;
    const sql = fs.readFileSync(migFile, 'utf8');
    
    // Split by semicolons and remove empty statements
    const statements = sql.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await client.execute(stmt);
    }
    console.log('✅ Cloud DB migration completed.');
  } catch (err) {
    console.error('❌ Cloud DB migration failed:', err);
  }
}

async function runCloud(stmt, params) {
  if (!process.env.TURSO_LIBSQL_URL || !process.env.TURSO_LIBSQL_TOKEN) return null;
  const { createClient } = require('@libsql/client');
  const client = createClient({
      url: process.env.TURSO_LIBSQL_URL,
      auth: { token: process.env.TURSO_LIBSQL_TOKEN }
  });
  return await client.execute(stmt, params);
}

module.exports = { init, migrate, run, get, all, migrateCloud, runCloud };
