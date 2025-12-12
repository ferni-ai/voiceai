/**
 * EvalOps Section
 *
 * Evaluation operations dashboard for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module EvalOpsSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import { getAdminHeaders } from '../admin-api.js';
import {
  ICON_CHART,
  ICON_EVALOPS,
  ICON_EXTERNAL,
  ICON_FLAGS,
  ICON_SEARCH,
  ICON_SETTINGS,
  ICON_SUCCESS,
  ICON_TEAM,
  ICON_WARNING,
  ICON_ZAP,
  iconSm,
} from '../icons.js';

const log = createLogger('EvalOpsSection');

interface EvalMetrics {
  totalEvaluations: number;
  passRate: number;
  flaggedResponses: number;
  avgVoiceConsistency: number;
  lastRunTime: string;
}

interface FlaggedResponse {
  id: string;
  personaId: string;
  dimension: string;
  score: number;
  reason: string;
  timestamp: string;
}

interface DimensionAverages {
  personaVoice: number;
  emotionalIntelligence: number;
  helpfulness: number;
  authenticity: number;
  safety: number;
  contextUse: number;
  trustBuilding: number;
  sampleSize: number;
}

/**
 * Render the EvalOps section
 */
export async function render(): Promise<string> {
  log.debug('Rendering EvalOps section');

  const metrics = await fetchEvalMetrics();
  const flagged = await fetchFlaggedResponses();
  const dimensions = await fetchDimensionAverages();

  return `
    <div class="evalops-section">
      <!-- Quick Stats -->
      <div class="admin-grid evalops-stats">
        <div class="admin-card evalops-stat">
          <div class="evalops-stat-icon">${iconSm(ICON_CHART)}</div>
          <div class="evalops-stat-value">${metrics.totalEvaluations}</div>
          <div class="evalops-stat-label">Total Evaluations</div>
        </div>
        <div class="admin-card evalops-stat">
          <div class="evalops-stat-icon">${iconSm(ICON_SUCCESS)}</div>
          <div class="evalops-stat-value evalops-stat-value--success">${metrics.passRate}%</div>
          <div class="evalops-stat-label">Pass Rate</div>
        </div>
        <div class="admin-card evalops-stat">
          <div class="evalops-stat-icon">${iconSm(ICON_FLAGS)}</div>
          <div class="evalops-stat-value evalops-stat-value--warning">${metrics.flaggedResponses}</div>
          <div class="evalops-stat-label">Flagged Responses</div>
        </div>
        <div class="admin-card evalops-stat">
          <div class="evalops-stat-icon">${iconSm(ICON_TEAM)}</div>
          <div class="evalops-stat-value">${metrics.avgVoiceConsistency}%</div>
          <div class="evalops-stat-label">Voice Consistency</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="admin-card evalops-actions">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_ZAP)}</span>
          Quick Actions
        </h2>
        <div class="evalops-actions-grid">
          <button class="admin-btn admin-btn--primary" data-action="run-suite">
            <span class="admin-icon">${iconSm(ICON_EVALOPS)}</span>
            Run Test Suite
          </button>
          <button class="admin-btn" data-action="quick-check">
            <span class="admin-icon">${iconSm(ICON_SEARCH)}</span>
            Quick Voice Check
          </button>
          <button class="admin-btn" data-action="export-report">
            <span class="admin-icon">${iconSm(ICON_EXTERNAL)}</span>
            Export Report
          </button>
        </div>
        <p class="evalops-last-run">
          Last run: ${metrics.lastRunTime}
        </p>
      </div>

      <!-- Evaluation Dimensions -->
      <div class="admin-card evalops-dimensions">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_CHART)}</span>
          Evaluation Dimensions
        </h2>
        <div class="dimensions-grid">
          ${renderDimension('Persona Voice', dimensions.personaVoice, 'Does this sound like the character?')}
          ${renderDimension('Emotional Intelligence', dimensions.emotionalIntelligence, 'Did we read the room?')}
          ${renderDimension('Helpfulness', dimensions.helpfulness, 'Did we actually help?')}
          ${renderDimension('Authenticity', dimensions.authenticity, 'Does it feel human?')}
          ${renderDimension('Safety', dimensions.safety, 'Is it appropriate?')}
          ${renderDimension('Context Use', dimensions.contextUse, 'Did we use memory well?')}
          ${renderDimension('Trust Building', dimensions.trustBuilding, 'Did we strengthen the relationship?')}
        </div>
        ${dimensions.sampleSize === 0 ? '<p class="dimensions-empty">No evaluations yet. Run a test suite to see dimension scores.</p>' : `<p class="dimensions-sample-size">Based on ${dimensions.sampleSize} evaluation${dimensions.sampleSize === 1 ? '' : 's'}</p>`}
      </div>

      <!-- Flagged Responses -->
      <div class="admin-card evalops-flagged">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_FLAGS)}</span>
          Flagged Responses
          <span class="section-badge">${flagged.length}</span>
        </h2>
        <div class="flagged-list">
          ${
            flagged.length > 0
              ? flagged.map((f) => renderFlaggedItem(f)).join('')
              : '<p class="flagged-empty">No flagged responses. All clear!</p>'
          }
        </div>
      </div>

      <!-- Feature Flags -->
      <div class="admin-card evalops-flags">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_SETTINGS)}</span>
          EvalOps Settings
        </h2>
        <div class="flags-list">
          ${renderFlagToggle('evalops', 'EvalOps Enabled', 'Master toggle for evaluation system', true)}
          ${renderFlagToggle('evalops-auto-sampling', 'Auto Sampling', 'Sample conversations automatically', true)}
          ${renderFlagToggle('evalops-voice-checks', 'Voice Checks', 'Heuristic voice consistency checks', true)}
          ${renderFlagToggle('evalops-llm-evaluation', 'LLM Evaluation', 'Full LLM-as-judge (costs API tokens)', false)}
          ${renderFlagToggle('evalops-alerting', 'Alerting', 'Alert on flagged responses', true)}
        </div>
      </div>
    </div>

    <style>
      .evalops-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .evalops-stats {
        grid-template-columns: repeat(4, 1fr);
      }

      @media (max-width: 1024px) {
        .evalops-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .evalops-stat {
        text-align: center;
        padding: var(--space-5, 1.25rem);
      }

      .evalops-stat-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--space-2, 0.5rem);
        color: var(--persona-primary, #4a6741);
      }

      .evalops-stat-icon svg {
        width: 24px;
        height: 24px;
      }

      .evalops-stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      .evalops-stat-value--success {
        color: var(--color-semantic-success, #4a6741);
      }

      .evalops-stat-value--warning {
        color: var(--color-semantic-warning, #d4a84b);
      }

      .evalops-stat-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: var(--space-1, 0.25rem);
      }

      .evalops-actions-grid {
        display: flex;
        gap: var(--space-3, 0.75rem);
        flex-wrap: wrap;
      }

      .evalops-last-run {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
        margin-top: var(--space-3, 0.75rem);
      }

      .dimensions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .dimension-item {
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
      }

      .dimension-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .dimension-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .dimension-score {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-weight: 600;
      }

      .dimension-score--high { color: var(--color-semantic-success, #4a6741); }
      .dimension-score--medium { color: var(--color-semantic-warning, #d4a84b); }
      .dimension-score--low { color: var(--color-semantic-error, #c44536); }

      .dimension-bar {
        height: 4px;
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .dimension-bar-fill {
        height: 100%;
        border-radius: 2px;
        transition: width var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      @media (prefers-reduced-motion: reduce) {
        .dimension-bar-fill {
          transition: none;
        }
      }

      .dimension-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .section-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        background: var(--color-semantic-warning, #d4a84b);
        color: var(--color-background, #1a1612);
        border-radius: var(--radius-full, 9999px);
        margin-left: auto;
      }

      .flagged-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .flagged-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-left: 3px solid var(--color-semantic-warning, #d4a84b);
        border-radius: 0 var(--radius-md, 8px) var(--radius-md, 8px) 0;
      }

      .flagged-icon {
        display: flex;
        align-items: center;
        color: var(--color-semantic-warning, #d4a84b);
      }

      .flagged-icon svg {
        width: 20px;
        height: 20px;
      }

      .flagged-content {
        flex: 1;
      }

      .flagged-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .flagged-persona {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .flagged-dimension {
        font-size: 0.75rem;
        padding: 0.125rem 0.375rem;
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-sm, 4px);
      }

      .flagged-reason {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .flagged-time {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }

      .flagged-empty {
        text-align: center;
        padding: var(--space-6, 1.5rem);
        color: var(--color-text-secondary, #a89a8c);
      }

      .flags-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .flag-item {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
      }

      .flag-info {
        flex: 1;
      }

      .flag-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .flag-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }
    </style>
  `;
}

