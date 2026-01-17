/**
 * Speech Metrics Section
 *
 * Admin dashboard for monitoring unified speech pipeline performance.
 * Shows real-time insights into:
 * - Session quality metrics
 * - Backchannel timing accuracy
 * - Turn prediction accuracy
 * - Response latency
 * - Per-persona performance comparison
 *
 * @module SpeechMetricsSection
 */

import { createLogger } from '../../utils/logger.js';
import {
  ICON_ACTIVITY,
  ICON_INFO,
  ICON_SUCCESS,
  ICON_USER,
  ICON_WARNING,
  iconSm,
} from '../icons.js';

const log = createLogger('SpeechMetricsSection');

// Lucide icons
const ICON_MICROPHONE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
const ICON_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const ICON_TARGET = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
const ICON_USERS = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const ICON_TREND_UP = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
const ICON_ALERT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

// ============================================================================
// TYPES
// ============================================================================

interface GlobalMetrics {
  uptimeSec: number;
  metrics: {
    latency: {
      avgAnalysisLatencyMs: number;
      p99LatencyMs: number;
      sampleCount: number;
    };
    quality: {
      avgEmotionConfidence: number;
      highConfidenceRate: number;
      backchannelAccuracyRate: number;
      turnPredictionAccuracyRate: number;
    };
    usage: {
      activeSessionCount: number;
      totalSessionsCreated: number;
      avgSessionDurationSec: number;
    };
  };
}

interface PersonaMetrics {
  personaId: string;
  sessionCount: number;
  totalTurns: number;
  avgBackchannelAccuracy: number;
  avgTurnPredictionAccuracy: number;
  avgEmotionConfidence: number;
  avgResponseLatencyMs: number;
  avgSessionDurationSec: number;
}

interface ActiveSession {
  sessionId: string;
  personaId: string;
  startTime: number;
  durationSec: number;
  turnCount: number;
  emotionSamples: number;
  backchannelCount: number;
}

interface RecentSession {
  sessionId: string;
  personaId: string;
  timestamp: number;
  durationSec: number;
  turnCount: number;
  backchannelAccuracy: number;
  turnPredictionAccuracy: number;
  avgEmotionConfidence: number;
  avgResponseLatencyMs: number;
}

interface DashboardData {
  global: GlobalMetrics;
  activeSessions: ActiveSession[];
  personaMetrics: PersonaMetrics[];
  recentSessions: RecentSession[];
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const response = await fetch('/api/speech-metrics/dashboard');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  } catch (error) {
    log.error('Failed to fetch dashboard data', { error });
    // Return empty data
    return {
      global: {
        uptimeSec: 0,
        metrics: {
          latency: { avgAnalysisLatencyMs: 0, p99LatencyMs: 0, sampleCount: 0 },
          quality: {
            avgEmotionConfidence: 0,
            highConfidenceRate: 0,
            backchannelAccuracyRate: 0,
            turnPredictionAccuracyRate: 0,
          },
          usage: { activeSessionCount: 0, totalSessionsCreated: 0, avgSessionDurationSec: 0 },
        },
      },
      activeSessions: [],
      personaMetrics: [],
      recentSessions: [],
    };
  }
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getQualityClass(percentage: number): string {
  if (percentage >= 80) return 'quality--excellent';
  if (percentage >= 60) return 'quality--good';
  if (percentage >= 40) return 'quality--fair';
  return 'quality--poor';
}

function getLatencyClass(ms: number): string {
  if (ms <= 150) return 'latency--excellent';
  if (ms <= 300) return 'latency--good';
  if (ms <= 500) return 'latency--fair';
  return 'latency--poor';
}

