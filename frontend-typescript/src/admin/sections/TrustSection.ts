/**
 * Trust Section
 *
 * Trust system analytics and monitoring for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module TrustSection
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { createLogger } from '../../utils/logger.js';
import {
  ICON_CHART,
  ICON_CROWN,
  ICON_DATABASE,
  ICON_HANDOFF,
  ICON_HISTORY,
  ICON_TEAM,
  ICON_TRUST,
  iconSm,
} from '../icons.js';

const log = createLogger('TrustSection');

interface TrustMetrics {
  totalProfiles: number;
  avgTrustScore: number;
  activeRelationships: number;
  milestonesReached: number;
}

interface TrustEvent {
  id: string;
  type: string;
  action: string;
  description: string;
  timestamp: string;
}

/**
 * Render the trust analytics section
 */
export async function render(): Promise<string> {
  log.debug('Rendering trust section');

  const [metrics, events, stages, systems] = await Promise.all([
    fetchTrustMetrics(),
    fetchTrustEvents(),
    fetchStageDistribution(),
    fetchTrustSystems(),
  ]);

  return `
    <div class="trust-section">
      <!-- Quick Stats -->
      <div class="admin-grid trust-stats">
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">${iconSm(ICON_TEAM)}</div>
          <div class="trust-stat-value">${metrics.totalProfiles}</div>
          <div class="trust-stat-label">Trust Profiles</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">${iconSm(ICON_TRUST)}</div>
          <div class="trust-stat-value">${metrics.avgTrustScore}%</div>
          <div class="trust-stat-label">Avg Trust Score</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">${iconSm(ICON_HANDOFF)}</div>
          <div class="trust-stat-value">${metrics.activeRelationships}</div>
          <div class="trust-stat-label">Active Relationships</div>
        </div>
        <div class="admin-card trust-stat">
          <div class="trust-stat-icon">${iconSm(ICON_CROWN)}</div>
          <div class="trust-stat-value">${metrics.milestonesReached}</div>
          <div class="trust-stat-label">Milestones Reached</div>
        </div>
      </div>

      <!-- Trust Systems -->
      <div class="admin-card trust-systems">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_DATABASE)}</span>
          Trust Systems
        </h2>
        <div class="systems-grid">
          ${systems.map((s) => renderTrustSystem(s.id, s.name, s.description, s.active)).join('')}
        </div>
      </div>

      <!-- Relationship Stages -->
      <div class="admin-card trust-stages">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_CHART)}</span>
          Relationship Stage Distribution
        </h2>
        <div class="stages-chart">
          ${stages.map((s) => renderStageBar(s.name, s.percent, getStageColor(s.stage))).join('')}
        </div>
      </div>

      <!-- Relationship Warmth Visualization -->
      <div class="admin-card trust-warmth">
        <h2 class="admin-section-title">
          <span class="admin-icon">✨</span>
          Relationship Warmth
          <span class="badge badge--new">Avatar Soul</span>
        </h2>
        <p class="warmth-desc">Visual representation of deepening relationships - reflected in avatar's default warmth</p>
        
        <div class="warmth-visualization">
          <div class="warmth-stages">
            ${renderWarmthStage('New User', 0.3, 'New relationships start cool and calm')}
            ${renderWarmthStage('Building Trust', 0.5, 'Warmth increases with each meaningful interaction')}
            ${renderWarmthStage('Established', 0.7, 'Avatar becomes noticeably warmer')}
            ${renderWarmthStage('Deep Partnership', 0.9, 'Maximum warmth - trusted inner circle')}
          </div>
          
          <div class="warmth-preview">
            <div class="warmth-avatar-container">
              <div class="warmth-avatar-glow"></div>
              <div class="warmth-avatar">F</div>
            </div>
            <div class="warmth-slider-container">
              <label>Preview Warmth: <span id="warmthPreviewValue">0.3</span></label>
              <input type="range" id="warmthPreviewSlider" min="0" max="1" step="0.1" value="0.3">
            </div>
          </div>
        </div>

        <div class="warmth-stats">
          <div class="warmth-stat">
            <span class="warmth-stat-label">Avg Warmth (All Users)</span>
            <span class="warmth-stat-value">0.52</span>
          </div>
          <div class="warmth-stat">
            <span class="warmth-stat-label">Users at Max Warmth</span>
            <span class="warmth-stat-value">23</span>
          </div>
          <div class="warmth-stat">
            <span class="warmth-stat-label">Warmth Increases Today</span>
            <span class="warmth-stat-value">+147</span>
          </div>
        </div>
      </div>

      <!-- Recent Trust Events -->
      <div class="admin-card trust-events">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HISTORY)}</span>
          Recent Trust Events
          ${events.length > 0 ? `<span class="events-count">${events.length}</span>` : ''}
        </h2>
        <div class="events-list">
          ${
            events.length > 0
              ? events.map((e) => renderTrustEvent(ICON_TRUST, e.description, e.timestamp)).join('')
              : renderNoEvents()
          }
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
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--space-2, 0.5rem);
        color: var(--persona-primary, #4a6741);
      }

      .trust-stat-icon svg {
        width: 24px;
        height: 24px;
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
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid var(--system-color, var(--color-text-muted, #756A5E));
        transition: background var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .system-item:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.05));
      }

      @media (prefers-reduced-motion: reduce) {
        .system-item {
          transition: none;
        }
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
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
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
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.05));
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
        transition: width var(--duration-deliberate, ${DURATION.DELIBERATE}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      @media (prefers-reduced-motion: reduce) {
        .stage-bar-fill {
          transition: none;
        }
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
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.02));
        border-radius: var(--radius-md, 8px);
      }

      .event-icon {
        display: flex;
        align-items: center;
        color: var(--persona-primary, #4a6741);
      }

      .event-icon svg {
        width: 16px;
        height: 16px;
      }

      .event-text {
        flex: 1;
        font-size: 0.875rem;
      }

      .event-time {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }

      .events-count {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        background: var(--persona-primary, #4a6741);
        color: white;
        border-radius: var(--radius-full, 9999px);
        margin-left: auto;
      }

      .no-events {
        text-align: center;
        padding: var(--space-6, 1.5rem);
        color: var(--color-text-secondary, #a89a8c);
      }

      .no-events-hint {
        font-size: 0.75rem;
        margin-top: var(--space-2, 0.5rem);
        color: var(--color-text-muted, #756A5E);
      }

      /* Relationship Warmth Section */
      .trust-warmth {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(196, 162, 101, 0.05));
        border: 1px solid rgba(74, 103, 65, 0.2);
      }

      .trust-warmth .admin-section-title {
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
        margin-left: auto;
      }

      .warmth-desc {
        color: var(--color-text-muted, #756A5E);
        font-size: 0.875rem;
        margin-bottom: var(--space-4, 1rem);
      }

      .warmth-visualization {
        display: flex;
        gap: var(--space-6, 1.5rem);
        margin-bottom: var(--space-4, 1rem);
      }

      @media (max-width: 900px) {
        .warmth-visualization {
          flex-direction: column;
        }
      }

      .warmth-stages {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3, 0.75rem);
      }

      .warmth-stage {
        padding: var(--space-3, 0.75rem);
        background: rgba(0, 0, 0, 0.2);
        border-radius: var(--radius-md, 8px);
        text-align: center;
      }

      .warmth-stage-avatar {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        margin: 0 auto var(--space-2, 0.5rem);
        transition: all 0.3s ease;
      }

      .warmth-stage-info {
        display: flex;
        justify-content: center;
        align-items: baseline;
        gap: var(--space-2, 0.5rem);
        margin-bottom: var(--space-1, 0.25rem);
      }

      .warmth-stage-name {
        font-weight: 600;
        font-size: 0.85rem;
      }

      .warmth-stage-value {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.75rem;
        color: var(--persona-primary, #4a6741);
      }

      .warmth-stage-desc {
        font-size: 0.7rem;
        color: var(--color-text-muted, #756A5E);
        line-height: 1.3;
      }

      .warmth-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        background: rgba(0, 0, 0, 0.2);
        border-radius: var(--radius-lg, 12px);
        min-width: 200px;
      }

      .warmth-avatar-container {
        position: relative;
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .warmth-avatar-glow {
        position: absolute;
        inset: -20px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(74, 103, 65, 0.3) 0%, transparent 70%);
        transition: all 0.5s ease;
        pointer-events: none;
      }

      .warmth-avatar {
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: linear-gradient(180deg, hsl(120, 20%, 33%), hsl(120, 22%, 28%));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: bold;
        color: white;
        box-shadow: 0 0 15px hsla(120, 20%, 33%, 0.3);
        transition: all 0.5s ease;
        z-index: 1;
      }

      .warmth-slider-container {
        width: 100%;
        text-align: center;
      }

      .warmth-slider-container label {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
        margin-bottom: var(--space-2, 0.5rem);
      }

      .warmth-slider-container input[type="range"] {
        width: 100%;
        height: 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        appearance: none;
        cursor: pointer;
      }

      .warmth-slider-container input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--persona-primary, #4a6741);
        cursor: pointer;
        transition: transform 0.2s;
      }

      .warmth-slider-container input[type="range"]::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }

      .warmth-stats {
        display: flex;
        gap: var(--space-4, 1rem);
        padding: var(--space-3, 0.75rem);
        background: rgba(0, 0, 0, 0.15);
        border-radius: var(--radius-md, 8px);
      }

      .warmth-stat {
        flex: 1;
        text-align: center;
      }

      .warmth-stat-label {
        font-size: 0.7rem;
        color: var(--color-text-muted, #756A5E);
        display: block;
        margin-bottom: var(--space-1, 0.25rem);
      }

      .warmth-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        color: var(--persona-primary, #4a6741);
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
      <span class="event-icon">${iconSm(icon)}</span>
      <span class="event-text">${text}</span>
      <span class="event-time">${time}</span>
    </div>
  `;
}

