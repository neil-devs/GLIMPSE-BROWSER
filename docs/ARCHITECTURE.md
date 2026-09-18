# Glimpse Browser — Architecture

## Overview

Glimpse Browser is a desktop web browser built on Electron that intelligently prefetches search result links visible on screen, delivering near-instant page loads when the user clicks a result. The project is structured as an npm workspaces monorepo managed by Turborepo.

## Monorepo Structure

```
glimpse-browser/
├── packages/shared/          ← Shared constants, validators, IPC types, errors
├── apps/desktop/             ← Electron desktop application
│   └── src/
│       ├── main/             ← Main process (Node.js)
│       ├── preload/          ← Preload scripts (context bridge)
│       └── renderer/         ← React UI (Chromium renderer)
└── apps/cloud-api/           ← Express REST API (Node.js)
    └── src/
        ├── routes/           ← Express route definitions
        ├── controllers/      ← Business logic
        ├── middleware/       ← Auth, validation, rate limiting, errors
        ├── db/               ← Supabase client, schema, migrations
        ├── ml/               ← Click prediction ML pipeline
        └── jobs/             ← Scheduled cron jobs
```

## Technology Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Desktop Shell  | Electron 32+                        |
| Renderer UI    | React 18 + Zustand                  |
| Build Tool     | electron-vite (Vite-based)          |
| Local Storage  | SQLite via better-sqlite3           |
| Cloud API      | Express 4 on Node.js 18+            |
| Cloud Database | PostgreSQL via Supabase             |
| Auth           | JWT (access + refresh tokens)       |
| Validation     | Zod (shared between client & server)|
| ML             | Pure JS gradient boosted trees      |
| Monorepo       | npm workspaces + Turborepo          |

## Data Flow

### Search → Prefetch → Click

```
┌─────────────────────────────────────────────────────────────────────┐
│ User types search query in address bar                              │
│         ↓                                                           │
│ Tab navigates to search engine (Google, Bing, etc.)                 │
│         ↓                                                           │
│ Engine adapter identifies result link CSS selectors                 │
│         ↓                                                           │
│ Visibility detector (IntersectionObserver in preload script)        │
│ reports which links are visible in the viewport                     │
│         ↓                                                           │
│ Click predictor (on-device ML model) ranks visible links            │
│ by predicted click probability                                      │
│         ↓                                                           │
│ Prefetch scheduler requests top-N URLs via Speculation Rules API    │
│ (respects bandwidth guard and aggressiveness settings)              │
│         ↓                                                           │
│ User scrolls → new visible links detected → new prefetches queued   │
│         ↓                                                           │
│ User clicks a link → if prefetched, page loads INSTANTLY            │
│ (served from Chromium's prerender cache)                            │
│         ↓                                                           │
│ Telemetry logged locally → batched and sent to cloud API            │
└─────────────────────────────────────────────────────────────────────┘
```

### Sync Architecture

```
Desktop Client  ←→  Cloud API  ←→  Supabase PostgreSQL
     │                  │
     │  Bookmarks       │  Conflict resolution
     │  History         │  (last-write-wins + manual)
     │  Settings        │
     │                  │
     └── SQLite ────────┘── sync_queue table
         (offline)           (tracks pending syncs)
```

## Security Architecture

1. **Authentication**: JWT access tokens (15min) + refresh tokens (7d) with rotation
2. **Password Storage**: bcrypt with 12 salt rounds
3. **Token Storage**: SHA-256 hashed in PostgreSQL — never stored in plaintext
4. **Session Validation**: Every API request checks session is_active in the database
5. **Rate Limiting**: 4 tiers (global: 200/15min, auth: 10/15min, telemetry: 500/1min, sync: 60/1min)
6. **Input Validation**: Zod schemas shared between client and server
7. **SQL Safety**: Parameterized queries only (prepared statements in SQLite, Supabase client for PostgreSQL)
8. **CORS**: Locked to `app://glimpse` in production, localhost only in development
9. **HTTP Headers**: helmet with strict CSP, HSTS, X-Frame-Options DENY
10. **Logging**: Sensitive fields (password, token, secret) automatically redacted from all logs
11. **Telemetry Privacy**: URLs anonymized before storage — PII patterns stripped

## Desktop Process Model

```
┌─────────────────────────────────────────────┐
│                MAIN PROCESS                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Windows  │  │   Tabs   │  │  Prefetch  │ │
│  │ Manager  │  │  Manager │  │   Engine   │ │
│  └─────────┘  └──────────┘  └────────────┘ │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Storage  │  │   IPC    │  │    ML      │ │
│  │ (SQLite) │  │ Handlers │  │  Predictor │ │
│  └─────────┘  └──────────┘  └────────────┘ │
│  ┌─────────┐  ┌──────────┐                  │
│  │  Sync   │  │ Auto     │                  │
│  │ Client  │  │ Updater  │                  │
│  └─────────┘  └──────────┘                  │
├─────────────────────────────────────────────┤
│              PRELOAD SCRIPTS                 │
│  Context bridge: exposes safe API to renderer│
├─────────────────────────────────────────────┤
│             RENDERER PROCESS                 │
│  React UI: TabBar, AddressBar, Sidebar, etc.│
│  Zustand stores: tabs, UI state, prefetch   │
└─────────────────────────────────────────────┘
```

## Local Database (SQLite)

The desktop app stores all data locally in a single SQLite file at `{userData}/glimpse.db`:

- `local_history` — Browsing history with visit counts
- `local_bookmarks` — Bookmarks with folder hierarchy
- `local_bookmark_folders` — Folder tree structure
- `local_settings` — Key-value configuration store
- `local_downloads` — Download lifecycle tracking
- `prefetch_cache_log` — Prefetch performance metrics
- `auth_tokens` — Cached authentication tokens

All queries use prepared statements (created once at startup, reused) for both performance and SQL injection prevention.

## Cloud Database (PostgreSQL)

15 tables with UUID primary keys, Row Level Security, and comprehensive indexes. See [CLOUD-API.md](./CLOUD-API.md) for the full schema reference.

## Build & Release

```bash
# Development
npm run dev              # Start all workspaces
npm run dev:api          # Cloud API only
npm run dev:desktop      # Desktop app only

# Production build
npm run build:desktop    # Build Electron app
npm run build:api        # Build cloud API

# Testing
npm run test             # Run all tests
npm run lint             # Lint all workspaces
```
