-- ============================================================================
-- GLIMPSE BROWSER — PostgreSQL Database Schema
-- ============================================================================
-- Complete schema for the Glimpse Browser cloud backend.
-- Designed for Supabase (PostgreSQL 15+) with Row Level Security.
--
-- Tables: 15
-- All tables use UUID primary keys, created_at/updated_at timestamps,
-- and have indexes on foreign keys and frequently queried columns.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE account_status_enum AS ENUM ('active', 'suspended', 'deleted');

CREATE TYPE search_engine_enum AS ENUM (
  'google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'yandex'
);

CREATE TYPE prefetch_status_enum AS ENUM ('success', 'failed', 'cancelled');

CREATE TYPE network_type_enum AS ENUM ('wifi', 'ethernet', 'cellular', 'unknown');

CREATE TYPE download_status_enum AS ENUM (
  'pending', 'in_progress', 'completed', 'failed', 'cancelled'
);

CREATE TYPE history_source_enum AS ENUM (
  'search_result', 'direct', 'bookmark', 'prefetch_click'
);

CREATE TYPE sync_entity_enum AS ENUM ('bookmarks', 'history', 'settings');

CREATE TYPE sync_operation_enum AS ENUM ('create', 'update', 'delete');

CREATE TYPE model_type_enum AS ENUM ('click_predictor');

CREATE TYPE prefetch_aggressiveness_enum AS ENUM (
  'conservative', 'balanced', 'aggressive'
);

CREATE TYPE audit_action_enum AS ENUM (
  'USER_SIGNUP', 'USER_LOGIN', 'USER_LOGOUT', 'USER_PASSWORD_CHANGE',
  'USER_ACCOUNT_DELETED', 'DEVICE_REGISTERED', 'DEVICE_TRUSTED',
  'DEVICE_REMOVED', 'BOOKMARK_CREATED', 'BOOKMARK_UPDATED',
  'BOOKMARK_DELETED', 'SETTINGS_UPDATED', 'SYNC_TRIGGERED',
  'SYNC_COMPLETED', 'SYNC_FAILED', 'MODEL_DOWNLOADED',
  'TELEMETRY_SUBMITTED', 'SESSION_EXPIRED', 'RATE_LIMIT_HIT',
  'SUSPICIOUS_ACTIVITY_FLAGGED'
);

-- ============================================================================
-- 1. users
-- ============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(320) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  avatar_url      VARCHAR(2048),
  account_status  account_status_enum NOT NULL DEFAULT 'active',
  last_login_at   TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. user_sessions
-- ============================================================================

CREATE TABLE user_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       UUID,   -- FK added after user_devices table
  device_name     VARCHAR(255),
  device_os       VARCHAR(100),
  device_arch     VARCHAR(50),
  app_version     VARCHAR(20),
  ip_address      INET,
  country         VARCHAR(100),
  city            VARCHAR(100),
  session_token   VARCHAR(255) NOT NULL,  -- SHA-256 hash
  refresh_token   VARCHAR(255) NOT NULL,  -- SHA-256 hash
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. user_devices
-- ============================================================================

CREATE TABLE user_devices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint  VARCHAR(255) NOT NULL,
  device_name         VARCHAR(255),
  device_os           VARCHAR(100),
  device_arch         VARCHAR(50),
  screen_resolution   VARCHAR(20),
  app_version         VARCHAR(20),
  is_trusted          BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_fingerprint)
);

-- Add FK from user_sessions to user_devices now that the table exists
ALTER TABLE user_sessions
  ADD CONSTRAINT fk_user_sessions_device
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. search_events
-- ============================================================================

CREATE TABLE search_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id             UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  session_id            UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  search_engine         search_engine_enum NOT NULL,
  query_text            VARCHAR(500) NOT NULL,
  query_length          SMALLINT NOT NULL GENERATED ALWAYS AS (LENGTH(query_text)) STORED,
  result_count_visible  SMALLINT NOT NULL DEFAULT 0,
  screen_resolution     VARCHAR(20),
  window_width          SMALLINT,
  window_height         SMALLINT,
  searched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. result_link_events
-- ============================================================================

