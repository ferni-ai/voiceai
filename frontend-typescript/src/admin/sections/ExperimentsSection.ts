/**
 * Experiments Section
 *
 * Web A/B experiment management for the admin portal.
 * View experiments, analyze results, and manage experiment lifecycle.
 *
 * @module ExperimentsSection
 */

import { createLogger } from '../../utils/logger.js';
import {
  ICON_CHART,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_PLUS,
  ICON_REFRESH,
  ICON_SETTINGS,
  ICON_SUCCESS,
  iconSm,
} from '../icons.js';

const log = createLogger('ExperimentsSection');

// ============================================================================
// TYPES
// ============================================================================

interface WebExperiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: Array<{ id: string; name: string; weight: number }>;
  primaryGoal: string;
  minimumSamples: number;
  winner?: string;
  winnerConfidence?: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  analysis?: ExperimentAnalysis;
}

interface ExperimentAnalysis {
  experimentId: string;
  variants: Array<{
    id: string;
    name: string;
    exposures: number;
    conversions: number;
    conversionRate: number;
    improvement?: number;
  }>;
  winner: string | null;
  confidence: number;
  isSignificant: boolean;
  recommendation: string;
  sampleSize: number;
  minimumSamples: number;
  progress: number;
}

interface ExperimentsResponse {
  experiments: WebExperiment[];
  summary: {
    total: number;
    running: number;
    completed: number;
    draft: number;
    paused: number;
  };
}

// ============================================================================
// API
// ============================================================================

async function fetchExperiments(): Promise<ExperimentsResponse> {
  try {
    const response = await fetch('/api/v1/admin/experiments');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    log.error('Failed to fetch experiments:', error);
    return {
      experiments: [],
      summary: { total: 0, running: 0, completed: 0, draft: 0, paused: 0 },
    };
  }
}

async function startExperiment(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/v1/admin/experiments/${id}/start`, {
      method: 'POST',
    });
    return response.ok;
  } catch (error) {
    log.error('Failed to start experiment:', error);
    return false;
  }
}

async function pauseExperiment(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/v1/admin/experiments/${id}/pause`, {
      method: 'POST',
    });
    return response.ok;
  } catch (error) {
    log.error('Failed to pause experiment:', error);
    return false;
  }
}

async function completeExperiment(id: string, winner: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/v1/admin/experiments/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner }),
    });
    return response.ok;
  } catch (error) {
    log.error('Failed to complete experiment:', error);
    return false;
  }
}

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the experiments section
 */
