/**
 * Voice Journal Styles
 *
 * CSS styles using design system tokens.
 * All values use CSS variables - no hardcoded colors/sizes.
 *
 * @module voice-journal/styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

// ============================================================================
// STYLES
// ============================================================================

export function getJournalStyles(): string {
  return `
    /* ========================================================================
       JOURNAL OVERLAY & CONTAINER
       ======================================================================== */
    
    .voice-journal-overlay {
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
    
    .voice-journal-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .journal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    .journal-container {
      position: relative;
      width: 90vw;
      max-width: clamp(476px, 90vw, 680px);
      max-height: 90vh;
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .voice-journal-overlay.open .journal-container {
      transform: scale(1);
    }
    
    /* ========================================================================
       HEADER
       ======================================================================== */
    
    .journal-header {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .journal-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
      margin: 0;
    }
    
    .journal-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: 2px 0 0;
    }
    
    .journal-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
    }
    
    .journal-action-btn,
    .journal-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-action-btn:hover,
    .journal-action-btn:focus-visible,
    .journal-close:hover,
    .journal-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* ========================================================================
       TABS
       ======================================================================== */
    
    .journal-tabs {
      display: flex;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 8px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }
    
    .journal-tab {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      background: none;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-tab:hover,
    .journal-tab:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
    }
    
    .journal-tab--active {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .journal-tab--active:hover,
    .journal-tab--active:focus-visible {
      background: var(--color-accent, #4a6741);
      color: white;
      filter: brightness(1.1);
    }
    
    /* ========================================================================
       TAB CONTENT
       ======================================================================== */
    
    .journal-content {
      flex: 1;
      overflow-y: auto;
    }
    
    .journal-tab-content {
      display: none;
      padding: var(--space-lg, 24px);
    }
    
    .journal-tab-content--active {
      display: block;
    }
    
    /* ========================================================================
       PROMPT CARD
       ======================================================================== */
    
    .journal-prompt-section {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .prompt-card {
      background: linear-gradient(135deg, 
        var(--color-accent-subtle, rgba(74, 103, 65, 0.15)), 
        var(--color-accent-subtle-fade, rgba(74, 103, 65, 0.05)));
      border: 1px solid var(--color-accent-border, rgba(74, 103, 65, 0.3));
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-lg, 20px);
    }
    
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .prompt-category {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent, #4a6741);
    }
    
    .prompt-difficulty {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.75rem;
    }
    
    .prompt-difficulty--gentle {
      color: var(--color-semantic-success, #4a6741);
    }
    
    .prompt-difficulty--moderate {
      color: var(--color-semantic-warning, #c4856a);
    }
    
    .prompt-difficulty--deep {
      color: var(--color-accent, #4a6741);
    }
    
    .prompt-text {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--color-text-primary);
      line-height: 1.5;
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .prompt-followup {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      font-style: italic;
      margin: 0 0 var(--space-md, 12px);
    }
    
    .prompt-shuffle {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: none;
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-muted);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .prompt-shuffle:hover,
    .prompt-shuffle:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* ========================================================================
       RECORDER
       ======================================================================== */
    
    .journal-recorder {
      text-align: center;
    }
    
    .recorder-visualizer {
      position: relative;
      width: min(180px, 100%);
      height: 180px;
      margin: 0 auto var(--space-lg, 24px);
    }
    
    #journal-visualizer {
      width: 100%;
      height: 100%;
    }
    
    .recorder-time {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: var(--font-mono, 'Space Mono', monospace);
      font-size: 1.5rem;
      color: var(--color-text-primary, #fff);
    }
    
    .recorder-controls {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .recorder-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--color-accent, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .recorder-btn:hover,
    .recorder-btn:focus-visible {
      filter: brightness(1.1);
    }
    
    .recorder-btn.recording {
      background: var(--color-semantic-error, #dc2626);
      animation: pulse-recording 1.5s infinite;
    }
    
    @keyframes pulse-recording {
      0%, 100% { box-shadow: 0 0 0 0 var(--color-semantic-error-glow, rgba(220, 38, 38, 0.4)); }
      50% { box-shadow: 0 0 0 10px var(--color-semantic-error-transparent, rgba(220, 38, 38, 0)); }
    }
    
    /* ========================================================================
       MOOD SELECTOR
       ======================================================================== */
    
    .mood-selector {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, 8px);
    }
    
    .mood-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }
    
    .mood-options {
      display: flex;
      gap: var(--space-xs, 4px);
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .mood-option {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms;
    }
    
    .mood-option:hover,
    .mood-option:focus-visible {
      background: var(--color-bg-tertiary);
      transform: scale(1.1);
    }
    
    .mood-option--selected {
      border-color: var(--color-accent, #4a6741);
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.2));
    }
    
    .mood-icon {
      color: var(--color-text-secondary);
    }
    
    .mood-option--selected .mood-icon {
      color: var(--color-accent, #4a6741);
    }
    
    /* ========================================================================
       STATS
       ======================================================================== */
    
    .journal-stats {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-md, 16px);
    }
    
    .stat-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-md, 16px);
      text-align: center;
    }
    
    .stat-icon {
      font-size: 1.25rem;
      margin-bottom: var(--space-xs, 4px);
      color: var(--color-text-secondary);
    }
    
    .stat-icon--mood {
      color: var(--color-accent);
    }
    
    .stat-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    
    .stat-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stats-activity {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 12px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .activity-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    
    .activity-bars {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      flex: 1;
      height: 30px;
    }
    
    .activity-bar {
      flex: 1;
      min-height: 4px;
      background: var(--color-accent, #4a6741);
      border-radius: 2px;
      transition: height ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    /* ========================================================================
       CALENDAR
       ======================================================================== */
    
    .journal-calendar {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-sm, 12px);
    }
    
    .calendar-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    
    .calendar-nav {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 4px);
      border-radius: var(--radius-sm, 4px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .calendar-nav:hover,
    .calendar-nav:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }
    
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    
    .calendar-day-name {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--color-text-muted);
      text-align: center;
      padding: var(--space-xs, 4px);
    }
    
    .calendar-day {
      position: relative;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-sm, 4px);
      cursor: default;
    }
    
    .calendar-day--empty {
      background: transparent;
    }
    
    .calendar-day--today {
      font-weight: 600;
      color: var(--color-accent, #4a6741);
    }
    
    .calendar-day--has-entry {
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.2));
      color: var(--color-text-primary);
    }
    
    .calendar-dot {
      position: absolute;
      bottom: 3px;
      width: 4px;
      height: 4px;
      background: var(--color-accent, #4a6741);
      border-radius: 50%;
    }
    
    /* ========================================================================
       ENTRIES
       ======================================================================== */
    
    .journal-entries {
      margin-top: var(--space-md, 16px);
    }
    
    .entries-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 var(--space-md, 16px);
    }
    
    .entries-empty {
      text-align: center;
      padding: var(--space-xl, 32px);
      color: var(--color-text-muted);
    }
    
    .entries-empty-text {
      font-size: 0.95rem;
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .entries-empty-hint {
      font-size: 0.85rem;
      opacity: 0.7;
      margin: 0;
    }
    
    .entries-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 10px);
    }
    
    .journal-entry {
      padding: var(--space-md, 14px);
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    }
    
    .journal-entry--auto {
      background: linear-gradient(135deg, 
        var(--color-accent-subtle, rgba(61, 90, 69, 0.08)), 
        var(--color-bg-secondary, rgba(255, 255, 255, 0.05))
      );
      border-left: 3px solid var(--color-accent, #3d5a45);
    }
    
    .entry-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-xs, 6px);
    }
    
    .entry-source {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-accent, #3d5a45);
      background: var(--color-accent-subtle, rgba(61, 90, 69, 0.15));
      padding: 2px 8px;
      border-radius: var(--radius-full, 9999px);
    }
    
    .entry-date {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }
    
    .entry-mood {
      display: flex;
      align-items: center;
      color: var(--color-text-secondary);
    }
    
    .entry-content {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-primary, #fff);
      margin: 0;
      line-height: 1.5;
    }
    
    .entry-audio {
      width: 100%;
      margin-top: var(--space-sm, 8px);
      height: 28px;
    }
    
    /* ========================================================================
       INSIGHTS
       ======================================================================== */
    
    .insights-empty {
      text-align: center;
      padding: var(--space-2xl, 48px) var(--space-lg, 24px);
    }
    
    .insights-empty-icon {
      color: var(--color-text-muted);
      margin-bottom: var(--space-md, 16px);
    }
    
    .insights-empty-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .insights-empty-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-lg, 24px);
      max-width: min(280px, 100%);
      margin-inline: auto;
    }
    
    .insights-cta {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--color-accent, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .insights-cta:hover,
    .insights-cta:focus-visible {
      filter: brightness(1.1);
    }
    
    .insights-header {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .insights-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .insights-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin: 0;
    }
    
    .insights-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .insight-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
    }
    
    .insight-icon {
      flex-shrink: 0;
      color: var(--color-accent);
    }
    
    .insight-content {
      flex: 1;
    }
    
    .insight-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .insight-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }
    
    /* ========================================================================
       ENTRY DELETE BUTTON
       ======================================================================== */
    
    .entry-header {
      position: relative;
    }
    
    .entry-delete {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 4px);
      border-radius: var(--radius-sm, 4px);
      opacity: 0;
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-entry:hover .entry-delete,
    .journal-entry:focus-within .entry-delete {
      opacity: 1;
    }
    
    .entry-delete:hover,
    .entry-delete:focus-visible {
      background: var(--color-semantic-error-subtle, rgba(220, 38, 38, 0.1));
      color: var(--color-semantic-error, #dc2626);
    }
    
    /* ========================================================================
       CALENDAR FILTER
       ======================================================================== */
    
    .calendar-day--has-entry {
      cursor: pointer;
    }
    
    .calendar-day--has-entry:hover,
    .calendar-day--has-entry:focus-visible {
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.3));
      transform: scale(1.1);
    }
    
    .calendar-day--selected {
      background: var(--color-accent, #4a6741) !important;
      color: white !important;
    }
    
    .calendar-day--selected .calendar-dot {
      background: white;
    }
    
    .calendar-filter-active {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm, 8px);
      margin-top: var(--space-sm, 8px);
      padding: var(--space-sm, 8px) var(--space-md, 12px);
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-md, 8px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    
    .calendar-clear-filter {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs, 4px);
      background: none;
      border: none;
      color: var(--color-accent, #4a6741);
      cursor: pointer;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.8rem;
      font-weight: 500;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      border-radius: var(--radius-sm, 4px);
      transition: background ${DURATION.FAST}ms;
    }
    
    .calendar-clear-filter:hover,
    .calendar-clear-filter:focus-visible {
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.2));
    }
    
    .entries-clear-filter {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 10px) var(--space-md, 16px);
      background: var(--color-accent, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: var(--space-md, 16px);
      transition: filter ${DURATION.FAST}ms;
    }
    
    .entries-clear-filter:hover,
    .entries-clear-filter:focus-visible {
      filter: brightness(1.1);
    }
    
    /* ========================================================================
       SEARCH BOX
       ======================================================================== */
    
    .journal-search {
      position: relative;
      margin-bottom: var(--space-md, 16px);
    }
    
    .journal-search-input {
      width: 100%;
      padding: var(--space-sm, 10px) var(--space-md, 16px);
      padding-left: var(--space-2xl, 40px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-primary);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.9rem;
      transition: border-color ${DURATION.FAST}ms;
    }
    
    .journal-search-input:focus {
      outline: none;
      border-color: var(--color-accent, #4a6741);
    }
    
    .journal-search-input::placeholder {
      color: var(--color-text-muted);
    }
    
    .journal-search-icon {
      position: absolute;
      left: var(--space-md, 14px);
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-muted);
      pointer-events: none;
    }
    
    /* ========================================================================
       SEARCH HIGHLIGHTS & FILTER INDICATORS
       ======================================================================== */
    
    .search-highlight {
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.3));
      color: var(--color-text-primary);
      padding: 0 2px;
      border-radius: 2px;
    }
    
    .entries-filter-indicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-sm, 8px) var(--space-md, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-md, 16px);
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    
    .entries-filter-clear-btn {
      background: none;
      border: none;
      color: var(--color-accent, #4a6741);
      cursor: pointer;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.8rem;
      font-weight: 500;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      border-radius: var(--radius-sm, 4px);
      transition: background ${DURATION.FAST}ms;
    }
    
    .entries-filter-clear-btn:hover,
    .entries-filter-clear-btn:focus-visible {
      background: var(--color-accent-subtle, rgba(74, 103, 65, 0.1));
    }
    
    /* ========================================================================
       MOOD ANALYTICS CHART
       ======================================================================== */
    
    .mood-analytics {
      margin-top: var(--space-lg, 24px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
    }
    
    .mood-analytics-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-md, 16px);
    }
    
    .mood-chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 100px;
      padding-top: var(--space-sm, 8px);
    }
    
    .mood-bar {
      flex: 1;
      min-width: 24px;
      background: var(--color-accent, #4a6741);
      border-radius: var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0;
      position: relative;
      transition: height ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .mood-bar::after {
      content: attr(data-label);
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.65rem;
      color: var(--color-text-muted);
      white-space: nowrap;
    }
    
    .mood-legend {
      display: flex;
      justify-content: center;
      gap: var(--space-md, 16px);
      margin-top: var(--space-lg, 28px);
      flex-wrap: wrap;
    }
    
    .mood-legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }
    
    .mood-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    /* ========================================================================
       RESPONSIVE
       ======================================================================== */
    
    @media (max-width: 640px) {
      .journal-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .recorder-visualizer {
        width: min(150px, 100%);
        height: 150px;
      }
      
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
      }
      
      .stat-card {
        padding: var(--space-sm, 12px);
      }
      
      .stat-value {
        font-size: 1.25rem;
      }
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    
    @media (prefers-reduced-motion: reduce) {
      .voice-journal-overlay,
      .journal-container,
      .journal-tab,
      .prompt-shuffle,
      .mood-option,
      .recorder-btn,
      .activity-bar {
        transition: none;
      }
      
      .recorder-btn.recording {
        animation: none;
      }
    }
  `;
}

