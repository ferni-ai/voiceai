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

import { DURATION } from '../config/animation-constants.js';
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

interface DeepAnalysisInsight {
  observation: string;
  significance: string;
  confidence: number;
  evidence: string[];
  surfacingContext: 'proactive' | 'when_relevant' | 'crisis_only';
}

interface DeepAnalysisHypothesis {
  prediction: string;
  reasoning: string;
  probability: number;
  timeframe: 'immediate' | 'this_week' | 'this_month' | 'eventual';
  testableSignals: string[];
}

interface DeepAnalysisOutreach {
  message: string;
  timing: 'morning' | 'afternoon' | 'evening' | 'specific_trigger';
  rationale: string;
  priority: number;
}

interface DeepAnalysisResult {
  hasAnalysis: boolean;
  analysisId?: string;
  analysisTimestamp?: string;
  insights: DeepAnalysisInsight[];
  hypotheses: DeepAnalysisHypothesis[];
  outreachSuggestions: DeepAnalysisOutreach[];
  coachingGuidance: string[];
}

type TabId = 'insights' | 'loops' | 'commitments' | 'relationships' | 'patterns' | 'coaching' | 'awareness' | 'deepanalysis';

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentTab: TabId = 'insights';
let isLoading = false;

// Cache TTL - 2 minutes (data doesn't change rapidly)
const CACHE_TTL_MS = 2 * 60 * 1000;

// Cached data with timestamps
let cachedInsights: SemanticInsight[] = [];
let cachedInsightsTime = 0;

let cachedLoops: OpenLoop[] = [];
let cachedLoopsTime = 0;

let cachedCommitments: Commitment[] = [];
let cachedCommitmentsTime = 0;

let cachedRelationships: RelationshipSummary | null = null;
let cachedRelationshipsTime = 0;

let cachedTemporal: TemporalContext | null = null;
let cachedBehavioral: BehavioralContext | null = null;
let cachedPatternsTime = 0;

let cachedCoaching: CoachingContext | null = null;
let cachedCoachingTime = 0;

let cachedSelfAwareness: SelfAwarenessContext | null = null;
let cachedSelfAwarenessTime = 0;

let cachedDeepAnalysis: DeepAnalysisResult | null = null;
let cachedDeepAnalysisTime = 0;

/** Check if cache is still valid */
function isCacheValid(cacheTime: number): boolean {
  return Date.now() - cacheTime < CACHE_TTL_MS;
}

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
      background: rgba(44, 37, 32, 0.75);
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
    const response = await apiGet<{ insights: SemanticInsight[] }>(`/api/semantic-intelligence/insights?userId=${userId}`);
    return response.data?.insights || [];
  } catch (error) {
    log.debug({ error }, 'Failed to fetch insights');
    return [];
  }
}

async function fetchOpenLoops(): Promise<OpenLoop[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    const response = await apiGet<{ loops: OpenLoop[] }>(`/api/semantic-intelligence/open-loops?userId=${userId}`);
    return response.data?.loops || [];
  } catch (error) {
    log.debug({ error }, 'Failed to fetch open loops');
    return [];
  }
}

async function fetchCommitments(): Promise<{ pending: Commitment[]; remembered: Commitment[] }> {
  const userId = getUserId();
  if (!userId) return { pending: [], remembered: [] };

  try {
    const response = await apiGet<{ pending: Commitment[]; remembered: Commitment[] }>(`/api/semantic-intelligence/commitments?userId=${userId}`);
    return { pending: response.data?.pending || [], remembered: response.data?.remembered || [] };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch commitments');
    return { pending: [], remembered: [] };
  }
}

async function fetchRelationships(): Promise<RelationshipSummary | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet<{ totalPeople: number; summary?: { topSupporter?: string; energyDrainer?: string; mostMentioned?: string } }>(`/api/semantic-intelligence/relationships?userId=${userId}`);
    const data = response.data;
    return {
      totalPeople: data?.totalPeople || 0,
      topSupporter: data?.summary?.topSupporter,
      energyDrainer: data?.summary?.energyDrainer,
      mostMentioned: data?.summary?.mostMentioned,
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
    const response = await apiGet<TemporalContext>(`/api/semantic-intelligence/temporal?userId=${userId}`);
    return response.data || null;
  } catch (error) {
    log.debug({ error }, 'Failed to fetch temporal patterns');
    return null;
  }
}

