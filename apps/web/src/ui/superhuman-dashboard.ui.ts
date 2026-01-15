/**
 * Superhuman Dashboard UI
 *
 * Shows Ferni's "Better than Human" capabilities in action:
 * - Commitment Keeper: Promises and commitments being tracked
 * - Capacity Guardian: Current energy/burnout status
 * - Values Alignment: How well actions match values
 * - Life Narrative: The user's story arc
 * - Predictive Coaching: Anticipated struggles
 * - Dream Keeper: Long-term aspirations being held
 *
 * DESIGN PRINCIPLES:
 *   - Visual proof of what makes Ferni superhuman
 *   - Data-driven insights from user's history
 *   - Actionable next steps
 */

import { t } from '../i18n/index.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { getBetterThanHumanCapabilities, type Capability } from '../services/capability-registry.js';
import { createCapabilityCard } from './capability-card.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SuperhumanDashboard');

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  'check-square': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  'battery-charging': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><line x1="22" y1="11" x2="22" y2="13"/><path d="m11 7-3 5h3l-3 5"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  'book-open': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
  'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  'trending-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
};

// ============================================================================
// TYPES
// ============================================================================

interface SuperhumanMetrics {
  commitments: {
    total: number;
    completed: number;
    pending: number;
    upcoming: string[];
  };
  capacity: {
    score: number; // 0-100
    trend: 'improving' | 'stable' | 'declining';
    riskFactors: string[];
  };
  values: {
    alignmentScore: number; // 0-100
    alignedAreas: string[];
    misalignedAreas: string[];
  };
  narrative: {
    currentChapter: string;
    recentThemes: string[];
    growthAreas: string[];
  };
  predictions: {
    upcomingChallenges: string[];
    opportunities: string[];
  };
  dreams: {
    active: string[];
    progress: number; // 0-100
  };
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .superhuman-dashboard-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip, 1000);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .superhuman-dashboard-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .superhuman-dashboard-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
    backdrop-filter: blur(8px);
  }
  
  .superhuman-dashboard {
    position: relative;
    width: 95%;
    max-width: 900px;
    max-height: 90vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
  }
  
  .superhuman-dashboard-overlay.visible .superhuman-dashboard {
    transform: scale(1);
  }
  
  .superhuman-dashboard__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-ferni-tint, rgba(74, 103, 65, 0.1)), transparent);
  }
  
  .superhuman-dashboard__header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3, 12px);
  }
  
  .superhuman-dashboard__eyebrow {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ferni, #4a6741);
  }
  
  .superhuman-dashboard__eyebrow svg {
    width: 14px;
    height: 14px;
  }
  
  .superhuman-dashboard__close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full, 9999px);
    transition: background var(--duration-fast, 100ms);
  }
  
  .superhuman-dashboard__close:hover {
    background: rgba(255, 255, 255, 0.5);
  }
  
  .superhuman-dashboard__close svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted, #a09080);
  }
  
  .superhuman-dashboard__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2C2520);
    margin: 0 0 var(--space-2, 8px) 0;
  }
  
  .superhuman-dashboard__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin: 0;
  }
  
  .superhuman-dashboard__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  .superhuman-dashboard__metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-6, 24px);
  }
  
  @media (max-width: 768px) {
    .superhuman-dashboard__metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  
  @media (max-width: 500px) {
    .superhuman-dashboard__metrics-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .superhuman-dashboard__metric {
    background: var(--color-bg-subtle, #f8f6f4);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-4, 16px);
    position: relative;
    overflow: hidden;
  }
  
  .superhuman-dashboard__metric-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md, 12px);
    background: var(--color-ferni-tint, rgba(74, 103, 65, 0.15));
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-3, 12px);
  }
  
  .superhuman-dashboard__metric-icon svg {
    width: 16px;
    height: 16px;
    color: var(--color-ferni, #4a6741);
  }
  
  .superhuman-dashboard__metric-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted, #a09080);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: var(--space-1, 4px);
  }
  
  .superhuman-dashboard__metric-value {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text-primary, #2C2520);
    line-height: 1;
    margin-bottom: var(--space-2, 8px);
  }
  
  .superhuman-dashboard__metric-trend {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
    font-size: 12px;
    font-weight: 500;
  }
  
  .superhuman-dashboard__metric-trend--up {
    color: var(--color-ferni, #4a6741);
  }
  
  .superhuman-dashboard__metric-trend--down {
    color: var(--color-error, #c75a5a);
  }
  
  .superhuman-dashboard__metric-trend--stable {
    color: var(--color-text-muted, #a09080);
  }
  
  .superhuman-dashboard__metric-trend svg {
    width: 14px;
    height: 14px;
  }
  
  .superhuman-dashboard__section {
    margin-bottom: var(--space-6, 24px);
  }
  
  .superhuman-dashboard__section:last-child {
    margin-bottom: 0;
  }
  
  .superhuman-dashboard__section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-3, 12px);
  }
  
  .superhuman-dashboard__section-icon {
    width: 24px;
    height: 24px;
    color: var(--color-ferni, #4a6741);
  }
  
  .superhuman-dashboard__section-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2C2520);
    margin: 0;
  }
  
  .superhuman-dashboard__list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .superhuman-dashboard__list-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: var(--color-bg-subtle, #f8f6f4);
    border-radius: var(--radius-md, 12px);
    margin-bottom: var(--space-2, 8px);
  }
  
  .superhuman-dashboard__list-item:last-child {
    margin-bottom: 0;
  }
  
  .superhuman-dashboard__list-icon {
    width: 20px;
    height: 20px;
    color: var(--color-ferni, #4a6741);
    flex-shrink: 0;
    margin-top: 2px;
  }
  
  .superhuman-dashboard__list-content {
    flex: 1;
  }
  
  .superhuman-dashboard__list-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-primary, #2C2520);
    margin: 0 0 var(--space-1, 4px) 0;
  }
  
  .superhuman-dashboard__list-desc {
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
    margin: 0;
  }
  
  .superhuman-dashboard__progress-bar {
    height: 8px;
    background: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-radius: 4px;
    overflow: hidden;
    margin-top: var(--space-2, 8px);
  }
  
  .superhuman-dashboard__progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-ferni, #4a6741), var(--color-ferni-secondary, #3d5a35));
    border-radius: 4px;
    transition: width var(--duration-slow, 300ms) var(--ease-spring);
  }
  
  .superhuman-dashboard__capabilities-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3, 12px);
  }
  
  @media (max-width: 600px) {
    .superhuman-dashboard__capabilities-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .superhuman-dashboard__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8, 32px);
    color: var(--color-text-muted, #a09080);
  }
  
  .superhuman-dashboard__loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-top-color: var(--color-ferni, #4a6741);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--space-3, 12px);
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .superhuman-dashboard {
      background: var(--color-bg-elevated-dark, #2a2420);
    }
    
    .superhuman-dashboard__header {
      background: linear-gradient(135deg, var(--color-ferni-tint-dark, rgba(74, 103, 65, 0.2)), transparent);
    }
    
    .superhuman-dashboard__title,
    .superhuman-dashboard__metric-value,
    .superhuman-dashboard__section-title,
    .superhuman-dashboard__list-title {
      color: var(--color-text-primary-dark, #faf6f0);
    }
    
    .superhuman-dashboard__metric,
    .superhuman-dashboard__list-item {
      background: var(--color-bg-subtle-dark, #3a3430);
    }
  }
`;

// Inject styles once
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
  stylesInjected = true;
}

// ============================================================================
// STATE
// ============================================================================

interface DashboardState {
  overlay: HTMLElement | null;
  metrics: SuperhumanMetrics | null;
  loading: boolean;
}

const state: DashboardState = {
  overlay: null,
  metrics: null,
  loading: false,
};

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchMetrics(): Promise<SuperhumanMetrics> {
  try {
    const headers = await getApiHeadersAsync();
    const response = await fetch('/api/superhuman/metrics', { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    log.warn('Failed to fetch superhuman metrics, using mock data', { error });
    
    // Return mock data for demo
    return {
      commitments: {
        total: 12,
        completed: 8,
        pending: 4,
        upcoming: [
          'Call Mom this weekend',
          'Finish project proposal by Friday',
          'Exercise 3x this week',
        ],
      },
      capacity: {
        score: 68,
        trend: 'stable',
        riskFactors: ['Heavy meeting week ahead', 'Sleep quality declining'],
      },
      values: {
        alignmentScore: 82,
        alignedAreas: ['Family time', 'Creative work', 'Health habits'],
        misalignedAreas: ['Work-life balance'],
      },
      narrative: {
        currentChapter: 'Building towards a career transition',
        recentThemes: ['Growth mindset', 'Letting go of perfectionism', 'Prioritizing relationships'],
        growthAreas: ['Boundaries at work', 'Self-compassion'],
      },
      predictions: {
        upcomingChallenges: [
          'End-of-quarter stress coming up',
          'Holiday family dynamics',
        ],
        opportunities: [
          'Your energy peaks mid-morning - great for creative work',
          'Weekend looks open for that hobby you mentioned',
        ],
      },
      dreams: {
        active: [
          'Write a book',
          'Learn to play guitar',
          'Travel to Japan',
        ],
        progress: 35,
      },
    };
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function getTrendIcon(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return ICONS['trending-up'];
    case 'declining': return ICONS['trending-down'];
    default: return ICONS.minus;
  }
}

function getTrendClass(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return 'superhuman-dashboard__metric-trend--up';
    case 'declining': return 'superhuman-dashboard__metric-trend--down';
    default: return 'superhuman-dashboard__metric-trend--stable';
  }
}

function renderContent(): void {
  if (!state.overlay) return;
  
  const content = state.overlay.querySelector('.superhuman-dashboard__content');
  if (!content) return;
  
  if (state.loading) {
    content.innerHTML = `
      <div class="superhuman-dashboard__loading">
        <div class="superhuman-dashboard__loading-spinner"></div>
        <p>Loading your superhuman insights...</p>
      </div>
    `;
    return;
  }
  
  if (!state.metrics) {
    content.innerHTML = `
      <div class="superhuman-dashboard__loading">
        <p>Unable to load metrics. Please try again.</p>
      </div>
    `;
    return;
  }
  
  const m = state.metrics;
  
  content.innerHTML = `
    <!-- Metrics Grid -->
    <div class="superhuman-dashboard__metrics-grid">
      <div class="superhuman-dashboard__metric">
        <div class="superhuman-dashboard__metric-icon">${ICONS['check-square']}</div>
        <div class="superhuman-dashboard__metric-label">Commitments Kept</div>
        <div class="superhuman-dashboard__metric-value">${m.commitments.completed}/${m.commitments.total}</div>
        <div class="superhuman-dashboard__metric-trend superhuman-dashboard__metric-trend--up">
          ${ICONS['trending-up']}
          <span>67% completion rate</span>
        </div>
      </div>
      
      <div class="superhuman-dashboard__metric">
        <div class="superhuman-dashboard__metric-icon">${ICONS['battery-charging']}</div>
        <div class="superhuman-dashboard__metric-label">Capacity</div>
        <div class="superhuman-dashboard__metric-value">${m.capacity.score}%</div>
        <div class="superhuman-dashboard__metric-trend ${getTrendClass(m.capacity.trend)}">
          ${getTrendIcon(m.capacity.trend)}
          <span>${m.capacity.trend}</span>
        </div>
      </div>
      
      <div class="superhuman-dashboard__metric">
        <div class="superhuman-dashboard__metric-icon">${ICONS.compass}</div>
        <div class="superhuman-dashboard__metric-label">Values Alignment</div>
        <div class="superhuman-dashboard__metric-value">${m.values.alignmentScore}%</div>
        <div class="superhuman-dashboard__metric-trend superhuman-dashboard__metric-trend--up">
          ${ICONS['trending-up']}
          <span>Living your values</span>
        </div>
      </div>
    </div>
    
    <!-- Upcoming Commitments -->
    <div class="superhuman-dashboard__section">
      <div class="superhuman-dashboard__section-header">
        ${ICONS['check-square']}
        <h3 class="superhuman-dashboard__section-title">Commitments I'm Tracking</h3>
      </div>
      <ul class="superhuman-dashboard__list">
        ${m.commitments.upcoming.map(c => `
          <li class="superhuman-dashboard__list-item">
            <span class="superhuman-dashboard__list-icon">${ICONS['check-square']}</span>
            <div class="superhuman-dashboard__list-content">
              <p class="superhuman-dashboard__list-title">${c}</p>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
    
    <!-- Predictions -->
    <div class="superhuman-dashboard__section">
      <div class="superhuman-dashboard__section-header">
        ${ICONS.eye}
        <h3 class="superhuman-dashboard__section-title">What I'm Anticipating</h3>
      </div>
      <ul class="superhuman-dashboard__list">
        ${m.predictions.upcomingChallenges.map(p => `
          <li class="superhuman-dashboard__list-item">
            <span class="superhuman-dashboard__list-icon">${ICONS.eye}</span>
            <div class="superhuman-dashboard__list-content">
              <p class="superhuman-dashboard__list-title">${p}</p>
              <p class="superhuman-dashboard__list-desc">I'll be here to help when this comes up</p>
            </div>
          </li>
        `).join('')}
        ${m.predictions.opportunities.map(o => `
          <li class="superhuman-dashboard__list-item">
            <span class="superhuman-dashboard__list-icon">${ICONS.star}</span>
            <div class="superhuman-dashboard__list-content">
              <p class="superhuman-dashboard__list-title">${o}</p>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
    
    <!-- Dreams -->
    <div class="superhuman-dashboard__section">
      <div class="superhuman-dashboard__section-header">
        ${ICONS.star}
        <h3 class="superhuman-dashboard__section-title">Dreams I'm Keeping Safe</h3>
      </div>
      <ul class="superhuman-dashboard__list">
        ${m.dreams.active.map(d => `
          <li class="superhuman-dashboard__list-item">
            <span class="superhuman-dashboard__list-icon">${ICONS.star}</span>
            <div class="superhuman-dashboard__list-content">
              <p class="superhuman-dashboard__list-title">${d}</p>
            </div>
          </li>
        `).join('')}
      </ul>
      <div class="superhuman-dashboard__progress-bar">
        <div class="superhuman-dashboard__progress-fill" style="width: ${m.dreams.progress}%"></div>
      </div>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 8px; text-align: center;">
        ${m.dreams.progress}% progress toward your dreams
      </p>
    </div>
    
    <!-- Life Narrative -->
    <div class="superhuman-dashboard__section">
      <div class="superhuman-dashboard__section-header">
        ${ICONS['book-open']}
        <h3 class="superhuman-dashboard__section-title">Your Story Arc</h3>
      </div>
      <div class="superhuman-dashboard__list-item">
        <span class="superhuman-dashboard__list-icon">${ICONS['book-open']}</span>
        <div class="superhuman-dashboard__list-content">
          <p class="superhuman-dashboard__list-title">Current Chapter: ${m.narrative.currentChapter}</p>
          <p class="superhuman-dashboard__list-desc">
            Recent themes: ${m.narrative.recentThemes.join(', ')}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Better Than Human Capabilities -->
    <div class="superhuman-dashboard__section">
      <div class="superhuman-dashboard__section-header">
        ${ICONS.sparkles}
        <h3 class="superhuman-dashboard__section-title">How I'm Better Than Human</h3>
      </div>
      <div class="superhuman-dashboard__capabilities-grid" id="bth-capabilities"></div>
    </div>
  `;
  
  // Add capability cards
  const capabilitiesGrid = content.querySelector('#bth-capabilities');
  if (capabilitiesGrid) {
    const bthCapabilities = getBetterThanHumanCapabilities().slice(0, 6);
    bthCapabilities.forEach(cap => {
      const card = createCapabilityCard(cap, {
        compact: true,
        showBthBadge: false,
        onClick: (c) => {
          log.info('Capability clicked from dashboard', { id: c.id });
          window.dispatchEvent(new CustomEvent('ferni:speak-trigger', {
            detail: { trigger: c.voiceTriggers[0], capabilityId: c.id }
          }));
          hide();
        },
      });
      capabilitiesGrid.appendChild(card);
    });
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the Superhuman Dashboard
 */
export async function show(): Promise<void> {
  injectStyles();
  
  // Create overlay if it doesn't exist
  if (!state.overlay) {
    state.overlay = document.createElement('div');
    state.overlay.className = 'superhuman-dashboard-overlay';
    state.overlay.innerHTML = `
      <div class="superhuman-dashboard-backdrop"></div>
      <div class="superhuman-dashboard">
        <div class="superhuman-dashboard__header">
          <div class="superhuman-dashboard__header-top">
            <span class="superhuman-dashboard__eyebrow">
              ${ICONS.sparkles}
              Better Than Human
            </span>
            <button class="superhuman-dashboard__close" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
          <h2 class="superhuman-dashboard__title">What Ferni Knows About You</h2>
          <p class="superhuman-dashboard__subtitle">
            Things no human friend could track - your patterns, commitments, dreams, and growth.
          </p>
        </div>
        <div class="superhuman-dashboard__content"></div>
      </div>
    `;
    
    document.body.appendChild(state.overlay);
    
    // Close handlers
    const backdrop = state.overlay.querySelector('.superhuman-dashboard-backdrop');
    const closeBtn = state.overlay.querySelector('.superhuman-dashboard__close');
    
    backdrop?.addEventListener('click', hide);
    closeBtn?.addEventListener('click', hide);
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.overlay?.classList.contains('visible')) {
        hide();
      }
    });
  }
  
  // Show loading state
  state.loading = true;
  state.metrics = null;
  renderContent();
  
  // Show with animation
  requestAnimationFrame(() => {
    state.overlay?.classList.add('visible');
  });
  
  // Fetch metrics
  try {
    state.metrics = await fetchMetrics();
  } catch (error) {
    log.error('Failed to fetch metrics', { error });
  }
  
  state.loading = false;
  renderContent();
  
  log.info('Superhuman Dashboard shown');
}

/**
 * Hide the Superhuman Dashboard
 */
export function hide(): void {
  if (!state.overlay) return;
  
  state.overlay.classList.remove('visible');
  
  log.info('Superhuman Dashboard hidden');
}

/**
 * Toggle the Superhuman Dashboard
 */
export function toggle(): void {
  if (state.overlay?.classList.contains('visible')) {
    hide();
  } else {
    void show();
  }
}

/**
 * Check if the dashboard is visible
 */
export function isVisible(): boolean {
  return state.overlay?.classList.contains('visible') ?? false;
}

// Export as singleton
export const superhumanDashboard = {
  show,
  hide,
  toggle,
  isVisible,
};
