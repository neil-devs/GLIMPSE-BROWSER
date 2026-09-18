-- ============================================================================
-- Development Seed Data
-- ============================================================================
-- Realistic test data for local development. Creates 3 users with
-- devices, sessions, bookmarks, history, settings, and sample telemetry.
--
-- Passwords are all 'TestPass1!' hashed with bcryptjs (12 rounds).
-- These hashes are pre-computed so the seed file is pure SQL.
-- ============================================================================

-- Clear existing seed data (in reverse FK order)
TRUNCATE sync_queue, ml_predictions_log, activity_audit_log,
         prefetch_performance_log, result_link_events, search_events,
         downloads, browsing_history, bookmarks, bookmark_folders,
         browser_settings, user_sessions, user_devices, ml_model_versions,
         users CASCADE;

-- ============================================================================
-- USERS
-- bcrypt hash of 'TestPass1!' with 12 salt rounds
-- ============================================================================

INSERT INTO users (id, email, password_hash, display_name, avatar_url, account_status, last_login_at, last_seen_at) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'alice@example.com',
   '$2a$12$LJ3m5ZkAGZ3rHPqOJmV8gu8h5d6kRqGFvXpJ2V1sWnKfXs6lZ4L2e',
   'Alice Chen', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
   'active', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '5 minutes'),

  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'bob@example.com',
   '$2a$12$LJ3m5ZkAGZ3rHPqOJmV8gu8h5d6kRqGFvXpJ2V1sWnKfXs6lZ4L2e',
   'Bob Martinez', 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
   'active', NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 hours'),

  ('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'carol@example.com',
   '$2a$12$LJ3m5ZkAGZ3rHPqOJmV8gu8h5d6kRqGFvXpJ2V1sWnKfXs6lZ4L2e',
   'Carol Williams', 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol',
   'active', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '1 hour');

-- ============================================================================
-- USER DEVICES
-- ============================================================================

