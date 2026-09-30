/**
 * Gift Suggestions Modal Styles
 *
 * Extracted from gift-suggestions.ui.ts for file size compliance (<500 lines per file).
 */

import { DURATION, EASING } from '../config/animation-constants.js';

export const giftSuggestionsStyles = `
    /* =========================================================================
       GIFT SUGGESTIONS UI
       ========================================================================= */
    
    .gift-suggestions-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .gift-suggestions-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .gift-suggestions-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .gift-suggestions-modal {
      position: relative;
      width: 94%;
      max-width: clamp(364px, 90vw, 520px);
      max-height: 90vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .gift-suggestions-overlay.open .gift-suggestions-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .gs-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .gs-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .gs-header-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .gs-icon {
      color: var(--persona-ink);
    }

    .gs-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-ink);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .gs-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .gs-close {
      width: var(--space-10, 2.5rem);
      height: var(--space-10, 2.5rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #70605a);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .gs-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
       FILTERS
       ========================================================================= */
    
    .gs-filters {
      display: flex;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .gs-filter {
      flex: 1;
    }

    .gs-filter-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-1, 0.25rem);
      display: block;
    }

    .gs-select {
      width: 100%;
      padding: var(--space-2, 0.5rem) var(--space-2-5, 0.625rem);
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.12));
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      background: var(--color-background-elevated, #FFFDFB);
      color: var(--color-text-primary, #2C2520);
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2370605a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      padding-right: var(--space-8, 2rem);
    }

    .gs-select:focus {
      border-color: var(--persona-primary, #4a6741);
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .gs-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       LOADING STATE
       ========================================================================= */
    
    .gs-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 3rem) var(--space-4, 1rem);
      text-align: center;
    }

    .gs-loading-icon {
      color: var(--persona-ink);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-spinner {
      animation: gs-spin 1s linear infinite;
    }

    @keyframes gs-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .gs-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       INITIAL STATE
       ========================================================================= */
    
    .gs-initial {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
    }

    .gs-initial-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-4, 1rem);
      border-radius: var(--radius-full, 50%);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-ink);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .gs-initial-icon svg {
      width: 28px;
      height: 28px;
    }

    .gs-initial-title {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .gs-initial-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.5;
      margin-bottom: var(--space-4, 1rem);
    }

    .gs-generate-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2-5, 0.625rem) var(--space-5, 1.25rem);
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      background: var(--persona-primary, #4a6741);
      border: 1px solid var(--persona-primary, #4a6741);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-generate-btn:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }

    /* =========================================================================
       SUGGESTIONS LIST
       ========================================================================= */
    
    .gs-suggestions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .gs-suggestion {
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-suggestion:hover {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-elevated, #FFFDFB);
    }

    .gs-suggestion-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .gs-suggestion-name {
      font-weight: 600;
      font-size: var(--text-base, 1rem);
      color: var(--color-text-primary, #2C2520);
    }

    .gs-suggestion-price {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--persona-ink);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
    }

    .gs-suggestion-desc {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
      line-height: 1.5;
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-suggestion-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 0.5rem);
    }

    .gs-suggestion-tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      padding: var(--space-0-5, 0.125rem) var(--space-2, 0.5rem);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      border-radius: var(--radius-sm, 0.25rem);
    }

    .gs-suggestion-tag svg {
      width: 12px;
      height: 12px;
    }

    .gs-personal-touch {
      margin-top: var(--space-3, 0.75rem);
      padding: var(--space-2-5, 0.625rem) var(--space-3, 0.75rem);
      background: var(--persona-tint, rgba(74, 103, 65, 0.06));
      border-radius: var(--radius-md, 0.5rem);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }

    .gs-personal-touch-label {
      font-size: var(--text-xxs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--persona-ink);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .gs-personal-touch-text {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--color-text-secondary, #5a4a42);
    }

    /* =========================================================================
       ERROR STATE
       ========================================================================= */
    
    .gs-error {
      text-align: center;
      padding: var(--space-8, 2rem) var(--space-4, 1rem);
      color: var(--color-semantic-error-text);
    }

    .gs-error-text {
      font-size: var(--text-sm, 0.875rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .gs-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-retry-btn:hover {
      border-color: var(--color-text-muted, #70605a);
    }

    /* =========================================================================
       FOOTER
       ========================================================================= */
    
    .gs-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .gs-footer-hint {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .gs-regenerate-btn {
      display: flex;
      align-items: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border-radius: var(--radius-md, 0.5rem);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      background: transparent;
      border: 1px solid var(--color-border, rgba(44, 37, 32, 0.15));
      color: var(--color-text-secondary, #5a4a42);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .gs-regenerate-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-ink);
    }

    .gs-regenerate-btn svg {
      width: 16px;
      height: 16px;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .gift-suggestions-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .gs-filters {
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .gift-suggestions-overlay,
      .gift-suggestions-modal,
      .gs-suggestion,
      .gs-generate-btn,
      .gs-spinner {
        transition: none;
        animation: none;
      }
    }
  `;
