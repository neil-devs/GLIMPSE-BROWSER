/**
 * Verification script to inspect live activity in your Supabase cloud database.
 * Run anytime: node scripts/check-cloud-db.js
 */
'use strict';

const https = require('https');

const SUPABASE_HOST = 'hzeaygkwuszvbsrsntgf.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZWF5Z2t3dXN6dmJzcnNudGdmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTc0MzcxMywiZXhwIjoyMTA1MzE5NzEzfQ.DuZMc3xy_ea92lDec1-2zN5EoYU2UBBorSmgtJOZhoo';

function fetchTable(table, query = '') {
  return new Promise((resolve) => {
    const path = `/rest/v1/${table}?${query}`;
    const req = https.request(
      {
        hostname: SUPABASE_HOST,
        port: 443,
        path,
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'count=exact',
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let rows = [];
          try {
            rows = JSON.parse(body);
          } catch {}
          const count = res.headers['content-range'] || rows.length;
          resolve({ table, count, rows });
        });
      }
    );
    req.on('error', () => resolve({ table, count: 0, rows: [] }));
    req.end();
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('   GLIMPSE BROWSER — LIVE SUPABASE CLOUD ACTIVITY     ');
  console.log('======================================================\n');

  const tables = [
    { name: 'search_events', sort: 'searched_at', display: (r) => `[${r.search_engine}] query="${r.query_text}" (${r.searched_at})` },
    { name: 'result_link_events', sort: 'created_at', display: (r) => `pos=${r.link_position} clicked=${r.was_clicked} cache_hit=${r.cache_hit} url=${r.url.slice(0, 50)}...` },
    { name: 'prefetch_performance_log', sort: 'prefetch_triggered_at', display: (r) => `status=${r.status} bytes=${r.bytes_transferred} url=${r.url.slice(0, 50)}...` },
    { name: 'browsing_history', sort: 'last_visited_at', display: (r) => `"${r.title || 'No title'}" -> ${r.url.slice(0, 50)} (${r.last_visited_at})` },
    { name: 'bookmarks', sort: 'created_at', display: (r) => `"${r.title}" -> ${r.url.slice(0, 50)}` },
    { name: 'downloads', sort: 'created_at', display: (r) => `${r.filename} (${r.status}, ${r.bytes_downloaded} bytes)` },
    { name: 'activity_audit_log', sort: 'created_at', display: (r) => `action=${r.action_type} at ${r.created_at}` },
  ];

  for (const t of tables) {
    const { count, rows } = await fetchTable(t.name, `order=${t.sort}.desc&limit=3`);
    console.log(`📌 TABLE: ${t.name.toUpperCase()} (Total: ${count})`);
    if (rows && rows.length > 0) {
      rows.forEach((r, i) => console.log(`   ${i + 1}. ${t.display(r)}`));
    } else {
      console.log('   (No rows yet)');
    }
    console.log('');
  }
  console.log('======================================================\n');
}

main().catch(console.error);
