/**
 * Trust Analytics Dashboard UI
 *
 * Admin view for monitoring trust system health and performance.
 *
 * Displays:
 * - Trust detection rates
 * - System engagement metrics
 * - A/B test results
 * - User response patterns
 * - Health status indicators
 *
 * DESIGN: Admin panel with data visualizations
 * 
 * @module TrustAnalyticsUI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TrustAnalytics');

// ============================================================================
// TYPES
// ============================================================================

export interface TrustMetrics {
  totalUsers: number;
  activeUsersToday: number;
  detectionRate: number; // % of conversations with trust signals
  boundaryRespectRate: number;
  growthReflectionsShared: number;
  callbacksUsed: number;
  celebrationsSent: number;
  outreachSent: number;
  outreachResponseRate: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  lastSync: Date;
  errorRate: number;
  avgLatencyMs: number;
  featureFlags: Record<string, boolean>;
}

export interface ABTestResult {
  testId: string;
  name: string;
  variants: Array<{
    name: string;
    users: number;
    conversionRate: number;
  }>;
  significance: number;
  winner?: string;
}

export interface TrustAnalyticsData {
  metrics: TrustMetrics;
  health: SystemHealth;
  abTests: ABTestResult[];
  dailyTrend: Array<{ date: string; detections: number; responses: number }>;
}

export interface TrustAnalyticsCallbacks {
  onRefresh?: () => Promise<TrustAnalyticsData>;
  onClose?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  /* Modal Overlay */
  .trust-analytics-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1400);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4, 16px);
    opacity: 0;
    visibility: hidden;
    transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
  }

  .trust-analytics-overlay--visible {
    opacity: 1;
    visibility: visible;
  }

  .trust-analytics-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.5);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  /* Modal Card */
  .trust-analytics-card {
    position: relative;
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl, 0 24px 48px rgba(44, 37, 32, 0.15));
    overflow: hidden;
    transform: scale(0.95);
    transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
  }

  .trust-analytics-overlay--visible .trust-analytics-card {
    transform: scale(1);
  }

  /* Header */
  .trust-analytics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5, 20px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    background: var(--color-background-secondary, #f5f2ed);
  }

  .trust-analytics-header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .trust-analytics-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--color-text-muted, #8a8078);
  }

  .trust-analytics-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
    margin: 0;
  }

  .trust-analytics-header-actions {
    display: flex;
    gap: var(--space-2, 8px);
  }

  .trust-analytics-btn-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-radius: var(--radius-md, 8px);
    color: var(--color-text-secondary, #5c544a);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .trust-analytics-btn-icon:hover {
    background: var(--color-background-elevated, #fffdfb);
    border-color: var(--color-border, rgba(44, 37, 32, 0.2));
  }

  .trust-analytics-btn-icon svg {
    width: 18px;
    height: 18px;
  }

  .trust-analytics-btn-icon--spin svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Content */
  .trust-analytics-content {
    padding: var(--space-6, 24px);
    overflow-y: auto;
    max-height: calc(90vh - 80px);
  }

  /* Health Status */
  .trust-analytics-health {
    display: flex;
    align-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-6, 24px);
  }

  .trust-analytics-health-status {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full, 9999px);
    color: white;
  }

  .trust-analytics-health-status--healthy {
    background: #4a6741;
  }

  .trust-analytics-health-status--degraded {
    background: #c4856a;
  }

  .trust-analytics-health-status--down {
    background: #b54747;
  }

  .trust-analytics-health-status svg {
    width: 24px;
    height: 24px;
  }

  .trust-analytics-health-info {
    flex: 1;
  }

  .trust-analytics-health-label {
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
    text-transform: capitalize;
  }

  .trust-analytics-health-details {
    font-size: 13px;
    color: var(--color-text-muted, #8a8078);
  }

  /* Metrics Grid */
  .trust-analytics-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-6, 24px);
  }

  .trust-analytics-metric {
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
    text-align: center;
  }

  .trust-analytics-metric-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1, 4px);
  }

  .trust-analytics-metric-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted, #8a8078);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Section */
  .trust-analytics-section {
    margin-bottom: var(--space-6, 24px);
  }

  .trust-analytics-section:last-child {
    margin-bottom: 0;
  }

  .trust-analytics-section-title {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #8a8078);
    margin-bottom: var(--space-3, 12px);
  }

  /* A/B Test Results */
  .trust-analytics-ab-tests {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }

  .trust-analytics-ab-test {
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
  }

  .trust-analytics-ab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3, 12px);
  }

  .trust-analytics-ab-name {
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
  }

  .trust-analytics-ab-significance {
    font-size: 12px;
    padding: var(--space-1, 4px) var(--space-2, 8px);
    border-radius: var(--radius-sm, 4px);
    font-weight: 500;
  }

  .trust-analytics-ab-significance--high {
    background: rgba(74, 103, 65, 0.15);
    color: var(--color-text-secondary);
  }

  .trust-analytics-ab-significance--low {
    background: rgba(138, 128, 120, 0.15);
    color: #8a8078;
  }

  .trust-analytics-ab-variants {
    display: flex;
    gap: var(--space-3, 12px);
  }

  .trust-analytics-ab-variant {
    flex: 1;
    padding: var(--space-3, 12px);
    background: white;
    border-radius: var(--radius-md, 8px);
    text-align: center;
  }

  .trust-analytics-ab-variant--winner {
    border: 2px solid var(--persona-primary, #4a6741);
  }

  .trust-analytics-ab-variant-name {
    font-size: 12px;
    color: var(--color-text-muted, #8a8078);
    margin-bottom: var(--space-1, 4px);
  }

  .trust-analytics-ab-variant-rate {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary, #2C2520);
  }

  .trust-analytics-ab-variant--winner .trust-analytics-ab-variant-rate {
    color: var(--color-text-secondary);
  }

  /* Trend Chart (simple CSS bars) */
  .trust-analytics-chart {
    display: flex;
    align-items: flex-end;
    gap: var(--space-1, 4px);
    height: 100px;
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, #f5f2ed);
    border-radius: var(--radius-lg, 12px);
  }

  .trust-analytics-chart-bar {
    flex: 1;
    background: var(--persona-primary, #4a6741);
    border-radius: var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0;
    min-height: 4px;
    transition: height ${DURATION.NORMAL}ms ${EASING.STANDARD};
    position: relative;
  }

  .trust-analytics-chart-bar:hover::after {
    content: attr(data-value);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    background: var(--color-text-primary, #2C2520);
    color: white;
    border-radius: var(--radius-sm, 4px);
    font-size: 11px;
    white-space: nowrap;
    margin-bottom: var(--space-1, 4px);
  }

  .trust-analytics-chart-labels {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-2, 8px);
    font-size: 10px;
    color: var(--color-text-muted, #8a8078);
  }

  /* Empty State */
  .trust-analytics-empty {
    text-align: center;
    padding: var(--space-8, 32px);
    color: var(--color-text-muted, #8a8078);
  }

  /* Loading */
  .trust-analytics-loading {
    text-align: center;
    padding: var(--space-8, 32px);
    color: var(--color-text-muted, #8a8078);
  }

  @media (prefers-reduced-motion: reduce) {
    .trust-analytics-overlay,
    .trust-analytics-card,
    .trust-analytics-chart-bar,
    .trust-analytics-btn-icon--spin svg {
      transition: none;
      animation: none;
    }
  }
`;

// ============================================================================
// UI CLASS
// ============================================================================

class TrustAnalyticsUI {
  private overlay: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private callbacks: TrustAnalyticsCallbacks = {};
  private data: TrustAnalyticsData | null = null;
  private isVisible = false;
  private isLoading = false;

  /**
   * Initialize
   */
  initialize(): void {
    if (this.overlay) return;

    this.cleanupOrphanedElements();
    this.injectStyles();
    this.createOverlay();
  }

  /**
   * HMR cleanup
   */
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.trust-analytics-overlay').forEach((el) => el.remove());
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: TrustAnalyticsCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show the dashboard
   */
  async show(): Promise<void> {
    this.initialize();
    if (!this.overlay) return;

    this.isLoading = true;
    this.renderContent();
    this.overlay.classList.add('trust-analytics-overlay--visible');
    this.isVisible = true;

    // Load data
    try {
      if (this.callbacks.onRefresh) {
        this.data = await this.callbacks.onRefresh();
      } else {
        // Demo data for development
        this.data = this.getDemoData();
      }
    } catch (error) {
      log.error('Failed to load analytics', error);
    }

    this.isLoading = false;
    this.renderContent();
    log.debug('Trust analytics shown');
  }

  /**
   * Hide
   */
  hide(): void {
    if (!this.overlay) return;

    this.overlay.classList.remove('trust-analytics-overlay--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /**
   * Refresh data
   */
  async refresh(): Promise<void> {
    this.isLoading = true;
    this.renderContent();

    try {
      if (this.callbacks.onRefresh) {
        this.data = await this.callbacks.onRefresh();
      }
    } catch (error) {
      log.error('Failed to refresh analytics', error);
    }

    this.isLoading = false;
    this.renderContent();
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = STYLES;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Create overlay
   */
  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'trust-analytics-overlay';
    this.overlay.innerHTML = `
      <div class="trust-analytics-backdrop"></div>
      <div class="trust-analytics-card">
        <header class="trust-analytics-header">
          <div class="trust-analytics-header-left">
            <span class="trust-analytics-eyebrow">Admin</span>
            <h2 class="trust-analytics-title">Trust Systems Analytics</h2>
          </div>
          <div class="trust-analytics-header-actions">
            <button class="trust-analytics-btn-icon" data-action="refresh" aria-label="Refresh">
              ${ICONS.refresh}
            </button>
            <button class="trust-analytics-btn-icon" data-action="close" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
        </header>
        <div class="trust-analytics-content"></div>
      </div>
    `;

    // Bind events
    this.overlay.querySelector('.trust-analytics-backdrop')?.addEventListener('click', () => this.hide());
    this.overlay.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());
    this.overlay.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this.refresh());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.overlay);
  }

  /**
   * Render content
   */
  private renderContent(): void {
    const content = this.overlay?.querySelector('.trust-analytics-content');
    if (!content) return;

    if (this.isLoading) {
      content.innerHTML = `<div class="trust-analytics-loading">Loading analytics...</div>`;
      this.overlay?.querySelector('[data-action="refresh"]')?.classList.add('trust-analytics-btn-icon--spin');
      return;
    }

    this.overlay?.querySelector('[data-action="refresh"]')?.classList.remove('trust-analytics-btn-icon--spin');

    if (!this.data) {
      content.innerHTML = `<div class="trust-analytics-empty">No data available</div>`;
      return;
    }

    const { metrics, health, abTests, dailyTrend } = this.data;

    content.innerHTML = `
      <!-- System Health -->
      <div class="trust-analytics-health">
        <div class="trust-analytics-health-status trust-analytics-health-status--${health.status}">
          ${health.status === 'healthy' ? ICONS.check : health.status === 'degraded' ? ICONS.warning : ICONS.error}
        </div>
        <div class="trust-analytics-health-info">
          <div class="trust-analytics-health-label">System ${health.status}</div>
          <div class="trust-analytics-health-details">
            Last sync: ${this.formatTime(health.lastSync)} • 
            Error rate: ${(health.errorRate * 100).toFixed(1)}% • 
            Latency: ${health.avgLatencyMs.toFixed(0)}ms
          </div>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="trust-analytics-section">
        <div class="trust-analytics-section-title">Key Metrics</div>
        <div class="trust-analytics-metrics">
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${metrics.totalUsers.toLocaleString()}</div>
            <div class="trust-analytics-metric-label">Total Users</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${metrics.activeUsersToday.toLocaleString()}</div>
            <div class="trust-analytics-metric-label">Active Today</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${(metrics.detectionRate * 100).toFixed(0)}%</div>
            <div class="trust-analytics-metric-label">Detection Rate</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${(metrics.boundaryRespectRate * 100).toFixed(0)}%</div>
            <div class="trust-analytics-metric-label">Boundary Respect</div>
          </div>
        </div>
        <div class="trust-analytics-metrics">
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${metrics.growthReflectionsShared}</div>
            <div class="trust-analytics-metric-label">Growth Shared</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${metrics.callbacksUsed}</div>
            <div class="trust-analytics-metric-label">Callbacks Used</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${metrics.celebrationsSent}</div>
            <div class="trust-analytics-metric-label">Celebrations</div>
          </div>
          <div class="trust-analytics-metric">
            <div class="trust-analytics-metric-value">${(metrics.outreachResponseRate * 100).toFixed(0)}%</div>
            <div class="trust-analytics-metric-label">Outreach Response</div>
          </div>
        </div>
      </div>

      <!-- Daily Trend -->
      <div class="trust-analytics-section">
        <div class="trust-analytics-section-title">7-Day Trend</div>
        <div class="trust-analytics-chart">
          ${this.renderChart(dailyTrend)}
        </div>
        <div class="trust-analytics-chart-labels">
          <span>${dailyTrend[0]?.date || ''}</span>
          <span>${dailyTrend[dailyTrend.length - 1]?.date || ''}</span>
        </div>
      </div>

      <!-- A/B Tests -->
      ${abTests.length > 0 ? `
        <div class="trust-analytics-section">
          <div class="trust-analytics-section-title">A/B Tests</div>
          <div class="trust-analytics-ab-tests">
            ${abTests.map((test) => this.renderABTest(test)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  /**
   * Render chart bars
   */
  private renderChart(data: Array<{ detections: number }>): string {
    if (data.length === 0) return '';

    const max = Math.max(...data.map((d) => d.detections)) || 1;

    return data
      .map((d) => {
        const height = (d.detections / max) * 100;
        return `<div class="trust-analytics-chart-bar" style="height: ${height}%" data-value="${d.detections}"></div>`;
      })
      .join('');
  }

  /**
   * Render A/B test card
   */
  private renderABTest(test: ABTestResult): string {
    const sigClass = test.significance >= 0.95 ? 'high' : 'low';

    return `
      <div class="trust-analytics-ab-test">
        <div class="trust-analytics-ab-header">
          <span class="trust-analytics-ab-name">${test.name}</span>
          <span class="trust-analytics-ab-significance trust-analytics-ab-significance--${sigClass}">
            ${(test.significance * 100).toFixed(0)}% confidence
          </span>
        </div>
        <div class="trust-analytics-ab-variants">
          ${test.variants
            .map(
              (v) => `
            <div class="trust-analytics-ab-variant ${v.name === test.winner ? 'trust-analytics-ab-variant--winner' : ''}">
              <div class="trust-analytics-ab-variant-name">${v.name}</div>
              <div class="trust-analytics-ab-variant-rate">${(v.conversionRate * 100).toFixed(1)}%</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  /**
   * Format time
   */
  private formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }

  /**
   * Demo data for development
   */
  private getDemoData(): TrustAnalyticsData {
    return {
      metrics: {
        totalUsers: 1247,
        activeUsersToday: 156,
        detectionRate: 0.73,
        boundaryRespectRate: 0.98,
        growthReflectionsShared: 42,
        callbacksUsed: 89,
        celebrationsSent: 234,
        outreachSent: 156,
        outreachResponseRate: 0.34,
      },
      health: {
        status: 'healthy',
        lastSync: new Date(Date.now() - 5 * 60000),
        errorRate: 0.002,
        avgLatencyMs: 45,
        featureFlags: {
          readingBetweenLines: true,
          boundaries: true,
          growth: true,
          callbacks: true,
          smallWins: true,
          thinkingOfYou: true,
        },
      },
      abTests: [
        {
          testId: 'growth_timing',
          name: 'Growth Reflection Timing',
          variants: [
            { name: 'Immediate', users: 312, conversionRate: 0.23 },
            { name: 'End of session', users: 308, conversionRate: 0.31 },
          ],
          significance: 0.97,
          winner: 'End of session',
        },
        {
          testId: 'outreach_channel',
          name: 'Preferred Outreach Channel',
          variants: [
            { name: 'Push', users: 200, conversionRate: 0.28 },
            { name: 'Email', users: 198, conversionRate: 0.34 },
            { name: 'SMS', users: 205, conversionRate: 0.42 },
          ],
          significance: 0.89,
        },
      ],
      dailyTrend: [
        { date: '12/2', detections: 89, responses: 45 },
        { date: '12/3', detections: 112, responses: 67 },
        { date: '12/4', detections: 98, responses: 52 },
        { date: '12/5', detections: 134, responses: 78 },
        { date: '12/6', detections: 156, responses: 92 },
        { date: '12/7', detections: 142, responses: 85 },
        { date: '12/8', detections: 167, responses: 98 },
      ],
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trustAnalyticsUI = new TrustAnalyticsUI();

export function initTrustAnalyticsUI(): void {
  trustAnalyticsUI.initialize();
}

export function showTrustAnalytics(): Promise<void> {
  return trustAnalyticsUI.show();
}

export function hideTrustAnalytics(): void {
  trustAnalyticsUI.hide();
}

export function setTrustAnalyticsCallbacks(callbacks: TrustAnalyticsCallbacks): void {
  trustAnalyticsUI.setCallbacks(callbacks);
}

export default trustAnalyticsUI;

