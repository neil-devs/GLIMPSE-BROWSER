/**
 * @fileoverview Authentication routes.
 * @module cloud-api/routes/auth
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rate-limiter');
const validate = require('../middleware/validate');
const {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  deleteAccountSchema,
} = require('@glimpse/shared/validators');
const authController = require('../controllers/auth.controller');

const router = Router();

/* ── Public (rate-limited) ──────────────────────────────────────── */

router.post(
  '/signup',
  authLimiter,
  validate(signupSchema),
  authController.signup
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

router.post(
  '/refresh',
  authLimiter,
  validate(refreshTokenSchema),
  authController.refresh
);

/* ── Authenticated ──────────────────────────────────────────────── */

router.post('/logout', requireAuth, authController.logout);

router.post('/logout-all-devices', requireAuth, authController.logoutAllDevices);

router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  authController.changePassword
);

router.delete(
  '/account',
  requireAuth,
  validate(deleteAccountSchema),
  authController.deleteAccount
);

router.get('/sessions', requireAuth, authController.getSessions);

router.delete('/sessions/:sessionId', requireAuth, authController.revokeSession);

module.exports = router;
