import React from 'react';
import ContextMenu from '../ContextMenu';

export default function TabContextMenu({ tab, position, onClose, actions }) {
  if (!tab || !position) return null;

  const items = [
    { label: 'New Tab', icon: '➕', onClick: actions.newTab, shortcut: 'Ctrl+T' },
    { separator: true },
    { label: 'Reload', icon: '↻', onClick: () => actions.reload(tab.id), shortcut: 'F5' },
    { label: 'Duplicate', icon: '⧉', onClick: () => actions.duplicate(tab.id) },
    { label: tab.isPinned ? 'Unpin Tab' : 'Pin Tab', icon: '📌', onClick: () => actions.pin(tab.id) },
    {
      label: tab.isMuted ? 'Unmute Tab' : 'Mute Tab',
      icon: tab.isMuted ? '🔊' : '🔇',
      onClick: () => actions.mute(tab.id, !tab.isMuted),
      disabled: !tab.isAudioPlaying && !tab.isMuted,
    },
    { separator: true },
    { label: 'Close Tab', icon: '✕', onClick: () => actions.close(tab.id), shortcut: 'Ctrl+W' },
    { label: 'Close Other Tabs', icon: '✕', onClick: () => actions.closeOthers(tab.id) },
    { label: 'Close Tabs to the Right', icon: '✕', onClick: () => actions.closeRight(tab.id) },
  ];

  return <ContextMenu position={position} items={items} onClose={onClose} />;
}
