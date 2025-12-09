/**
 * Diagnostics Section
 *
 * System diagnostics and handoff monitoring for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module DiagnosticsSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import {
  ICON_HANDOFF,
  ICON_HISTORY,
  ICON_HEALTH,
  ICON_SUCCESS,
  ICON_ERROR,
  ICON_ARROW_RIGHT,
  iconSm,
} from '../icons.js';

const log = createLogger('DiagnosticsSection');

interface HandoffMetrics {
  totalHandoffs: number;
  successRate: number;
  avgDuration: number;
  failedHandoffs: number;
}

interface HandoffEvent {
  id: string;
  from: string;
  to: string;
  trigger: string;
  duration: number;
  status: 'success' | 'failed';
  timestamp: string;
}

/**
 * Render the diagnostics section
 */
export async function render(): Promise<string> {
  log.debug('Rendering diagnostics section');

  const metrics = await fetchHandoffMetrics();
  const events = await fetchRecentHandoffs();

  return `
    <div class="diagnostics-section">
      <!-- Handoff Stats -->
      <div class="admin-grid diagnostics-stats">
        <div class="admin-card diagnostics-stat">
          <div class="diagnostics-stat-value">${metrics.totalHandoffs}</div>
          <div class="diagnostics-stat-label">Total Handoffs</div>
        </div>
        <div class="admin-card diagnostics-stat">
          <div class="diagnostics-stat-value diagnostics-stat-value--success">${metrics.successRate}%</div>
          <div class="diagnostics-stat-label">Success Rate</div>
        </div>
        <div class="admin-card diagnostics-stat">
          <div class="diagnostics-stat-value">${metrics.avgDuration}ms</div>
          <div class="diagnostics-stat-label">Avg Duration</div>
        </div>
        <div class="admin-card diagnostics-stat">
          <div class="diagnostics-stat-value diagnostics-stat-value--warning">${metrics.failedHandoffs}</div>
          <div class="diagnostics-stat-label">Failed (24h)</div>
        </div>
      </div>

      <!-- Handoff Flow Diagram -->
      <div class="admin-card diagnostics-flow">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HANDOFF)}</span>
          Handoff Flow
        </h2>
        <div class="flow-diagram">
          ${renderFlowDiagram()}
        </div>
      </div>

      <!-- Recent Handoffs -->
      <div class="admin-card diagnostics-events">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HISTORY)}</span>
          Recent Handoffs
        </h2>
        <table class="admin-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Trigger</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(e => renderHandoffRow(e)).join('')}
          </tbody>
        </table>
      </div>

      <!-- System Health -->
      <div class="admin-card diagnostics-health">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HEALTH)}</span>
          System Components
        </h2>
        <div class="health-grid">
          ${renderHealthItem('LiveKit', 'healthy', '99.9% uptime')}
          ${renderHealthItem('Gemini', 'healthy', '45ms avg latency')}
          ${renderHealthItem('Cartesia', 'healthy', '98ms avg latency')}
          ${renderHealthItem('Firestore', 'healthy', '12ms avg latency')}
          ${renderHealthItem('Redis', 'healthy', '< 1ms avg latency')}
          ${renderHealthItem('Voice Auth', 'healthy', '89 profiles indexed')}
        </div>
      </div>
    </div>

    <style>
      .diagnostics-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .diagnostics-stats {
        grid-template-columns: repeat(4, 1fr);
      }

      @media (max-width: 1024px) {
        .diagnostics-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .diagnostics-stat {
        text-align: center;
        padding: var(--space-5, 1.25rem);
      }

      .diagnostics-stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      .diagnostics-stat-value--success {
        color: var(--color-semantic-success, #4a6741);
      }

      .diagnostics-stat-value--warning {
        color: var(--color-semantic-warning, #d4a84b);
      }

      .diagnostics-stat-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: var(--space-1, 0.25rem);
      }

      .flow-diagram {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-6, 1.5rem);
        flex-wrap: wrap;
      }

      .flow-node {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 2px solid var(--node-color, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-lg, 12px);
        min-width: 100px;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .flow-node:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.06));
      }

      @media (prefers-reduced-motion: reduce) {
        .flow-node {
          transition: none;
        }
      }

      .flow-node-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.75rem;
        color: white;
      }

      .flow-node-name {
        font-size: 0.8125rem;
        font-weight: 500;
      }

      .flow-arrow {
        display: flex;
        align-items: center;
        color: var(--color-text-muted, #756A5E);
      }

      .flow-arrow svg {
        width: 20px;
        height: 20px;
      }

      .handoff-status {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1, 0.25rem);
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full, 9999px);
        font-size: 0.75rem;
        font-weight: 500;
      }

      .handoff-status svg {
        width: 12px;
        height: 12px;
      }

      .handoff-status--success {
        background: rgba(74, 103, 65, 0.2);
        color: var(--color-semantic-success, #4a6741);
      }

      .handoff-status--failed {
        background: rgba(196, 69, 54, 0.2);
        color: var(--color-semantic-error, #c44536);
      }

      .health-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .health-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
      }

      .health-indicator {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        animation: diagnostics-pulse 2s infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .health-indicator {
          animation: none;
        }
      }

      .health-indicator--healthy {
        background: var(--color-semantic-success, #4a6741);
        box-shadow: 0 0 8px var(--color-semantic-success, #4a6741);
      }

      .health-indicator--degraded {
        background: var(--color-semantic-warning, #d4a84b);
        box-shadow: 0 0 8px var(--color-semantic-warning, #d4a84b);
      }

      .health-indicator--down {
        background: var(--color-semantic-error, #c44536);
        box-shadow: 0 0 8px var(--color-semantic-error, #c44536);
      }

      @keyframes diagnostics-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .health-info {
        flex: 1;
      }

      .health-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .health-detail {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }
    </style>
  `;
}

