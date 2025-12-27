/**
 * Semantic Intelligence Panel
 *
 * Displays "Better Than Human" v3.0-v3.7 insights:
 * - Proactive insights surfaced by Ferni
 * - Open loops (things worth following up on)
 * - Ferni's commitments and remembered things
 * - Relationship graph summary
 * - Temporal patterns
 * - Behavioral intelligence
 * - Coaching recommendations
 * - Self-awareness insights
 *
 * @module ui/semantic-intelligence-panel
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, getUserId } from '../utils/api.js';

const log = createLogger('SemanticIntelligencePanel');

// ============================================================================
// TYPES
// ============================================================================

interface SemanticInsight {
  id: string;
  insight: string;
  context: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: string;
}

interface OpenLoop {
  id: string;
  type: 'advice' | 'intention' | 'event' | 'question';
  content: string;
  context: string;
  created: string;
  status: string;
}

interface Commitment {
  id: string;
  type: 'remember' | 'check_back' | 'avoid' | 'follow_up';
  content: string;
  created: string;
  status: string;
}

interface RelationshipSummary {
  totalPeople: number;
  topSupporter?: string;
  energyDrainer?: string;
  mostMentioned?: string;
}

interface TemporalContext {
  bestTimeOfDay?: string;
  currentEnergy?: string;
  seasonalPattern?: string;
}

interface BehavioralContext {
  sabotagePatterns: Array<{ pattern: string; frequency: number }>;
  emotionalBaseline: { dominantEmotion: string; stability: number };
}

interface CoachingContext {
  learningStyle?: string;
  bestApproach?: string;
  resistanceTopics: string[];
}

interface SelfAwarenessContext {
  blindSpots: Array<{ area: string; evidence: string }>;
  valuesMisalignment: Array<{ value: string; behavior: string }>;
}

type TabId = 'insights' | 'loops' | 'commitments' | 'relationships' | 'patterns' | 'coaching' | 'awareness';

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentTab: TabId = 'insights';
let isLoading = false;

// Cached data
let cachedInsights: SemanticInsight[] = [];
let cachedLoops: OpenLoop[] = [];
let cachedCommitments: Commitment[] = [];
let cachedRelationships: RelationshipSummary | null = null;
let cachedTemporal: TemporalContext | null = null;
let cachedBehavioral: BehavioralContext | null = null;
let cachedCoaching: CoachingContext | null = null;
let cachedSelfAwareness: SelfAwarenessContext | null = null;

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('semantic-intelligence-styles')) return;

  const style = document.createElement('style');
  style.id = 'semantic-intelligence-styles';
  style.textContent = `
    .semantic-panel {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--backdrop-medium);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal-backdrop);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--duration-normal) var(--ease-out-expo);
    }

    .semantic-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .semantic-panel-card {
      background: var(--color-bg-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      width: min(90vw, 700px);
      max-height: 85vh;
      overflow: hidden;
      transform: scale(0.95);
      opacity: 0;
      transition: all var(--duration-slow) var(--ease-spring);
    }

    .semantic-panel.visible .semantic-panel-card {
      transform: scale(1);
      opacity: 1;
    }

    .semantic-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .semantic-panel-title {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .semantic-panel-title svg {
      width: 24px;
      height: 24px;
      color: var(--color-accent-primary);
    }

    .semantic-panel-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-xs);
      border-radius: var(--radius-full);
      color: var(--color-text-muted);
      transition: all var(--duration-fast);
    }

    .semantic-panel-close:hover,
    .semantic-panel-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }

    .semantic-panel-tabs {
      display: flex;
      padding: 0 var(--space-lg);
      border-bottom: 1px solid var(--color-border-subtle);
      overflow-x: auto;
      gap: var(--space-2xs);
    }

    .semantic-tab {
      background: none;
      border: none;
      padding: var(--space-sm) var(--space-md);
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--color-text-muted);
      cursor: pointer;
      position: relative;
      white-space: nowrap;
      transition: color var(--duration-fast);
    }

    .semantic-tab:hover,
    .semantic-tab:focus-visible {
      color: var(--color-text-primary);
    }

    .semantic-tab.active {
      color: var(--color-accent-primary);
    }

    .semantic-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--color-accent-primary);
      border-radius: 1px 1px 0 0;
    }

    .semantic-panel-content {
      padding: var(--space-lg);
      overflow-y: auto;
      max-height: calc(85vh - 180px);
    }

    .semantic-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
      padding: var(--space-2xl);
      color: var(--color-text-muted);
    }

    .semantic-empty {
      text-align: center;
      padding: var(--space-2xl);
      color: var(--color-text-muted);
    }

    .semantic-insight-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
      margin-bottom: var(--space-md);
      border-left: 3px solid var(--color-accent-primary);
    }

    .semantic-insight-card.priority-critical {
      border-left-color: var(--color-semantic-error);
    }

    .semantic-insight-card.priority-high {
      border-left-color: var(--color-semantic-warning);
    }

    .semantic-insight-content {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      line-height: 1.5;
      margin-bottom: var(--space-xs);
    }

    .semantic-insight-meta {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .semantic-insight-source {
      background: var(--color-bg-tertiary);
      padding: var(--space-2xs) var(--space-xs);
      border-radius: var(--radius-sm);
    }

    .semantic-loop-card,
    .semantic-commitment-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
      padding: var(--space-md);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-sm);
    }

    .semantic-loop-icon,
    .semantic-commitment-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: var(--color-bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .semantic-loop-content,
    .semantic-commitment-content {
      flex: 1;
    }

    .semantic-loop-text,
    .semantic-commitment-text {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      margin-bottom: var(--space-2xs);
    }

    .semantic-loop-context,
    .semantic-commitment-context {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }

    .semantic-stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .semantic-stat-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg);
      padding: var(--space-md);
      text-align: center;
    }

    .semantic-stat-value {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-accent-primary);
    }

    .semantic-stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-2xs);
    }

    .semantic-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-md);
    }

    @media (prefers-reduced-motion: reduce) {
      .semantic-panel,
      .semantic-panel-card {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchInsights(): Promise<SemanticInsight[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    const response = await apiGet(`/api/semantic-intelligence/insights?userId=${userId}`);
    return response?.insights || [];
  } catch (error) {
    log.debug({ error }, 'Failed to fetch insights');
    return [];
  }
}

async function fetchOpenLoops(): Promise<OpenLoop[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    const response = await apiGet(`/api/semantic-intelligence/open-loops?userId=${userId}`);
    return response?.loops || [];
  } catch (error) {
    log.debug({ error }, 'Failed to fetch open loops');
    return [];
  }
}

async function fetchCommitments(): Promise<{ pending: Commitment[]; remembered: Commitment[] }> {
  const userId = getUserId();
  if (!userId) return { pending: [], remembered: [] };

  try {
    const response = await apiGet(`/api/semantic-intelligence/commitments?userId=${userId}`);
    return { pending: response?.pending || [], remembered: response?.remembered || [] };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch commitments');
    return { pending: [], remembered: [] };
  }
}

async function fetchRelationships(): Promise<RelationshipSummary | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet(`/api/semantic-intelligence/relationships?userId=${userId}`);
    return {
      totalPeople: response?.totalPeople || 0,
      topSupporter: response?.summary?.topSupporter,
      energyDrainer: response?.summary?.energyDrainer,
      mostMentioned: response?.summary?.mostMentioned,
    };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch relationships');
    return null;
  }
}

async function fetchTemporal(): Promise<TemporalContext | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet(`/api/semantic-intelligence/temporal?userId=${userId}`);
    return response || null;
  } catch (error) {
    log.debug({ error }, 'Failed to fetch temporal patterns');
    return null;
  }
}

async function fetchBehavioral(): Promise<BehavioralContext | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet(`/api/semantic-intelligence/behavioral?userId=${userId}`);
    return {
      sabotagePatterns: response?.sabotagePatterns || [],
      emotionalBaseline: response?.emotionalBaseline || { dominantEmotion: 'neutral', stability: 0.5 },
    };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch behavioral intelligence');
    return null;
  }
}

async function fetchCoaching(): Promise<CoachingContext | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet(`/api/semantic-intelligence/coaching?userId=${userId}`);
    return {
      learningStyle: response?.learningStyle?.primary,
      bestApproach: response?.effectiveness?.bestApproach,
      resistanceTopics: response?.resistance?.sensitiveTopics || [],
    };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch coaching intelligence');
    return null;
  }
}

async function fetchSelfAwareness(): Promise<SelfAwarenessContext | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet(`/api/semantic-intelligence/self-awareness?userId=${userId}`);
    return {
      blindSpots: response?.blindSpots || [],
      valuesMisalignment: response?.valuesAlignment?.misaligned || [],
    };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch self-awareness data');
    return null;
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderInsightsTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Gathering what I\'ve noticed...</div>';
  }

  if (cachedInsights.length === 0) {
    return '<div class="semantic-empty">No proactive insights yet. Keep chatting with Ferni!</div>';
  }

  return cachedInsights
    .map(
      (insight) => `
    <div class="semantic-insight-card priority-${insight.priority}">
      <div class="semantic-insight-content">${insight.insight}</div>
      <div class="semantic-insight-meta">
        <span class="semantic-insight-source">${insight.source}</span>
        <span>${insight.priority} priority</span>
      </div>
    </div>
  `
    )
    .join('');
}

function renderLoopsTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Checking what we left open...</div>';
  }

  if (cachedLoops.length === 0) {
    return '<div class="semantic-empty">Nothing left hanging. We\'re good!</div>';
  }

  const typeIcons: Record<string, string> = {
    advice: '💡',
    intention: '🎯',
    event: '📅',
    question: '❓',
  };

  return cachedLoops
    .map(
      (loop) => `
    <div class="semantic-loop-card">
      <div class="semantic-loop-icon">${typeIcons[loop.type] || '📝'}</div>
      <div class="semantic-loop-content">
        <div class="semantic-loop-text">${loop.content}</div>
        <div class="semantic-loop-context">${loop.context || loop.type}</div>
      </div>
    </div>
  `
    )
    .join('');
}

function renderCommitmentsTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Checking what I\'m remembering for you...</div>';
  }

  const all = [...(cachedCommitments as unknown as Commitment[])];
  if (all.length === 0) {
    return '<div class="semantic-empty">No commitments tracked yet.</div>';
  }

  const typeIcons: Record<string, string> = {
    remember: '🧠',
    check_back: '📞',
    avoid: '🚫',
    follow_up: '🔄',
  };

  return all
    .map(
      (c) => `
    <div class="semantic-commitment-card">
      <div class="semantic-commitment-icon">${typeIcons[c.type] || '📋'}</div>
      <div class="semantic-commitment-content">
        <div class="semantic-commitment-text">${c.content}</div>
        <div class="semantic-commitment-context">${c.type.replace('_', ' ')}</div>
      </div>
    </div>
  `
    )
    .join('');
}

function renderRelationshipsTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Looking at your world...</div>';
  }

  if (!cachedRelationships) {
    return '<div class="semantic-empty">No relationship data yet.</div>';
  }

  const r = cachedRelationships;
  return `
    <div class="semantic-stat-grid">
      <div class="semantic-stat-card">
        <div class="semantic-stat-value">${r.totalPeople}</div>
        <div class="semantic-stat-label">People Tracked</div>
      </div>
      ${r.topSupporter ? `
      <div class="semantic-stat-card">
        <div class="semantic-stat-value">${r.topSupporter}</div>
        <div class="semantic-stat-label">Top Supporter</div>
      </div>
      ` : ''}
      ${r.mostMentioned ? `
      <div class="semantic-stat-card">
        <div class="semantic-stat-value">${r.mostMentioned}</div>
        <div class="semantic-stat-label">Most Mentioned</div>
      </div>
      ` : ''}
    </div>
    <p style="color: var(--color-text-muted); font-size: 0.875rem;">
      Ferni tracks your relationships to understand who brings you energy and who might drain it.
    </p>
  `;
}

function renderPatternsTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Connecting the dots...</div>';
  }

  if (!cachedTemporal && !cachedBehavioral) {
    return '<div class="semantic-empty">No pattern data yet. Keep chatting!</div>';
  }

  let html = '';

  if (cachedTemporal) {
    html += '<div class="semantic-section-title">Temporal Patterns</div>';
    html += '<div class="semantic-stat-grid">';
    if (cachedTemporal.bestTimeOfDay) {
      html += `
        <div class="semantic-stat-card">
          <div class="semantic-stat-value">${cachedTemporal.bestTimeOfDay}</div>
          <div class="semantic-stat-label">Best Time of Day</div>
        </div>
      `;
    }
    if (cachedTemporal.currentEnergy) {
      html += `
        <div class="semantic-stat-card">
          <div class="semantic-stat-value">${cachedTemporal.currentEnergy}</div>
          <div class="semantic-stat-label">Current Energy</div>
        </div>
      `;
    }
    html += '</div>';
  }

  if (cachedBehavioral) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">Behavioral Intelligence</div>';
    if (cachedBehavioral.emotionalBaseline) {
      html += `
        <div class="semantic-stat-grid">
          <div class="semantic-stat-card">
            <div class="semantic-stat-value">${cachedBehavioral.emotionalBaseline.dominantEmotion}</div>
            <div class="semantic-stat-label">Dominant Emotion</div>
          </div>
          <div class="semantic-stat-card">
            <div class="semantic-stat-value">${Math.round(cachedBehavioral.emotionalBaseline.stability * 100)}%</div>
            <div class="semantic-stat-label">Emotional Stability</div>
          </div>
        </div>
      `;
    }
  }

  return html || '<div class="semantic-empty">No pattern data yet.</div>';
}

function renderCoachingTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Thinking about your growth...</div>';
  }

  if (!cachedCoaching) {
    return '<div class="semantic-empty">No coaching data yet.</div>';
  }

  let html = '<div class="semantic-stat-grid">';

  if (cachedCoaching.learningStyle) {
    html += `
      <div class="semantic-stat-card">
        <div class="semantic-stat-value">${cachedCoaching.learningStyle}</div>
        <div class="semantic-stat-label">Learning Style</div>
      </div>
    `;
  }

  if (cachedCoaching.bestApproach) {
    html += `
      <div class="semantic-stat-card">
        <div class="semantic-stat-value">${cachedCoaching.bestApproach}</div>
        <div class="semantic-stat-label">Best Approach</div>
      </div>
    `;
  }

  html += '</div>';

  if (cachedCoaching.resistanceTopics.length > 0) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">Sensitive Topics</div>';
    html += '<p style="color: var(--color-text-muted); font-size: 0.875rem;">';
    html += 'Ferni approaches these topics carefully: ';
    html += cachedCoaching.resistanceTopics.join(', ');
    html += '</p>';
  }

  return html;
}

function renderAwarenessTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Reflecting on your journey...</div>';
  }

  if (!cachedSelfAwareness) {
    return '<div class="semantic-empty">No self-awareness insights yet.</div>';
  }

  let html = '';

  if (cachedSelfAwareness.blindSpots.length > 0) {
    html += '<div class="semantic-section-title">Blind Spots</div>';
    html += cachedSelfAwareness.blindSpots
      .slice(0, 3)
      .map(
        (bs) => `
      <div class="semantic-insight-card">
        <div class="semantic-insight-content">${bs.area}</div>
        <div class="semantic-insight-meta">${bs.evidence}</div>
      </div>
    `
      )
      .join('');
  }

  if (cachedSelfAwareness.valuesMisalignment.length > 0) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">Values Alignment</div>';
    html += cachedSelfAwareness.valuesMisalignment
      .slice(0, 3)
      .map(
        (v) => `
      <div class="semantic-insight-card">
        <div class="semantic-insight-content">Value: ${v.value}</div>
        <div class="semantic-insight-meta">Action: ${v.behavior}</div>
      </div>
    `
      )
      .join('');
  }

  return html || '<div class="semantic-empty">I\'m still learning about you. Keep talking!</div>';
}

function renderContent(): string {
  switch (currentTab) {
    case 'insights':
      return renderInsightsTab();
    case 'loops':
      return renderLoopsTab();
    case 'commitments':
      return renderCommitmentsTab();
    case 'relationships':
      return renderRelationshipsTab();
    case 'patterns':
      return renderPatternsTab();
    case 'coaching':
      return renderCoachingTab();
    case 'awareness':
      return renderAwarenessTab();
    default:
      return '';
  }
}

function updateContent(): void {
  const contentEl = container?.querySelector('.semantic-panel-content');
  if (contentEl) {
    contentEl.innerHTML = renderContent();
  }
}

function updateTabs(): void {
  container?.querySelectorAll('.semantic-tab').forEach((tab) => {
    const tabId = tab.getAttribute('data-tab') as TabId;
    tab.classList.toggle('active', tabId === currentTab);
  });
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadTabData(tab: TabId): Promise<void> {
  isLoading = true;
  updateContent();

  try {
    switch (tab) {
      case 'insights':
        cachedInsights = await fetchInsights();
        break;
      case 'loops':
        cachedLoops = await fetchOpenLoops();
        break;
      case 'commitments':
        const commitmentData = await fetchCommitments();
        cachedCommitments = [...commitmentData.pending, ...commitmentData.remembered];
        break;
      case 'relationships':
        cachedRelationships = await fetchRelationships();
        break;
      case 'patterns':
        [cachedTemporal, cachedBehavioral] = await Promise.all([fetchTemporal(), fetchBehavioral()]);
        break;
      case 'coaching':
        cachedCoaching = await fetchCoaching();
        break;
      case 'awareness':
        cachedSelfAwareness = await fetchSelfAwareness();
        break;
    }
  } catch (error) {
    log.debug({ error, tab }, 'Failed to load tab data');
  }

  isLoading = false;
  updateContent();
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function showSemanticIntelligencePanel(): void {
  injectStyles();

  // Remove existing
  const existing = document.querySelector('.semantic-panel');
  if (existing) {
    existing.remove();
  }

  // Create container
  container = document.createElement('div');
  container.className = 'semantic-panel';
  container.innerHTML = `
    <div class="semantic-panel-card">
      <div class="semantic-panel-header">
        <div class="semantic-panel-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
          </svg>
          What I've Noticed
        </div>
        <button class="semantic-panel-close" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="semantic-panel-tabs">
        <button class="semantic-tab active" data-tab="insights">Insights</button>
        <button class="semantic-tab" data-tab="loops">Following Up</button>
        <button class="semantic-tab" data-tab="commitments">Remembering</button>
        <button class="semantic-tab" data-tab="relationships">Your People</button>
        <button class="semantic-tab" data-tab="patterns">Your Patterns</button>
        <button class="semantic-tab" data-tab="coaching">Your Growth</button>
        <button class="semantic-tab" data-tab="awareness">Your Journey</button>
      </div>
      <div class="semantic-panel-content">
        <div class="semantic-loading">Just a moment...</div>
      </div>
    </div>
  `;

  // Event listeners
  container.querySelector('.semantic-panel-close')?.addEventListener('click', hideSemanticIntelligencePanel);
  container.addEventListener('click', (e) => {
    if (e.target === container) {
      hideSemanticIntelligencePanel();
    }
  });

  container.querySelectorAll('.semantic-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab') as TabId;
      currentTab = tabId;
      updateTabs();
      loadTabData(tabId);
    });
  });

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideSemanticIntelligencePanel();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('visible');
    loadTabData(currentTab);
  });

  log.debug('Semantic intelligence panel shown');
}

export function hideSemanticIntelligencePanel(): void {
  if (!container) return;

  container.classList.remove('visible');

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.SLOW);

  log.debug('Semantic intelligence panel hidden');
}

export function isSemanticIntelligencePanelVisible(): boolean {
  return container?.classList.contains('visible') ?? false;
}