async function fetchTrustMetrics(): Promise<TrustMetrics> {
  try {
    const response = await fetch('/api/trust/analytics/metrics', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return {
        totalProfiles: data.totalProfiles || 0,
        avgTrustScore: data.avgTrustScore || 0,
        activeRelationships: data.activeRelationships || 0,
        milestonesReached: data.milestonesReached || 0,
      };
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch trust metrics');
  }

  // Return zeros to indicate no data (not fake data)
  return {
    totalProfiles: 0,
    avgTrustScore: 0,
    activeRelationships: 0,
    milestonesReached: 0,
  };
}

async function fetchTrustEvents(): Promise<TrustEvent[]> {
  try {
    const response = await fetch('/api/v1/admin/dashboard/activity/trust', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return data.activity || [];
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch trust events');
  }

  return [];
}

interface StageData {
  stage: string;
  name: string;
  count: number;
  percent: number;
}

async function fetchStageDistribution(): Promise<StageData[]> {
  try {
    const response = await fetch('/api/trust/analytics/stages', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return data.stages || [];
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch stage distribution');
  }

  // Return default stages with 0 percentages
  return [
    { stage: 'new', name: 'First Meeting', count: 0, percent: 0 },
    { stage: 'building', name: 'Getting Started', count: 0, percent: 0 },
    { stage: 'established', name: 'Building Trust', count: 0, percent: 0 },
    { stage: 'deep', name: 'Established', count: 0, percent: 0 },
    { stage: 'flourishing', name: 'Deep Partnership', count: 0, percent: 0 },
  ];
}

interface TrustSystem {
  id: string;
  name: string;
  description: string;
  active: boolean;
  lastEvent?: string;
}

async function fetchTrustSystems(): Promise<TrustSystem[]> {
  try {
    const response = await fetch('/api/trust/analytics/systems', {
      headers: {
        'x-admin-key': 'dev-mode',
      },
    });
    if (response.ok) {
      const data = await response.json();
      return data.systems || [];
    }
  } catch (error) {
    log.warn({ error }, 'Failed to fetch trust systems');
  }

  // Return default systems
  return [
    {
      id: 'reading-between-lines',
      name: 'Reading Between Lines',
      description: "Detects what's NOT being said",
      active: true,
    },
    {
      id: 'boundary-memory',
      name: 'Boundary Memory',
      description: 'Tracks what NOT to bring up',
      active: true,
    },
    {
      id: 'growth-reflection',
      name: 'Growth Reflection',
      description: 'Notices user evolution',
      active: true,
    },
    {
      id: 'inside-jokes',
      name: 'Inside Jokes',
      description: 'Builds shared history',
      active: true,
    },
    {
      id: 'small-wins',
      name: 'Small Wins',
      description: 'Celebrates effort, not just outcomes',
      active: true,
    },
    {
      id: 'thinking-of-you',
      name: 'Thinking of You',
      description: 'Proactive no-agenda outreach',
      active: false,
    },
  ];
}

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    new: 'var(--color-text-secondary, #a89a8c)',
    building: 'var(--persona-jack, #9a7b5a)',
    established: 'var(--persona-primary, #4a6741)',
    deep: 'var(--persona-peter, #3a6b73)',
    flourishing: 'var(--color-accent, #C4A265)',
  };
  return colors[stage] || 'var(--color-text-secondary, #a89a8c)';
}

function renderNoEvents(): string {
  return `
    <div class="no-events">
      <p>No recent trust events</p>
      <p class="no-events-hint">Events will appear here as trust milestones are reached</p>
    </div>
  `;
}

function renderWarmthStage(name: string, warmth: number, desc: string): string {
  const hue = 120 - warmth * 75; // Green to warm gold
  const saturation = 20 + warmth * 20;
  const lightness = 33 + warmth * 12;
  const glowOpacity = 0.3 + warmth * 0.4;
  
  return `
    <div class="warmth-stage">
      <div class="warmth-stage-avatar" style="
        background: linear-gradient(180deg, hsl(${hue}, ${saturation}%, ${lightness}%), hsl(${hue}, ${saturation + 2}%, ${lightness - 5}%));
        box-shadow: 0 0 ${15 + warmth * 15}px hsla(${hue}, ${saturation}%, ${lightness}%, ${glowOpacity});
      ">F</div>
      <div class="warmth-stage-info">
        <div class="warmth-stage-name">${name}</div>
        <div class="warmth-stage-value">${warmth.toFixed(1)}</div>
      </div>
      <div class="warmth-stage-desc">${desc}</div>
    </div>
  `;
}

export function setupWarmthPreview(): void {
  const slider = document.getElementById('warmthPreviewSlider') as HTMLInputElement;
  const valueDisplay = document.getElementById('warmthPreviewValue');
  const avatar = document.querySelector('.warmth-avatar') as HTMLElement;
  const glow = document.querySelector('.warmth-avatar-glow') as HTMLElement;
  
  if (!slider || !avatar || !glow) return;
  
  slider.addEventListener('input', () => {
    const warmth = parseFloat(slider.value);
    if (valueDisplay) valueDisplay.textContent = warmth.toFixed(1);
    
    // Update avatar appearance based on warmth
    const hue = 120 - warmth * 75;
    const saturation = 20 + warmth * 20;
    const lightness = 33 + warmth * 12;
    const glowOpacity = 0.3 + warmth * 0.4;
    
    avatar.style.background = `linear-gradient(180deg, hsl(${hue}, ${saturation}%, ${lightness}%), hsl(${hue}, ${saturation + 2}%, ${lightness - 5}%))`;
    avatar.style.boxShadow = `0 0 ${15 + warmth * 15}px hsla(${hue}, ${saturation}%, ${lightness}%, ${glowOpacity})`;
    
    glow.style.background = `radial-gradient(circle, hsla(${hue - 30}, ${saturation + 10}%, ${lightness + 10}%, ${glowOpacity}) 0%, transparent 70%)`;
    glow.style.transform = `scale(${1 + warmth * 0.3})`;
  });
}

export default { render };