function renderPersonaCard(persona: PersonaMetrics): string {
  const qualityClass = getQualityClass(persona.avgTurnPredictionAccuracy);
  const latencyClass = getLatencyClass(persona.avgResponseLatencyMs);

  return `
    <div class="persona-metrics-card">
      <div class="persona-metrics-header">
        <span class="persona-name">${persona.personaId}</span>
        <span class="persona-sessions">${persona.sessionCount} sessions</span>
      </div>
      <div class="persona-metrics-grid">
        <div class="persona-metric">
          <span class="metric-label">Turn Prediction</span>
          <span class="metric-value ${qualityClass}">${persona.avgTurnPredictionAccuracy}%</span>
        </div>
        <div class="persona-metric">
          <span class="metric-label">Backchannel</span>
          <span class="metric-value ${getQualityClass(persona.avgBackchannelAccuracy)}">${persona.avgBackchannelAccuracy}%</span>
        </div>
        <div class="persona-metric">
          <span class="metric-label">Response</span>
          <span class="metric-value ${latencyClass}">${formatLatency(persona.avgResponseLatencyMs)}</span>
        </div>
        <div class="persona-metric">
          <span class="metric-label">Emotion</span>
          <span class="metric-value ${getQualityClass(persona.avgEmotionConfidence)}">${persona.avgEmotionConfidence}%</span>
        </div>
      </div>
      <div class="persona-metrics-footer">
        <span>${persona.totalTurns} total turns</span>
        <span>Avg ${Math.round(persona.avgSessionDurationSec / 60)}m sessions</span>
      </div>
    </div>
  `;
}

function renderActiveSession(session: ActiveSession): string {
  return `
    <div class="active-session-row">
      <div class="session-persona">${session.personaId}</div>
      <div class="session-duration">${Math.round(session.durationSec / 60)}m</div>
      <div class="session-turns">${session.turnCount} turns</div>
      <div class="session-backchannels">${session.backchannelCount} BC</div>
      <div class="session-indicator live-indicator"></div>
    </div>
  `;
}

