/**
 * @fileoverview Admin routes for system telemetry and ML operations.
 * Protected by ADMIN_API_KEY via adminAuth middleware.
 * @module cloud-api/routes/admin
 */

'use strict';

const { Router } = require('express');
const { adminAuth } = require('../middleware/admin-auth');
const telemetryController = require('../controllers/telemetry.controller');
const { runRetraining } = require('../jobs/retrain-model.job');
const logger = require('../utils/logger');

const router = Router();

/* Protect all admin routes with timing-safe API key verification */
router.use(adminAuth);

/**
 * GET /admin/telemetry/summary
 * Aggregate metrics on engines, clicks, installs, missing fields, and dates.
 */
router.get('/telemetry/summary', telemetryController.getTelemetrySummary);

/**
 * POST /admin/ml/run-now
 * Trigger an immediate retraining run.
 */
router.post('/ml/run-now', async (req, res, next) => {
  try {
    logger.info('Admin triggered immediate ML retraining run');
    const result = await runRetraining();
    res.json({
      success: true,
      message: 'ML retraining job triggered successfully',
      data: result || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
