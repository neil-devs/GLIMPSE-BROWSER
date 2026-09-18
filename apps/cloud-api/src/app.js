/**
 * @fileoverview Express application factory.
 * Assembles all middleware, routes, and error handlers.
 * @module cloud-api/app
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { requestIdMiddleware, httpLogger } = require('./middleware/logger');
const { globalLimiter } = require('./middleware/rate-limiter');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
const { API_VERSION } = require('@glimpse/shared/constants');

/* Route imports */
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const telemetryRoutes = require('./routes/telemetry');
const modelRoutes = require('./routes/model');

/**
 * Create and configure the Express application.
 * @returns {import('express').Application}
 */
function createApp() {
  const app = express();

  /* ── 1. Security headers (helmet) ─────────────────────────── */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000, /* 1 year */
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  /* ── 2. CORS ──────────────────────────────────────────────── */
  const allowedOrigins = buildAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        /* Allow requests with no origin (mobile apps, curl, etc.) in dev */
        if (!origin && process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        if (!origin) {
          return callback(null, false);
        }
        if (allowedOrigins.some(allowed => {
          if (allowed instanceof RegExp) return allowed.test(origin);
          return allowed === origin;
        })) {
          return callback(null, true);
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
      maxAge: 600,
    })
  );

  /* ── 3. Request ID ────────────────────────────────────────── */
  app.use(requestIdMiddleware);

  /* ── 4. HTTP request logging (morgan → winston) ───────────── */
  app.use(httpLogger);

  /* ── 5. Body parsers ──────────────────────────────────────── */
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  /* ── 6. Global rate limiter ───────────────────────────────── */
  app.use(globalLimiter);

  /* ── 7. Trust proxy (for accurate IP behind reverse proxies) */
  app.set('trust proxy', 1);

  /* ── 8. Mount routes ──────────────────────────────────────── */
  const prefix = `/api/${API_VERSION}`;

  app.use('/health', healthRoutes);
  app.use(`${prefix}/health`, healthRoutes);
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/sync`, syncRoutes);
  app.use(`${prefix}/telemetry`, telemetryRoutes);
  app.use(`${prefix}/model`, modelRoutes);

  /* Root endpoint */
  app.get('/', (req, res) => {
    res.json({
      name: 'Glimpse Browser Cloud API',
      version: API_VERSION,
      status: 'running',
      docs: '/health/detailed',
    });
  });

  /* ── 9. 404 handler ───────────────────────────────────────── */
  app.use(notFoundHandler);

  /* ── 10. Global error handler (must be last) ──────────────── */
  app.use(errorHandler);

  return app;
}

/**
 * Build the allowed origins list based on environment.
 * Production: only app://glimpse (Electron custom protocol)
 * Development: also allow localhost on any port
 */
function buildAllowedOrigins() {
  const origins = [
    'app://glimpse',
  ];

  /* Custom CORS_ORIGIN from env */
  if (process.env.CORS_ORIGIN) {
    const custom = process.env.CORS_ORIGIN.split(',').map(s => s.trim());
    origins.push(...custom);
  }

  /* In development, allow localhost */
  if (process.env.NODE_ENV !== 'production') {
    origins.push(/^http:\/\/localhost(:\d+)?$/);
    origins.push(/^http:\/\/127\.0\.0\.1(:\d+)?$/);
  }

  return origins;
}

module.exports = { createApp };
