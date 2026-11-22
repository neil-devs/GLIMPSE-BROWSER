-- ============================================================================
-- Migration 004: Telemetry V2 & Model Infrastructure
-- ============================================================================
-- Enhances search and link events for privacy-preserving ML training,
-- enables batch telemetry ingestion, adds model evaluation tracking,
-- and creates model_field_stats.
-- ============================================================================

-- ── 1. search_events updates ───────────────────────────────────────────────

-- Drop generated column query_length before altering query_text
ALTER TABLE search_events DROP COLUMN IF EXISTS query_length;

-- Make query_text nullable (privacy by design: only query_features is stored)
ALTER TABLE search_events ALTER COLUMN query_text DROP NOT NULL;

-- Re-create query_length as plain SMALLINT
ALTER TABLE search_events ADD COLUMN IF NOT EXISTS query_length SMALLINT;

-- Add new telemetry fields to search_events
ALTER TABLE search_events
  ADD COLUMN IF NOT EXISTS install_id UUID,
  ADD COLUMN IF NOT EXISTS client_event_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS query_features JSONB,
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. result_link_events updates ──────────────────────────────────────────

-- Allow url to be nullable (only domain and coarse features need to be retained)
ALTER TABLE result_link_events ALTER COLUMN url DROP NOT NULL;
ALTER TABLE result_link_events ALTER COLUMN search_event_id DROP NOT NULL;

-- Add new telemetry & ranking fields to result_link_events
ALTER TABLE result_link_events
  ADD COLUMN IF NOT EXISTS client_event_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS tld VARCHAR(24),
  ADD COLUMN IF NOT EXISTS url_depth SMALLINT,
  ADD COLUMN IF NOT EXISTS link_text_length SMALLINT,
  ADD COLUMN IF NOT EXISTS first_visible_ms INTEGER,
  ADD COLUMN IF NOT EXISTS preload_state VARCHAR(12),
  ADD COLUMN IF NOT EXISTS click_class VARCHAR(24),
  ADD COLUMN IF NOT EXISTS ms_to_usable INTEGER,
  ADD COLUMN IF NOT EXISTS model_score REAL,
  ADD COLUMN IF NOT EXISTS model_rank SMALLINT,
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. ml_model_versions updates ───────────────────────────────────────────

ALTER TABLE ml_model_versions
  ADD COLUMN IF NOT EXISTS model_json JSONB,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS metrics JSONB,
  ADD COLUMN IF NOT EXISTS config JSONB,
  ADD COLUMN IF NOT EXISTS dataset_hash TEXT,
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT DEFAULT 2;

-- ── 4. model_field_stats table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_field_stats (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  install_id          UUID NOT NULL,
  model_version       VARCHAR(20) NOT NULL,
  day                 DATE NOT NULL DEFAULT CURRENT_DATE,
  searches            INTEGER NOT NULL DEFAULT 0,
  hits_top1           INTEGER NOT NULL DEFAULT 0,
  hits_top3           INTEGER NOT NULL DEFAULT 0,
  hits_top6           INTEGER NOT NULL DEFAULT 0,
  baseline_hits_top3  INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (install_id, model_version, day)
);

-- ── 5. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_search_events_install_id ON search_events(install_id);
CREATE INDEX IF NOT EXISTS idx_search_events_client_event_id ON search_events(client_event_id);
CREATE INDEX IF NOT EXISTS idx_search_events_searched_at ON search_events(searched_at);
CREATE INDEX IF NOT EXISTS idx_search_events_is_synthetic ON search_events(is_synthetic);

CREATE INDEX IF NOT EXISTS idx_result_links_client_event_id ON result_link_events(client_event_id);
CREATE INDEX IF NOT EXISTS idx_result_links_domain ON result_link_events(domain);
CREATE INDEX IF NOT EXISTS idx_result_links_was_clicked ON result_link_events(was_clicked);
CREATE INDEX IF NOT EXISTS idx_result_links_click_class ON result_link_events(click_class);
CREATE INDEX IF NOT EXISTS idx_result_links_is_synthetic ON result_link_events(is_synthetic);

CREATE INDEX IF NOT EXISTS idx_model_field_stats_lookup ON model_field_stats(install_id, model_version, day);

-- ── 6. RLS Policies ────────────────────────────────────────────────────────

ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_field_stats ENABLE ROW LEVEL SECURITY;

-- Allow anonymous ingestion and deletion by install_id
DROP POLICY IF EXISTS "telemetry_insert_search_events" ON search_events;
CREATE POLICY "telemetry_insert_search_events" ON search_events
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "telemetry_select_search_events" ON search_events;
CREATE POLICY "telemetry_select_search_events" ON search_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "telemetry_delete_search_events" ON search_events;
CREATE POLICY "telemetry_delete_search_events" ON search_events
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "telemetry_insert_link_events" ON result_link_events;
CREATE POLICY "telemetry_insert_link_events" ON result_link_events
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "telemetry_select_link_events" ON result_link_events;
CREATE POLICY "telemetry_select_link_events" ON result_link_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "telemetry_delete_link_events" ON result_link_events;
CREATE POLICY "telemetry_delete_link_events" ON result_link_events
  FOR DELETE USING (true);

DROP POLICY IF EXISTS "telemetry_stats_insert" ON model_field_stats;
CREATE POLICY "telemetry_stats_insert" ON model_field_stats
  FOR ALL USING (true) WITH CHECK (true);
