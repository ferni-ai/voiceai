/**
 * Trust Journey Styles
 *
 * CSS for the Trust Journey modal.
 * Uses CSS custom properties from the design system.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

/**
 * Inject styles into the document head
 */
export function injectStyles(): HTMLStyleElement {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-trust-journey-styles', '');
  styleElement.textContent = getStyles();
  document.head.appendChild(styleElement);
  return styleElement;
}

/**
 * Remove styles from document
 */
export function removeStyles(styleElement: HTMLStyleElement | null): void {
  styleElement?.remove();
}

function getStyles(): string {
  return `
    /* ========================================================================
       TRUST JOURNEY PANEL - Full-screen immersive experience
       ======================================================================== */
    .trust-journey-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, 
                  visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .trust-journey-panel.visible {
      opacity: 1;
      visibility: visible;
    }
    
    .trust-journey-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .trust-journey-card {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(504px, 90vw, 720px);
      width: calc(100% - var(--space-8, 32px));
      max-height: calc(100vh - var(--space-12, 48px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.92) translateY(30px);
      opacity: 0;
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                  opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
    }
    
    .trust-journey-panel.visible .trust-journey-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    
    /* Header */
    .trust-journey-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
      background: linear-gradient(to bottom, var(--persona-tint, rgba(74, 103, 65, 0.05)), transparent);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .trust-journey-header-content { flex: 1; }
    
    .trust-journey-eyebrow {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
      margin-bottom: var(--space-1, 4px);
    }
    
    .trust-journey-eyebrow svg { width: 14px; height: 14px; }
    
    .trust-journey-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
      line-height: var(--leading-tight, 1.2);
    }
    
    .trust-journey-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
    }
    
    .trust-journey-actions {
      display: flex;
      gap: var(--space-2, 8px);
    }
    
    .trust-journey-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .trust-journey-action-btn:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
      transform: scale(1.05);
    }
    
    .trust-journey-action-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, var(--persona-primary, #4a6741));
      outline-offset: 2px;
      background: var(--color-background-tertiary, #E8E0D5);
    }
    
    .trust-journey-action-btn:active { transform: scale(0.95); }
    .trust-journey-action-btn svg { width: 18px; height: 18px; }
    .trust-journey-action-btn.loading svg { animation: spin 1s linear infinite; }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    /* Content */
    .trust-journey-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }
    
    .trust-journey-content[aria-live] { min-height: 200px; }
    
    /* Relationship Strength Meter */
    .trust-strength-section { margin-bottom: var(--space-8, 32px); }
    
    .trust-strength-ring {
      position: relative;
      width: min(180px, 100%);
      height: 180px;
      margin: 0 auto var(--space-4, 16px);
    }
    
    .trust-strength-ring svg { transform: rotate(-90deg); }
    
    .trust-strength-bg {
      fill: none;
      stroke: var(--color-background-tertiary, #E8E0D5);
      stroke-width: 12;
    }
    
    .trust-strength-fill {
      fill: none;
      stroke: url(#trustGradient);
      stroke-width: 12;
      stroke-linecap: round;
      stroke-dasharray: 440;
      stroke-dashoffset: 440;
      transition: stroke-dashoffset 1.5s ${EASING.EXPO_OUT};
    }
    
    .trust-strength-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .trust-strength-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-4xl, 40px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }
    
    .trust-strength-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .trust-strength-description {
      text-align: center;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      max-width: min(400px, 100%);
      margin: 0 auto;
      line-height: var(--leading-relaxed, 1.6);
    }
    
    /* Stats Grid */
    .trust-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-8, 32px);
    }
    
    .trust-stat-card {
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      text-align: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      cursor: default;
    }
    
    .trust-stat-card:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      transform: translateY(-2px);
    }
    
    .trust-stat-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin: 0 auto var(--space-2, 8px);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
    }
    
    .trust-stat-icon svg { width: 20px; height: 20px; }
    
    .trust-stat-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
      margin-bottom: var(--space-1, 4px);
    }
    
    .trust-stat-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    /* Section Headers */
    .trust-section { margin-bottom: var(--space-6, 24px); }
    
    .trust-section-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }
    
    .trust-section-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--persona-primary, #4a6741) 0%, var(--persona-secondary, #3d5a35) 100%);
      border-radius: var(--radius-md, 8px);
      color: white;
    }
    
    .trust-section-icon svg { width: 16px; height: 16px; }
    
    .trust-section-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    /* Growth Patterns */
    .growth-patterns-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .growth-pattern-tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-accent-text, var(--persona-primary, #4a6741));
    }
    
    .growth-pattern-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-bold, 700);
      color: white;
    }
    
    /* Timeline */
    .trust-timeline {
      position: relative;
      padding-left: var(--space-6, 24px);
    }
    
    .trust-timeline::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: linear-gradient(to bottom, var(--persona-primary, #4a6741), transparent);
      border-radius: 1px;
    }
    
    .timeline-item {
      position: relative;
      padding-bottom: var(--space-4, 16px);
      animation: timelineFadeIn ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
      opacity: 0;
      transform: translateX(-10px);
    }
    
    @keyframes timelineFadeIn {
      to { opacity: 1; transform: translateX(0); }
    }
    
    .timeline-item::before {
      content: '';
      position: absolute;
      left: calc(-1 * var(--space-6, 24px) + 4px);
      top: 6px;
      width: 10px;
      height: 10px;
      background: var(--color-background-elevated, #FFFDFB);
      border: 2px solid var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
    }
    
    .timeline-item--growth::before { border-color: var(--color-semantic-success, #3d7a52); }
    .timeline-item--win::before { border-color: var(--color-semantic-warning, #c49a6c); }
    .timeline-item--callback::before { border-color: var(--color-semantic-info, #3a6b9c); }
    
    .timeline-date {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-1, 4px);
    }
    
    .timeline-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 4px);
    }
    
    .timeline-description {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      line-height: var(--leading-relaxed, 1.5);
    }
    
    .timeline-load-more {
      display: flex;
      justify-content: center;
      margin-top: var(--space-4, 16px);
    }
    
    .timeline-load-more-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .timeline-load-more-btn:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }
    
    .timeline-load-more-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, var(--persona-primary, #4a6741));
      outline-offset: 2px;
    }
    
    .timeline-load-more-btn svg { width: 16px; height: 16px; }
    
    /* Timeline Filter Tabs */
    .timeline-filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
      padding-bottom: var(--space-3, 12px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
    }
    
    .timeline-filter-tab {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-1, 4px) var(--space-3, 12px);
      background: transparent;
      border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .timeline-filter-tab:hover {
      background: var(--color-background-secondary, #F5F1E8);
      border-color: var(--color-border-medium, rgba(0,0,0,0.15));
    }
    
    .timeline-filter-tab--active {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
    }
    
    .timeline-filter-tab--active:hover {
      background: var(--persona-tint, rgba(74, 103, 65, 0.15));
    }
    
    .timeline-filter-tab:focus-visible {
      outline: 2px solid var(--color-accent-primary, var(--persona-primary, #4a6741));
      outline-offset: 2px;
    }
    
    .timeline-filter-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 var(--space-1, 4px);
      background: var(--color-background-tertiary, #E8E0D5);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-2xs, 10px);
      font-weight: var(--font-weight-bold, 700);
    }
    
    .timeline-filter-tab--active .timeline-filter-count {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    /* Boundaries Message */
    .boundaries-message {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.05)), transparent);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }
    
    .boundaries-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      color: white;
      flex-shrink: 0;
    }
    
    .boundaries-icon svg { width: 22px; height: 22px; }
    
    .boundaries-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      line-height: var(--leading-relaxed, 1.6);
    }
    
    /* Loading State */
    .trust-journey-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-16, 64px);
      text-align: center;
    }
    
    .trust-journey-loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--color-background-tertiary, #E8E0D5);
      border-top-color: var(--color-text-secondary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-4, 16px);
    }
    
    .trust-journey-loading-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
    }
    
    /* Skeleton Loading */
    .trust-journey-skeleton { padding: var(--space-6, 24px); }
    
    .skeleton-ring {
      width: min(180px, 100%);
      height: 180px;
      margin: 0 auto var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: 50%;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }
    
    .skeleton-text {
      height: 16px;
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-sm, 4px);
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }
    
    .skeleton-text--short { width: 60%; margin: 0 auto; }
    .skeleton-text--medium { width: 80%; margin: var(--space-2, 8px) auto; }
    
    .skeleton-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin: var(--space-8, 32px) 0;
    }
    
    .skeleton-stat {
      height: 100px;
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    /* Empty State */
    .trust-journey-empty {
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
    }
    
    .trust-journey-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .trust-journey-empty-icon svg { width: 36px; height: 36px; }
    
    .trust-journey-empty-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 20px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 8px);
    }
    
    .trust-journey-empty-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      max-width: min(320px, 100%);
      margin: 0 auto;
    }
    
    /* Error State */
    .trust-journey-error {
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
    }
    
    .trust-journey-error-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4, 16px);
      background: var(--color-semantic-error-tint, rgba(200, 100, 100, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--color-semantic-error, #c46464);
    }
    
    .trust-journey-error-icon svg { width: 28px; height: 28px; }
    
    .trust-journey-error-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-2, 8px);
    }
    
    .trust-journey-error-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin-bottom: var(--space-4, 16px);
    }
    
    .trust-journey-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--persona-primary, #4a6741);
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .trust-journey-retry-btn:hover { background: var(--persona-secondary, #3d5a35); }
    .trust-journey-retry-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, var(--persona-primary, #4a6741));
      outline-offset: 2px;
    }
    
    /* Offline Banner */
    .trust-journey-offline-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--color-semantic-warning-tint, rgba(196, 154, 108, 0.1));
      color: var(--color-semantic-warning, #9a7a5a);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .trust-journey-offline-banner svg { width: 16px; height: 16px; }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .trust-journey-backdrop {
      background: var(--backdrop-heavy, rgba(20, 18, 16, 0.8));
    }
    
    [data-theme="midnight"] .trust-journey-card {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .trust-journey-title,
    [data-theme="midnight"] .trust-section-title,
    [data-theme="midnight"] .trust-stat-value,
    [data-theme="midnight"] .trust-strength-value,
    [data-theme="midnight"] .timeline-title,
    [data-theme="midnight"] .trust-journey-empty-title,
    [data-theme="midnight"] .trust-journey-error-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .trust-journey-subtitle,
    [data-theme="midnight"] .trust-strength-description,
    [data-theme="midnight"] .boundaries-text,
    [data-theme="midnight"] .timeline-description,
    [data-theme="midnight"] .trust-journey-empty-text,
    [data-theme="midnight"] .trust-journey-error-text {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .trust-stat-card,
    [data-theme="midnight"] .growth-pattern-tag,
    [data-theme="midnight"] .trust-journey-action-btn,
    [data-theme="midnight"] .timeline-load-more-btn,
    [data-theme="midnight"] .timeline-filter-tab {
      background: var(--color-background-secondary, #60504a);
      border-color: var(--color-border-subtle, rgba(255,255,255,0.1));
    }
    
    [data-theme="midnight"] .trust-stat-card:hover,
    [data-theme="midnight"] .trust-journey-action-btn:hover,
    [data-theme="midnight"] .timeline-load-more-btn:hover,
    [data-theme="midnight"] .timeline-filter-tab:hover {
      background: var(--color-background-tertiary, #504540);
    }
    
    [data-theme="midnight"] .timeline-filter-tab--active {
      background: var(--persona-tint, rgba(74, 103, 65, 0.2));
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #6a9761);
    }
    
    [data-theme="midnight"] .timeline-filter-count {
      background: var(--color-background-tertiary, #504540);
    }
    
    [data-theme="midnight"] .timeline-filter-tabs {
      border-bottom-color: var(--color-border-subtle, rgba(255,255,255,0.1));
    }
    
    [data-theme="midnight"] .trust-stat-icon {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .trust-strength-bg {
      stroke: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .trust-journey-eyebrow,
    [data-theme="midnight"] .trust-strength-label,
    [data-theme="midnight"] .trust-stat-label,
    [data-theme="midnight"] .timeline-date {
      color: var(--color-text-muted, #e8e2da);
    }
    
    [data-theme="midnight"] .skeleton-ring,
    [data-theme="midnight"] .skeleton-text,
    [data-theme="midnight"] .skeleton-stat {
      background: var(--color-background-secondary, #60504a);
    }
    
    /* ========================================================================
       RESPONSIVE
       ======================================================================== */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .trust-journey-card {
        max-height: calc(100vh - var(--space-4, 16px));
        border-radius: var(--radius-xl, 20px);
      }
      
      .trust-stats-grid { grid-template-columns: repeat(2, 1fr); }
      .skeleton-stats { grid-template-columns: repeat(2, 1fr); }
      
      .trust-strength-ring { width: min(140px, 100%); height: 140px; }
      .skeleton-ring { width: min(140px, 100%); height: 140px; }
      
      .trust-strength-value { font-size: var(--text-3xl, 32px); }
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .trust-journey-panel,
      .trust-journey-card,
      .trust-stat-card,
      .trust-strength-fill,
      .timeline-item {
        transition: none !important;
        animation: none !important;
      }
      
      .timeline-item { opacity: 1; transform: none; }
      .trust-journey-action-btn.loading svg { animation: none; }
      
      .skeleton-ring,
      .skeleton-text,
      .skeleton-stat { animation: none; }
    }
  `;
}

