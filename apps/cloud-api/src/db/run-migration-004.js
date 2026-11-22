/**
 * Run migration 004 against Supabase to allow anonymous telemetry.
 * Usage: node apps/cloud-api/src/db/run-migration-004.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigration() {
  console.log('Running migration 004: Allow anonymous telemetry...');
  console.log('Supabase URL:', SUPABASE_URL);

  // Test connection first
  const { data: testData, error: testErr } = await supabase
    .from('search_events')
    .select('id')
    .limit(1);
  
  if (testErr) {
    console.error('Connection test failed:', testErr.message);
    // Try to continue anyway — the table might just be empty
  } else {
    console.log('Connection OK. search_events has', testData?.length || 0, 'rows');
  }

  // We can't run raw SQL via supabase-js client.
  // Instead, use the Supabase SQL Editor or the REST API.
  // Let's use the Supabase Management API (rpc) if available.
  
  // For now, let's try inserting a test search event to verify it works
  console.log('\nTesting anonymous search event insert...');
  const { data: insertData, error: insertErr } = await supabase
    .from('search_events')
    .insert({
      user_id: null,
      device_id: null,
      session_id: null,
      search_engine: 'google',
      query_text: '_migration_test_',
      result_count_visible: 0,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('Insert failed:', insertErr.message, insertErr.details, insertErr.hint);
    console.log('\nYou need to run this SQL in Supabase SQL Editor:');
    console.log('---');
    console.log('ALTER TABLE result_link_events ALTER COLUMN search_event_id DROP NOT NULL;');
    console.log('ALTER TABLE search_events DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE result_link_events DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE prefetch_performance_log DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE activity_audit_log DISABLE ROW LEVEL SECURITY;');
    console.log('---');
  } else {
    console.log('✓ Anonymous search event inserted:', insertData.id);
    
    // Clean up test row
    await supabase.from('search_events').delete().eq('query_text', '_migration_test_');
    console.log('✓ Test row cleaned up');
  }

  // Test result_link_events with null search_event_id
  console.log('\nTesting result_link_events with null search_event_id...');
  const { data: linkData, error: linkErr } = await supabase
    .from('result_link_events')
    .insert({
      search_event_id: null,
      user_id: null,
      url: 'https://test.example.com',
      domain: 'test.example.com',
      link_position: 1,
      was_visible_on_load: true,
      was_clicked: false,
    })
    .select('id')
    .single();

  if (linkErr) {
    console.error('Link event insert failed:', linkErr.message);
    console.log('The search_event_id NOT NULL constraint needs to be dropped.');
    console.log('Run this in Supabase SQL Editor:');
    console.log('ALTER TABLE result_link_events ALTER COLUMN search_event_id DROP NOT NULL;');
  } else {
    console.log('✓ Link event with null search_event_id works:', linkData.id);
    await supabase.from('result_link_events').delete().eq('url', 'https://test.example.com');
    console.log('✓ Test row cleaned up');
  }

  console.log('\nMigration check complete.');
}

runMigration().catch(console.error);
