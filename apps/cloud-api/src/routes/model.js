/**
 * @fileoverview ML model routes.
 * @module cloud-api/routes/model
 */

'use strict';

const { Router } = require('express');
const { requireAuth, optionalAuth } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { modelAccuracyReportSchema } = require('@glimpse/shared/validators');
const modelController = require('../controllers/model.controller');

const router = Router();

/* Public — any client can check for and download the latest model */
router.get('/latest', modelController.getLatestModel);
router.get('/download', optionalAuth, modelController.downloadModel);

/* Public — list all model versions */
router.get('/versions', modelController.listVersions);

/* Authenticated — report accuracy back to the server */
router.post(
  '/report-accuracy',
  optionalAuth,
  validate(modelAccuracyReportSchema),
  modelController.reportAccuracy
);

module.exports = router;
