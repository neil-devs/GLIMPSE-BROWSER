/**
 * @fileoverview Telemetry routes.
 * @module cloud-api/routes/telemetry
 */

'use strict';

const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth.middleware');
const { telemetryLimiter } = require('../middleware/rate-limiter');
const validate = require('../middleware/validate');
const {
  searchEventSchema,
  linkEventsBatchSchema,
  prefetchPerformanceSchema,
  pageLoadSchema,
} = require('@glimpse/shared/validators');
const telemetryController = require('../controllers/telemetry.controller');

const router = Router();

/* All telemetry routes use optional auth and telemetry rate limiting */
router.use(optionalAuth);
router.use(telemetryLimiter);

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
