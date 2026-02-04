#!/usr/bin/env node
// Batch insert resources into Turso (libSQL) or via HTTP endpoint
// Usage: node batch_insert_resources.js [path/to/resources.json]

const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function insertViaLibSQL(items) {
  const { createClient } = require('@libsql/client');
  const url = process.env.TURSO_LIBSQL_URL;
  const token = process.env.TURSO_LIBSQL_TOKEN;
  if (!url || !token) throw new Error('TURSO_LIBSQL_URL or TURSO_LIBSQL_TOKEN missing');
  const client = createClient({ url, auth: { token } });

  for (const it of items) {
    const now = Date.now();
    await client.execute('INSERT OR REPLACE INTO resources (id, categoryId, name, payload, created_at) VALUES (?, ?, ?, ?, ?)', [
      it.id,
      process.env.TURSO_SOCIAL_CATEGORY_ID || '1770190320',
      it.name,
      JSON.stringify(it.payload || {}),
      now
    ]);
    console.log('inserted libsql', it.id);
  }
}

async function insertViaHttp(items) {
  const server = process.env.SERVER_URL || 'http://localhost:3000';
  for (const it of items) {
    try {
      const res = await axios.post(`${server.replace(/\/$/, '')}/api/turso/resource`, {
        id: it.id,
        name: it.name,
        payload: it.payload || {}
      }, { timeout: 10000 });
      console.log('inserted http', it.id, '->', res.data && res.data.method);
    } catch (e) {
      console.error('http insert failed for', it.id, e.message || e);
    }
  }
}

async function main() {
  const arg = process.argv[2] || path.join(__dirname, 'resources.json');
  if (!fs.existsSync(arg)) {
    console.error('File not found:', arg);
    process.exit(1);
  }
  const raw = fs.readFileSync(arg, 'utf8');
  let items = [];
  try { items = JSON.parse(raw); } catch (e) { console.error('Invalid JSON'); process.exit(2); }

  if (!Array.isArray(items)) { console.error('JSON must be an array of resources'); process.exit(3); }

  if (process.env.TURSO_LIBSQL_URL && process.env.TURSO_LIBSQL_TOKEN) {
    console.log('Using libSQL insertion');
    await insertViaLibSQL(items);
  } else {
    console.log('Using HTTP endpoint insertion (SERVER_URL=' + (process.env.SERVER_URL || 'http://localhost:3000') + ')');
    await insertViaHttp(items);
  }

  console.log('Done');
}

main().catch(err => { console.error('Fatal:', err && err.message ? err.message : err); process.exit(10); });