async function fetchBehavioral(): Promise<BehavioralContext | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet<{ sabotagePatterns?: Array<{ pattern: string; frequency: number }>; emotionalBaseline?: { dominantEmotion: string; stability: number } }>(`/api/semantic-intelligence/behavioral?userId=${userId}`);
    const data = response.data;
    return {
      sabotagePatterns: data?.sabotagePatterns || [],
      emotionalBaseline: data?.emotionalBaseline || { dominantEmotion: 'neutral', stability: 0.5 },
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
    const response = await apiGet<{ learningStyle?: { primary?: string }; effectiveness?: { bestApproach?: string }; resistance?: { sensitiveTopics?: string[] } }>(`/api/semantic-intelligence/coaching?userId=${userId}`);
    const data = response.data;
    return {
      learningStyle: data?.learningStyle?.primary,
      bestApproach: data?.effectiveness?.bestApproach,
      resistanceTopics: data?.resistance?.sensitiveTopics || [],
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
    const response = await apiGet<{ blindSpots?: Array<{ area: string; evidence: string }>; valuesAlignment?: { misaligned?: Array<{ value: string; behavior: string }> } }>(`/api/semantic-intelligence/self-awareness?userId=${userId}`);
    const data = response.data;
    return {
      blindSpots: data?.blindSpots || [],
      valuesMisalignment: data?.valuesAlignment?.misaligned || [],
    };
  } catch (error) {
    log.debug({ error }, 'Failed to fetch self-awareness data');
    return null;
  }
}