INSERT INTO user_devices (id, user_id, device_fingerprint, device_name, device_os, device_arch, screen_resolution, app_version, is_trusted) VALUES
  ('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'fp_alice_win_desktop', 'Alice Desktop', 'Windows 11', 'x64', '1920x1080', '1.0.0', TRUE),

  ('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'fp_alice_mac_laptop', 'Alice MacBook', 'macOS 14', 'arm64', '2560x1600', '1.0.0', TRUE),

  ('f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'fp_bob_win_laptop', 'Bob Laptop', 'Windows 10', 'x64', '1366x768', '1.0.0', TRUE),

  ('a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
   'fp_carol_linux_desktop', 'Carol Workstation', 'Ubuntu 22.04', 'x64', '3840x2160', '1.0.0', FALSE);

-- ============================================================================
-- USER SESSIONS
-- ============================================================================

INSERT INTO user_sessions (id, user_id, device_id, device_name, device_os, device_arch, app_version, ip_address, country, city, session_token, refresh_token, is_active, expires_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Alice Desktop', 'Windows 11', 'x64',
   '1.0.0', '192.168.1.10', 'United States', 'San Francisco',
   'hashed_session_token_alice_1', 'hashed_refresh_token_alice_1',
   TRUE, NOW() + INTERVAL '7 days'),

  ('22222222-2222-4222-8222-222222222222', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', 'Bob Laptop', 'Windows 10', 'x64',
   '1.0.0', '10.0.0.55', 'United Kingdom', 'London',
   'hashed_session_token_bob_1', 'hashed_refresh_token_bob_1',
   TRUE, NOW() + INTERVAL '5 days');

-- ============================================================================
-- BOOKMARK FOLDERS
-- ============================================================================

INSERT INTO bookmark_folders (id, user_id, name, parent_folder_id, position) VALUES
  ('f0000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'Development', NULL, 0),
  ('f0000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'News', NULL, 1),
  ('f0000003-0000-4000-8000-000000000003', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'JavaScript', 'f0000001-0000-4000-8000-000000000001', 0),
  ('f0000004-0000-4000-8000-000000000004', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'Research', NULL, 0);

-- ============================================================================
-- BOOKMARKS
-- ============================================================================

INSERT INTO bookmarks (id, user_id, title, url, favicon_url, folder_id, position, is_synced) VALUES
  ('b0000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'MDN Web Docs', 'https://developer.mozilla.org', 'https://developer.mozilla.org/favicon.ico',
   'f0000001-0000-4000-8000-000000000001', 0, TRUE),

  ('b0000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'GitHub', 'https://github.com', 'https://github.com/favicon.ico',
   'f0000001-0000-4000-8000-000000000001', 1, TRUE),

  ('b0000003-0000-4000-8000-000000000003', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'Node.js Docs', 'https://nodejs.org/docs/latest/api/', 'https://nodejs.org/favicon.ico',
   'f0000003-0000-4000-8000-000000000003', 0, TRUE),

  ('b0000004-0000-4000-8000-000000000004', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'Hacker News', 'https://news.ycombinator.com', 'https://news.ycombinator.com/favicon.ico',
   'f0000002-0000-4000-8000-000000000002', 0, TRUE),

  ('b0000005-0000-4000-8000-000000000005', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'Wikipedia', 'https://en.wikipedia.org', 'https://en.wikipedia.org/favicon.ico',
   'f0000004-0000-4000-8000-000000000004', 0, TRUE),

  ('b0000006-0000-4000-8000-000000000006', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'Stack Overflow', 'https://stackoverflow.com', 'https://stackoverflow.com/favicon.ico',
   NULL, 0, FALSE);

-- ============================================================================
-- BROWSER SETTINGS
-- ============================================================================

INSERT INTO browser_settings (user_id, default_search_engine, prefetch_enabled, prefetch_aggressiveness, theme, language) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'google', TRUE, 'aggressive', 'dark', 'en'),
  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'duckduckgo', TRUE, 'balanced', 'system', 'en'),
  ('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'bing', TRUE, 'conservative', 'light', 'en');

-- ============================================================================
-- SEARCH EVENTS
-- ============================================================================

INSERT INTO search_events (id, user_id, device_id, session_id, search_engine, query_text, result_count_visible, screen_resolution, window_width, window_height, searched_at) VALUES
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', '11111111-1111-4111-8111-111111111111',
   'google', 'electron browser development tutorial', 5, '1920x1080', 1920, 1080,
   NOW() - INTERVAL '2 hours'),

  ('se000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', '11111111-1111-4111-8111-111111111111',
   'google', 'intersection observer API MDN', 4, '1920x1080', 1920, 1080,
   NOW() - INTERVAL '1 hour'),

  ('se000003-0000-4000-8000-000000000003', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c', '22222222-2222-4222-8222-222222222222',
   'duckduckgo', 'postgresql row level security best practices', 6, '1366x768', 1366, 768,
   NOW() - INTERVAL '30 minutes');

-- ============================================================================
-- RESULT LINK EVENTS
-- ============================================================================

INSERT INTO result_link_events (search_event_id, user_id, url, domain, link_position, was_visible_on_load, was_prefetched, was_clicked, prefetch_duration_ms, page_load_time_ms) VALUES
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://www.electronjs.org/docs/latest/', 'electronjs.org', 1, TRUE, TRUE, TRUE, 450, NULL),
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://github.com/nicedayfor/electron-sample-browser', 'github.com', 2, TRUE, TRUE, FALSE, 680, NULL),
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://www.youtube.com/watch?v=abc123', 'youtube.com', 3, TRUE, TRUE, FALSE, 920, NULL),
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://medium.com/electron-browser-guide', 'medium.com', 4, TRUE, FALSE, FALSE, NULL, 1200),
  ('se000001-0000-4000-8000-000000000001', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://stackoverflow.com/questions/12345', 'stackoverflow.com', 5, TRUE, FALSE, FALSE, NULL, 980),

  ('se000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API', 'developer.mozilla.org', 1, TRUE, TRUE, TRUE, 320, NULL),
  ('se000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://www.w3schools.com/jsref/api_intersectionobserver.asp', 'w3schools.com', 2, TRUE, TRUE, FALSE, 550, NULL),
  ('se000002-0000-4000-8000-000000000002', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
   'https://web.dev/articles/intersectionobserver', 'web.dev', 3, TRUE, FALSE, FALSE, NULL, 780),

  ('se000003-0000-4000-8000-000000000003', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'https://www.postgresql.org/docs/current/ddl-rowsecurity.html', 'postgresql.org', 1, TRUE, TRUE, FALSE, 400, NULL),
  ('se000003-0000-4000-8000-000000000003', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
   'https://supabase.com/docs/guides/auth/row-level-security', 'supabase.com', 2, TRUE, TRUE, TRUE, 380, NULL);

-- ============================================================================
-- BROWSING HISTORY
-- ============================================================================

INSERT INTO browsing_history (user_id, device_id, url, title, favicon_url, visit_count, last_visited_at, source, search_event_id) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
   'https://www.electronjs.org/docs/latest/', 'Electron Documentation', 'https://www.electronjs.org/favicon.ico',
   3, NOW() - INTERVAL '2 hours', 'search_result', 'se000001-0000-4000-8000-000000000001'),

  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
   'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API',
   'IntersectionObserver API - MDN', 'https://developer.mozilla.org/favicon.ico',
   5, NOW() - INTERVAL '1 hour', 'search_result', 'se000002-0000-4000-8000-000000000002'),

  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
   'https://github.com', 'GitHub', 'https://github.com/favicon.ico',
   12, NOW() - INTERVAL '30 minutes', 'bookmark', NULL),

  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
   'https://supabase.com/docs/guides/auth/row-level-security',
   'Row Level Security | Supabase Docs', 'https://supabase.com/favicon.ico',
   1, NOW() - INTERVAL '25 minutes', 'search_result', 'se000003-0000-4000-8000-000000000003'),

  ('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d',
   'https://www.google.com', 'Google', 'https://www.google.com/favicon.ico',
   25, NOW() - INTERVAL '1 hour', 'direct', NULL);