function renderFlowDiagram(): string {
  const personas = [
    { id: 'ferni', name: 'Ferni', color: '#4a6741' },
    { id: 'peter', name: 'Peter', color: '#3a6b73' },
    { id: 'maya', name: 'Maya', color: '#a67a6a' },
    { id: 'alex', name: 'Alex', color: '#5a6b8a' },
  ];

  return personas.map((p, i) => `
    ${i > 0 ? `<span class="flow-arrow">${iconSm(ICON_ARROW_RIGHT)}</span>` : ''}
    <div class="flow-node" style="--node-color: ${p.color};">
      <div class="flow-node-avatar" style="background: ${p.color};">
        ${p.name.slice(0, 2).toUpperCase()}
      </div>
      <span class="flow-node-name">${p.name}</span>
    </div>
  `).join('');
}

function renderHandoffRow(event: HandoffEvent): string {
  const statusIcon = event.status === 'success' ? iconSm(ICON_SUCCESS) : iconSm(ICON_ERROR);
  
  return `
    <tr>
      <td>${event.from}</td>
      <td>${event.to}</td>
      <td><code>${event.trigger}</code></td>
      <td>${event.duration}ms</td>
      <td>
        <span class="handoff-status handoff-status--${event.status}">
          ${statusIcon} ${event.status}
        </span>
      </td>
      <td>${event.timestamp}</td>
    </tr>
  `;
}

function renderHealthItem(name: string, status: 'healthy' | 'degraded' | 'down', detail: string): string {
  return `
    <div class="health-item">
      <span class="health-indicator health-indicator--${status}"></span>
      <div class="health-info">
        <div class="health-name">${name}</div>
        <div class="health-detail">${detail}</div>
      </div>
    </div>
  `;
}

async function fetchHandoffMetrics(): Promise<HandoffMetrics> {
  try {
    const response = await fetch('/api/v1/admin/diagnostics/handoff/metrics', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Fall through to mock data
  }

  return {
    totalHandoffs: 1847,
    successRate: 99.2,
    avgDuration: 145,
    failedHandoffs: 3,
  };
}

async function fetchRecentHandoffs(): Promise<HandoffEvent[]> {
  try {
    const response = await fetch('/api/v1/admin/diagnostics/handoff/recent', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return data.events || [];
    }
  } catch {
    // Fall through to mock data
  }

  return [
    { id: 'h1', from: 'Ferni', to: 'Peter', trigger: 'research', duration: 142, status: 'success', timestamp: '5 min ago' },
    { id: 'h2', from: 'Peter', to: 'Ferni', trigger: 'return', duration: 128, status: 'success', timestamp: '12 min ago' },
    { id: 'h3', from: 'Ferni', to: 'Maya', trigger: 'habits', duration: 156, status: 'success', timestamp: '28 min ago' },
    { id: 'h4', from: 'Maya', to: 'Ferni', trigger: 'return', duration: 134, status: 'success', timestamp: '45 min ago' },
    { id: 'h5', from: 'Ferni', to: 'Alex', trigger: 'email', duration: 289, status: 'failed', timestamp: '1 hour ago' },
  ];
}

export default { render };