async function fetchDeepAnalysis(): Promise<DeepAnalysisResult | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiGet<DeepAnalysisResult>(`/api/semantic-intelligence/deep-analysis?userId=${userId}`);
    return response.data || null;
  } catch (error) {
    log.debug({ error }, 'Failed to fetch deep analysis');
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

function renderDeepAnalysisTab(): string {
  if (isLoading) {
    return '<div class="semantic-loading">Gathering deep insights from our conversations...</div>';
  }

  if (!cachedDeepAnalysis || !cachedDeepAnalysis.hasAnalysis) {
    return '<div class="semantic-empty">Deep analysis hasn\'t run yet. This happens automatically as we have more conversations together.</div>';
  }

  const { insights, hypotheses, outreachSuggestions, coachingGuidance, analysisTimestamp } = cachedDeepAnalysis;
  let html = '';

  // Show when analysis was last run
  if (analysisTimestamp) {
    const analysisDate = new Date(analysisTimestamp);
    html += `<p style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: var(--space-lg);">Last analyzed: ${analysisDate.toLocaleDateString()} ${analysisDate.toLocaleTimeString()}</p>`;
  }

  // Semantic Insights section
  if (insights.length > 0) {
    html += '<div class="semantic-section-title">What I\'ve Noticed</div>';
    html += insights
      .slice(0, 5)
      .map(
        (insight) => `
      <div class="semantic-insight-card priority-${insight.confidence > 0.8 ? 'high' : insight.confidence > 0.6 ? 'medium' : 'low'}">
        <div class="semantic-insight-content">${insight.observation}</div>
        <div class="semantic-insight-meta">
          <span class="semantic-insight-source">${Math.round(insight.confidence * 100)}% confident</span>
          <span>Why: ${insight.significance}</span>
        </div>
        ${insight.evidence.length > 0 ? `<div style="margin-top: var(--space-xs); font-size: 0.75rem; color: var(--color-text-muted);">Evidence: ${insight.evidence.slice(0, 2).join('; ')}</div>` : ''}
      </div>
    `
      )
      .join('');
  }

  // Predictive Hypotheses section
  if (hypotheses.length > 0) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">What I Anticipate</div>';
    html += hypotheses
      .slice(0, 3)
      .map(
        (hyp) => `
      <div class="semantic-insight-card">
        <div class="semantic-insight-content">${hyp.prediction}</div>
        <div class="semantic-insight-meta">
          <span class="semantic-insight-source">${Math.round(hyp.probability * 100)}% likely</span>
          <span>Timeframe: ${hyp.timeframe.replace('_', ' ')}</span>
        </div>
        <div style="margin-top: var(--space-xs); font-size: 0.8125rem; color: var(--color-text-secondary);">${hyp.reasoning}</div>
        ${hyp.testableSignals.length > 0 ? `<div style="margin-top: var(--space-xs); font-size: 0.75rem; color: var(--color-text-muted);">Watch for: ${hyp.testableSignals.slice(0, 2).join(', ')}</div>` : ''}
      </div>
    `
      )
      .join('');
  }

  // Outreach Suggestions section
  if (outreachSuggestions.length > 0) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">Moments to Reach Out</div>';
    html += outreachSuggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3)
      .map(
        (sug) => `
      <div class="semantic-loop-card">
        <div class="semantic-loop-icon">📞</div>
        <div class="semantic-loop-content">
          <div class="semantic-loop-text">${sug.message}</div>
          <div class="semantic-loop-context">${sug.timing} • ${sug.rationale}</div>
        </div>
      </div>
    `
      )
      .join('');
  }

  // Coaching Guidance section
  if (coachingGuidance.length > 0) {
    html += '<div class="semantic-section-title" style="margin-top: var(--space-lg);">Coaching Approach</div>';
    html += '<div style="background: var(--color-bg-secondary); border-radius: var(--radius-lg); padding: var(--space-md);">';
    html += coachingGuidance
      .slice(0, 4)
      .map((guidance) => `<p style="margin: 0 0 var(--space-xs); font-size: 0.875rem; color: var(--color-text-secondary);">• ${guidance}</p>`)
      .join('');
    html += '</div>';
  }

  return html || '<div class="semantic-empty">Deep analysis is building up. Keep chatting!</div>';
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
    case 'deepanalysis':
      return renderDeepAnalysisTab();
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
  const now = Date.now();

  // Check if we have valid cached data - skip fetch if so
  let needsFetch = false;
  switch (tab) {
    case 'insights':
      needsFetch = cachedInsights.length === 0 || !isCacheValid(cachedInsightsTime);
      break;
    case 'loops':
      needsFetch = cachedLoops.length === 0 || !isCacheValid(cachedLoopsTime);
      break;
    case 'commitments':
      needsFetch = cachedCommitments.length === 0 || !isCacheValid(cachedCommitmentsTime);
      break;
    case 'relationships':
      needsFetch = !cachedRelationships || !isCacheValid(cachedRelationshipsTime);
      break;
    case 'patterns':
      needsFetch = (!cachedTemporal && !cachedBehavioral) || !isCacheValid(cachedPatternsTime);
      break;
    case 'coaching':
      needsFetch = !cachedCoaching || !isCacheValid(cachedCoachingTime);
      break;
    case 'awareness':
      needsFetch = !cachedSelfAwareness || !isCacheValid(cachedSelfAwarenessTime);
      break;
    case 'deepanalysis':
      needsFetch = !cachedDeepAnalysis || !isCacheValid(cachedDeepAnalysisTime);
      break;
  }

  // If cached, render immediately without showing loading state
  if (!needsFetch) {
    updateContent();
    return;
  }

  isLoading = true;
  updateContent();

  try {
    switch (tab) {
      case 'insights':
        cachedInsights = await fetchInsights();
        cachedInsightsTime = now;
        break;
      case 'loops':
        cachedLoops = await fetchOpenLoops();
        cachedLoopsTime = now;
        break;
      case 'commitments':
        const commitmentData = await fetchCommitments();
        cachedCommitments = [...commitmentData.pending, ...commitmentData.remembered];
        cachedCommitmentsTime = now;
        break;
      case 'relationships':
        cachedRelationships = await fetchRelationships();
        cachedRelationshipsTime = now;
        break;
      case 'patterns':
        [cachedTemporal, cachedBehavioral] = await Promise.all([fetchTemporal(), fetchBehavioral()]);
        cachedPatternsTime = now;
        break;
      case 'coaching':
        cachedCoaching = await fetchCoaching();
        cachedCoachingTime = now;
        break;
      case 'awareness':
        cachedSelfAwareness = await fetchSelfAwareness();
        cachedSelfAwarenessTime = now;
        break;
      case 'deepanalysis':
        cachedDeepAnalysis = await fetchDeepAnalysis();
        cachedDeepAnalysisTime = now;
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
        <button class="semantic-tab" data-tab="deepanalysis">Deep Analysis</button>
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