function renderRecentSession(session: RecentSession): string {
  const qualityClass = getQualityClass(session.turnPredictionAccuracy);
  const timeAgo = formatTimeAgo(session.timestamp);

  return `
    <tr class="recent-session-row">
      <td>${session.personaId}</td>
      <td>${timeAgo}</td>
      <td>${Math.round(session.durationSec / 60)}m</td>
      <td>${session.turnCount}</td>
      <td class="${qualityClass}">${session.turnPredictionAccuracy}%</td>
      <td class="${getQualityClass(session.backchannelAccuracy)}">${session.backchannelAccuracy}%</td>
      <td class="${getLatencyClass(session.avgResponseLatencyMs)}">${formatLatency(session.avgResponseLatencyMs)}</td>
    </tr>
  `;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function renderNoData(message: string): string {
  return `
    <div class="no-data-placeholder">
      ${iconSm(ICON_INFO)}
      <span>${message}</span>
    </div>
  `;
}

// ============================================================================
// STYLES
// ============================================================================

function getStyles(): string {
  return `
    <style>
      .speech-metrics-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-6, 24px);
      }

      /* Stats Grid */
      .speech-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--space-4, 16px);
      }

      .speech-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--space-4, 16px);
        text-align: center;
      }

      .speech-stat-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-full, 50%);
        background: var(--color-ferni-light, rgba(74, 103, 65, 0.1));
        color: var(--color-ferni, #4a6741);
        margin-bottom: var(--space-2, 8px);
      }

      .speech-stat-icon--warning {
        background: var(--color-warning-light, rgba(234, 179, 8, 0.1));
        color: var(--color-warning, #eab308);
      }

      .speech-stat-icon--success {
        background: var(--color-success-light, rgba(34, 197, 94, 0.1));
        color: var(--color-success, #22c55e);
      }

      .speech-stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        line-height: 1;
      }

      .speech-stat-value--warning { color: var(--color-warning, #eab308); }
      .speech-stat-value--success { color: var(--color-success, #22c55e); }

      .speech-stat-label {
        font-size: 0.875rem;
        color: var(--color-text-muted, #666);
        margin-top: var(--space-1, 4px);
      }

      /* Quality indicators */
      .quality--excellent { color: var(--color-success, #22c55e); }
      .quality--good { color: var(--color-ferni, #4a6741); }
      .quality--fair { color: var(--color-warning, #eab308); }
      .quality--poor { color: var(--color-error, #ef4444); }

      .latency--excellent { color: var(--color-success, #22c55e); }
      .latency--good { color: var(--color-ferni, #4a6741); }
      .latency--fair { color: var(--color-warning, #eab308); }
      .latency--poor { color: var(--color-error, #ef4444); }

      /* Persona Cards */
      .persona-metrics-grid-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--space-4, 16px);
      }

      .persona-metrics-card {
        background: var(--color-background-elevated, #FFFDFB);
        border: 1px solid var(--color-border, #e5e5e5);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
      }

      .persona-metrics-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3, 12px);
        padding-bottom: var(--space-2, 8px);
        border-bottom: 1px solid var(--color-border-light, #f0f0f0);
      }

      .persona-name {
        font-weight: 600;
        text-transform: capitalize;
        color: var(--color-text-primary, #2C2520);
      }

      .persona-sessions {
        font-size: 0.75rem;
        color: var(--color-text-muted, #666);
      }

      .persona-metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3, 12px);
      }

      .persona-metric {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .metric-label {
        font-size: 0.75rem;
        color: var(--color-text-muted, #666);
      }

      .metric-value {
        font-size: 1.25rem;
        font-weight: 600;
      }

      .persona-metrics-footer {
        display: flex;
        justify-content: space-between;
        margin-top: var(--space-3, 12px);
        padding-top: var(--space-2, 8px);
        border-top: 1px solid var(--color-border-light, #f0f0f0);
        font-size: 0.75rem;
        color: var(--color-text-muted, #666);
      }

      /* Active Sessions */
      .active-sessions-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .active-session-row {
        display: grid;
        grid-template-columns: 1fr auto auto auto auto;
        gap: var(--space-4, 16px);
        padding: var(--space-3, 12px);
        background: var(--color-background, #FFFDFB);
        border-radius: var(--radius-md, 8px);
        align-items: center;
      }

      .session-persona {
        font-weight: 500;
        text-transform: capitalize;
      }

      .session-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-success, #22c55e);
      }

      .live-indicator {
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Recent Sessions Table */
      .recent-session-row td {
        padding: var(--space-3, 12px);
      }

      /* No Data */
      .no-data-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-8, 32px);
        color: var(--color-text-muted, #666);
      }

      /* Alerts */
      .quality-alerts {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .quality-alert {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        border-radius: var(--radius-md, 8px);
        font-size: 0.875rem;
      }

      .quality-alert--warning {
        background: var(--color-warning-light, rgba(234, 179, 8, 0.1));
        border: 1px solid var(--color-warning, #eab308);
        color: var(--color-warning-dark, #a16207);
      }

      .quality-alert--critical {
        background: var(--color-error-light, rgba(239, 68, 68, 0.1));
        border: 1px solid var(--color-error, #ef4444);
        color: var(--color-error-dark, #b91c1c);
      }

      .alert-icon {
        flex-shrink: 0;
      }
    </style>
  `;
}

// ============================================================================
// MAIN RENDER
// ============================================================================

/**
 * Render the speech metrics section
 */
export async function render(): Promise<string> {
  log.debug('Rendering speech metrics section');

  const data = await fetchDashboardData();
  const { global, activeSessions, personaMetrics, recentSessions } = data;

  // Generate quality alerts based on thresholds
  const alerts: Array<{ level: 'warning' | 'critical'; message: string }> = [];

  if (global.metrics.quality.turnPredictionAccuracyRate < 70) {
    alerts.push({
      level: global.metrics.quality.turnPredictionAccuracyRate < 50 ? 'critical' : 'warning',
      message: `Turn prediction accuracy is ${global.metrics.quality.turnPredictionAccuracyRate}% (target: 70%+)`,
    });
  }

  if (global.metrics.quality.backchannelAccuracyRate < 70) {
    alerts.push({
      level: global.metrics.quality.backchannelAccuracyRate < 50 ? 'critical' : 'warning',
      message: `Backchannel timing accuracy is ${global.metrics.quality.backchannelAccuracyRate}% (target: 70%+)`,
    });
  }

  if (global.metrics.latency.avgAnalysisLatencyMs > 300) {
    alerts.push({
      level: global.metrics.latency.avgAnalysisLatencyMs > 500 ? 'critical' : 'warning',
      message: `Average response latency is ${formatLatency(global.metrics.latency.avgAnalysisLatencyMs)} (target: <300ms)`,
    });
  }

  return `
    ${getStyles()}
    <div class="speech-metrics-section">
      <!-- Quality Alerts -->
      ${
        alerts.length > 0
          ? `
        <div class="admin-card quality-alerts-container">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_ALERT)}</span>
            Quality Alerts
          </h2>
          <div class="quality-alerts">
            ${alerts
              .map(
                (alert) => `
              <div class="quality-alert quality-alert--${alert.level}">
                <span class="alert-icon">${iconSm(alert.level === 'critical' ? ICON_WARNING : ICON_INFO)}</span>
                <span>${alert.message}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Overview Stats -->
      <div class="admin-grid speech-stats">
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon">${iconSm(ICON_CLOCK)}</div>
          <div class="speech-stat-value">${formatUptime(global.uptimeSec)}</div>
          <div class="speech-stat-label">Uptime</div>
        </div>
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon speech-stat-icon--success">${iconSm(ICON_USERS)}</div>
          <div class="speech-stat-value speech-stat-value--success">${global.metrics.usage.activeSessionCount}</div>
          <div class="speech-stat-label">Active Sessions</div>
        </div>
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon">${iconSm(ICON_TARGET)}</div>
          <div class="speech-stat-value">${global.metrics.quality.turnPredictionAccuracyRate ?? 0}%</div>
          <div class="speech-stat-label">Turn Prediction</div>
        </div>
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon">${iconSm(ICON_MICROPHONE)}</div>
          <div class="speech-stat-value">${global.metrics.quality.backchannelAccuracyRate ?? 0}%</div>
          <div class="speech-stat-label">Backchannel Timing</div>
        </div>
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon">${iconSm(ICON_ACTIVITY)}</div>
          <div class="speech-stat-value">${formatLatency(global.metrics.latency.avgAnalysisLatencyMs)}</div>
          <div class="speech-stat-label">Avg Latency</div>
        </div>
        <div class="admin-card speech-stat">
          <div class="speech-stat-icon">${iconSm(ICON_TREND_UP)}</div>
          <div class="speech-stat-value">${global.metrics.usage.totalSessionsCreated}</div>
          <div class="speech-stat-label">Total Sessions</div>
        </div>
      </div>

      <!-- Per-Persona Metrics -->
      <div class="admin-card persona-metrics-container">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_USER)}</span>
          Per-Persona Performance
        </h2>
        ${
          personaMetrics.length > 0
            ? `
          <div class="persona-metrics-grid-container">
            ${personaMetrics.map((p) => renderPersonaCard(p)).join('')}
          </div>
        `
            : renderNoData('No persona metrics available yet')
        }
      </div>

      <!-- Active Sessions -->
      <div class="admin-card active-sessions-container">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ACTIVITY)}</span>
          Active Sessions
          ${activeSessions.length > 0 ? '<span class="live-indicator"></span>' : ''}
        </h2>
        ${
          activeSessions.length > 0
            ? `
          <div class="active-sessions-list">
            ${activeSessions.map((s) => renderActiveSession(s)).join('')}
          </div>
        `
            : renderNoData('No active sessions')
        }
      </div>

      <!-- Recent Sessions -->
      <div class="admin-card recent-sessions-container">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_SUCCESS)}</span>
          Recent Sessions
        </h2>
        ${
          recentSessions.length > 0
            ? `
          <table class="admin-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Time</th>
                <th>Duration</th>
                <th>Turns</th>
                <th>Turn Pred.</th>
                <th>Backchannel</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              ${recentSessions.map((s) => renderRecentSession(s)).join('')}
            </tbody>
          </table>
        `
            : renderNoData('No recent sessions')
        }
      </div>
    </div>
  `;
}

export default { render };
