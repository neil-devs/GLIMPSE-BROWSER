-- ============================================================================
-- Migration 002: Add Row Level Security Policies
-- ============================================================================
-- Enables RLS on all user-facing tables and creates policies that ensure
-- users can only access their own data. Service-role key bypasses RLS.
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL USER-FACING TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prefetch_performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmark_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE browsing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_predictions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- ml_model_versions is public read — no RLS needed for reads, but protect writes
ALTER TABLE ml_model_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users cannot delete themselves directly (soft delete via account_status)
-- Insert is handled by the service role during signup

-- ============================================================================
-- USER_SESSIONS POLICIES
-- ============================================================================

CREATE POLICY sessions_select_own ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY sessions_insert_own ON user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_update_own ON user_sessions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_delete_own ON user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- USER_DEVICES POLICIES
-- ============================================================================

CREATE POLICY devices_select_own ON user_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY devices_insert_own ON user_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY devices_update_own ON user_devices
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY devices_delete_own ON user_devices
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- SEARCH_EVENTS POLICIES
-- ============================================================================

-- Users can see their own search events; anonymous events (user_id IS NULL)
-- are only accessible via service role
CREATE POLICY search_events_select_own ON search_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY search_events_insert ON search_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- RESULT_LINK_EVENTS POLICIES
-- ============================================================================

CREATE POLICY result_link_events_select_own ON result_link_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY result_link_events_insert ON result_link_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- PREFETCH_PERFORMANCE_LOG POLICIES
-- ============================================================================

CREATE POLICY prefetch_perf_select_own ON prefetch_performance_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY prefetch_perf_insert ON prefetch_performance_log
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- BOOKMARKS POLICIES
-- ============================================================================

CREATE POLICY bookmarks_select_own ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY bookmarks_insert_own ON bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarks_update_own ON bookmarks
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarks_delete_own ON bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- BOOKMARK_FOLDERS POLICIES
-- ============================================================================

CREATE POLICY bookmark_folders_select_own ON bookmark_folders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY bookmark_folders_insert_own ON bookmark_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmark_folders_update_own ON bookmark_folders
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmark_folders_delete_own ON bookmark_folders
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- BROWSING_HISTORY POLICIES
-- ============================================================================

CREATE POLICY history_select_own ON browsing_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY history_insert_own ON browsing_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY history_update_own ON browsing_history
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY history_delete_own ON browsing_history
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- DOWNLOADS POLICIES
-- ============================================================================

CREATE POLICY downloads_select_own ON downloads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY downloads_insert_own ON downloads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY downloads_update_own ON downloads
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY downloads_delete_own ON downloads
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- BROWSER_SETTINGS POLICIES
-- ============================================================================

CREATE POLICY settings_select_own ON browser_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY settings_insert_own ON browser_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY settings_update_own ON browser_settings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- ML_MODEL_VERSIONS POLICIES
-- Public read access (anyone can download models), writes via service role only
-- ============================================================================

CREATE POLICY ml_models_select_all ON ml_model_versions
  FOR SELECT USING (TRUE);

-- ============================================================================
-- ML_PREDICTIONS_LOG POLICIES
-- ============================================================================

CREATE POLICY ml_predictions_select_own ON ml_predictions_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY ml_predictions_insert ON ml_predictions_log
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- ACTIVITY_AUDIT_LOG POLICIES
-- Users can view their own audit logs; full access via service role
-- ============================================================================

CREATE POLICY audit_log_select_own ON activity_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Insert via service role only (no direct user inserts)

-- ============================================================================
-- SYNC_QUEUE POLICIES
-- ============================================================================

CREATE POLICY sync_queue_select_own ON sync_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY sync_queue_insert_own ON sync_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY sync_queue_update_own ON sync_queue
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY sync_queue_delete_own ON sync_queue
  FOR DELETE USING (auth.uid() = user_id);
