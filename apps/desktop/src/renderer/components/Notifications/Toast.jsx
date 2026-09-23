/**
 * @fileoverview Toast — individual notification with auto-dismiss.
 * Types: success, error, warning, info.
 */

import React, { useEffect, useState, useRef } from 'react';
import Icon from '../Icon';
import './Toast.css';

const TYPE_CONFIG = {
  success: { icon: 'check', color: 'var(--color-success)' },
  error: { icon: 'x', color: 'var(--color-error)' },
  warning: { icon: 'alert-triangle', color: 'var(--color-warning)' },
  info: { icon: 'lightning', color: 'var(--color-info)' },
};

const AUTO_DISMISS_MS = 4000;

export default function Toast({ notification, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const startRef = useRef(Date.now());

  const { type = 'info', title, message } = notification;
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  /* Auto-dismiss countdown */
  useEffect(() => {
    startRef.current = Date.now();

    /* Progress animation */
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
    }, 50);

    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 200);
    }, AUTO_DISMISS_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  const handleDismiss = () => {
    clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(onDismiss, 200);
  };

  return (
    <div
      className={`toast toast--${type} ${exiting ? 'toast--exit' : ''}`}
      role="alert"
    >
      <div className="toast__accent" style={{ background: config.color }} />

      <div className="toast__icon" style={{ color: config.color }}>
        <Icon name={config.icon} size={18} />
      </div>

      <div className="toast__body">
        {title && <div className="toast__title">{title}</div>}
        {message && <div className="toast__message">{message}</div>}
      </div>

      <button className="toast__close" onClick={handleDismiss} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>

      <div className="toast__progress">
        <div
          className="toast__progress-bar"
          style={{ width: `${progress}%`, background: config.color }}
        />
      </div>
    </div>
  );
}
