/**
 * Human Listening Section
 *
 * Admin dashboard for monitoring "Better than Human" listening capabilities.
 * Shows real-time insights into:
 * - Cognitive load detection
 * - Emotional undercurrents
 * - Self-soothing/hedging detection
 * - Engagement scores
 * - Voice pattern analysis
 *
 * @module HumanListeningSection
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

const log = createLogger('HumanListeningSection');

// Headphones icon (Lucide)
const ICON_HEADPHONES = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>`;

// Brain icon (Lucide)
const ICON_BRAIN = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>`;

// Heart icon (Lucide)
const ICON_HEART = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

// ============================================================================
// TYPES
// ============================================================================

interface ListeningMetrics {
  totalSessions: number;
  distressDetections: number;
  avgCognitiveLoad: number;
  avgEngagement: number;
  selfSoothingDetections: number;
  hedgingDetections: number;
}

interface RecentSignal {
  sessionId: string;
  timestamp: string;
  signalType:
    | 'distress'
    | 'cognitive_load'
    | 'self_soothing'
    | 'hedging'
    | 'disengagement'
    | 'tremor';
  severity: 'low' | 'medium' | 'high';
  details: string;
  actionTaken?: string;
}

interface LiveSession {
  sessionId: string;
  userId?: string;
  cognitiveLoad: 'low' | 'medium' | 'high' | 'overloaded';
  engagement: 'high' | 'medium' | 'low' | 'distracted';
  emotionalUndercurrent?: string;
  lastSignal?: string;
  duration: number;
}

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the human listening section
 */
