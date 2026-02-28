#!/usr/bin/env node
// Simple CLI to test a list of media URLs against /api/check-url on local server
// Usage: node tools/check_urls.js url1 url2 ...

const base = process.env.SI_BASE || 'http://localhost:3000';
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.log('Usage: node tools/check_urls.js <url1> <url2> ...');
  process.exit(1);
}

async function check(u) {
  try {
    const res = await fetch(base + '/api/check-url?url=' + encodeURIComponent(u));
    const data = await res.json();
    console.log('URL:', u);
    console.log(JSON.stringify(data, null, 2));
    console.log('---');
  } catch (e) {
    console.error('Error checking', u, e.message);
  }
}

(async () => {
  for (const u of urls) {
    // small delay to avoid hammering
    await check(u);
  }
})();
