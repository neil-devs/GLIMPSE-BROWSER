/**
 * @fileoverview Individual toast notification component.
 */

import React, { useEffect, useState } from 'react';
import './Toast.css';

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export default function Toast({ notification, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const { id, type = 'info', message, duration = 4000 } = notification;

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 300);
  };

  return (
    <div className={`toast toast--${type} ${exiting ? 'toast--exit' : ''}`}>
      <span className="toast__icon">{ICONS[type]}</span>
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={handleDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
