/**
 * Marketplace Base Styles
 *
 * Core CSS styles for the marketplace modal.
 * Uses CSS variables from design system - no hardcoded colors.
 *
 * @module marketplace/styles/base
 */

import { DURATION, EASING } from '../../../config/animation-constants.js';

/**
 * Get base marketplace styles
 */
export function getBaseStyles(): string {
  return `
    /* ========================================
       MARKETPLACE MODAL - BASE STYLES
       ======================================== */

    .marketplace-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ease, visibility ${DURATION.SLOW}ms ease;
    }

    .marketplace-modal.open {
      opacity: 1;
      visibility: visible;
    }

    .marketplace-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .marketplace-container {
      position: relative;
      width: 90vw;
      max-width: min(900px, 100%);
      max-height: 85vh;
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-2xl);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.95);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT},
                  opacity ${DURATION.SLOW}ms ease;
    }

    @supports not (backdrop-filter: blur(24px)) {
      .marketplace-container {
        background: var(--color-background-elevated);
      }
    }

    /* Subtle gradient overlay using design system token */
    .marketplace-container::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--gradient-mesh);
      opacity: 0.5;
      pointer-events: none;
      border-radius: inherit;
    }

    .marketplace-modal.open .marketplace-container {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    /* ========================================
       HEADER
       ======================================== */

    .marketplace-header {
      position: relative;
      z-index: var(--z-raised);
      padding: var(--space-lg) var(--space-lg) var(--space-md);
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-background-elevated);
    }

    .marketplace-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xs);
    }

    .marketplace-title {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
      margin: 0;
    }

    .marketplace-close {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full);
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform ${DURATION.NORMAL}ms ease, 
                  background ${DURATION.FAST}ms ease,
                  color ${DURATION.FAST}ms ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    .marketplace-close:hover,
    .marketplace-close:focus-visible {
      background: var(--color-bg-subtle);
      color: var(--color-text-primary);
      transform: rotate(90deg);
    }

    .marketplace-close:active {
      transform: rotate(90deg) scale(0.95);
    }

    .marketplace-subtitle {
      font-family: var(--font-body);
      color: var(--color-text-muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 var(--space-lg);
    }

    /* ========================================
       TABS
       ======================================== */

    .marketplace-tabs {
      display: flex;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);
      /* Subtle pill container background */
      background: var(--color-background-tertiary);
      padding: 4px;
      border-radius: 9999px;
      width: fit-content;
    }

    .marketplace-tab {
      padding: 10px 20px;
      border-radius: 9999px;
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
      display: flex;
      align-items: center;
    }

    .marketplace-tab:hover,
    .marketplace-tab:focus-visible {
      color: var(--color-text-primary);
      background: var(--color-background-glass);
    }

    .marketplace-tab.active {
      background: var(--persona-primary, var(--color-accent-primary));
      color: var(--persona-text, white);
      box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.2);
    }

    .marketplace-tab:active {
      transform: scale(0.98);
    }

    /* ========================================
       SEARCH
       ======================================== */

    .marketplace-search {
      display: flex;
      gap: var(--space-sm);
    }

    .search-input-wrapper {
      flex: 1;
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted);
      pointer-events: none;
    }

    .marketplace-search-input {
      width: 100%;
      padding: 12px 16px 12px 44px;
      border-radius: var(--radius-lg);
      background: var(--color-bg-subtle);
      border: 1.5px solid var(--color-border-medium);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: 0.9rem;
      outline: none;
      transition: border-color ${DURATION.FAST}ms ease,
                  box-shadow ${DURATION.FAST}ms ease;
    }

    .marketplace-search-input:focus {
      border-color: var(--persona-primary, var(--color-accent-primary));
      box-shadow: 0 0 0 3px var(--persona-glow, var(--color-accent-glow));
    }

    .marketplace-search-input::placeholder {
      color: var(--color-text-dimmed);
    }

    .marketplace-category-select {
      padding: 12px 16px;
      padding-right: 36px;
      border-radius: var(--radius-lg);
      background: var(--color-bg-subtle);
      border: 1.5px solid var(--color-border-medium);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: 0.875rem;
      cursor: pointer;
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: border-color ${DURATION.FAST}ms ease;
    }

    .marketplace-category-select:focus {
      border-color: var(--persona-primary, var(--color-accent-primary));
    }

    .marketplace-category-select option {
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
    }

    /* ========================================
       CONTENT AREA
       ======================================== */

    .marketplace-content {
      position: relative;
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg);
      /* Secondary background creates visual separation from header */
      background: var(--color-background-secondary);
    }
    
    /* Warm glow at top for depth using design system token */
    .marketplace-content::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 120px;
      background: var(--gradient-sunbeam);
      opacity: 0.6;
      pointer-events: none;
    }

    .marketplace-loading,
    .marketplace-empty {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-2xl) var(--space-lg);
      text-align: center;
    }

    .marketplace-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-border-subtle);
      border-top-color: var(--persona-primary, var(--color-accent-primary));
      border-radius: 50%;
      animation: spin ${DURATION.DELIBERATE}ms linear infinite;
      margin-bottom: var(--space-md);
    }

    .marketplace-loading span {
      font-family: var(--font-body);
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-illustration {
      margin-bottom: var(--space-md);
    }

    .empty-title {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs);
    }

    .empty-hint {
      font-family: var(--font-body);
      color: var(--color-text-muted);
      font-size: 0.875rem;
      margin: 0;
    }

    /* ========================================
       FOOTER
       ======================================== */

    .marketplace-footer {
      position: relative;
      z-index: var(--z-raised);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md) var(--space-lg);
      border-top: 1px solid var(--color-border-subtle);
      background: var(--color-background-elevated);
    }

    .marketplace-creator-link {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-text-muted);
      text-decoration: none;
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 500;
      transition: color ${DURATION.FAST}ms ease;
    }

    .marketplace-creator-link:hover,
    .marketplace-creator-link:focus-visible {
      color: var(--color-text-primary);
    }

    .marketplace-powered-by {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }

    /* ========================================
       AGENT GRID
       ======================================== */

    .marketplace-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md);
    }

    .agent-grid-wrapper {
      display: contents;
    }
  `;
}

