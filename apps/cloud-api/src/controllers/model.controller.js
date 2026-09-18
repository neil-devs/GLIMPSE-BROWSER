/**
 * @fileoverview ML model controller.
 * Serves model metadata, downloads, accuracy reporting, and version listing.
 * @module cloud-api/controllers/model
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { supabase } = require('../db/client');
const { Errors } = require('@glimpse/shared/errors');
const logger = require('../utils/logger');

/**
 * GET /model/latest — Return latest active model version metadata
 */
async function getLatestModel(req, res, next) {
  try {
    const { data: model, error } = await supabase
      .from('ml_model_versions')
      .select('*')
      .eq('is_active', true)
      .eq('model_type', 'click_predictor')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !model) {
      throw Errors.MODEL_NOT_FOUND();
    }

    res.json({
      success: true,
      data: {
        id: model.id,
        version: model.version_string,
        modelType: model.model_type,
        trainingDataCount: model.training_data_count,
        metrics: {
          accuracy: model.accuracy_score,
          precision: model.precision_score,
          recall: model.recall_score,
          f1: model.f1_score,
          aucRoc: model.auc_roc_score,
        },
        fileSizeBytes: model.model_file_size_bytes,
        trainedAt: model.trained_at,
        deployedAt: model.deployed_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /model/download — Stream the latest model JSON file to client
 */
async function downloadModel(req, res, next) {
  try {
    /* Find active model */
    const { data: model, error } = await supabase
      .from('ml_model_versions')
      .select('model_file_path, version_string')
      .eq('is_active', true)
      .eq('model_type', 'click_predictor')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !model) {
      throw Errors.MODEL_NOT_FOUND();
    }

    /* Resolve model file path */
    const modelPath = path.resolve(
      __dirname,
      '..',
      'ml',
      model.model_file_path || 'models/latest.json'
    );

    if (!fs.existsSync(modelPath)) {
      logger.error('Model file not found on disk', { modelPath });
      throw Errors.MODEL_NOT_FOUND('Model file not found on server');
    }

    /* Log download if user is authenticated */
    if (req.user) {
      const { AUDIT_ACTIONS } = require('@glimpse/shared/constants');
      supabase
        .from('activity_audit_log')
        .insert({
          user_id: req.user.id,
          action_type: AUDIT_ACTIONS.MODEL_DOWNLOADED,
          entity_type: 'ml_model',
          entity_id: model.version_string,
          ip_address: req.ip || null,
          device_id: req.device?.id || null,
        })
        .then()
        .catch(() => {});
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="glimpse-model-${model.version_string}.json"`
    );
    res.setHeader('X-Model-Version', model.version_string);

    const readStream = fs.createReadStream(modelPath);
    readStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /model/report-accuracy — Client reports real-world prediction accuracy
 */
async function reportAccuracy(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const deviceId = req.device?.id || null;

    const {
      modelVersionId,
      searchEventId,
      predictedUrls,
      actualClickedUrl,
      predictionCorrect,
      inferenceTimeMs,
    } = req.body;

    /* Verify model version exists */
    const { data: model } = await supabase
      .from('ml_model_versions')
      .select('id')
      .eq('id', modelVersionId)
      .single();

    if (!model) {
      throw Errors.MODEL_NOT_FOUND('Model version not found');
    }

    const { error } = await supabase
      .from('ml_predictions_log')
      .insert({
        user_id: userId,
        device_id: deviceId,
        model_version_id: modelVersionId,
        search_event_id: searchEventId,
        predicted_urls: predictedUrls,
        actual_clicked_url: actualClickedUrl || null,
        prediction_correct: predictionCorrect,
        inference_time_ms: inferenceTimeMs,
      });

    if (error) throw error;

    logger.debug('Model accuracy reported', {
      modelVersionId,
      predictionCorrect,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /model/versions — List all model versions with metrics
 */
async function listVersions(req, res, next) {
  try {
    const { data: versions, error } = await supabase
      .from('ml_model_versions')
      .select('*')
      .eq('model_type', 'click_predictor')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      data: {
        versions: (versions || []).map((v) => ({
          id: v.id,
          version: v.version_string,
          modelType: v.model_type,
          trainingDataCount: v.training_data_count,
          metrics: {
            accuracy: v.accuracy_score,
            precision: v.precision_score,
            recall: v.recall_score,
            f1: v.f1_score,
            aucRoc: v.auc_roc_score,
          },
          fileSizeBytes: v.model_file_size_bytes,
          isActive: v.is_active,
          trainedAt: v.trained_at,
          deployedAt: v.deployed_at,
          createdAt: v.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLatestModel,
  downloadModel,
  reportAccuracy,
  listVersions,
};
