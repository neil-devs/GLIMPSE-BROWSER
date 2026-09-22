/**
 * @fileoverview Generic context menu component.
 * Renders at mouse position, closes on outside click or Escape.
 */

import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

/**
 * @param {object} props
 * @param {{ x: number, y: number }|null} props.position - Mouse position or null to hide
 * @param {{ label: string, icon?: string, onClick?: Function, disabled?: boolean, separator?: boolean }[]} props.items
 * @param {Function} props.onClose - Called when the menu should close
 */
export default function ContextMenu({ position, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!position) return;

    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  /* Adjust position to stay within viewport */
  useEffect(() => {
    if (!position || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;

    if (position.x > maxX) menu.style.left = `${maxX}px`;
    if (position.y > maxY) menu.style.top = `${maxY}px`;
  }, [position]);

  if (!position || !items || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu scale-in"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="context-menu__separator" />;
        }

        return (
          <button
            key={i}
            className={`context-menu__item ${item.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu__icon">{item.icon}</span>}
            <span className="context-menu__label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu__shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