-- ============================================================================
-- ML MODEL VERSION (baseline model)
-- ============================================================================

INSERT INTO ml_model_versions (id, version_string, model_type, training_data_count, accuracy_score, precision_score, recall_score, f1_score, auc_roc_score, model_file_path, model_file_size_bytes, is_active, trained_at, deployed_at) VALUES
  ('m0000001-0000-4000-8000-000000000001', '0.1.0', 'click_predictor', 500,
   0.72, 0.68, 0.75, 0.71, 0.78,
   'models/latest.json', 4096, TRUE, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days');

-- ============================================================================
-- ACTIVITY AUDIT LOG
-- ============================================================================

INSERT INTO activity_audit_log (user_id, action_type, entity_type, entity_id, ip_address, metadata) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'USER_SIGNUP', 'user', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '192.168.1.10', '{"source": "desktop_app"}'),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'USER_LOGIN', 'session', '11111111-1111-4111-8111-111111111111', '192.168.1.10', '{"device": "Alice Desktop"}'),
  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'USER_SIGNUP', 'user', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '10.0.0.55', '{"source": "desktop_app"}'),
  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'USER_LOGIN', 'session', '22222222-2222-4222-8222-222222222222', '10.0.0.55', '{"device": "Bob Laptop"}'),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'SETTINGS_UPDATED', 'settings', NULL, '192.168.1.10', '{"changed": ["theme", "prefetch_aggressiveness"]}'),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'SYNC_TRIGGERED', 'bookmarks', NULL, '192.168.1.10', '{"item_count": 4}'),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'SYNC_COMPLETED', 'bookmarks', NULL, '192.168.1.10', '{"synced": 4, "conflicts": 0}');
