/**
 * @fileoverview Notifications container — renders toasts in bottom-right.
 */

import React from 'react';
import Toast from './Toast';
import useUiStore from '../../store/ui-store';
import './Notifications.css';

export default function Notifications() {
  const notifications = useUiStore((s) => s.notifications);
  const removeNotification = useUiStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="notifications">
      {notifications.map((n) => (
        <Toast
          key={n.id}
          notification={n}
          onDismiss={() => removeNotification(n.id)}
        />
      ))}
    </div>
  );
}