export async function render(): Promise<string> {
  log.debug('Rendering human listening section');

  const metrics = await fetchMetrics();
  const signals = await fetchRecentSignals();
  const liveSessions = await fetchLiveSessions();

  return `
    <div class="human-listening-section">
      <!-- Overview Stats -->
      <div class="admin-grid listening-stats">
        <div class="admin-card listening-stat">
          <div class="listening-stat-icon">${iconSm(ICON_HEADPHONES)}</div>
          <div class="listening-stat-value">${metrics.totalSessions}</div>
          <div class="listening-stat-label">Sessions Analyzed</div>
        </div>
        <div class="admin-card listening-stat">
          <div class="listening-stat-icon listening-stat-icon--warning">${iconSm(ICON_WARNING)}</div>
          <div class="listening-stat-value listening-stat-value--warning">${metrics.distressDetections}</div>
          <div class="listening-stat-label">Distress Signals</div>
        </div>
        <div class="admin-card listening-stat">
          <div class="listening-stat-icon">${iconSm(ICON_BRAIN)}</div>
          <div class="listening-stat-value">${formatCognitiveLoad(metrics.avgCognitiveLoad)}</div>
          <div class="listening-stat-label">Avg Cognitive Load</div>
        </div>
        <div class="admin-card listening-stat">
          <div class="listening-stat-icon listening-stat-icon--success">${iconSm(ICON_ACTIVITY)}</div>
          <div class="listening-stat-value">${Math.round(metrics.avgEngagement * 100)}%</div>
          <div class="listening-stat-label">Avg Engagement</div>
        </div>
      </div>

      <!-- Detection Breakdown -->
      <div class="admin-card listening-detections">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HEART)}</span>
          Detection Breakdown (24h)
        </h2>
        <div class="detection-grid">
          ${renderDetectionCard('Self-Soothing', metrics.selfSoothingDetections, 'Phrases like "I\'m fine", "It doesn\'t matter"', 'soothing')}
          ${renderDetectionCard('Hedging', metrics.hedgingDetections, 'Uncertainty, minimizing, protecting language', 'hedging')}
          ${renderDetectionCard('Voice Tremor', 12, 'Wavering, cracking, emotional strain', 'tremor')}
          ${renderDetectionCard('Energy Fade', 8, 'Voice trailing off, losing confidence', 'fade')}
        </div>
      </div>

      <!-- Live Sessions -->
      <div class="admin-card listening-live">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_USER)}</span>
          Live Sessions
          <span class="live-indicator"></span>
        </h2>
        <div class="live-sessions-grid">
          ${liveSessions.length > 0 ? liveSessions.map((s) => renderLiveSession(s)).join('') : renderNoSessions()}
        </div>
      </div>

      <!-- Recent Signals -->
      <div class="admin-card listening-signals">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ACTIVITY)}</span>
          Recent Signals
        </h2>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Signal</th>
              <th>Severity</th>
              <th>Details</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            ${signals.map((s) => renderSignalRow(s)).join('')}
          </tbody>
        </table>
      </div>

      <!-- Avatar Soul Response -->
      <div class="admin-card listening-soul-response">
        <h2 class="admin-section-title">
          <span class="admin-icon">✨</span>
          Avatar Soul Response
          <span class="badge badge--new">NEW</span>
        </h2>
        <p class="section-desc">How the avatar visually responds to detected listening signals</p>
        
        <div class="soul-response-grid">
          ${renderSoulResponse('Distress Detected', 'Protective Mode', 'Avatar scales up, draws closer with warm glow', 'enterProtectiveMode()')}
          ${renderSoulResponse('Cognitive Overload', 'Pupil Contraction', 'Pupils contract, slows visual activity', 'setPupilDilation("CONTRACTED")')}
          ${renderSoulResponse('Self-Soothing', 'Comfort Pulse', 'Warm pulsing glow radiates outward', 'startComfortPulse()')}
          ${renderSoulResponse('Emotional Peak', 'Memory Spark', 'Golden flash acknowledging the moment', 'triggerMemorySpark()')}
          ${renderSoulResponse('Engagement Drop', 'Energy Matching', 'Avatar energy adjusts to match user', 'setUserEnergy(level)')}
          ${renderSoulResponse('Voice Tremor', 'Anticipatory Shimmer', 'Subtle shimmer shows recognition', 'playAnticipation("concerned")')}
        </div>

        <div class="soul-response-stats">
          <div class="soul-stat">
            <div class="soul-stat-value" id="soulMicroExpressions">847</div>
            <div class="soul-stat-label">Micro-Expressions (24h)</div>
          </div>
          <div class="soul-stat">
            <div class="soul-stat-value" id="soulProtectiveModes">23</div>
            <div class="soul-stat-label">Protective Modes</div>
          </div>
          <div class="soul-stat">
            <div class="soul-stat-value" id="soulComfortPulses">156</div>
            <div class="soul-stat-label">Comfort Pulses</div>
          </div>
          <div class="soul-stat">
            <div class="soul-stat-value" id="soulMemorySparks">89</div>
            <div class="soul-stat-label">Memory Sparks</div>
          </div>
        </div>

        <a href="#avatar-soul" class="soul-link" data-navigate="avatar-soul">
          Open Avatar Soul Lab →
        </a>
      </div>

      <!-- Feature Status -->
      <div class="admin-card listening-features">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HEADPHONES)}</span>
          Listening Features
        </h2>
        <div class="features-grid">
          ${renderFeatureStatus('Cognitive Load Detection', true, 'Detects mental overload from speech patterns')}
          ${renderFeatureStatus('Hedging Detection', true, 'Identifies uncertainty and protecting language')}
          ${renderFeatureStatus('Self-Soothing Detection', true, 'Catches phrases masking true feelings')}
          ${renderFeatureStatus('Voice Tremor Analysis', true, 'Detects emotional strain in voice')}
          ${renderFeatureStatus('Breath Pattern Detection', true, 'Sighs, held breath, deep breaths')}
          ${renderFeatureStatus('Engagement Scoring', true, 'Real-time presence vs distraction')}
          ${renderFeatureStatus('Narrative Arc Tracking', true, 'Detects story structure and climax')}
          ${renderFeatureStatus('Energy Dynamics', true, 'Voice energy fade detection')}
          ${renderFeatureStatus('Fluency Analysis', true, 'Stammering, self-corrections')}
          ${renderFeatureStatus('Filler Pattern Analysis', true, 'Um, uh, like patterns')}
          ${renderFeatureStatus('Volume Dynamics', true, 'Getting quieter on sensitive topics')}
          ${renderFeatureStatus('Cross-Session Baselines', false, 'Learn individual user patterns')}
        </div>
      </div>
    </div>

    <style>
      .human-listening-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .listening-stats {
        grid-template-columns: repeat(4, 1fr);
      }

      @media (max-width: 1024px) {
        .listening-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .listening-stat {
        text-align: center;
        padding: var(--space-5, 1.25rem);
        position: relative;
      }

      .listening-stat-icon {
        margin-bottom: var(--space-2, 0.5rem);
        color: var(--color-text-muted, #888);
      }

      .listening-stat-icon--warning {
        color: var(--color-warning, #f59e0b);
      }

      .listening-stat-icon--success {
        color: var(--color-success, #10b981);
      }

      .listening-stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      .listening-stat-value--warning {
        color: var(--color-warning, #f59e0b);
      }

      .listening-stat-label {
        font-size: 0.875rem;
        color: var(--color-text-muted, #888);
        margin-top: var(--space-1, 0.25rem);
      }

      /* Detection Cards */
      .detection-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-3, 0.75rem);
      }

      @media (max-width: 1024px) {
        .detection-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .detection-card {
        padding: var(--space-4, 1rem);
        background: var(--color-background-subtle, #f5f5f5);
        border-radius: var(--radius-md, 0.5rem);
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .detection-card--soothing {
        border-left-color: var(--color-warning, #f59e0b);
      }

      .detection-card--hedging {
        border-left-color: var(--color-info, #3b82f6);
      }

      .detection-card--tremor {
        border-left-color: var(--color-error, #ef4444);
      }

      .detection-card--fade {
        border-left-color: var(--color-muted, #6b7280);
      }

      .detection-card-title {
        font-weight: 600;
        margin-bottom: var(--space-1, 0.25rem);
      }

      .detection-card-count {
        font-size: 1.5rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      .detection-card-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #888);
        margin-top: var(--space-2, 0.5rem);
      }

      /* Live Sessions */
      .live-sessions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .live-session-card {
        padding: var(--space-4, 1rem);
        background: var(--color-background-subtle, #f5f5f5);
        border-radius: var(--radius-md, 0.5rem);
        border: 1px solid var(--color-border, #e5e5e5);
      }

      .live-session-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3, 0.75rem);
      }

      .live-session-id {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.75rem;
        color: var(--color-text-muted, #888);
      }

      .live-session-duration {
        font-size: 0.75rem;
        color: var(--color-text-muted, #888);
      }

      .live-session-metrics {
        display: flex;
        gap: var(--space-3, 0.75rem);
      }

      .live-metric {
        flex: 1;
        text-align: center;
      }

      .live-metric-label {
        font-size: 0.625rem;
        text-transform: uppercase;
        color: var(--color-text-muted, #888);
        letter-spacing: 0.05em;
      }

      .live-metric-value {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .live-metric-value--low {
        color: var(--color-success, #10b981);
      }

      .live-metric-value--medium {
        color: var(--color-warning, #f59e0b);
      }

      .live-metric-value--high,
      .live-metric-value--overloaded {
        color: var(--color-error, #ef4444);
      }

      .live-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: var(--color-success, #10b981);
        border-radius: 50%;
        margin-left: var(--space-2, 0.5rem);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Signal severity badges */
      .severity-badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full, 9999px);
        font-size: 0.75rem;
        font-weight: 500;
      }

      .severity-badge--low {
        background: var(--color-success-bg, #d1fae5);
        color: var(--color-success, #10b981);
      }

      .severity-badge--medium {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #f59e0b);
      }

      .severity-badge--high {
        background: var(--color-error-bg, #fee2e2);
        color: var(--color-error, #ef4444);
      }

      /* Feature status */
      .features-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 0.75rem);
      }

      @media (max-width: 1024px) {
        .features-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .feature-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-3, 0.75rem);
        background: var(--color-background-subtle, #f5f5f5);
        border-radius: var(--radius-md, 0.5rem);
      }

      .feature-item--enabled {
        border-left: 3px solid var(--color-success, #10b981);
      }

      .feature-item--disabled {
        border-left: 3px solid var(--color-muted, #6b7280);
        opacity: 0.7;
      }

      .feature-icon {
        flex-shrink: 0;
      }

      .feature-icon--enabled {
        color: var(--color-success, #10b981);
      }

      .feature-icon--disabled {
        color: var(--color-muted, #6b7280);
      }

      .feature-name {
        font-weight: 500;
        font-size: 0.875rem;
      }

      .feature-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #888);
      }

      .no-sessions {
        text-align: center;
        padding: var(--space-8, 2rem);
        color: var(--color-text-muted, #888);
      }

      /* Avatar Soul Response Section */
      .listening-soul-response {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(154, 123, 90, 0.05));
        border: 1px solid rgba(74, 103, 65, 0.2);
      }

      .listening-soul-response .admin-section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .badge--new {
        background: var(--persona-primary, #4a6741);
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full, 9999px);
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .section-desc {
        color: var(--color-text-muted, #888);
        font-size: 0.875rem;
        margin-bottom: var(--space-4, 1rem);
      }

      .soul-response-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 0.75rem);
        margin-bottom: var(--space-4, 1rem);
      }

      @media (max-width: 1024px) {
        .soul-response-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .soul-response-item {
        padding: var(--space-3, 0.75rem);
        background: rgba(0, 0, 0, 0.2);
        border-radius: var(--radius-md, 0.5rem);
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .soul-response-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        margin-bottom: var(--space-2, 0.5rem);
        flex-wrap: wrap;
      }

      .soul-response-trigger {
        font-weight: 600;
        font-size: 0.8rem;
        color: var(--color-text-muted, #888);
      }

      .soul-response-arrow {
        color: var(--persona-primary, #4a6741);
      }

      .soul-response-action {
        font-weight: 600;
        color: var(--persona-primary, #4a6741);
        font-size: 0.875rem;
      }

      .soul-response-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #888);
        margin-bottom: var(--space-2, 0.5rem);
      }

      .soul-response-code {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.625rem;
        color: var(--persona-primary, #4a6741);
        opacity: 0.7;
      }

      .soul-response-stats {
        display: flex;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        background: rgba(0, 0, 0, 0.15);
        border-radius: var(--radius-md, 0.5rem);
        margin-bottom: var(--space-3, 0.75rem);
      }

      .soul-stat {
        flex: 1;
        text-align: center;
      }

      .soul-stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        color: var(--persona-primary, #4a6741);
      }

      .soul-stat-label {
        font-size: 0.7rem;
        color: var(--color-text-muted, #888);
      }

      .soul-link {
        display: inline-block;
        color: var(--persona-primary, #4a6741);
        text-decoration: none;
        font-size: 0.875rem;
        transition: opacity 0.2s;
      }

      .soul-link:hover {
        opacity: 0.8;
      }
    </style>
  `;
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderDetectionCard(title: string, count: number, desc: string, type: string): string {
  return `
    <div class="detection-card detection-card--${type}">
      <div class="detection-card-title">${title}</div>
      <div class="detection-card-count">${count}</div>
      <div class="detection-card-desc">${desc}</div>
    </div>
  `;
}

function renderLiveSession(session: LiveSession): string {
  return `
    <div class="live-session-card">
      <div class="live-session-header">
        <span class="live-session-id">${session.sessionId.slice(0, 8)}...</span>
        <span class="live-session-duration">${formatDuration(session.duration)}</span>
      </div>
      <div class="live-session-metrics">
        <div class="live-metric">
          <div class="live-metric-label">Cognitive</div>
          <div class="live-metric-value live-metric-value--${session.cognitiveLoad}">${session.cognitiveLoad}</div>
        </div>
        <div class="live-metric">
          <div class="live-metric-label">Engagement</div>
          <div class="live-metric-value live-metric-value--${session.engagement === 'high' ? 'low' : session.engagement === 'low' ? 'high' : 'medium'}">${session.engagement}</div>
        </div>
      </div>
      ${
        session.emotionalUndercurrent
          ? `
        <div class="live-session-undercurrent">
          <span class="live-metric-label">Emotional undercurrent:</span>
          ${session.emotionalUndercurrent}
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderNoSessions(): string {
  return `
    <div class="no-sessions">
      <div class="admin-icon">${iconSm(ICON_HEADPHONES)}</div>
      <div>No active sessions</div>
      <div style="font-size: 0.75rem">Human listening insights will appear here during conversations</div>
    </div>
  `;
}

function renderSignalRow(signal: RecentSignal): string {
  return `
    <tr>
      <td>${formatTime(signal.timestamp)}</td>
      <td><span style="text-transform: capitalize">${signal.signalType.replace('_', ' ')}</span></td>
      <td><span class="severity-badge severity-badge--${signal.severity}">${signal.severity}</span></td>
      <td>${signal.details}</td>
      <td>${signal.actionTaken || '—'}</td>
    </tr>
  `;
}

function renderFeatureStatus(name: string, enabled: boolean, desc: string): string {
  return `
    <div class="feature-item feature-item--${enabled ? 'enabled' : 'disabled'}">
      <span class="feature-icon feature-icon--${enabled ? 'enabled' : 'disabled'}">
        ${iconSm(enabled ? ICON_SUCCESS : ICON_INFO)}
      </span>
      <div>
        <div class="feature-name">${name}</div>
        <div class="feature-desc">${desc}</div>
      </div>
    </div>
  `;
}

function renderSoulResponse(trigger: string, response: string, desc: string, code: string): string {
  return `
    <div class="soul-response-item">
      <div class="soul-response-header">
        <span class="soul-response-trigger">${trigger}</span>
        <span class="soul-response-arrow">→</span>
        <span class="soul-response-action">${response}</span>
      </div>
      <div class="soul-response-desc">${desc}</div>
      <code class="soul-response-code">${code}</code>
    </div>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchMetrics(): Promise<ListeningMetrics> {
  try {
    const response = await fetch('/api/admin/human-listening/metrics');
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    log.warn('Failed to fetch listening metrics', err);
  }

  // Mock data for development
  return {
    totalSessions: 1247,
    distressDetections: 23,
    avgCognitiveLoad: 0.35,
    avgEngagement: 0.78,
    selfSoothingDetections: 156,
    hedgingDetections: 412,
  };
}

async function fetchRecentSignals(): Promise<RecentSignal[]> {
  try {
    const response = await fetch('/api/admin/human-listening/signals');
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    log.warn('Failed to fetch listening signals', err);
  }

  // Mock data for development
  return [
    {
      sessionId: 'abc123',
      timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
      signalType: 'self_soothing',
      severity: 'medium',
      details: '"I\'m fine, it doesn\'t matter"',
      actionTaken: 'Slowed response pace',
    },
    {
      sessionId: 'def456',
      timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
      signalType: 'cognitive_load',
      severity: 'high',
      details: 'Elevated fillers, slowing speech rate',
      actionTaken: 'Simplified response',
    },
    {
      sessionId: 'ghi789',
      timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
      signalType: 'distress',
      severity: 'high',
      details: 'Voice tremor + self-soothing detected',
      actionTaken: 'Gentle validation response',
    },
    {
      sessionId: 'jkl012',
      timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      signalType: 'hedging',
      severity: 'low',
      details: '"Maybe, I guess, probably"',
      actionTaken: 'Gentle probe offered',
    },
    {
      sessionId: 'mno345',
      timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
      signalType: 'disengagement',
      severity: 'medium',
      details: 'Response length declining',
      actionTaken: 'Topic shift suggested',
    },
  ];
}

async function fetchLiveSessions(): Promise<LiveSession[]> {
  try {
    const response = await fetch('/api/admin/human-listening/live');
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    log.warn('Failed to fetch live sessions', err);
  }

  // Return empty for now - will populate when sessions are active
  return [];
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatCognitiveLoad(value: number): string {
  if (value < 0.3) return 'Low';
  if (value < 0.6) return 'Med';
  if (value < 0.8) return 'High';
  return 'Over';
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}
