/**
 * @fileoverview Authentication controller.
 * Handles signup, login, logout, token refresh, password change,
 * account deletion, and session management.
 * @module cloud-api/controllers/auth
 */

'use strict';

const { supabase } = require('../db/client');
const {
  hashPassword,
  comparePassword,
  generateToken,
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  generateUUID,
} = require('../utils/crypto');
const { Errors } = require('@glimpse/shared/errors');
const { AUDIT_ACTIONS, TOKEN_EXPIRY } = require('@glimpse/shared/constants');
const logger = require('../utils/logger');

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * Log an action to the activity_audit_log table (fire-and-forget).
 */
function auditLog(userId, actionType, entityType, entityId, req, metadata = {}) {
  supabase
    .from('activity_audit_log')
    .insert({
      user_id: userId,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
      device_id: req.device?.id || null,
      metadata,
    })
    .then()
    .catch((err) => {
      logger.error('Failed to write audit log', { error: err.message, actionType });
    });
}

/**
 * Register or update a user's device.
 * Returns the device record.
 */
async function upsertDevice(userId, deviceInfo) {
  const fingerprint = deviceInfo.deviceFingerprint || `auto_${generateUUID().slice(0, 12)}`;

  /* Try to find existing device */
  const { data: existing } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('device_fingerprint', fingerprint)
    .single();

  if (existing) {
    /* Update last_seen and other fields */
    const { data: updated, error } = await supabase
      .from('user_devices')
      .update({
        device_name: deviceInfo.deviceName || existing.device_name,
        device_os: deviceInfo.deviceOs || existing.device_os,
        device_arch: deviceInfo.deviceArch || existing.device_arch,
        screen_resolution: deviceInfo.screenResolution || existing.screen_resolution,
        app_version: deviceInfo.appVersion || existing.app_version,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  /* Insert new device */
  const { data: device, error } = await supabase
    .from('user_devices')
    .insert({
      user_id: userId,
      device_fingerprint: fingerprint,
      device_name: deviceInfo.deviceName || 'Unknown Device',
      device_os: deviceInfo.deviceOs || 'unknown',
      device_arch: deviceInfo.deviceArch || 'unknown',
      screen_resolution: deviceInfo.screenResolution || null,
      app_version: deviceInfo.appVersion || null,
    })
    .select()
    .single();

  if (error) throw error;
  return device;
}

/**
 * Create a session and generate access + refresh tokens.
 */
async function createSession(user, device, req) {
  const rawRefreshToken = generateToken(48);
  const hashedRefresh = hashToken(rawRefreshToken);
  const sessionToken = hashToken(generateToken(32));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY.refreshSeconds * 1000);

  const { data: session, error } = await supabase
    .from('user_sessions')
    .insert({
      user_id: user.id,
      device_id: device?.id || null,
      device_name: device?.device_name || null,
      device_os: device?.device_os || null,
      device_arch: device?.device_arch || null,
      app_version: device?.app_version || null,
      ip_address: req.ip || null,
      session_token: sessionToken,
      refresh_token: hashedRefresh,
      is_active: true,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    sessionId: session.id,
    deviceId: device?.id,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    sessionId: session.id,
  });

  /* We return the raw refresh token (not the hash) to the client.
     The hash is stored in DB. On refresh, we hash the incoming token
     and compare with the stored hash. But for simplicity, we use the
     JWT refresh token which is self-verifiable, and the DB hash is of
     the raw random token used as a binding identifier. */
  return {
    session,
    accessToken,
    refreshToken,
    rawRefreshToken,
  };
}

/* ── Controllers ────────────────────────────────────────────────── */

/**
 * POST /auth/signup
 */
async function signup(req, res, next) {
  try {
    const { email, password, displayName } = req.body;
    const deviceInfo = req.body.device || {};

    /* Check if email is already registered */
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw Errors.EMAIL_ALREADY_EXISTS();
    }

    /* Hash password */
    const passwordHash = await hashPassword(password);

    /* Create user */
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        display_name: displayName,
        account_status: 'active',
        last_login_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select('id, email, display_name, avatar_url, account_status, created_at')
      .single();

    if (userError) throw userError;

    /* Register device */
    const device = await upsertDevice(user.id, deviceInfo);

    /* Create default settings */
    await supabase
      .from('browser_settings')
      .insert({ user_id: user.id })
      .then()
      .catch(() => {}); /* ignore if already exists */

    /* Create session and tokens */
    const { accessToken, refreshToken } = await createSession(user, device, req);

    /* Audit */
    auditLog(user.id, AUDIT_ACTIONS.USER_SIGNUP, 'user', user.id, req);
    auditLog(user.id, AUDIT_ACTIONS.DEVICE_REGISTERED, 'device', device.id, req);

    logger.info('User signed up', { userId: user.id, requestId: req.requestId });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
        },
        accessToken,
        refreshToken,
        device: {
          id: device.id,
          deviceName: device.device_name,
          deviceOs: device.device_os,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const deviceInfo = req.body.device || {};

    /* Find user */
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, display_name, avatar_url, account_status, created_at')
      .eq('email', email)
      .single();

    if (userError || !user) {
      throw Errors.INVALID_CREDENTIALS();
    }

    /* Check account status */
    if (user.account_status === 'suspended') {
      throw Errors.ACCOUNT_SUSPENDED();
    }
    if (user.account_status === 'deleted') {
      throw Errors.ACCOUNT_DELETED();
    }

    /* Verify password */
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      throw Errors.INVALID_CREDENTIALS();
    }

    /* Update login timestamps */
    await supabase
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    /* Register or update device */
    const device = await upsertDevice(user.id, deviceInfo);

    /* Create session */
    const { accessToken, refreshToken } = await createSession(user, device, req);

    /* Audit */
    auditLog(user.id, AUDIT_ACTIONS.USER_LOGIN, 'session', null, req, {
      device: device.device_name,
    });

    logger.info('User logged in', { userId: user.id, requestId: req.requestId });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
        },
        accessToken,
        refreshToken,
        device: {
          id: device.id,
          deviceName: device.device_name,
          deviceOs: device.device_os,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 */
async function logout(req, res, next) {
  try {
    const { sessionId } = req.user;

    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);

    auditLog(req.user.id, AUDIT_ACTIONS.USER_LOGOUT, 'session', sessionId, req);

    logger.info('User logged out', { userId: req.user.id, requestId: req.requestId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout-all-devices
 */
async function logoutAllDevices(req, res, next) {
  try {
    const { id: userId } = req.user;

    const { data } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true)
      .select('id');

    const count = data ? data.length : 0;

    auditLog(userId, AUDIT_ACTIONS.USER_LOGOUT, 'session', null, req, {
      sessionsRevoked: count,
      allDevices: true,
    });

    logger.info('User logged out from all devices', {
      userId,
      sessionsRevoked: count,
      requestId: req.requestId,
    });

    res.json({ success: true, sessionsRevoked: count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/refresh
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken: incomingToken } = req.body;

    /* Verify the JWT refresh token */
    let decoded;
    try {
      const { verifyRefreshToken } = require('../utils/crypto');
      decoded = verifyRefreshToken(incomingToken);
    } catch (err) {
      throw Errors.INVALID_REFRESH_TOKEN();
    }

    if (decoded.type !== 'refresh') {
      throw Errors.INVALID_REFRESH_TOKEN();
    }

    /* Find the active session */
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('id', decoded.sessionId)
      .eq('user_id', decoded.sub)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      throw Errors.INVALID_REFRESH_TOKEN();
    }

    /* Check session hasn't expired */
    if (new Date(session.expires_at) < new Date()) {
      /* Mark session as inactive */
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('id', session.id);
      throw Errors.INVALID_REFRESH_TOKEN('Refresh token has expired');
    }

    /* Rotate refresh token: invalidate old, issue new */
    const newRawRefresh = generateToken(48);
    const newHashedRefresh = hashToken(newRawRefresh);
    const newExpiresAt = new Date(Date.now() + TOKEN_EXPIRY.refreshSeconds * 1000);

    await supabase
      .from('user_sessions')
      .update({
        refresh_token: newHashedRefresh,
        expires_at: newExpiresAt.toISOString(),
        last_active_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    /* Generate new access token */
    const accessToken = generateAccessToken({
      userId: decoded.sub,
      email: decoded.email,
      sessionId: session.id,
      deviceId: session.device_id,
    });

    /* Generate new refresh token JWT */
    const newRefreshToken = generateRefreshToken({
      userId: decoded.sub,
      sessionId: session.id,
    });

    logger.debug('Token refreshed', {
      userId: decoded.sub,
      sessionId: session.id,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/change-password
 */
async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    const currentSessionId = req.user.sessionId;

    /* Fetch current password hash */
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw Errors.NOT_FOUND('User not found');
    }

    /* Verify old password */
    const valid = await comparePassword(oldPassword, user.password_hash);
    if (!valid) {
      throw Errors.INCORRECT_PASSWORD();
    }

    /* Hash new password */
    const newHash = await hashPassword(newPassword);

    /* Update password */
    await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userId);

    /* Invalidate all OTHER sessions (keep current session active) */
    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('id', currentSessionId);

    auditLog(userId, AUDIT_ACTIONS.USER_PASSWORD_CHANGE, 'user', userId, req);

    logger.info('Password changed', { userId, requestId: req.requestId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /auth/account
 */
async function deleteAccount(req, res, next) {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    /* Verify password */
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw Errors.NOT_FOUND('User not found');
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      throw Errors.INCORRECT_PASSWORD();
    }

    /* Soft delete: set account_status = 'deleted' */
    await supabase
      .from('users')
      .update({ account_status: 'deleted' })
      .eq('id', userId);

    /* Invalidate ALL sessions */
    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId);

    auditLog(userId, AUDIT_ACTIONS.USER_ACCOUNT_DELETED, 'user', userId, req);

    logger.info('Account deleted (soft)', { userId, requestId: req.requestId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/sessions
 */
async function getSessions(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select(`
        id, device_id, device_name, device_os, device_arch,
        app_version, ip_address, country, city,
        is_active, expires_at, last_active_at, created_at
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_active_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        sessions: (sessions || []).map((s) => ({
          id: s.id,
          deviceId: s.device_id,
          deviceName: s.device_name,
          deviceOs: s.device_os,
          deviceArch: s.device_arch,
          appVersion: s.app_version,
          ipAddress: s.ip_address,
          country: s.country,
          city: s.city,
          isActive: s.is_active,
          isCurrent: s.id === req.user.sessionId,
          expiresAt: s.expires_at,
          lastActiveAt: s.last_active_at,
          createdAt: s.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /auth/sessions/:sessionId
 */
async function revokeSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    /* Ensure session belongs to this user */
    const { data: session, error } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !session) {
      throw Errors.SESSION_NOT_FOUND();
    }

    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);

    logger.info('Session revoked', { userId, sessionId, requestId: req.requestId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  logout,
  logoutAllDevices,
  refresh,
  changePassword,
  deleteAccount,
  getSessions,
  revokeSession,
};