function renderDimension(name: string, score: number, desc: string): string {
  const scoreClass = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low';
  const barColor =
    score >= 90
      ? 'var(--color-semantic-success, #4a6741)'
      : score >= 70
        ? 'var(--color-semantic-warning, #d4a84b)'
        : 'var(--color-semantic-error, #c44536)';

  return `
    <div class="dimension-item">
      <div class="dimension-header">
        <span class="dimension-name">${name}</span>
        <span class="dimension-score dimension-score--${scoreClass}">${score}%</span>
      </div>
      <div class="dimension-bar" role="progressbar" aria-valuenow="${score}" aria-valuemin="0" aria-valuemax="100" aria-label="${name}: ${score} percent">
        <div class="dimension-bar-fill" style="width: ${score}%; background: ${barColor};" aria-hidden="true"></div>
      </div>
      <p class="dimension-desc">${desc}</p>
    </div>
  `;
}

function renderFlaggedItem(item: FlaggedResponse): string {
  return `
    <div class="flagged-item" data-id="${item.id}">
      <span class="flagged-icon">${iconSm(ICON_WARNING)}</span>
      <div class="flagged-content">
        <div class="flagged-header">
          <span class="flagged-persona">${item.personaId}</span>
          <span class="flagged-dimension">${item.dimension}</span>
          <span class="flagged-time">${item.timestamp}</span>
        </div>
        <p class="flagged-reason">${item.reason}</p>
      </div>
    </div>
  `;
}

