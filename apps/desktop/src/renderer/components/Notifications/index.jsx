/**
 * @fileoverview Toast notification container.
 * Renders all active notifications stacked in the top-right corner.
 */

import React from 'react';
import Toast from './Toast';
import useUiStore from '../../store/ui-store';
import './Toast.css';

export default function Notifications() {
  const notifications = useUiStore((s) => s.notifications);
  const removeNotification = useUiStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="toast-container">
      {notifications.map((n) => (
        <Toast key={n.id} notification={n} onDismiss={removeNotification} />
      ))}
    </div>
  );
}
