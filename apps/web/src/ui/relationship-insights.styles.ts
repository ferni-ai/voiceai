/**
 * Relationship Insights Dashboard Styles
 *
 * Extracted from relationship-insights.ui.ts for file size compliance (<500 lines per file).
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { relationshipInsightsContentStyles } from './relationship-insights-content.styles.js';

const relationshipInsightsStylesPart = `
    /* =========================================================================
       RELATIONSHIP INSIGHTS DASHBOARD
       ========================================================================= */
    
    .relationship-insights-overlay {
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

    .relationship-insights-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .relationship-insights-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .relationship-insights-modal {
      position: relative;
      width: 94%;
      max-width: clamp(392px, 90vw, 560px);
      max-height: 90vh;
      background: var(--color-bg-elevated, var(--color-white));
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px color-mix(in srgb, var(--color-black) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--color-black) 6%, transparent);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.96) translateY(8px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .relationship-insights-overlay.open .relationship-insights-modal {
      transform: scale(1) translateY(0);
    }

    /* =========================================================================
       HEADER
       ========================================================================= */
    
    .ri-header {
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
    }

    .ri-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .ri-header-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .ri-icon {
      color: var(--persona-ink);
    }

    .ri-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-ink);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .ri-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.2;
    }

    .ri-close {
      width: var(--space-10, 2.5rem);
      height: var(--space-10, 2.5rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .ri-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary);
    }

    /* =========================================================================
       TABS
       ========================================================================= */
    
    .ri-tabs {
      display: flex;
      gap: var(--space-1, 0.25rem);
      padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.06));
    }

    .ri-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1-5, 0.375rem);
      padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
      border: none;
      background: transparent;
      border-radius: var(--radius-lg, 1rem);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 500;
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ri-tab:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary);
    }

    .ri-tab.active {
      background: var(--persona-primary, var(--color-ferni));
      color: var(--color-white);
    }

    .ri-tab svg {
      width: 14px;
      height: 14px;
    }

    /* =========================================================================
       CONTENT
       ========================================================================= */
    
    .ri-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5, 1.25rem) var(--space-6, 1.5rem);
    }

    /* =========================================================================
       LOADING STATE
       ========================================================================= */
    
    .ri-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 3rem);
    }

    .ri-spinner {
      animation: ri-spin 1s linear infinite;
      color: var(--persona-ink);
      margin-bottom: var(--space-3, 0.75rem);
    }

    @keyframes ri-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .ri-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted);
    }

    /* =========================================================================
       STATS GRID
       ========================================================================= */
    
    .ri-stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 0.75rem);
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ri-stat {
      background: var(--color-bg-secondary, color-mix(in srgb, var(--color-white) 50%, transparent));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-3, 0.75rem);
      text-align: center;
    }

    .ri-stat-value {
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary);
      line-height: 1;
    }

    .ri-stat-label {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted);
      margin-top: var(--space-1, 0.25rem);
    }

    .ri-stat.highlight {
      background: var(--persona-tint, color-mix(in srgb, var(--color-ferni) 10%, transparent));
    }

    .ri-stat.highlight .ri-stat-value {
      color: var(--persona-ink);
    }

    .ri-stat.warning {
      background: var(--color-semantic-error-tint);
    }

    .ri-stat.warning .ri-stat-value {
      color: var(--color-semantic-error-text);
    }

    /* =========================================================================
       BREAKDOWN
       ========================================================================= */
    
    .ri-breakdown {
      background: var(--color-bg-secondary, color-mix(in srgb, var(--color-white) 50%, transparent));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ri-breakdown-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .ri-breakdown-items {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }

    .ri-breakdown-item {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .ri-breakdown-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
    }

    .ri-breakdown-icon svg {
      width: 16px;
      height: 16px;
    }

    .ri-breakdown-label {
      flex: 1;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary);
    }

    .ri-breakdown-value {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary);
    }

`;

export const relationshipInsightsStyles =
  relationshipInsightsStylesPart + relationshipInsightsContentStyles;
