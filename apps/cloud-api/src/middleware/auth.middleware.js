/**
 * @fileoverview Authentication middleware.
 * Provides three strategies:
 *   - verifyToken: decodes JWT and validates session, attaches user to req
 *   - requireAuth: throws 401 if no valid user
 *   - optionalAuth: attaches user if token present, proceeds without error if not
 * @module cloud-api/middleware/auth
 */

'use strict';

const { verifyAccessToken } = require('../utils/crypto');
const { supabase } = require('../db/client');
const { Errors } = require('@glimpse/shared/errors');
const logger = require('../utils/logger');

/**
 * Extract Bearer token from Authorization header.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Core token verification logic.
 * Verifies JWT signature, checks session is still active and not expired.
 * Attaches req.user and req.device on success.
 *
 * @param {import('express').Request} req
 * @returns {Promise<boolean>} True if authentication succeeded
 */
async function verifyAndAttach(req) {
  const token = extractToken(req);
  if (!token) return false;

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw Errors.TOKEN_EXPIRED();
    }
    /* Invalid signature, malformed, etc. */
    return false;
  }

  if (decoded.type !== 'access') {
    return false;
  }

  /* Verify session is still active in the database */
  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('id, user_id, device_id, is_active, expires_at')
    .eq('id', decoded.sessionId)
    .single();

  if (error || !session) {
    logger.debug('Session not found in database', {
      sessionId: decoded.sessionId,
      requestId: req.requestId,
    });
    return false;
  }

  if (!session.is_active) {
    logger.debug('Session has been revoked', {
      sessionId: decoded.sessionId,
      requestId: req.requestId,
    });
    return false;
  }

  if (new Date(session.expires_at) < new Date()) {
    logger.debug('Session has expired', {
      sessionId: decoded.sessionId,
      requestId: req.requestId,
    });
    return false;
  }

  /* Update last_active_at (fire-and-forget, don't block the request) */
  supabase
    .from('user_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.id)
    .then()
    .catch(() => {});

  /* Attach user context to the request */
  req.user = {
    id: decoded.sub,
    email: decoded.email,
    sessionId: decoded.sessionId,
  };

  req.device = {
    id: session.device_id || decoded.deviceId,
  };

  return true;
}

/**
 * Middleware: Verify token and attach user to request.
 * Does not throw if token is missing — use requireAuth for that.
 */
async function verifyToken(req, res, next) {
  try {
    await verifyAndAttach(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Require valid authentication.
 * Returns 401 if no valid token or session.
 */
async function requireAuth(req, res, next) {
  try {
    const authenticated = await verifyAndAttach(req);
    if (!authenticated) {
      throw Errors.UNAUTHORIZED();
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Optional authentication.
 * Attaches user if token is present and valid, proceeds without error if not.
 * Use for endpoints that work for both anonymous and authenticated users.
 */
async function optionalAuth(req, res, next) {
  try {
    /* Best-effort: attach user if possible, ignore failures */
    const token = extractToken(req);
    if (token) {
      await verifyAndAttach(req);
    }
    next();
  } catch (err) {
    /* If token verification fails, just proceed without user context.
       Exception: if token is expired, we still proceed without error
       for optional auth — the client should refresh. */
    if (err.code === 'TOKEN_EXPIRED') {
      next(); // proceed unauthenticated
    } else {
      next(err);
    }
  }
}

module.exports = {
  verifyToken,
  requireAuth,
  optionalAuth,
};
