/**
 * Health Dashboard UI
 *
 * Displays iOS HealthKit data synced from the native app.
 * Shows sleep, HRV, steps, and other health metrics.
 *
 * Features:
 * - Connection status indicator
 * - Daily summary cards
 * - Weekly trends visualization
 * - Sync status and last update time
 *
 * @module ui/health-dashboard
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { soundUI } from './sound.ui.js';
import { healthDashboardAnalytics } from '../services/feature-analytics.service.js';

const log = createLogger('HealthDashboard');

// ============================================================================
// TYPES
// ============================================================================

interface HealthStatus {
  connected: boolean;
  lastSync?: string;
  deviceName?: string;
  permissionsGranted?: string[];
}

interface DailySummary {
  date: string;
  steps?: number;
  activeCalories?: number;
  sleepHours?: number;
  sleepQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  hrvAvg?: number;
  hrvTrend?: 'down' | 'stable' | 'up';
  restingHeartRate?: number;
  mindfulMinutes?: number;
  standHours?: number;
  exerciseMinutes?: number;
}

interface HistoryData {
  summaries: DailySummary[];
}

// ============================================================================
// STATE
// ============================================================================

let dashboardModal: HTMLElement | null = null;
let currentStatus: HealthStatus | null = null;
let currentSummary: DailySummary | null = null;
let historyData: DailySummary[] = [];
let isLoading = false;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
/* Health Dashboard Modal */
.health-dashboard-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 2100);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, 
              visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.health-dashboard-overlay.open {
  opacity: 1;
  visibility: visible;
}

.health-dashboard-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.health-dashboard-container {
  position: relative;
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  background: var(--color-bg-elevated, #2a2520);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  transform: scale(0.95) translateY(20px);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
}

.health-dashboard-overlay.open .health-dashboard-container {
  transform: scale(1) translateY(0);
}

/* Header */
.health-dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5, 20px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
}

.health-dashboard-header-content {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.health-dashboard-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg, 16px);
  background: linear-gradient(135deg, #ff6b6b 0%, #ff4757 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.health-dashboard-icon svg {
  width: 24px;
  height: 24px;
  color: white;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.health-dashboard-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary, #f4f1ed);
  margin: 0;
}

.health-dashboard-subtitle {
  font-size: 13px;
  color: var(--color-text-secondary, rgba(244, 241, 237, 0.7));
  margin: 2px 0 0;
}

.health-dashboard-close {
  padding: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-md, 12px);
  color: var(--color-text-secondary);
  transition: background ${DURATION.FAST}ms ease;
}

.health-dashboard-close:hover {
  background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
}

.health-dashboard-close svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* Content */
.health-dashboard-content {
  padding: var(--space-5, 20px) var(--space-6, 24px);
  overflow-y: auto;
  max-height: calc(85vh - 80px);
}

/* Connection Status */
.health-connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
  border-radius: var(--radius-lg, 16px);
  margin-bottom: var(--space-5, 20px);
}

.health-connection-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-error, #ff4757);
  box-shadow: 0 0 8px var(--color-error, #ff4757);
}

.health-connection-indicator.connected {
  background: var(--color-success, #2ed573);
  box-shadow: 0 0 8px var(--color-success, #2ed573);
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 8px var(--color-success, #2ed573); }
  50% { box-shadow: 0 0 16px var(--color-success, #2ed573); }
}

.health-connection-text {
  flex: 1;
}

.health-connection-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.health-connection-detail {
  font-size: 12px;
  color: var(--color-text-muted, rgba(244, 241, 237, 0.5));
  margin-top: 2px;
}

/* Empty State */
.health-empty-state {
  text-align: center;
  padding: var(--space-8, 32px) var(--space-4, 16px);
}

.health-empty-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-4, 16px);
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.health-empty-icon svg {
  width: 40px;
  height: 40px;
  color: var(--color-text-muted);
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
}

.health-empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2, 8px);
}

.health-empty-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 280px;
  margin: 0 auto;
}

/* Metrics Grid */
.health-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-5, 20px);
}

.health-metric-card {
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 16px);
  transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
}

.health-metric-card:hover {
  transform: translateY(-2px);
}

.health-metric-card.featured {
  grid-column: span 2;
  background: linear-gradient(135deg, 
    rgba(255, 107, 107, 0.15) 0%, 
    rgba(255, 71, 87, 0.1) 100%);
  border: 1px solid rgba(255, 107, 107, 0.2);
}

