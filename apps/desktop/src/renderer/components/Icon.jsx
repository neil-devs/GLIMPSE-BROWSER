/**
 * @fileoverview SVG Icon component library.
 * All icons use currentColor so they inherit the parent's color.
 * Usage: <Icon name="arrow-left" size={16} />
 */

import React from 'react';

const icons = {
  'arrow-left': (
    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'arrow-right': (
    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'refresh': (
    <path d="M4 4V9H4.58M19.94 11A8 8 0 0 0 5.26 8.13M4.58 9H9M20 20V15H19.42M4.06 13A8 8 0 0 0 18.74 15.87M19.42 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'x': (
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'plus': (
    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'star': (
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'star-filled': (
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" stroke="currentColor" strokeWidth="1" />
  ),
  'download': (
    <>
      <path d="M21 15V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  'menu': (
    <>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </>
  ),
  'sidebar': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M15 3V21" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  'shield': (
    <path d="M12 22S20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'lock': (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M7 11V7A5 5 0 0 1 17 7V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>
  ),
  'lightning': (
    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="currentColor" />
  ),
  'globe': (
    <>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M2 12H22" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 2A15.3 15.3 0 0 1 16 12A15.3 15.3 0 0 1 12 22A15.3 15.3 0 0 1 8 12A15.3 15.3 0 0 1 12 2Z" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  'speaker': (
    <>
      <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
      <path d="M15.54 8.46A5 5 0 0 1 15.54 15.54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M19.07 4.93A10 10 0 0 1 19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  'speaker-off': (
    <>
      <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
      <path d="M23 9L17 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M17 9L23 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  'pin': (
    <path d="M12 17V21M15 3.5L8.5 10L3.5 8L2 9.5L7.5 15L6 20.5L7.5 22L12 17L18 14.5L19.5 16L20.5 10.5L15 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'copy': (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M5 15H4A2 2 0 0 1 2 13V4A2 2 0 0 1 4 2H13A2 2 0 0 1 15 4V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  'trash': (
    <>
      <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M19 6V20A2 2 0 0 1 17 22H7A2 2 0 0 1 5 20V6M8 6V4A2 2 0 0 1 10 2H14A2 2 0 0 1 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  'settings': (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M19.4 15A1.65 1.65 0 0 0 21 13.74V10.26A1.65 1.65 0 0 0 19.4 9L18.88 8.71A1.68 1.68 0 0 1 18 7.13L18.16 6.56A1.65 1.65 0 0 0 17.13 4.62L14.87 3.38A1.65 1.65 0 0 0 13.34 3.72L12.76 4.1A1.68 1.68 0 0 1 11.24 4.1L10.66 3.72A1.65 1.65 0 0 0 9.13 3.38L6.87 4.62A1.65 1.65 0 0 0 5.84 6.56L6 7.13A1.68 1.68 0 0 1 5.12 8.71L4.6 9A1.65 1.65 0 0 0 3 10.26V13.74A1.65 1.65 0 0 0 4.6 15L5.12 15.29A1.68 1.68 0 0 1 6 16.87L5.84 17.44A1.65 1.65 0 0 0 6.87 19.38L9.13 20.62A1.65 1.65 0 0 0 10.66 20.28L11.24 19.9A1.68 1.68 0 0 1 12.76 19.9L13.34 20.28A1.65 1.65 0 0 0 14.87 20.62L17.13 19.38A1.65 1.65 0 0 0 18.16 17.44L18 16.87A1.68 1.68 0 0 1 18.88 15.29L19.4 15Z" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  'search': (
    <>
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  'book-open': (
    <path d="M2 3H8A4 4 0 0 1 12 7V21A3 3 0 0 0 9 18H2V3ZM22 3H16A4 4 0 0 0 12 7V21A3 3 0 0 1 15 18H22V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'clock': (
    <>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  'chevron-right': (
    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'chevron-down': (
    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'check': (
    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'external-link': (
    <>
      <path d="M18 13V19A2 2 0 0 1 16 21H5A2 2 0 0 1 3 19V8A2 2 0 0 1 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  'minimize': (
    <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  ),
  'maximize': (
    <rect x="5" y="5" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
  ),
};

export default function Icon({ name, size = 24, className = '', style = {}, ...props }) {
  const icon = icons[name];
  if (!icon) {
    console.warn(`[Icon] Unknown icon: "${name}"`);
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`icon ${className}`}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      {...props}
    >
      {icon}
    </svg>
  );
}
