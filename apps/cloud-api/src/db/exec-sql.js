/**
 * Execute raw SQL on Supabase using the rpc endpoint or direct REST call.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function runSQL(sql) {
  // Use Supabase's /rest/v1/rpc endpoint or the management API
  // The supabase-js client doesn't support raw SQL, but we can use
  // the PostgreSQL REST API directly with the service key
  const url = `${SUPABASE_URL}/rest/v1/rpc/`;
  
  // Try using fetch to call a custom function, or use the SQL API
  // Actually, the simplest way is to use the Supabase SQL endpoint
  const sqlUrl = `${SUPABASE_URL}/rest/v1/`;
  
  console.log('Attempting to alter table via Supabase...');
  console.log('SQL:', sql);
  
  // We'll try the pg_query approach via a temporary function
  // But first, let's just see if we can use the supabase query API
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });

  // Try rpc approach - call a SQL function if one exists
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
  
  if (error) {
    console.log('RPC exec_sql not available:', error.message);
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  MANUAL STEP REQUIRED - Run in Supabase SQL Editor:     ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║                                                          ║');
    console.log('║  ALTER TABLE result_link_events                         ║');
    console.log('║    ALTER COLUMN search_event_id DROP NOT NULL;           ║');
    console.log('║                                                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    
    // Workaround: skip link events that don't have a search_event_id
    // We'll make the controller handle this gracefully
    return false;
  }
  
  console.log('SQL executed successfully:', data);
  return true;
}

runSQL('ALTER TABLE result_link_events ALTER COLUMN search_event_id DROP NOT NULL;')
  .then((ok) => { if (ok) console.log('Done!'); })
  .catch(console.error);
