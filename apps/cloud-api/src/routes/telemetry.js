/**
 * @fileoverview Telemetry routes.
 * @module cloud-api/routes/telemetry
 */

'use strict';

const { Router } = require('express');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth.middleware');
const { telemetryLimiter } = require('../middleware/rate-limiter');
const validate = require('../middleware/validate');
const {
  searchEventSchema,
  linkEventsBatchSchema,
  prefetchPerformanceSchema,
  pageLoadSchema,
  telemetryBatchSchema,
} = require('@glimpse/shared/validators');
const telemetryController = require('../controllers/telemetry.controller');

const router = Router();

/* Per-install rate limiter: max 120 batch requests per minute */
const installLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: true,
  keyGenerator: (req) => {
    let installId = req.params?.installId || req.query?.installId;
    if (!installId && Array.isArray(req.body) && req.body[0]?.search) {
      installId = req.body[0].search.installId || req.body[0].search.install_id;
    } else if (!installId && req.body?.sessions && req.body.sessions[0]?.search) {
      installId = req.body.sessions[0].search.installId || req.body.sessions[0].search.install_id;
    }
    return `install:${installId || req.ip}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many telemetry requests from this install.' },
    });
  },
});

/* All telemetry routes use optional auth and telemetry rate limiting */
router.use(optionalAuth);
router.use(telemetryLimiter);

/* V2 Batch Telemetry Endpoint with 256 KB body limit */
router.post(
  '/batch',
  express.json({ limit: '256kb' }),
  installLimiter,
  validate(telemetryBatchSchema),
  telemetryController.logBatch
);

/* User Data Deletion */
router.delete(
  '/data',
  express.json({ limit: '10kb' }),
  telemetryController.deleteInstallData
);

router.delete(
  '/data/:installId',
  telemetryController.deleteInstallData
);

router.post(
  '/search',
  validate(searchEventSchema),
  telemetryController.logSearchEvent
);

router.post(
  '/link-events',
  validate(linkEventsBatchSchema),
  telemetryController.logLinkEvents
);

router.post(
  '/prefetch-performance',
  validate(prefetchPerformanceSchema),
  telemetryController.logPrefetchPerformance
);

router.post(
  '/page-load',
  validate(pageLoadSchema),
  telemetryController.logPageLoad
);

module.exports = router;
