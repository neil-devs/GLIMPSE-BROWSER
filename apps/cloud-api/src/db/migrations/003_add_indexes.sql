-- ============================================================================
-- Migration 003: Performance Indexes
-- ============================================================================
-- Additional composite and partial indexes beyond the primary FK indexes
-- created in 001_init.sql, targeting specific query patterns.
-- ============================================================================

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- User login lookup: email + account_status
CREATE INDEX IF NOT EXISTS idx_users_email_status
  ON users(email, account_status);

-- Active sessions for a user (session validation on every request)
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user
  ON user_sessions(user_id, is_active, expires_at)
  WHERE is_active = TRUE;

-- Refresh token lookup (used during token refresh)
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_active
  ON user_sessions(refresh_token, is_active)
  WHERE is_active = TRUE;

-- Device lookup by user + fingerprint (device registration/update)
CREATE INDEX IF NOT EXISTS idx_user_devices_lookup
  ON user_devices(user_id, device_fingerprint);

-- Search events time-range queries (training data fetching, telemetry cleanup)
CREATE INDEX IF NOT EXISTS idx_search_events_user_time
  ON search_events(user_id, searched_at DESC);

-- Result link events for ML training: prefetched links with known click status
CREATE INDEX IF NOT EXISTS idx_result_link_events_training
  ON result_link_events(was_prefetched, was_clicked, created_at)
  WHERE was_prefetched = TRUE;

-- Result link events domain analysis
CREATE INDEX IF NOT EXISTS idx_result_link_events_domain_clicked
  ON result_link_events(domain, was_clicked);

-- Bookmarks ordered by folder and position (tree rendering)
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_folder_pos
  ON bookmarks(user_id, folder_id, position);

-- Bookmark folders ordered by parent and position (tree rendering)
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user_parent_pos
  ON bookmark_folders(user_id, parent_folder_id, position);

-- Browsing history: recent history per user (most common query)
CREATE INDEX IF NOT EXISTS idx_browsing_history_user_recent
  ON browsing_history(user_id, last_visited_at DESC);

-- Browsing history: URL deduplication lookup
CREATE INDEX IF NOT EXISTS idx_browsing_history_user_url
  ON browsing_history(user_id, url);

-- Downloads: recent downloads per user
CREATE INDEX IF NOT EXISTS idx_downloads_user_recent
  ON downloads(user_id, created_at DESC);

-- Prefetch performance: time-range cleanup queries
CREATE INDEX IF NOT EXISTS idx_prefetch_perf_time
  ON prefetch_performance_log(created_at);

-- Audit log: time-range cleanup queries
CREATE INDEX IF NOT EXISTS idx_audit_log_time
  ON activity_audit_log(created_at);

-- Sync queue: pending items per user (sync status check)
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_pending
  ON sync_queue(user_id, entity_type, created_at)
  WHERE synced_at IS NULL;

-- Sync queue: conflicts needing resolution
CREATE INDEX IF NOT EXISTS idx_sync_queue_conflicts
  ON sync_queue(user_id, conflict_detected)
  WHERE conflict_detected = TRUE AND conflict_resolved_at IS NULL;

-- ML model versions: find active model quickly
CREATE INDEX IF NOT EXISTS idx_ml_model_active_version
  ON ml_model_versions(is_active, model_type)
  WHERE is_active = TRUE;

-- ML predictions: accuracy analysis per model version
CREATE INDEX IF NOT EXISTS idx_ml_predictions_model_correct
  ON ml_predictions_log(model_version_id, prediction_correct);

-- ============================================================================
-- FULL TEXT SEARCH INDEXES
-- ============================================================================

-- Browsing history full-text search on URL and title
CREATE INDEX IF NOT EXISTS idx_browsing_history_fts
  ON browsing_history
  USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || url));

-- Bookmarks full-text search on title and URL
CREATE INDEX IF NOT EXISTS idx_bookmarks_fts
  ON bookmarks
  USING gin(to_tsvector('english', title || ' ' || url));
