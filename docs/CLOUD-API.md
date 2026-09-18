# Glimpse Browser — Cloud API Reference

## Overview

The Glimpse Cloud API is a Node.js/Express REST API that provides:

- **Authentication** — Signup, login, logout, token refresh, session management
- **Cross-Device Sync** — Bookmarks, history, and settings synchronization
- **Telemetry** — Search events, link events, prefetch performance, page load tracking
- **ML Model Serving** — Model metadata, downloads, version listing, accuracy reporting
- **Health Monitoring** — Basic and detailed health checks

## Base URL

```
Development:  http://localhost:3001/api/v1
Production:   https://api.glimpse-browser.com/api/v1
```

## Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <access_token>
```

Tokens are issued on login/signup and refreshed via the `/auth/refresh` endpoint.

### Token Lifecycle

| Token Type     | Lifetime | Storage      |
|---------------|----------|-------------|
| Access Token  | 15 min   | Client memory|
| Refresh Token | 7 days   | Client + DB |

**Refresh rotation**: Every refresh request issues a new refresh token and invalidates the old one.

---

## Endpoints

### Health

| Method | Path               | Auth     | Description              |
|--------|--------------------|----------|--------------------------|
| GET    | `/health`          | No       | Quick health check       |
| GET    | `/health/detailed` | No       | Full system diagnostics  |

### Auth

| Method | Path                             | Auth     | Rate Limit | Description                     |
|--------|----------------------------------|----------|------------|---------------------------------|
| POST   | `/api/v1/auth/signup`            | No       | 10/15min   | Create account                  |
| POST   | `/api/v1/auth/login`             | No       | 10/15min   | Login                           |
| POST   | `/api/v1/auth/refresh`           | No       | 10/15min   | Refresh tokens                  |
| POST   | `/api/v1/auth/logout`            | Required | Global     | Logout current session          |
| POST   | `/api/v1/auth/logout-all-devices`| Required | Global     | Revoke all sessions             |
| POST   | `/api/v1/auth/change-password`   | Required | Global     | Change password                 |
| DELETE | `/api/v1/auth/account`           | Required | Global     | Soft-delete account             |
| GET    | `/api/v1/auth/sessions`          | Required | Global     | List active sessions            |
| DELETE | `/api/v1/auth/sessions/:id`      | Required | Global     | Revoke a specific session       |

#### POST `/api/v1/auth/signup`

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass1!",
  "displayName": "Alice Chen",
  "device": {
    "deviceFingerprint": "fp_hash_abc",
    "deviceName": "Alice Desktop",
    "deviceOs": "Windows 11",
    "deviceArch": "x64",
    "screenResolution": "1920x1080",
    "appVersion": "1.0.0"
  }
}

// Response (201)
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "displayName": "...", "createdAt": "..." },
    "accessToken": "jwt...",
    "refreshToken": "jwt...",
    "device": { "id": "uuid", "deviceName": "...", "deviceOs": "..." }
  }
}
```

#### POST `/api/v1/auth/login`

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass1!",
  "device": { ... }
}

// Response (200) — same shape as signup
```

#### POST `/api/v1/auth/refresh`

```json
// Request
{ "refreshToken": "jwt..." }

// Response (200)
{ "success": true, "data": { "accessToken": "jwt...", "refreshToken": "jwt..." } }
```

### Sync

All sync endpoints require authentication and are rate-limited to 60/min.

| Method | Path                              | Description                   |
|--------|-----------------------------------|-------------------------------|
| POST   | `/api/v1/sync/bookmarks`          | Upload bookmarks (upsert)     |
| GET    | `/api/v1/sync/bookmarks`          | Download all bookmarks        |
| POST   | `/api/v1/sync/history`            | Upload history batch          |
| GET    | `/api/v1/sync/history?since=ISO`  | Download history since date   |
| POST   | `/api/v1/sync/settings`           | Upload settings               |
| GET    | `/api/v1/sync/settings`           | Download settings             |
| GET    | `/api/v1/sync/status`             | Last sync timestamps          |
| POST   | `/api/v1/sync/resolve-conflict`   | Resolve a sync conflict       |

#### Conflict Resolution

The sync system uses **last-write-wins** with optional manual resolution:

1. Client uploads bookmarks with timestamps
2. Server compares `updatedAt` timestamps
3. If client timestamp is newer → server updates
4. If server timestamp is newer → conflict logged to `sync_queue`
5. Client can view pending conflicts via `GET /sync/status`
6. Client resolves by choosing `client` or `server` version via `POST /sync/resolve-conflict`

### Telemetry

Telemetry endpoints use optional authentication (works for anonymous users too) and are rate-limited to 500/min.

| Method | Path                                 | Description                |
|--------|--------------------------------------|----------------------------|
| POST   | `/api/v1/telemetry/search`           | Log a search event         |
| POST   | `/api/v1/telemetry/link-events`      | Batch log link events      |
| POST   | `/api/v1/telemetry/prefetch-performance` | Log prefetch metrics   |
| POST   | `/api/v1/telemetry/page-load`        | Log page load time         |

**Privacy**: All URLs are anonymized before storage — PII patterns (emails, JWT tokens, long hex strings, UUIDs) are stripped from query parameters.

### ML Model

| Method | Path                             | Auth       | Description                |
|--------|----------------------------------|------------|----------------------------|
| GET    | `/api/v1/model/latest`           | No         | Latest model metadata      |
| GET    | `/api/v1/model/download`         | Optional   | Download model JSON file   |
| GET    | `/api/v1/model/versions`         | No         | List all model versions    |
| POST   | `/api/v1/model/report-accuracy`  | Optional   | Report prediction accuracy |

---

## Error Response Format

All errors follow this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Invalid email format"],
      "password": ["Must be at least 8 characters"]
    }
  }
}
```

