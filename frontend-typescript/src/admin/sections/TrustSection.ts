/**
 * Trust Section
 *
 * Trust system analytics and monitoring for the admin portal.
 *
 * @module TrustSection
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('TrustSection');

interface TrustMetrics {
  totalProfiles: number;
  avgTrustScore: number;
  activeRelationships: number;
  milestonesReached: number;
}

/**
 * Render the trust analytics section
 */
export async function render(): Promise<string> {
  log.debug('Rendering trust section');

  const metrics = await fetchTrustMetrics();

  return `
    <div class="trust-section">
      <!-- Quick Stats -->
      <div class="admin-grid trust-stats">
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">👥</div>
          <div class="trust-stat-value">${metrics.totalProfiles}</div>
          <div class="trust-stat-label">Trust Profiles</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">💚</div>
          <div class="trust-stat-value">${metrics.avgTrustScore}%</div>
          <div class="trust-stat-label">Avg Trust Score</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">🤝</div>
          <div class="trust-stat-value">${metrics.activeRelationships}</div>
          <div class="trust-stat-label">Active Relationships</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">🏆</div>
          <div class="trust-stat-value">${metrics.milestonesReached}</div>
          <div class="trust-stat-label">Milestones Reached</div>
        </div>
      </div>

      <!-- Trust Systems -->
      <div class="admin-card trust-systems">
        <h2 class="admin-section-title">
          <span>🧠</span> Trust Systems
        </h2>
        <div class="systems-grid">
          ${renderTrustSystem('reading-between-lines', 'Reading Between Lines', 'Detects what\'s NOT being said', true)}
          ${renderTrustSystem('boundary-memory', 'Boundary Memory', 'Tracks what NOT to bring up', true)}
          ${renderTrustSystem('growth-reflection', 'Growth Reflection', 'Notices user evolution', true)}
          ${renderTrustSystem('inside-jokes', 'Inside Jokes', 'Tracks shared history', true)}
          ${renderTrustSystem('small-wins', 'Small Wins', 'Celebrates effort, not just outcomes', true)}
          ${renderTrustSystem('thinking-of-you', 'Thinking of You', 'Proactive no-agenda outreach', false)}
        </div>
      </div>

      <!-- Relationship Stages -->
      <div class="admin-card trust-stages">
        <h2 class="admin-section-title">
          <span>📈</span> Relationship Stage Distribution
        </h2>
        <div class="stages-chart">
          ${renderStageBar('First Meeting', 15, '#a89a8c')}
          ${renderStageBar('Getting Started', 28, '#9a7b5a')}
          ${renderStageBar('Building Trust', 32, '#4a6741')}
          ${renderStageBar('Established', 18, '#3a6b73')}
          ${renderStageBar('Deep Partnership', 7, '#C4A265')}
        </div>
      </div>

      <!-- Recent Trust Events -->
      <div class="admin-card trust-events">
        <h2 class="admin-section-title">
          <span>📜</span> Recent Trust Events
        </h2>
        <div class="events-list">
          ${renderTrustEvent('💚', 'user_abc reached "Building Trust" stage', '10 min ago')}
          ${renderTrustEvent('🎯', 'Boundary detected and respected for user_xyz', '25 min ago')}
          ${renderTrustEvent('🏆', 'Small win celebrated: user_123 completed morning routine', '1 hour ago')}
          ${renderTrustEvent('😊', 'Inside joke reference successful with user_456', '2 hours ago')}
          ${renderTrustEvent('📈', 'Growth reflection triggered for user_789', '3 hours ago')}
        </div>
      </div>
    </div>

    <style>
      .trust-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .trust-stats {
        grid-template-columns: repeat(4, 1fr);
      }

      @media (max-width: 1024px) {
        .trust-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .trust-stat {
        text-align: center;
        padding: var(--space-5, 1.25rem);
      }

      .trust-stat-icon {
        font-size: 1.5rem;
        margin-bottom: var(--space-2, 0.5rem);
      }

      .trust-stat-value {
        font-size: 2rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        color: var(--persona-primary, #4a6741);
      }

      .trust-stat-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: var(--space-1, 0.25rem);
      }

      .systems-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .system-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-4, 1rem);
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid var(--system-color, var(--color-text-muted, #756A5E));
      }

      .system-item--active {
        --system-color: var(--persona-primary, #4a6741);
      }

      .system-info {
        flex: 1;
      }

      .system-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .system-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .system-status {
        font-size: 0.625rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full, 9999px);
      }

      .system-status--active {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .system-status--inactive {
        background: rgba(255, 255, 255, 0.1);
        color: var(--color-text-secondary, #a89a8c);
      }

      .stages-chart {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .stage-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
      }

      .stage-name {
        min-width: 140px;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .stage-bar-bg {
        flex: 1;
        height: 24px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md, 8px);
        overflow: hidden;
      }

      .stage-bar-fill {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: var(--space-2, 0.5rem);
        border-radius: var(--radius-md, 8px);
        transition: width 500ms ease;
      }

      .stage-percent {
        font-size: 0.75rem;
        font-weight: 600;
        color: white;
      }

      .events-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .event-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: rgba(255, 255, 255, 0.02);
        border-radius: var(--radius-md, 8px);
      }

      .event-icon {
        font-size: 1rem;
      }

      .event-text {
        flex: 1;
        font-size: 0.875rem;
      }

      .event-time {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }
    </style>
  `;
}

function renderTrustSystem(id: string, name: string, desc: string, active: boolean): string {
  return `
    <div class="system-item ${active ? 'system-item--active' : ''}" data-system="${id}">
      <div class="system-info">
        <div class="system-name">${name}</div>
        <div class="system-desc">${desc}</div>
      </div>
      <span class="system-status ${active ? 'system-status--active' : 'system-status--inactive'}">
        ${active ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </div>
  `;
}

function renderStageBar(name: string, percent: number, color: string): string {
  return `
    <div class="stage-item">
      <span class="stage-name">${name}</span>
      <div class="stage-bar-bg">
        <div class="stage-bar-fill" style="width: ${percent}%; background: ${color};">
          <span class="stage-percent">${percent}%</span>
        </div>
      </div>
    </div>
  `;
}

function renderTrustEvent(icon: string, text: string, time: string): string {
  return `
    <div class="event-item">
      <span class="event-icon">${icon}</span>
      <span class="event-text">${text}</span>
      <span class="event-time">${time}</span>
    </div>
  `;
}

async function fetchTrustMetrics(): Promise<TrustMetrics> {
  try {
    const response = await fetch('/api/trust/analytics/metrics');
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Fall through to mock data
  }

  return {
    totalProfiles: 892,
    avgTrustScore: 76,
    activeRelationships: 234,
    milestonesReached: 1547,
  };
}

export default { render };