function renderFlagToggle(id: string, name: string, desc: string, enabled: boolean): string {
  return `
    <div class="flag-item" data-flag="${id}">
      <div class="flag-info">
        <div class="flag-name">${name}</div>
        <div class="flag-desc">${desc}</div>
      </div>
      <label class="admin-toggle">
        <input type="checkbox" ${enabled ? 'checked' : ''} data-setting-id="${id}" data-action="toggle-evalops">
        <span class="admin-toggle-slider"></span>
      </label>
    </div>
  `;
}

async function fetchEvalMetrics(): Promise<EvalMetrics> {
  try {
    const response = await fetch('/api/evalops/metrics', {
      headers: getAdminHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      const metrics = data.metrics || data;
      return {
        totalEvaluations: metrics.totalEvaluations || 0,
        passRate: Math.round(metrics.averageScore || 0),
        flaggedResponses: metrics.flaggedResponses || 0,
        avgVoiceConsistency: Math.round(metrics.averageScore || 0),
        lastRunTime: metrics.lastEvaluationTime
          ? formatTimeAgo(new Date(metrics.lastEvaluationTime))
          : 'Never run',
      };
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch eval metrics');
  }

  // Return zeros to indicate no data (not fake data)
  return {
    totalEvaluations: 0,
    passRate: 0,
    flaggedResponses: 0,
    avgVoiceConsistency: 0,
    lastRunTime: 'Never run',
  };
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} hours ago`;
  return `${Math.round(diff / 86400000)} days ago`;
}

async function fetchFlaggedResponses(): Promise<FlaggedResponse[]> {
  try {
    const response = await fetch('/api/evalops/evaluations/flagged', {
      headers: getAdminHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      const evaluations = data.evaluations || [];
      return evaluations.map((e: Record<string, unknown>) => ({
        id: e.id || `eval-${Math.random().toString(36).slice(2)}`,
        personaId: e.personaId || 'unknown',
        dimension: e.lowestDimension || 'Quality',
        score: e.lowestScore || e.overallScore || 0,
        reason: e.details || 'Flagged for review',
        timestamp: e.timestamp ? formatTimeAgo(new Date(e.timestamp as string)) : 'recently',
      }));
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch flagged evaluations');
  }

  // Return empty array to indicate no data (not fake data)
  return [];
}

async function fetchDimensionAverages(): Promise<DimensionAverages> {
  try {
    const response = await fetch('/api/evalops/dimensions', {
      headers: getAdminHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      return data.dimensions || {
        personaVoice: 0,
        emotionalIntelligence: 0,
        helpfulness: 0,
        authenticity: 0,
        safety: 0,
        contextUse: 0,
        trustBuilding: 0,
        sampleSize: 0,
      };
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch dimension averages');
  }

  // Return zeros to indicate no evaluations yet (not fake data)
  return {
    personaVoice: 0,
    emotionalIntelligence: 0,
    helpfulness: 0,
    authenticity: 0,
    safety: 0,
    contextUse: 0,
    trustBuilding: 0,
    sampleSize: 0,
  };
}

export default { render };