export async function render(): Promise<string> {
  log.debug('Rendering experiments section');

  const data = await fetchExperiments();
  const { experiments, summary } = data;

  return `
    <div class="experiments-section">
      <!-- Summary Cards -->
      <div class="experiments-summary">
        ${renderSummaryCard('Running', summary.running, 'running', ICON_PLAY)}
        ${renderSummaryCard('Completed', summary.completed, 'completed', ICON_SUCCESS)}
        ${renderSummaryCard('Draft', summary.draft, 'draft', ICON_SETTINGS)}
        ${renderSummaryCard('Paused', summary.paused, 'paused', ICON_PAUSE)}
      </div>

      <!-- Actions -->
      <div class="experiments-actions">
        <button class="admin-btn primary" data-action="create-experiment">
          <span class="admin-icon">${iconSm(ICON_PLUS)}</span>
          New Experiment
        </button>
        <button class="admin-btn" data-action="refresh-experiments">
          <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
          Refresh
        </button>
      </div>

      <!-- Experiments List -->
      <div class="experiments-list">
        ${
          experiments.length === 0
            ? `
          <div class="admin-card experiments-empty">
            <div class="empty-state">
              <span class="admin-icon">${iconSm(ICON_CHART)}</span>
              <h3>No Experiments Yet</h3>
              <p>Create your first A/B test to start optimizing.</p>
            </div>
          </div>
        `
            : experiments.map((exp) => renderExperimentCard(exp)).join('')
        }
      </div>
    </div>

    <style>
      .experiments-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      .experiments-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-4);
      }

      .summary-card {
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .summary-card .admin-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .summary-card.running .admin-icon { background: rgba(74, 103, 65, 0.15); color: #4a6741; }
      .summary-card.completed .admin-icon { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
      .summary-card.draft .admin-icon { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
      .summary-card.paused .admin-icon { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

      .summary-card-content h4 {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
      }

      .summary-card-content .count {
        font-size: var(--text-2xl);
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .experiments-actions {
        display: flex;
        gap: var(--space-3);
      }

      .admin-btn.primary {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .admin-btn.primary:hover {
        background: var(--persona-primary-hover, #3d5a35);
      }

      .experiments-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .experiment-card {
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        border: 1px solid var(--color-border);
      }

      .experiment-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-4);
      }

      .experiment-title {
        font-size: var(--text-lg);
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1) 0;
      }

      .experiment-description {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0;
      }

      .experiment-status {
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-full);
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
      }

      .experiment-status.running {
        background: rgba(74, 103, 65, 0.15);
        color: #4a6741;
      }

      .experiment-status.completed {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .experiment-status.draft {
        background: rgba(148, 163, 184, 0.15);
        color: #94a3b8;
      }

      .experiment-status.paused {
        background: rgba(251, 191, 36, 0.15);
        color: #fbbf24;
      }

      .experiment-variants {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }

      .variant-card {
        background: var(--color-background);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
      }

      .variant-card.winner {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.05);
      }

      .variant-name {
        font-weight: 600;
        font-size: var(--text-sm);
        margin-bottom: var(--space-2);
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .variant-name .winner-badge {
        background: #22c55e;
        color: white;
        padding: 2px 6px;
        border-radius: var(--radius-full);
        font-size: 10px;
        text-transform: uppercase;
      }

      .variant-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
        font-size: var(--text-xs);
      }

      .variant-stat {
        text-align: center;
      }

      .variant-stat-value {
        font-weight: 600;
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .variant-stat-label {
        color: var(--color-text-muted);
      }

      .experiment-progress {
        margin-bottom: var(--space-4);
      }

      .progress-bar {
        height: 6px;
        background: var(--color-background);
        border-radius: var(--radius-full);
        overflow: hidden;
        margin-bottom: var(--space-2);
      }

      .progress-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: var(--radius-full);
        transition: width 0.3s ease;
      }

      .progress-label {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        display: flex;
        justify-content: space-between;
      }

      .experiment-recommendation {
        background: var(--color-background);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-4);
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .experiment-actions {
        display: flex;
        gap: var(--space-2);
      }

      .empty-state {
        text-align: center;
        padding: var(--space-8);
      }

      .empty-state .admin-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--space-4);
        opacity: 0.5;
      }

      .empty-state h3 {
        margin: 0 0 var(--space-2) 0;
        color: var(--color-text-primary);
      }

      .empty-state p {
        color: var(--color-text-muted);
        margin: 0;
      }

      @media (max-width: 768px) {
        .experiments-summary {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    </style>
  `;
}

function renderSummaryCard(label: string, count: number, status: string, icon: string): string {
  return `
    <div class="summary-card ${status}">
      <span class="admin-icon">${iconSm(icon)}</span>
      <div class="summary-card-content">
        <h4>${label}</h4>
        <span class="count">${count}</span>
      </div>
    </div>
  `;
}

