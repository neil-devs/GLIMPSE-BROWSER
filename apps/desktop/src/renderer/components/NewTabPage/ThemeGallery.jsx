import React, { useState } from 'react';
import { THEME_IMAGES } from './ntp-themes';
import './ThemeGallery.css';

export default function ThemeGallery({ onClose, onSelect, currentUrl }) {
  const [search, setSearch] = useState('');

  return (
    <div className="ntp-gallery-overlay">
      <div className="ntp-gallery">
        <div className="ntp-gallery__header">
          <button className="ntp-gallery__back" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="ntp-gallery__title">Backgrounds</h2>
        </div>
        
        <div className="ntp-gallery__content">
          <div className="ntp-gallery__grid">
            <button 
              className={`ntp-gallery__item ntp-gallery__item--none ${!currentUrl ? 'active' : ''}`}
              onClick={() => {
                onSelect('');
                onClose();
              }}
            >
              <div className="ntp-gallery__item-circle" />
              <span>No background</span>
            </button>
            
            {THEME_IMAGES.map((img) => (
              <button
                key={img.id}
                className={`ntp-gallery__item ${currentUrl === img.url ? 'active' : ''}`}
                onClick={() => {
                  onSelect(img.url);
                  onClose();
                }}
              >
                <img src={img.thumb} alt={`Theme ${img.id}`} loading="lazy" />
                {currentUrl === img.url && (
                  <div className="ntp-gallery__item-check">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