CREATE TABLE result_link_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_event_id       UUID NOT NULL REFERENCES search_events(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  url                   VARCHAR(2048) NOT NULL,
  domain                VARCHAR(255) NOT NULL,
  link_position         SMALLINT NOT NULL CHECK (link_position >= 1),
  was_visible_on_load   BOOLEAN NOT NULL DEFAULT FALSE,
  was_prefetched        BOOLEAN NOT NULL DEFAULT FALSE,
  prefetch_started_at   TIMESTAMPTZ,
  prefetch_completed_at TIMESTAMPTZ,
  prefetch_duration_ms  INTEGER,
  was_clicked           BOOLEAN NOT NULL DEFAULT FALSE,
  clicked_at            TIMESTAMPTZ,
  page_load_time_ms     INTEGER,
  cache_hit             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. prefetch_performance_log
-- ============================================================================

CREATE TABLE prefetch_performance_log (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id               UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  url                     VARCHAR(2048) NOT NULL,
  domain                  VARCHAR(255) NOT NULL,
  engine                  search_engine_enum NOT NULL,
  prefetch_triggered_at   TIMESTAMPTZ NOT NULL,
  prefetch_completed_at   TIMESTAMPTZ,
  bytes_transferred       BIGINT DEFAULT 0,
  status                  prefetch_status_enum NOT NULL,
  failure_reason          VARCHAR(500),
  network_type            network_type_enum DEFAULT 'unknown',
  available_bandwidth_mbps REAL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. bookmark_folders (created before bookmarks for FK reference)
-- ============================================================================

CREATE TABLE bookmark_folders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  parent_folder_id  UUID REFERENCES bookmark_folders(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. bookmarks
-- ============================================================================

CREATE TABLE bookmarks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(500) NOT NULL,
  url             VARCHAR(2048) NOT NULL,
  favicon_url     VARCHAR(2048),
  folder_id       UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  is_synced       BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. browsing_history
-- ============================================================================

CREATE TABLE browsing_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  url             VARCHAR(2048) NOT NULL,
  title           VARCHAR(500),
  favicon_url     VARCHAR(2048),
  visit_count     INTEGER NOT NULL DEFAULT 1,
  last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          history_source_enum DEFAULT 'direct',
  search_event_id UUID REFERENCES search_events(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. downloads
-- ============================================================================

CREATE TABLE downloads (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id           UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  url                 VARCHAR(2048) NOT NULL,
  filename            VARCHAR(500) NOT NULL,
  file_size_bytes     BIGINT,
  mime_type           VARCHAR(255),
  save_path           VARCHAR(1024),
  status              download_status_enum NOT NULL DEFAULT 'pending',
  bytes_downloaded    BIGINT NOT NULL DEFAULT 0,
  download_speed_bps  BIGINT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. browser_settings
-- ============================================================================

CREATE TABLE browser_settings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_search_engine       search_engine_enum NOT NULL DEFAULT 'google',
  prefetch_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  prefetch_aggressiveness     prefetch_aggressiveness_enum NOT NULL DEFAULT 'balanced',
  prefetch_on_metered_network BOOLEAN NOT NULL DEFAULT FALSE,
  cache_size_limit_mb         INTEGER NOT NULL DEFAULT 500,
  history_retention_days      INTEGER NOT NULL DEFAULT 90,
  theme                       VARCHAR(10) NOT NULL DEFAULT 'system'
                              CHECK (theme IN ('light', 'dark', 'system')),
  language                    VARCHAR(10) NOT NULL DEFAULT 'en',
  zoom_level                  REAL NOT NULL DEFAULT 1.0,
  block_ads                   BOOLEAN NOT NULL DEFAULT FALSE,
  block_trackers              BOOLEAN NOT NULL DEFAULT FALSE,
  hardware_acceleration       BOOLEAN NOT NULL DEFAULT TRUE,
  javascript_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 12. ml_model_versions
-- ============================================================================

CREATE TABLE ml_model_versions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_string        VARCHAR(20) NOT NULL,
  model_type            model_type_enum NOT NULL DEFAULT 'click_predictor',
  training_data_count   INTEGER NOT NULL DEFAULT 0,
  accuracy_score        REAL,
  precision_score       REAL,
  recall_score          REAL,
  f1_score              REAL,
  auc_roc_score         REAL,
  model_file_path       VARCHAR(1024),
  model_file_size_bytes BIGINT,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  trained_at            TIMESTAMPTZ,
  deployed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. ml_predictions_log
-- ============================================================================

CREATE TABLE ml_predictions_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id           UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  model_version_id    UUID NOT NULL REFERENCES ml_model_versions(id) ON DELETE CASCADE,
  search_event_id     UUID NOT NULL REFERENCES search_events(id) ON DELETE CASCADE,
  predicted_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_clicked_url  VARCHAR(2048),
  prediction_correct  BOOLEAN,
  inference_time_ms   INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 14. activity_audit_log
-- ============================================================================

CREATE TABLE activity_audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type     audit_action_enum NOT NULL,
  entity_type     VARCHAR(100),
  entity_id       VARCHAR(255),
  ip_address      INET,
  user_agent      TEXT,
  device_id       UUID,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 15. sync_queue
-- ============================================================================

CREATE TABLE sync_queue (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id             UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  entity_type           sync_entity_enum NOT NULL,
  operation             sync_operation_enum NOT NULL,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at             TIMESTAMPTZ,
  conflict_detected     BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_resolved_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables that have an updated_at column
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_bookmark_folders_updated_at
  BEFORE UPDATE ON bookmark_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_browser_settings_updated_at
  BEFORE UPDATE ON browser_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PRIMARY INDEXES (on FKs and common WHERE-clause columns)
-- ============================================================================

-- user_sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_device_id ON user_sessions(device_id);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- user_devices
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_fingerprint ON user_devices(user_id, device_fingerprint);

-- search_events
CREATE INDEX idx_search_events_user_id ON search_events(user_id);
CREATE INDEX idx_search_events_device_id ON search_events(device_id);
CREATE INDEX idx_search_events_session_id ON search_events(session_id);
CREATE INDEX idx_search_events_searched_at ON search_events(searched_at);
CREATE INDEX idx_search_events_engine ON search_events(search_engine);

-- result_link_events
CREATE INDEX idx_result_link_events_search_id ON result_link_events(search_event_id);
CREATE INDEX idx_result_link_events_user_id ON result_link_events(user_id);
CREATE INDEX idx_result_link_events_clicked ON result_link_events(was_clicked) WHERE was_clicked = TRUE;
CREATE INDEX idx_result_link_events_prefetched ON result_link_events(was_prefetched) WHERE was_prefetched = TRUE;
CREATE INDEX idx_result_link_events_created_at ON result_link_events(created_at);
CREATE INDEX idx_result_link_events_domain ON result_link_events(domain);

-- prefetch_performance_log
CREATE INDEX idx_prefetch_perf_user_id ON prefetch_performance_log(user_id);
CREATE INDEX idx_prefetch_perf_device_id ON prefetch_performance_log(device_id);
CREATE INDEX idx_prefetch_perf_status ON prefetch_performance_log(status);
CREATE INDEX idx_prefetch_perf_created_at ON prefetch_performance_log(created_at);

-- bookmarks
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_folder_id ON bookmarks(folder_id);
CREATE INDEX idx_bookmarks_position ON bookmarks(user_id, folder_id, position);

-- bookmark_folders
CREATE INDEX idx_bookmark_folders_user_id ON bookmark_folders(user_id);
CREATE INDEX idx_bookmark_folders_parent ON bookmark_folders(parent_folder_id);

-- browsing_history
CREATE INDEX idx_browsing_history_user_id ON browsing_history(user_id);
CREATE INDEX idx_browsing_history_device_id ON browsing_history(device_id);
CREATE INDEX idx_browsing_history_url ON browsing_history(user_id, url);
CREATE INDEX idx_browsing_history_last_visited ON browsing_history(last_visited_at);
CREATE INDEX idx_browsing_history_search_event ON browsing_history(search_event_id);

-- downloads
CREATE INDEX idx_downloads_user_id ON downloads(user_id);
CREATE INDEX idx_downloads_device_id ON downloads(device_id);
CREATE INDEX idx_downloads_status ON downloads(status);
CREATE INDEX idx_downloads_created_at ON downloads(created_at);

-- browser_settings (user_id is already UNIQUE, acts as index)

-- ml_model_versions
CREATE INDEX idx_ml_models_active ON ml_model_versions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_ml_models_version ON ml_model_versions(version_string);

-- ml_predictions_log
CREATE INDEX idx_ml_predictions_user_id ON ml_predictions_log(user_id);
CREATE INDEX idx_ml_predictions_model ON ml_predictions_log(model_version_id);
CREATE INDEX idx_ml_predictions_search ON ml_predictions_log(search_event_id);
CREATE INDEX idx_ml_predictions_correct ON ml_predictions_log(prediction_correct);

-- activity_audit_log
CREATE INDEX idx_audit_log_user_id ON activity_audit_log(user_id);
CREATE INDEX idx_audit_log_action ON activity_audit_log(action_type);
CREATE INDEX idx_audit_log_created_at ON activity_audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON activity_audit_log(entity_type, entity_id);

-- sync_queue
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_queue_device_id ON sync_queue(device_id);
CREATE INDEX idx_sync_queue_pending ON sync_queue(synced_at) WHERE synced_at IS NULL;
CREATE INDEX idx_sync_queue_entity ON sync_queue(entity_type);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);
