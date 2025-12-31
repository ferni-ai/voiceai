/**
 * Relationship Insights Dashboard UI
 *
 * A dashboard showing patterns and insights across all your relationships.
 * Help users maintain their connections and understand their relationship health.
 *
 * @module ui/relationship-insights
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { t } from '../i18n/index.js';

const log = createLogger('RelationshipInsightsUI');

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipInsight {
  id: string;
  type: 'nudge' | 'pattern' | 'milestone' | 'warning';
  title: string;
  description: string;
  actionLabel?: string;
  contactId?: string;
  contactName?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RelationshipStats {
  totalPeople: number;
  familyCount: number;
  friendCount: number;
  colleagueCount: number;
  averageStrength: number;
  upcomingDates: number;
  needsAttention: number;
}

export interface RelationshipInsightsData {
  stats: RelationshipStats;
  insights: RelationshipInsight[];
  strengthDistribution: { label: string; value: number; color: string }[];
  recentActivity: { date: string; count: number }[];
}

export interface RelationshipInsightsOptions {
  onSelectPerson?: (contactId: string) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

interface RelationshipInsightsState {
  isOpen: boolean;
  data: RelationshipInsightsData | null;
  isLoading: boolean;
  error: string | null;
  activeTab: 'overview' | 'insights' | 'activity';
}

let state: RelationshipInsightsState = {
  isOpen: false,
  data: null,
  isLoading: false,
  error: null,
  activeTab: 'overview',
};

let modalContainer: HTMLElement | null = null;
let callbacks: RelationshipInsightsOptions = {};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  chart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  alertTriangle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  sparkles: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  trendUp: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  activity: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  loader: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ri-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  briefcase: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
};

// Priority colors
const PRIORITY_COLORS: Record<RelationshipInsight['priority'], string> = {
  high: 'var(--color-semantic-error, #c44)',
  medium: 'var(--nayan-primary, #b8956a)',
  low: 'var(--persona-primary, #4a6741)',
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('relationship-insights-styles')) return;

  const style = document.createElement('style');
  style.id = 'relationship-insights-styles';
  style.textContent = `
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
      color: var(--persona-primary, #4a6741);
    }

    .ri-eyebrow {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .ri-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
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
      color: var(--color-text-muted, #70605a);
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      margin: calc(-1 * var(--space-2, 0.5rem)) calc(-1 * var(--space-2, 0.5rem)) 0 0;
    }

    .ri-close:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      color: var(--color-text-primary, #2C2520);
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
      color: var(--color-text-muted, #70605a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .ri-tab:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.04));
      color: var(--color-text-secondary, #5a4a42);
    }

    .ri-tab.active {
      background: var(--persona-primary, #4a6741);
      color: white;
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
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 0.75rem);
    }

    @keyframes ri-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .ri-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
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
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-3, 0.75rem);
      text-align: center;
    }

    .ri-stat-value {
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }

    .ri-stat-label {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }

    .ri-stat.highlight {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }

    .ri-stat.highlight .ri-stat-value {
      color: var(--persona-primary, #4a6741);
    }

    .ri-stat.warning {
      background: var(--color-semantic-error-tint);
    }

    .ri-stat.warning .ri-stat-value {
      color: var(--color-semantic-error, #c44);
    }

    /* =========================================================================
       BREAKDOWN
       ========================================================================= */
    
    .ri-breakdown {
      background: var(--color-bg-secondary, rgba(250, 248, 245, 0.5));
      border-radius: var(--radius-lg, 1rem);
      padding: var(--space-4, 1rem);
      margin-bottom: var(--space-5, 1.25rem);
    }

    .ri-breakdown-title {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
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
      color: var(--color-text-muted, #70605a);
    }

    .ri-breakdown-icon svg {
      width: 16px;
      height: 16px;
    }

    .ri-breakdown-label {
      flex: 1;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4a42);
    }

    .ri-breakdown-value {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    /* =========================================================================
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
      color: var(--persona-primary, #4a6741);
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
      color: var(--color-semantic-error, #c44);
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
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const modal = modalContainer.querySelector('.relationship-insights-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="ri-header">
      <div class="ri-header-row">
        <div class="ri-header-title">
          <span class="ri-icon">${ICONS.chart}</span>
          <div>
            <div class="ri-eyebrow">Relationship Health</div>
            <h2 class="ri-title">Your People Insights</h2>
          </div>
        </div>
        <button class="ri-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      </div>
    </div>
    
    <div class="ri-tabs">
      <button aria-label="${t('accessibility.overview')}" class="ri-tab ${state.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
        ${ICONS.chart} Overview
      </button>
      <button aria-label="${t('accessibility.insights')}" class="ri-tab ${state.activeTab === 'insights' ? 'active' : ''}" data-tab="insights">
        ${ICONS.sparkles} Insights
      </button>
      <button aria-label="${t('accessibility.activity')}" class="ri-tab ${state.activeTab === 'activity' ? 'active' : ''}" data-tab="activity">
        ${ICONS.activity} Activity
      </button>
    </div>
    
    <div class="ri-content">
      ${renderContent()}
    </div>
  `;

  bindEvents();
}

function renderContent(): string {
  if (state.isLoading) {
    return `
      <div class="ri-loading">
        ${ICONS.loader}
        <p class="ri-loading-text">Analyzing your relationships...</p>
      </div>
    `;
  }

  if (state.error) {
    return `
      <div class="ri-error">
        <p>${escapeHtml(state.error)}</p>
      </div>
    `;
  }

  if (!state.data) {
    return `<div class="ri-empty">No data available</div>`;
  }

  switch (state.activeTab) {
    case 'overview':
      return renderOverviewTab();
    case 'insights':
      return renderInsightsTab();
    case 'activity':
      return renderActivityTab();
    default:
      return renderOverviewTab();
  }
}

function renderOverviewTab(): string {
  if (!state.data) return '';
  const { stats, strengthDistribution } = state.data;

  return `
    <!-- Stats Grid -->
    <div class="ri-stats-grid">
      <div class="ri-stat highlight">
        <div class="ri-stat-value">${stats.totalPeople}</div>
        <div class="ri-stat-label">Total People</div>
      </div>
      <div class="ri-stat ${stats.needsAttention > 0 ? 'warning' : ''}">
        <div class="ri-stat-value">${stats.needsAttention}</div>
        <div class="ri-stat-label">Need Attention</div>
      </div>
      <div class="ri-stat">
        <div class="ri-stat-value">${stats.upcomingDates}</div>
        <div class="ri-stat-label">Upcoming Dates</div>
      </div>
      <div class="ri-stat">
        <div class="ri-stat-value">${stats.averageStrength}%</div>
        <div class="ri-stat-label">Avg Strength</div>
      </div>
    </div>
    
    <!-- Breakdown -->
    <div class="ri-breakdown">
      <div class="ri-breakdown-title">By Relationship</div>
      <div class="ri-breakdown-items">
        <div class="ri-breakdown-item">
          <span class="ri-breakdown-icon">${ICONS.home}</span>
          <span class="ri-breakdown-label">Family</span>
          <span class="ri-breakdown-value">${stats.familyCount}</span>
        </div>
        <div class="ri-breakdown-item">
          <span class="ri-breakdown-icon">${ICONS.heart}</span>
          <span class="ri-breakdown-label">Friends</span>
          <span class="ri-breakdown-value">${stats.friendCount}</span>
        </div>
        <div class="ri-breakdown-item">
          <span class="ri-breakdown-icon">${ICONS.briefcase}</span>
          <span class="ri-breakdown-label">Colleagues</span>
          <span class="ri-breakdown-value">${stats.colleagueCount}</span>
        </div>
      </div>
    </div>
    
    <!-- Strength Distribution -->
    <div class="ri-strength-chart">
      <div class="ri-chart-title">Relationship Strength</div>
      <div class="ri-chart-bars">
        ${strengthDistribution.map(item => `
          <div class="ri-chart-bar">
            <span class="ri-chart-bar-label">${item.label}</span>
            <div class="ri-chart-bar-track">
              <div class="ri-chart-bar-fill" style="width: ${item.value}%; background: ${item.color}"></div>
            </div>
            <span class="ri-chart-bar-value">${item.value}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderInsightsTab(): string {
  if (!state.data) return '';
  const { insights } = state.data;

  if (insights.length === 0) {
    return `
      <div class="ri-empty">
        <div class="ri-empty-icon">${ICONS.sparkles}</div>
        <p>No insights right now.<br/>Keep connecting with your people!</p>
      </div>
    `;
  }

  return `
    <div class="ri-insights">
      ${insights.map(insight => `
        <div class="ri-insight" data-contact-id="${insight.contactId || ''}">
          <div class="ri-insight-priority" style="background: ${PRIORITY_COLORS[insight.priority]}"></div>
          <div class="ri-insight-content">
            <div class="ri-insight-title">${escapeHtml(insight.title)}</div>
            <div class="ri-insight-desc">${escapeHtml(insight.description)}</div>
            ${insight.contactName ? `<div class="ri-insight-contact">${escapeHtml(insight.contactName)}</div>` : ''}
          </div>
          ${insight.contactId ? `<div class="ri-insight-arrow">${ICONS.chevronRight}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderActivityTab(): string {
  if (!state.data) return '';
  const { recentActivity } = state.data;

  // Create a 7x4 grid (28 days)
  const cells = [];
  for (let i = 0; i < 28; i++) {
    const dayData = recentActivity[i];
    const count = dayData?.count || 0;
    let level = 0;
    if (count > 0) level = 1;
    if (count > 2) level = 2;
    if (count > 4) level = 3;
    if (count > 6) level = 4;
    cells.push(`<div class="ri-activity-cell level-${level}" title="${dayData?.date || ''}: ${count} interactions"></div>`);
  }

  return `
    <div class="ri-activity">
      <div class="ri-activity-title">Last 4 Weeks</div>
      <div class="ri-activity-grid">
        ${cells.join('')}
      </div>
      <div class="ri-activity-legend">
        Less
        <div class="ri-activity-legend-cell" style="background: var(--color-bg-tertiary)"></div>
        <div class="ri-activity-legend-cell" style="background: rgba(74, 103, 65, 0.2)"></div>
        <div class="ri-activity-legend-cell" style="background: rgba(74, 103, 65, 0.4)"></div>
        <div class="ri-activity-legend-cell" style="background: rgba(74, 103, 65, 0.6)"></div>
        <div class="ri-activity-legend-cell" style="background: var(--persona-primary)"></div>
        More
      </div>
    </div>

    <!-- Top insights from activity -->
    ${state.data.insights.length > 0 ? `
      <div class="ri-chart-title" style="margin-top: var(--space-6)">Based on Your Activity</div>
      <div class="ri-insights">
        ${state.data.insights.slice(0, 3).map(_insight => `
          <div class="ri-insight" data-contact-id="${_insight.contactId || ''}">
            <div class="ri-insight-priority" style="background: ${PRIORITY_COLORS[_insight.priority]}"></div>
            <div class="ri-insight-content">
              <div class="ri-insight-title">${escapeHtml(_insight.title)}</div>
              <div class="ri-insight-desc">${escapeHtml(_insight.description)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Close
  modalContainer.querySelector('.ri-close')?.addEventListener('click', closeRelationshipInsights);
  modalContainer.querySelector('.relationship-insights-backdrop')?.addEventListener('click', closeRelationshipInsights);

  // Tabs
  modalContainer.querySelectorAll('.ri-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab') as RelationshipInsightsState['activeTab'];
      if (tabId) {
        state.activeTab = tabId;
        render();
      }
    });
  });

  // Insight clicks
  modalContainer.querySelectorAll('.ri-insight').forEach(el => {
    el.addEventListener('click', () => {
      const contactId = el.getAttribute('data-contact-id');
      if (contactId && callbacks.onSelectPerson) {
        callbacks.onSelectPerson(contactId);
        closeRelationshipInsights();
      }
    });
  });

  // Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen) {
    closeRelationshipInsights();
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadInsightsData(): Promise<void> {
  state.isLoading = true;
  state.error = null;
  render();

  try {
    const response = await apiFetch('/api/contacts/insights');

    if (!response.ok) {
      throw new Error('Failed to load insights');
    }

    state.data = await response.json();
    state.isLoading = false;
    render();
  } catch (error) {
    log.error('Failed to load relationship insights:', error);
    
    // Use mock data for now
    state.data = getMockData();
    state.isLoading = false;
    render();
  }
}

function getMockData(): RelationshipInsightsData {
  return {
    stats: {
      totalPeople: 12,
      familyCount: 4,
      friendCount: 5,
      colleagueCount: 3,
      averageStrength: 68,
      upcomingDates: 2,
      needsAttention: 3,
    },
    insights: [
      {
        id: '1',
        type: 'nudge',
        title: 'Reconnect with Sarah',
        description: "It's been 3 weeks since you last talked. Maybe send a quick hello?",
        contactId: 'sarah-123',
        contactName: 'Sarah Johnson',
        priority: 'high',
      },
      {
        id: '2',
        type: 'milestone',
        title: "Mom's birthday is coming up",
        description: 'In 5 days. Have you thought about what to get her?',
        contactId: 'mom-456',
        contactName: 'Mom',
        priority: 'high',
      },
      {
        id: '3',
        type: 'pattern',
        title: 'Great connection streak!',
        description: "You've been in touch with family every week this month.",
        priority: 'low',
      },
    ],
    strengthDistribution: [
      { label: 'Strong', value: 35, color: 'var(--persona-primary)' },
      { label: 'Good', value: 40, color: 'var(--nayan-primary)' },
      { label: 'Needs work', value: 25, color: 'var(--color-semantic-error)' },
    ],
    recentActivity: Array.from({ length: 28 }, (_, i) => ({
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      count: Math.floor(Math.random() * 8),
    })),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Relationship Insights dashboard
 */
export function openRelationshipInsights(options: RelationshipInsightsOptions = {}): void {
  closeRelationshipInsights();
  
  injectStyles();

  state = {
    isOpen: true,
    data: null,
    isLoading: false,
    error: null,
    activeTab: 'overview',
  };

  callbacks = options;

  modalContainer = document.createElement('div');
  modalContainer.className = 'relationship-insights-overlay';
  modalContainer.innerHTML = `
    <div class="relationship-insights-backdrop"></div>
    <div class="relationship-insights-modal" role="dialog" aria-modal="true" aria-label="${t('accessibility.relationshipInsights')}">
    </div>
  `;
  document.body.appendChild(modalContainer);

  render();
  loadInsightsData();

  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  log.info('Opened Relationship Insights');
}

/**
 * Close the Relationship Insights dashboard
 */
export function closeRelationshipInsights(): void {
  if (!modalContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);

  modalContainer.classList.remove('open');

  setTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
    
    if (callbacks.onClose) {
      callbacks.onClose();
    }
    callbacks = {};
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed Relationship Insights');
}

export const relationshipInsights = {
  open: openRelationshipInsights,
  close: closeRelationshipInsights,
};

export default relationshipInsights;

