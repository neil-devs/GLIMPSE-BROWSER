import React from 'react';
import './ErrorPage.css';

export default function ErrorPage({ errorCode, errorDescription, url }) {
  return (
    <div className="error-page">
      <div className="error-page__content">
        <div className="error-page__icon">⚠</div>
        <h1 className="error-page__title">This page can't be reached</h1>
        <p className="error-page__url">{url || 'Unknown URL'}</p>
        <div className="error-page__details">
          <p className="error-page__code">{errorCode || 'ERR_UNKNOWN'}</p>
          <p className="error-page__description">{errorDescription || 'An unexpected error occurred.'}</p>
        </div>
        <div className="error-page__actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