.health-metric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2, 8px);
}

.health-metric-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.health-metric-icon {
  width: 20px;
  height: 20px;
}

.health-metric-icon svg {
  width: 100%;
  height: 100%;
  stroke: var(--color-text-secondary);
  fill: none;
  stroke-width: 2;
}

.health-metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
}

.health-metric-unit {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 4px;
}

.health-metric-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--space-1, 4px);
  font-size: 12px;
  color: var(--color-text-muted);
}

.health-metric-trend.up {
  color: var(--color-success, #2ed573);
}

.health-metric-trend.down {
  color: var(--color-warning, #ffa502);
}

.health-metric-trend svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* Sleep Quality Bar */
.health-sleep-quality {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-top: var(--space-2, 8px);
}

.health-sleep-bar {
  flex: 1;
  height: 6px;
  background: var(--color-bg-glass, rgba(255, 255, 255, 0.1));
  border-radius: 3px;
  overflow: hidden;
}

.health-sleep-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.health-sleep-bar-fill.poor { 
  width: 25%; 
  background: var(--color-error, #ff4757); 
}
.health-sleep-bar-fill.fair { 
  width: 50%; 
  background: var(--color-warning, #ffa502); 
}
.health-sleep-bar-fill.good { 
  width: 75%; 
  background: var(--color-success, #2ed573); 
}
.health-sleep-bar-fill.excellent { 
  width: 100%; 
  background: linear-gradient(90deg, #2ed573, #00d2d3); 
}

.health-sleep-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
  color: var(--color-text-secondary);
}

/* Weekly Chart */
.health-weekly-section {
  margin-top: var(--space-5, 20px);
}

.health-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-3, 12px);
}

.health-weekly-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 120px;
  padding: var(--space-3, 12px) 0;
  border-bottom: 1px solid var(--color-border-subtle);
}

.health-chart-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  flex: 1;
}

.health-chart-bar {
  width: 24px;
  background: var(--color-bg-tertiary);
  border-radius: 4px 4px 0 0;
  transition: height ${DURATION.SLOW}ms ${EASING.SPRING};
  position: relative;
}

.health-chart-bar.today {
  background: linear-gradient(to top, var(--color-ferni, #4a6741), rgba(74, 103, 65, 0.6));
}

.health-chart-day {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.health-chart-day.today {
  color: var(--color-ferni, #4a6741);
  font-weight: 600;
}

/* Loading State */
.health-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8, 32px);
  gap: var(--space-3, 12px);
}

.health-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-bg-tertiary);
  border-top-color: var(--color-ferni, #4a6741);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.health-loading-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Last Updated */
.health-last-updated {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--space-4, 16px);
  padding-top: var(--space-4, 16px);
  border-top: 1px solid var(--color-border-subtle);
}

/* Responsive */
@media (max-width: 480px) {
  .health-dashboard-container {
    width: 95%;
    max-height: 90vh;
    border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
  }

  .health-dashboard-overlay.open .health-dashboard-container {
    transform: translateX(-50%) translateY(0);
  }

  .health-metrics-grid {
    grid-template-columns: 1fr;
  }

  .health-metric-card.featured {
    grid-column: 1;
  }
}
`;

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  heart: '<svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  steps: '<svg viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  brain: '<svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  trendDown: '<svg viewBox="0 0 24 24"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
  watch: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><polyline points="12 10 12 12 13 13"/><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/></svg>',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num: number | undefined): string {
  if (num === undefined) return '--';
  return num.toLocaleString();
}

function formatHours(hours: number | undefined): string {
  if (hours === undefined) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getRelativeTime(dateString: string | undefined): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function getDayLabel(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  return days[date.getDay()];
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderConnectionStatus(): string {
  const connected = currentStatus?.connected ?? false;
  const lastSync = currentStatus?.lastSync;
  const deviceName = currentStatus?.deviceName || 'iPhone';

  return `
    <div class="health-connection-status">
      <div class="health-connection-indicator ${connected ? 'connected' : ''}"></div>
      <div class="health-connection-text">
        <div class="health-connection-label">
          ${connected ? 'Connected' : 'Not Connected'}
        </div>
        <div class="health-connection-detail">
          ${connected 
            ? `${deviceName} • Last sync: ${getRelativeTime(lastSync)}`
            : 'Connect your iPhone to sync health data'}
        </div>
      </div>
    </div>
  `;
}

function renderEmptyState(): string {
  return `
    <div class="health-empty-state">
      <div class="health-empty-icon">${ICONS.watch}</div>
      <h3 class="health-empty-title">Connect Apple Health</h3>
      <p class="health-empty-text">
        Open the Ferni app on your iPhone to sync your health data. 
        I'll help you understand how sleep, activity, and stress affect your wellbeing.
      </p>
    </div>
  `;
}

function renderMetricsGrid(): string {
  const summary = currentSummary;
  if (!summary) return renderEmptyState();

  return `
    <div class="health-metrics-grid">
      <!-- Sleep (Featured) -->
      <div class="health-metric-card featured">
        <div class="health-metric-header">
          <span class="health-metric-label">Sleep</span>
          <span class="health-metric-icon">${ICONS.moon}</span>
        </div>
        <div class="health-metric-value">
          ${formatHours(summary.sleepHours)}
        </div>
        ${summary.sleepQuality ? `
          <div class="health-sleep-quality">
            <div class="health-sleep-bar">
              <div class="health-sleep-bar-fill ${summary.sleepQuality}"></div>
            </div>
            <span class="health-sleep-label">${summary.sleepQuality}</span>
          </div>
        ` : ''}
      </div>

      <!-- Steps -->
      <div class="health-metric-card">
        <div class="health-metric-header">
          <span class="health-metric-label">Steps</span>
          <span class="health-metric-icon">${ICONS.steps}</span>
        </div>
        <div class="health-metric-value">
          ${formatNumber(summary.steps)}
        </div>
      </div>

      <!-- HRV -->
      <div class="health-metric-card">
        <div class="health-metric-header">
          <span class="health-metric-label">HRV</span>
          <span class="health-metric-icon">${ICONS.brain}</span>
        </div>
        <div class="health-metric-value">
          ${summary.hrvAvg ?? '--'}<span class="health-metric-unit">ms</span>
        </div>
        ${summary.hrvTrend ? `
          <div class="health-metric-trend ${summary.hrvTrend}">
            ${summary.hrvTrend === 'up' ? ICONS.trendUp : summary.hrvTrend === 'down' ? ICONS.trendDown : ''}
            ${summary.hrvTrend === 'up' ? 'Improving' : summary.hrvTrend === 'down' ? 'Below baseline' : 'Stable'}
          </div>
        ` : ''}
      </div>

      <!-- Active Calories -->
      <div class="health-metric-card">
        <div class="health-metric-header">
          <span class="health-metric-label">Active Cal</span>
          <span class="health-metric-icon">${ICONS.flame}</span>
        </div>
        <div class="health-metric-value">
          ${formatNumber(summary.activeCalories)}
        </div>
      </div>

      <!-- Resting Heart Rate -->
      <div class="health-metric-card">
        <div class="health-metric-header">
          <span class="health-metric-label">Resting HR</span>
          <span class="health-metric-icon">${ICONS.activity}</span>
        </div>
        <div class="health-metric-value">
          ${summary.restingHeartRate ?? '--'}<span class="health-metric-unit">bpm</span>
        </div>
      </div>
    </div>
  `;
}

function renderWeeklyChart(): string {
  if (historyData.length === 0) return '';

  const maxSteps = Math.max(...historyData.map(d => d.steps || 0), 10000);
  
  return `
    <div class="health-weekly-section">
      <h3 class="health-section-title">This Week</h3>
      <div class="health-weekly-chart">
        ${historyData.slice(0, 7).reverse().map((day, i) => {
          const height = day.steps ? Math.max(10, (day.steps / maxSteps) * 100) : 10;
          const isToday = i === historyData.length - 1;
          return `
            <div class="health-chart-bar-container">
              <div class="health-chart-bar ${isToday ? 'today' : ''}" 
                   style="height: ${height}px">
              </div>
              <span class="health-chart-day ${isToday ? 'today' : ''}">
                ${getDayLabel(day.date)}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderLastUpdated(): string {
  if (!currentStatus?.lastSync) return '';
  
  return `
    <div class="health-last-updated">
      Last synced ${getRelativeTime(currentStatus.lastSync)}
    </div>
  `;
}

function renderLoadingState(): string {
  return `
    <div class="health-loading">
      <div class="health-loading-spinner"></div>
      <span class="health-loading-text">Loading health data...</span>
    </div>
  `;
}

function renderContent(): string {
  if (isLoading) return renderLoadingState();
  
  const connected = currentStatus?.connected ?? false;
  
  if (!connected) {
    return renderConnectionStatus() + renderEmptyState();
  }

  return `
    ${renderConnectionStatus()}
    ${renderMetricsGrid()}
    ${renderWeeklyChart()}
    ${renderLastUpdated()}
  `;
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (dashboardModal) return dashboardModal;

  // HMR cleanup
  document.querySelectorAll('.health-dashboard-overlay').forEach(el => el.remove());

  // Inject styles
  if (!document.getElementById('health-dashboard-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'health-dashboard-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  dashboardModal = document.createElement('div');
  dashboardModal.className = 'health-dashboard-overlay';
  dashboardModal.innerHTML = `
    <div class="health-dashboard-backdrop" data-action="close"></div>
    <div class="health-dashboard-container" role="dialog" aria-modal="true" aria-labelledby="health-title">
      <header class="health-dashboard-header">
        <div class="health-dashboard-header-content">
          <div class="health-dashboard-icon">${ICONS.heart}</div>
          <div>
            <h2 class="health-dashboard-title" id="health-title">Health</h2>
            <p class="health-dashboard-subtitle">Apple Health data</p>
          </div>
        </div>
        <button class="health-dashboard-close" data-action="close" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>
      <div class="health-dashboard-content" id="health-content">
        ${renderLoadingState()}
      </div>
    </div>
  `;

  dashboardModal.addEventListener('click', handleClick);
  dashboardModal.addEventListener('keydown', handleKeydown);

  document.body.appendChild(dashboardModal);
  return dashboardModal;
}

function updateContent(): void {
  const content = dashboardModal?.querySelector('#health-content');
  if (content) {
    content.innerHTML = renderContent();
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;
  
  if (target.closest('[data-action="close"]')) {
    closeHealthDashboard();
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeHealthDashboard();
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchHealthData(): Promise<void> {
  isLoading = true;
  updateContent();

  try {
    // Fetch status
    const statusResponse = await apiGet<HealthStatus>('/api/apple-health/status');
    if (statusResponse.ok && statusResponse.data) {
      currentStatus = statusResponse.data;
    } else {
      currentStatus = { connected: false };
    }

    if (currentStatus?.connected) {
      // Fetch today's summary
      try {
        const summaryResponse = await apiGet<DailySummary>('/api/apple-health/summary');
        if (summaryResponse.ok && summaryResponse.data) {
          currentSummary = summaryResponse.data;
        } else {
          currentSummary = null;
        }
      } catch {
        log.debug('No summary data available');
        currentSummary = null;
      }

      // Fetch week history
      try {
        const historyResponse = await apiGet<HistoryData>('/api/apple-health/history?days=7');
        if (historyResponse.ok && historyResponse.data) {
          historyData = historyResponse.data.summaries || [];
        } else {
          historyData = [];
        }
      } catch {
        log.debug('No history data available');
        historyData = [];
      }
    }
  } catch (error) {
    log.error({ error }, 'Failed to fetch health data');
    currentStatus = { connected: false };
    currentSummary = null;
    historyData = [];
  } finally {
    isLoading = false;
    updateContent();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the health dashboard
 */
export async function openHealthDashboard(): Promise<void> {
  const modal = ensureModalExists();
  
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  
  soundUI.play('switch');
  healthDashboardAnalytics.dashboardOpened();
  
  await fetchHealthData();
}

/**
 * Close the health dashboard
 */
export function closeHealthDashboard(): void {
  if (!dashboardModal) return;

  dashboardModal.classList.remove('open');
  document.body.style.overflow = '';
  
  soundUI.play('click');
}

/**
 * Refresh health data
 */
export async function refreshHealthData(): Promise<void> {
  await fetchHealthData();
}

/**
 * Cleanup (for HMR)
 */
export function disposeHealthDashboard(): void {
  if (dashboardModal) {
    dashboardModal.remove();
    dashboardModal = null;
  }
  document.getElementById('health-dashboard-styles')?.remove();
  currentStatus = null;
  currentSummary = null;
  historyData = [];
}

export const healthDashboardUI = {
  open: openHealthDashboard,
  close: closeHealthDashboard,
  refresh: refreshHealthData,
  dispose: disposeHealthDashboard,
};

export default healthDashboardUI;
