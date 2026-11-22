-- ============================================================================
-- Migration 004: Allow anonymous telemetry
-- ============================================================================
-- Makes telemetry tables work without requiring user authentication.
-- This enables the desktop client to send telemetry data anonymously.
-- ============================================================================

-- Allow result_link_events without a search_event_id
ALTER TABLE result_link_events ALTER COLUMN search_event_id DROP NOT NULL;

-- Allow search_events without a user_id (already nullable in schema, but verify)
-- search_events.user_id is already UUID REFERENCES users(id) ON DELETE SET NULL (nullable)

-- Allow prefetch_performance_log without a user_id (already nullable)
-- prefetch_performance_log.user_id is already nullable

-- Disable RLS on telemetry tables so anonymous inserts work
ALTER TABLE search_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE result_link_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE prefetch_performance_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_audit_log DISABLE ROW LEVEL SECURITY;