function renderExperimentCard(exp: WebExperiment): string {
  const analysis = exp.analysis;

  return `
    <div class="admin-card experiment-card" data-experiment-id="${exp.id}">
      <div class="experiment-header">
        <div>
          <h3 class="experiment-title">${exp.name}</h3>
          ${exp.description ? `<p class="experiment-description">${exp.description}</p>` : ''}
        </div>
        <span class="experiment-status ${exp.status}">${exp.status}</span>
      </div>

      ${
        analysis
          ? `
        <div class="experiment-variants">
          ${analysis.variants
            .map(
              (v) => `
            <div class="variant-card ${analysis.winner === v.id ? 'winner' : ''}">
              <div class="variant-name">
                ${v.name || v.id}
                ${analysis.winner === v.id ? '<span class="winner-badge">Winner</span>' : ''}
              </div>
              <div class="variant-stats">
                <div class="variant-stat">
                  <div class="variant-stat-value">${v.exposures.toLocaleString()}</div>
                  <div class="variant-stat-label">Exposures</div>
                </div>
                <div class="variant-stat">
                  <div class="variant-stat-value">${v.conversions.toLocaleString()}</div>
                  <div class="variant-stat-label">Conversions</div>
                </div>
                <div class="variant-stat">
                  <div class="variant-stat-value">${(v.conversionRate * 100).toFixed(2)}%</div>
                  <div class="variant-stat-label">Rate</div>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="experiment-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${analysis.progress}%"></div>
          </div>
          <div class="progress-label">
            <span>${analysis.sampleSize.toLocaleString()} / ${analysis.minimumSamples.toLocaleString()} samples</span>
            <span>${analysis.confidence}% confidence</span>
          </div>
        </div>

        <div class="experiment-recommendation">
          ${analysis.recommendation}
        </div>
      `
          : `
        <div class="experiment-variants">
          ${exp.variants
            .map(
              (v) => `
            <div class="variant-card">
              <div class="variant-name">${v.name || v.id}</div>
              <div class="variant-stats">
                <div class="variant-stat">
                  <div class="variant-stat-value">${v.weight}%</div>
                  <div class="variant-stat-label">Traffic</div>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }

      <div class="experiment-actions">
        ${
          exp.status === 'draft'
            ? `
          <button class="admin-btn" data-action="start-experiment" data-id="${exp.id}">
            <span class="admin-icon">${iconSm(ICON_PLAY)}</span>
            Start
          </button>
        `
            : ''
        }
        ${
          exp.status === 'running'
            ? `
          <button class="admin-btn" data-action="pause-experiment" data-id="${exp.id}">
            <span class="admin-icon">${iconSm(ICON_PAUSE)}</span>
            Pause
          </button>
          ${
            analysis?.isSignificant
              ? `
            <button class="admin-btn primary" data-action="ship-winner" data-id="${exp.id}" data-winner="${analysis.winner}">
              <span class="admin-icon">${iconSm(ICON_SUCCESS)}</span>
              Ship ${analysis.winner}
            </button>
          `
              : ''
          }
        `
            : ''
        }
        ${
          exp.status === 'paused'
            ? `
          <button class="admin-btn" data-action="start-experiment" data-id="${exp.id}">
            <span class="admin-icon">${iconSm(ICON_PLAY)}</span>
            Resume
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Setup event handlers for the experiments section
 */
export function setupEvents(): void {
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('[data-action]') as HTMLElement;

    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    switch (action) {
      case 'refresh-experiments':
        window.location.reload();
        break;

      case 'start-experiment':
        if (id && (await startExperiment(id))) {
          window.location.reload();
        }
        break;

      case 'pause-experiment':
        if (id && (await pauseExperiment(id))) {
          window.location.reload();
        }
        break;

      case 'ship-winner':
        if (id && button.dataset.winner) {
          if (confirm(`Ship "${button.dataset.winner}" as the winner?`)) {
            if (await completeExperiment(id, button.dataset.winner)) {
              window.location.reload();
            }
          }
        }
        break;

      case 'create-experiment':
        // Create experiment modal not yet implemented - log and show toast
        log.info('Create experiment requested - feature in development');
        // Use the admin toast if available, otherwise just log
        const toastContainer = document.querySelector('.admin-toast-container');
        if (toastContainer) {
          const toast = document.createElement('div');
          toast.className = 'admin-toast';
          toast.textContent = 'Create experiment coming soon!';
          toastContainer.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        }
        break;
    }
  });
}

export default { render, setupEvents };
