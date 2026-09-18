/**
 * @fileoverview Supabase client singleton.
 * Provides two clients:
 *   - supabase: service-role key (bypasses RLS, used for server-side ops)
 *   - supabaseAnon: anon key (respects RLS, used for user-context ops)
 * @module cloud-api/db/client
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY environment variable is required');
}

/**
 * Service-role Supabase client.
 * Bypasses RLS — use for administrative operations, background jobs,
 * and any server-side query that doesn't act on behalf of a specific user.
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client': 'glimpse-cloud-api',
    },
  },
});

/**
 * Anonymous Supabase client.
 * Respects RLS — use when performing operations in a user's context.
 * Note: For the cloud-api server, most operations use the service-role
 * client since we handle auth ourselves via JWT middleware.
 */
const supabaseAnon = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    })
  : null;

/**
 * Test database connectivity by running a simple query.
 * @returns {Promise<boolean>} True if connection is healthy
 */
async function testConnection() {
  try {
    const start = Date.now();
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      logger.error('Database connection test failed', {
        error: error.message,
        code: error.code,
      });
      return false;
    }

    logger.info('Database connection verified', { latencyMs });
    return true;
  } catch (err) {
    logger.error('Database connection test threw exception', {
      error: err.message,
    });
    return false;
  }
}

/**
 * Get database latency by timing a lightweight query.
 * @returns {Promise<number>} Latency in milliseconds, or -1 on failure
 */
async function getDbLatency() {
  try {
    const start = Date.now();
    await supabase.from('users').select('id').limit(1);
    return Date.now() - start;
  } catch {
    return -1;
  }
}

module.exports = {
  supabase,
  supabaseAnon,
  testConnection,
  getDbLatency,
};
