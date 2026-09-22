/**
 * @fileoverview Global error handling for the Electron main process.
 * Catches uncaught exceptions and unhandled promise rejections,
 * logs them, and optionally shows a user-facing dialog.
 * @module desktop/utils/error-handler
 */

'use strict';

const { dialog } = require('electron');
const { logger } = require('./logger');

/**
 * Register global error handlers on the process.
 * Should be called once during app initialization.
 */
function setupErrorHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      message: error.message,
      stack: error.stack,
    });
    showErrorDialog(
      'Unexpected Error',
      `An unexpected error occurred:\n\n${error.message}\n\nThe application will attempt to continue, but you may want to restart it.`
    );
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error('Unhandled promise rejection', { message, stack });
  });
}

/**
 * Show a native error dialog to the user.
 * @param {string} title - Dialog title
 * @param {string} message - Error description shown to the user
 */
function showErrorDialog(title, message) {
  try {
    dialog.showErrorBox(title, message);
  } catch {
    /* Dialog may fail if app is not ready yet — log instead */
    logger.error('Could not show error dialog', { title, message });
  }
}

/**
 * Handle a tab-level error by building an error page HTML string.
 * Returns the HTML string — the caller is responsible for loading it into the webContents.
 *
 * @param {string} errorCode - Chromium error code (e.g., 'ERR_NAME_NOT_RESOLVED')
 * @param {string} errorDescription - Human-readable description from Chromium
 * @param {string} failedUrl - The URL that failed to load
 * @returns {string} HTML error page content
 */
function buildErrorPageHtml(errorCode, errorDescription, failedUrl) {
  const errorMessages = {
    ERR_NAME_NOT_RESOLVED: {
      title: "Can't find this website",
      description: `The server at <strong>${escapeHtml(failedUrl)}</strong> could not be found. Check the address for typos or try again later.`,
    },
    ERR_CONNECTION_REFUSED: {
      title: "This site can't be reached",
      description: `<strong>${escapeHtml(failedUrl)}</strong> refused to connect. The site may be down or your firewall may be blocking it.`,
    },
    ERR_INTERNET_DISCONNECTED: {
      title: 'No internet connection',
      description: 'You appear to be offline. Check your network connection and try again.',
    },
    ERR_CONNECTION_TIMED_OUT: {
      title: 'Connection timed out',
      description: `<strong>${escapeHtml(failedUrl)}</strong> took too long to respond. Try reloading the page.`,
    },
    ERR_SSL_PROTOCOL_ERROR: {
      title: 'Secure connection failed',
      description: `A secure connection to <strong>${escapeHtml(failedUrl)}</strong> could not be established.`,
    },
    ERR_CERT_COMMON_NAME_INVALID: {
      title: 'Certificate error',
      description: `The security certificate for <strong>${escapeHtml(failedUrl)}</strong> is not valid.`,
    },
  };

  const info = errorMessages[errorCode] || {
    title: 'Page failed to load',
    description: `Could not load <strong>${escapeHtml(failedUrl)}</strong>.<br><br>Error: ${escapeHtml(errorDescription || errorCode)}`,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${info.title} — Glimpse</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #e8e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px;
    }
    .error-container {
      text-align: center;
      max-width: 520px;
    }
    .error-icon {
      font-size: 64px;
      margin-bottom: 24px;
      opacity: 0.6;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #f87171;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #a0a0b8;
      margin-bottom: 24px;
    }
    .error-code {
      font-size: 12px;
      color: #606080;
      font-family: 'JetBrains Mono', monospace;
      margin-bottom: 24px;
    }
    .actions { display: flex; gap: 12px; justify-content: center; }
    button {
      padding: 10px 24px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .btn-primary {
      background: #6c63ff;
      color: white;
    }
    .btn-primary:hover { background: #7c73ff; }
    .btn-secondary {
      background: rgba(255,255,255,0.08);
      color: #e8e8f0;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">🌐</div>
    <h1>${info.title}</h1>
    <p>${info.description}</p>
    <div class="error-code">${escapeHtml(errorCode)}</div>
    <div class="actions">
      <button class="btn-primary" onclick="location.reload()">Retry</button>
      <button class="btn-secondary" onclick="history.back()">Go Back</button>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS in error pages.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  setupErrorHandlers,
  showErrorDialog,
  buildErrorPageHtml,
};