### Error Codes

| Code                    | HTTP | Description                          |
|------------------------|------|--------------------------------------|
| `VALIDATION_ERROR`      | 400  | Request body validation failed       |
| `INVALID_JSON`          | 400  | Request body is not valid JSON       |
| `UNAUTHORIZED`          | 401  | Missing or invalid auth token        |
| `TOKEN_EXPIRED`         | 401  | Access token has expired             |
| `INVALID_CREDENTIALS`   | 401  | Wrong email or password              |
| `FORBIDDEN`             | 403  | Not allowed for this resource        |
| `NOT_FOUND`             | 404  | Resource not found                   |
| `DUPLICATE_ENTRY`       | 409  | Record already exists                |
| `RATE_LIMIT_EXCEEDED`   | 429  | Too many requests                    |
| `INTERNAL_SERVER_ERROR`  | 500  | Unexpected server error              |

---

## Database Schema

### Tables

| Table                    | Description                                |
|--------------------------|---------------------------------------------|
| `users`                  | User accounts (email, password hash, status)|
| `user_devices`           | Registered devices per user                 |
| `user_sessions`          | Active sessions (token hashes, IP, expiry)  |
| `browser_settings`       | Per-user browser configuration              |
| `bookmark_folders`       | Folder hierarchy for bookmarks              |
| `bookmarks`              | Saved bookmarks (URL, title, folder, sync)  |
| `browsing_history`       | Visit history with counts and sources       |
| `downloads`              | Download records                            |
| `search_events`          | Search queries with engine and viewport info|
| `result_link_events`     | Per-link visibility, prefetch, and click data|
| `prefetch_performance_log` | Prefetch timing and bandwidth metrics     |
| `ml_model_versions`      | Trained model registry with metrics         |
| `ml_predictions_log`     | Client-reported prediction accuracy         |
| `activity_audit_log`     | Security audit trail                        |
| `sync_queue`             | Pending sync operations and conflicts       |

All tables use UUID v4 primary keys and have RLS policies enabled.

---

## Rate Limits

| Tier       | Window   | Max Requests | Applied To              |
|-----------|----------|-------------|-------------------------|
| Global    | 15 min   | 200         | All endpoints            |
| Auth      | 15 min   | 10          | Login, signup, refresh   |
| Telemetry | 1 min    | 500         | All telemetry endpoints  |
| Sync      | 1 min    | 60          | All sync endpoints       |

Rate limit headers are returned on every response:
- `RateLimit-Limit` — Max requests for the window
- `RateLimit-Remaining` — Requests remaining
- `RateLimit-Reset` — Seconds until window resets
- `Retry-After` — Seconds to wait (on 429 responses)

---

## Scheduled Jobs

| Job                | Schedule            | Description                       |
|--------------------|---------------------|-----------------------------------|
| Model Retraining   | Sundays 02:00 UTC   | Retrain click predictor model     |
| Telemetry Cleanup  | Daily 03:00 UTC     | Purge old telemetry data          |

### Data Retention

| Data Type              | Retention |
|------------------------|-----------|
| Result link events     | 90 days   |
| Prefetch performance   | 30 days   |
| Audit log              | 180 days  |
| Expired sessions       | 30 days   |
| ML predictions log     | 60 days   |
