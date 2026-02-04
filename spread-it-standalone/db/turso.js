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

module.exports = { init, migrate, run, get, all };
