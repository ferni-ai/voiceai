/**
 * Relationship Insights Dashboard Styles (tabs content, insights, activity,
 * responsive and reduced motion). Concatenated by relationship-insights.styles.ts.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

export const relationshipInsightsContentStyles = `    /* =========================================================================
       STRENGTH CHART
       ========================================================================= */
    
    .ri-strength-chart {
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ri-chart-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .ri-chart-bars {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }

    .ri-chart-bar {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
    }

    .ri-chart-bar-label {
      width: 60px;
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .ri-chart-bar-track {
      flex: 1;
      height: 8px;
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
    }

    .ri-chart-bar-fill {
      height: 100%;
      border-radius: var(--radius-full, 9999px);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .ri-chart-bar-value {
      width: 30px;
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--color-text-secondary, #5a4a42);
      text-align: right;
    }

    /* =========================================================================
       INSIGHTS LIST
       ========================================================================= */
    
    .ri-insights {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }

    .ri-insight {
      display: flex;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border-radius: var(--radius-lg, 1rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ri-insight:hover {
      background: var(--color-background-elevated, #FFFDFB);
      box-shadow: var(--shadow-sm);
    }

    .ri-insight-priority {
      width: 4px;
      border-radius: var(--radius-full, 9999px);
      flex-shrink: 0;
    }

    .ri-insight-content {
      flex: 1;
      min-width: 0;
    }

    .ri-insight-title {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-0-5, 0.125rem);
    }

    .ri-insight-desc {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.4;
    }

    .ri-insight-contact {
      font-size: var(--text-xs, 0.75rem);
      color: var(--persona-ink);
      font-weight: 500;
      margin-top: var(--space-1, 0.25rem);
    }

    .ri-insight-arrow {
      color: var(--color-text-muted, #70605a);
      align-self: center;
    }

    .ri-empty {
      text-align: center;
      padding: var(--space-8, 2rem);
      color: var(--color-text-muted, #70605a);
    }

    .ri-empty-icon {
      margin-bottom: var(--space-3, 0.75rem);
      opacity: 0.4;
    }

    /* =========================================================================
       ACTIVITY CHART
       ========================================================================= */
    
    .ri-activity {
      margin-bottom: var(--space-4, 1rem);
    }

    .ri-activity-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .ri-activity-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: var(--space-1, 0.25rem);
    }

    .ri-activity-cell {
      aspect-ratio: 1;
      border-radius: var(--radius-sm, 0.25rem);
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
    }

    .ri-activity-cell.level-1 {
      background: rgba(74, 103, 65, 0.2);
    }

    .ri-activity-cell.level-2 {
      background: rgba(74, 103, 65, 0.4);
    }

    .ri-activity-cell.level-3 {
      background: rgba(74, 103, 65, 0.6);
    }

    .ri-activity-cell.level-4 {
      background: var(--persona-primary, #4a6741);
    }

    .ri-activity-legend {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: var(--space-1, 0.25rem);
      margin-top: var(--space-2, 0.5rem);
      font-size: var(--text-xxs, 0.625rem);
      color: var(--color-text-muted, #70605a);
    }

    .ri-activity-legend-cell {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    /* =========================================================================
       ERROR STATE
       ========================================================================= */
    
    .ri-error {
      text-align: center;
      padding: var(--space-8, 2rem);
      color: var(--color-semantic-error-text);
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */
    
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .relationship-insights-modal {
        width: 100%;
        max-width: none;
        max-height: 95vh;
        border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
        margin-top: auto;
      }

      .ri-stats-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */
    
    @media (prefers-reduced-motion: reduce) {
      .relationship-insights-overlay,
      .relationship-insights-modal,
      .ri-tab,
      .ri-insight,
      .ri-spinner,
      .ri-chart-bar-fill {
        transition: none;
        animation: none;
      }
    }
  `;
