/**
 * Semantic Intelligence Panel - "What I've Noticed"
 *
 * A rich, story-driven visualization of Ferni's superhuman insights.
 * This is the showcase of the "Better Than Human" promise - showing users
 * what Ferni understands about them that no human friend could.
 *
 * DESIGN PHILOSOPHY:
 * - Story over Stats: Every number tells a narrative
 * - Gentle over Gamified: Celebrate without addiction mechanics
 * - Personal over Generic: Your patterns, not averages
 * - Honest over Optimistic: Show uncertainty bands
 * - Actionable over Informative: Every insight suggests a next step
 *
 * TABS:
 * 1. Insights - Proactive observations with persona attribution
 * 2. Deep Analysis - Pattern mining and predictive insights
 * 3. Following Up - Open loops Ferni is tracking
 * 4. Remembering - What Ferni holds in memory for you
 * 5. Your People - Relationship network summary
 * 6. Your Patterns - Temporal and behavioral patterns
 * 7. Your Growth - Coaching insights and learning style
 * 8. Your Journey - Self-awareness and values alignment
 *
 * @module ui/semantic-intelligence-panel
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, getUserId } from '../utils/api.js';
import { t } from '../i18n/index.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';

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
// ICONS - Lucide-style SVG icons (NO emojis!)
// ============================================================================

const ICONS = {
  // Navigation & UI
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
  
  // Insight types
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.44 2.5 2.5 0 0 0-2.96 3.08 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 19.5Z"/><path d="M12 4.5a2.5 2.5 0 0 1 4.96-.44 2.5 2.5 0 0 1 2.96 3.08 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5Z"/><path d="M12 4.5v15"/></svg>',
  lightbulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  helpCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  
  // Loop types
  messageCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  
  // Commitment types
  heartHandshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>',
  shieldCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
  bellRing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/></svg>',
  
  // People & relationships
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  userCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16,11 18,13 22,9"/></svg>',
  
  // Patterns & growth
  trendingUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  battery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" x2="22" y1="11" y2="13"/></svg>',
  
  // Growth & coaching
  sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  
  // Personas (for attribution)
  ferni: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  peter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  maya: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  jordan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>',
  alex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  nayan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

// Persona color mapping
const PERSONA_COLORS: Record<string, string> = {
  ferni: 'var(--persona-ferni, #4a6741)',
  peter: 'var(--persona-peter, #3a6b73)',
  maya: 'var(--persona-maya, #a67a6a)',
  jordan: 'var(--persona-jordan, #c4856a)',
  alex: 'var(--persona-alex, #5a6b8a)',
  nayan: 'var(--persona-nayan, #b8956a)',
};

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
    /* ========================================================================
       SEMANTIC INTELLIGENCE PANEL - "What I've Noticed"
       Rich, story-driven visualization of Ferni's superhuman insights
    ======================================================================== */

    .semantic-panel {
      position: fixed;
      inset: 0;
      background: var(--color-utility-backdrop, rgba(44, 37, 32, 0.75));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal-backdrop, 2000);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--duration-normal, 200ms) var(--ease-out-expo);
    }

    .semantic-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .semantic-panel-card {
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      width: min(92vw, 680px);
      max-height: 88vh;
      overflow: hidden;
      transform: scale(0.95) translateY(10px);
      opacity: 0;
      transition: all var(--duration-slow, 300ms) var(--ease-spring);
    }

    .semantic-panel.visible .semantic-panel-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }

    /* Header */
    .semantic-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5, 20px) var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-bg-elevated, #FFFDFB);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .semantic-panel-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.375rem;
      font-weight: 600;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .semantic-panel-title svg {
      width: 24px;
      height: 24px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-panel-close {
      width: 36px;
      height: 36px;
      background: var(--color-bg-secondary);
      border: none;
      cursor: pointer;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--duration-fast, 100ms);
    }

    .semantic-panel-close svg {
      width: 18px;
      height: 18px;
    }

    .semantic-panel-close:hover,
    .semantic-panel-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }

    .semantic-panel-close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    /* Tabs */
    .semantic-panel-tabs {
      display: flex;
      padding: 0 var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle);
      overflow-x: auto;
      gap: var(--space-1, 4px);
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .semantic-panel-tabs::-webkit-scrollbar {
      display: none;
    }

    .semantic-tab {
      background: none;
      border: none;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      font-family: var(--font-body);
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text-muted);
      cursor: pointer;
      position: relative;
      white-space: nowrap;
      transition: color var(--duration-fast, 100ms);
    }

    .semantic-tab:hover,
    .semantic-tab:focus-visible {
      color: var(--color-text-primary);
    }

    .semantic-tab:focus-visible {
      outline: none;
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }

    .semantic-tab.active {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    .semantic-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: var(--space-2, 8px);
      right: var(--space-2, 8px);
      height: 2px;
      background: var(--persona-primary, #4a6741);
      border-radius: 1px 1px 0 0;
    }

    /* Content Area */
    .semantic-panel-content {
      padding: var(--space-5, 20px) var(--space-6, 24px);
      overflow-y: auto;
      max-height: calc(88vh - 140px);
    }

    /* Loading State */
    .semantic-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-4, 16px);
      padding: var(--space-12, 48px) var(--space-6, 24px);
    }

    .semantic-loading__spinner {
      width: 40px;
      height: 40px;
    }

    .semantic-loading__spinner svg {
      width: 100%;
      height: 100%;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-loading__text {
      font-size: 0.9375rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    /* Hero Sections (per tab) */
    [class*="-hero"] {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
      padding-bottom: var(--space-5, 20px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    [class*="-hero__icon"] {
      width: 48px;
      height: 48px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    [class*="-hero__icon"] svg {
      width: 24px;
      height: 24px;
      color: var(--persona-primary, #4a6741);
    }

    [class*="-hero__content"] {
      flex: 1;
    }

    [class*="-hero__title"] {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    [class*="-hero__subtitle"] {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    /* ========================================================================
       INSIGHT CARDS (Insights Tab)
    ======================================================================== */

    .semantic-insights-feed {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-insight-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      border-left: 3px solid var(--persona-primary, #4a6741);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    @keyframes semanticCardIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .semantic-insight-card.priority-critical {
      border-left-color: var(--color-semantic-error);
      background: var(--color-semantic-errorTint, rgba(181, 69, 58, 0.08));
    }

    .semantic-insight-card.priority-high {
      border-left-color: var(--color-semantic-warning);
    }

    .semantic-insight-card__persona {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .semantic-insight-card__persona-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-insight-card__persona-icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-color, var(--persona-primary));
    }

    .semantic-insight-card__persona-name {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--persona-color, var(--persona-primary));
    }

    .semantic-insight-card__body {
      position: relative;
    }

    .semantic-insight-card__priority {
      position: absolute;
      top: 0;
      right: 0;
    }

    .semantic-insight-card__priority-icon svg {
      width: 16px;
      height: 16px;
      color: var(--color-text-muted);
    }

    .semantic-insight-card__content {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      line-height: 1.6;
      margin: 0 0 var(--space-2, 8px);
      padding-right: var(--space-6, 24px);
    }

    .semantic-insight-card__context {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      font-style: italic;
      margin: 0;
    }

    /* ========================================================================
       LOOPS (Following Up Tab)
    ======================================================================== */

    .semantic-loops-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-loop-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-loop-card__header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .semantic-loop-card__icon {
      width: 28px;
      height: 28px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-loop-card__icon svg {
      width: 14px;
      height: 14px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-loop-card__type {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .semantic-loop-card__content {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      line-height: 1.5;
      margin: 0 0 var(--space-3, 12px);
    }

    .semantic-loop-card__footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .semantic-loop-card__context {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }

    .semantic-loop-card__date {
      font-size: 0.75rem;
      color: var(--color-text-dimmed);
    }

    /* ========================================================================
       COMMITMENTS (Remembering Tab)
    ======================================================================== */

    .semantic-commitments-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .semantic-commitment-stat {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      text-align: center;
      border-top: 3px solid var(--stat-color, var(--persona-primary));
    }

    .semantic-commitment-stat__icon {
      width: 28px;
      height: 28px;
      margin: 0 auto var(--space-2, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-commitment-stat__icon svg {
      width: 20px;
      height: 20px;
      color: var(--stat-color, var(--persona-primary));
    }

    .semantic-commitment-stat__value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
      display: block;
    }

    .semantic-commitment-stat__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .semantic-commitments-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .semantic-commitment-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-commitment-card__icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-commitment-card__icon svg {
      width: 16px;
      height: 16px;
      color: var(--commitment-color, var(--persona-primary));
    }

    .semantic-commitment-card__body {
      flex: 1;
    }

    .semantic-commitment-card__content {
      font-size: 0.875rem;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1, 4px);
    }

    .semantic-commitment-card__type {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--commitment-color, var(--color-text-muted));
    }

    /* ========================================================================
       RELATIONSHIPS (Your People Tab)
    ======================================================================== */

    .semantic-relationships-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .semantic-relationship-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-relationship-card--supporter {
      border-top: 3px solid var(--color-semantic-success);
    }

    .semantic-relationship-card--mentioned {
      border-top: 3px solid var(--persona-primary, #4a6741);
    }

    .semantic-relationship-card--drainer {
      border-top: 3px solid var(--color-semantic-warning);
    }

    .semantic-relationship-card__icon {
      width: 32px;
      height: 32px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-relationship-card__icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-relationship-card__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .semantic-relationship-card__name {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      display: block;
    }

    .semantic-relationship-card__insight {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }

    .semantic-relationships-note {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
      border-radius: var(--radius-lg, 12px);
    }

    .semantic-relationships-note__icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .semantic-relationships-note__icon svg {
      width: 100%;
      height: 100%;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-relationships-note__text {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    /* ========================================================================
       PATTERNS (Your Patterns Tab)
    ======================================================================== */

    .semantic-patterns-section {
      margin-bottom: var(--space-6, 24px);
    }

    .semantic-patterns-section__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.8125rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-4, 16px);
    }

    .semantic-patterns-section__icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-patterns-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-3, 12px);
    }

    .semantic-pattern-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      text-align: center;
    }

    .semantic-pattern-card__visual {
      width: 40px;
      height: 40px;
      margin: 0 auto var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-pattern-card__visual svg {
      width: 20px;
      height: 20px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-pattern-card__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-1, 4px);
    }

    .semantic-pattern-card__value {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .semantic-emotional-baseline {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      display: flex;
      gap: var(--space-4, 16px);
      flex-wrap: wrap;
    }

    .semantic-emotional-baseline__emotion,
    .semantic-emotional-baseline__stability {
      flex: 1;
      min-width: 120px;
    }

    .semantic-emotional-baseline__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-2, 8px);
    }

    .semantic-emotional-baseline__value {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary);
      text-transform: capitalize;
    }

    .semantic-emotional-baseline__bar {
      height: 8px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
      margin-bottom: var(--space-1, 4px);
    }

    .semantic-emotional-baseline__fill {
      height: 100%;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      transition: width var(--duration-slow, 300ms) var(--ease-spring);
    }

    .semantic-emotional-baseline__percent {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-sabotage-patterns {
      margin-top: var(--space-4, 16px);
    }

    .semantic-sabotage-patterns__title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-3, 12px);
      display: block;
    }

    .semantic-sabotage-pattern {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-2, 8px);
    }

    .semantic-sabotage-pattern__icon svg {
      width: 16px;
      height: 16px;
      color: var(--color-semantic-warning);
    }

    .semantic-sabotage-pattern__text {
      flex: 1;
      font-size: 0.875rem;
      color: var(--color-text-primary);
    }

    .semantic-sabotage-pattern__frequency {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-muted);
      background: var(--color-bg-tertiary);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-sm, 4px);
    }

    /* ========================================================================
       COACHING (Your Growth Tab)
    ======================================================================== */

    .semantic-coaching-profile {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .semantic-coaching-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
    }

    .semantic-coaching-card__icon {
      width: 36px;
      height: 36px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .semantic-coaching-card__icon svg {
      width: 18px;
      height: 18px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-coaching-card__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-1, 4px);
    }

    .semantic-coaching-card__value {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .semantic-coaching-boundaries {
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
    }

    .semantic-coaching-boundaries__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3, 12px);
    }

    .semantic-coaching-boundaries__icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-coaching-boundaries__list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .semantic-coaching-boundary {
      background: var(--color-bg-elevated, #FFFDFB);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border-radius: var(--radius-full, 9999px);
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }

    .semantic-coaching-boundaries__note {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin: 0;
      font-style: italic;
    }

    /* ========================================================================
       AWARENESS (Your Journey Tab)
    ======================================================================== */

    .semantic-awareness-section {
      margin-bottom: var(--space-6, 24px);
    }

    .semantic-awareness-section__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.8125rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-4, 16px);
    }

    .semantic-awareness-section__icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-awareness-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-awareness-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-awareness-card__area {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-awareness-card__evidence {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin: 0;
      font-style: italic;
    }

    .semantic-values-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-values-card {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-values-card__value,
    .semantic-values-card__behavior {
      flex: 1;
    }

    .semantic-values-card__label {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-1, 4px);
    }

    .semantic-values-card__text {
      font-size: 0.875rem;
      color: var(--color-text-primary);
    }

    .semantic-values-card__divider {
      flex-shrink: 0;
    }

    .semantic-values-card__arrow svg {
      width: 16px;
      height: 16px;
      color: var(--color-text-muted);
    }

    .semantic-awareness-note {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      font-style: italic;
      margin: var(--space-4, 16px) 0 0;
      text-align: center;
    }

    /* ========================================================================
       DEEP ANALYSIS Tab
    ======================================================================== */

    .semantic-deep-hero__timestamp {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-top: var(--space-2, 8px);
      display: block;
    }

    .semantic-deep-section {
      margin-bottom: var(--space-6, 24px);
    }

    .semantic-deep-section__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.8125rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-4, 16px);
    }

    .semantic-deep-section__icon svg {
      width: 16px;
      height: 16px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-deep-insights {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-deep-insight {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-deep-insight__confidence {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .semantic-deep-insight__confidence-bar {
      flex: 1;
      height: 4px;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      max-width: 100px;
    }

    .semantic-deep-insight__confidence-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-deep-insight__observation {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-deep-insight__significance {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-deep-insight__evidence {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }

    .semantic-deep-insight__evidence-item {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      background: var(--color-bg-tertiary);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-sm, 4px);
    }

    .semantic-deep-hypotheses {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-deep-hypothesis {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-deep-hypothesis__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-3, 12px);
    }

    .semantic-deep-hypothesis__probability {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-sm, 4px);
    }

    .semantic-deep-hypothesis__timeframe {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      text-transform: capitalize;
    }

    .semantic-deep-hypothesis__prediction {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-deep-hypothesis__reasoning {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3, 12px);
    }

    .semantic-deep-hypothesis__signals {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }

    .semantic-deep-hypothesis__signals-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .semantic-deep-hypothesis__signal {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      background: var(--color-bg-tertiary);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-sm, 4px);
    }

    .semantic-deep-outreach {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .semantic-deep-outreach-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
      border-left: 3px solid var(--persona-primary, #4a6741);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-deep-outreach-card__message {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-deep-outreach-card__meta {
      display: flex;
      gap: var(--space-3, 12px);
    }

    .semantic-deep-outreach-card__timing {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      text-transform: capitalize;
    }

    .semantic-deep-outreach-card__rationale {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .semantic-deep-guidance {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-4, 16px);
    }

    .semantic-deep-guidance-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-2, 8px);
    }

    .semantic-deep-guidance-item:last-child {
      margin-bottom: 0;
    }

    .semantic-deep-guidance-item__bullet svg {
      width: 14px;
      height: 14px;
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .semantic-deep-guidance-item__text {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
    }

    /* ========================================================================
       TEASER/EMPTY STATE
    ======================================================================== */

    .semantic-teaser {
      position: relative;
      padding: var(--space-4, 16px);
    }

    .semantic-teaser__badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full, 9999px);
      margin-bottom: var(--space-4, 16px);
    }

    .semantic-teaser__badge-icon svg {
      width: 12px;
      height: 12px;
    }

    .semantic-teaser__header {
      text-align: center;
      margin-bottom: var(--space-5, 20px);
    }

    .semantic-teaser__icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-4, 16px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-xl, 16px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .semantic-teaser__icon svg {
      width: 28px;
      height: 28px;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-teaser__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .semantic-teaser__description {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    .semantic-teaser__preview {
      position: relative;
      margin-bottom: var(--space-4, 16px);
    }

    .semantic-teaser__item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-2, 8px);
      opacity: 0;
      animation: semanticCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    .semantic-teaser__item-icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .semantic-teaser__item-icon svg {
      width: 100%;
      height: 100%;
      color: var(--persona-primary, #4a6741);
    }

    .semantic-teaser__item-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      font-style: italic;
    }

    .semantic-teaser__fade {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: linear-gradient(to top, var(--color-bg-elevated, #FFFDFB), transparent);
      pointer-events: none;
    }

    .semantic-teaser__unlock {
      text-align: center;
      padding: var(--space-4, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-4, 16px);
    }

    .semantic-teaser__unlock--soon {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border: 1px solid var(--persona-primary, #4a6741);
    }

    .semantic-teaser__unlock-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .semantic-teaser__unlock--soon .semantic-teaser__unlock-text {
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
    }

    .semantic-teaser__cta {
      text-align: center;
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      font-style: italic;
    }

    /* Show More */
    .semantic-show-more {
      text-align: center;
      margin-top: var(--space-4, 16px);
    }

    .semantic-show-more__text {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
    }

    /* ========================================================================
       RESPONSIVE & ACCESSIBILITY
    ======================================================================== */

    @media (max-width: 480px) {
      .semantic-panel-card {
        max-height: 92vh;
        border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
        margin-top: auto;
      }

      .semantic-panel-content {
        max-height: calc(92vh - 140px);
      }

      [class*="-hero"] {
        flex-direction: column;
        text-align: center;
      }

      .semantic-relationships-grid,
      .semantic-coaching-profile {
        grid-template-columns: 1fr;
      }

      .semantic-values-card {
        flex-direction: column;
        text-align: center;
      }

      .semantic-values-card__divider {
        transform: rotate(90deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .semantic-panel,
      .semantic-panel-card,
      .semantic-insight-card,
      .semantic-loop-card,
      .semantic-commitment-card,
      .semantic-awareness-card,
      .semantic-values-card,
      .semantic-deep-insight,
      .semantic-deep-hypothesis,
      .semantic-deep-outreach-card,
      .semantic-teaser__item {
        animation: none;
        opacity: 1;
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
    return renderLoadingState('Gathering what I\'ve noticed...');
  }

  if (cachedInsights.length === 0) {
    return renderEmptyTeaser('insights');
  }

  // Group insights by source persona for storytelling
  const bySource = cachedInsights.reduce((acc, insight) => {
    const source = insight.source.toLowerCase();
    if (!acc[source]) acc[source] = [];
    acc[source].push(insight);
    return acc;
  }, {} as Record<string, SemanticInsight[]>);

  return `
    <div class="semantic-insights-hero">
      <div class="semantic-insights-hero__icon">${ICONS.brain}</div>
      <div class="semantic-insights-hero__content">
        <h3 class="semantic-insights-hero__title">Patterns I'm noticing</h3>
        <p class="semantic-insights-hero__subtitle">
          ${cachedInsights.length} insight${cachedInsights.length !== 1 ? 's' : ''} from your conversations
        </p>
      </div>
    </div>
    
    <div class="semantic-insights-feed">
      ${cachedInsights
        .slice(0, 6)
        .map((insight, i) => renderInsightCard(insight, i))
        .join('')}
    </div>
    
    ${cachedInsights.length > 6 ? `
      <div class="semantic-show-more">
        <span class="semantic-show-more__text">
          + ${cachedInsights.length - 6} more insights
        </span>
      </div>
    ` : ''}
  `;
}

function renderInsightCard(insight: SemanticInsight, index: number): string {
  const sourceKey = insight.source.toLowerCase() as keyof typeof ICONS;
  const personaIcon = ICONS[sourceKey] || ICONS.ferni;
  const personaColor = PERSONA_COLORS[sourceKey] || PERSONA_COLORS.ferni;
  
  const priorityIcon = insight.priority === 'critical' 
    ? ICONS.bellRing 
    : insight.priority === 'high' 
      ? ICONS.sparkles 
      : ICONS.lightbulb;

  return `
    <div class="semantic-insight-card priority-${insight.priority}" style="animation-delay: ${index * 60}ms">
      <div class="semantic-insight-card__persona" style="--persona-color: ${personaColor}">
        <span class="semantic-insight-card__persona-icon">${personaIcon}</span>
        <span class="semantic-insight-card__persona-name">${capitalize(insight.source)}</span>
      </div>
      <div class="semantic-insight-card__body">
        <div class="semantic-insight-card__priority">
          <span class="semantic-insight-card__priority-icon">${priorityIcon}</span>
        </div>
        <p class="semantic-insight-card__content">${insight.insight}</p>
        ${insight.context ? `
          <p class="semantic-insight-card__context">${insight.context}</p>
        ` : ''}
      </div>
    </div>
  `;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderLoopsTab(): string {
  if (isLoading) {
    return renderLoadingState('Checking what we left open...');
  }

  if (cachedLoops.length === 0) {
    return renderEmptyTeaser('loops');
  }

  const typeIcons: Record<string, string> = {
    advice: ICONS.lightbulb,
    intention: ICONS.target,
    event: ICONS.calendar,
    question: ICONS.helpCircle,
  };
  
  const typeLabels: Record<string, string> = {
    advice: 'Advice to revisit',
    intention: 'Intention you set',
    event: 'Upcoming event',
    question: 'Question to explore',
  };

  return `
    <div class="semantic-loops-hero">
      <div class="semantic-loops-hero__icon">${ICONS.repeat}</div>
      <div class="semantic-loops-hero__content">
        <h3 class="semantic-loops-hero__title">Things I'm tracking</h3>
        <p class="semantic-loops-hero__subtitle">
          ${cachedLoops.length} open loop${cachedLoops.length !== 1 ? 's' : ''} worth following up on
        </p>
      </div>
    </div>
    
    <div class="semantic-loops-grid">
      ${cachedLoops.map((loop, i) => `
        <div class="semantic-loop-card" style="animation-delay: ${i * 60}ms">
          <div class="semantic-loop-card__header">
            <span class="semantic-loop-card__icon">${typeIcons[loop.type] || ICONS.bookmark}</span>
            <span class="semantic-loop-card__type">${typeLabels[loop.type] || loop.type}</span>
          </div>
          <p class="semantic-loop-card__content">${loop.content}</p>
          <div class="semantic-loop-card__footer">
            <span class="semantic-loop-card__context">${loop.context || ''}</span>
            <span class="semantic-loop-card__date">${formatRelativeDate(loop.created)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  } catch {
    return '';
  }
}

function renderCommitmentsTab(): string {
  if (isLoading) {
    return renderLoadingState('Checking what I\'m holding for you...');
  }

  const all = [...(cachedCommitments as unknown as Commitment[])];
  if (all.length === 0) {
    return renderEmptyTeaser('commitments');
  }

  const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
    remember: { icon: ICONS.heartHandshake, label: 'Remembering', color: 'var(--persona-ferni)' },
    check_back: { icon: ICONS.bellRing, label: 'Checking back', color: 'var(--persona-maya)' },
    avoid: { icon: ICONS.shieldCheck, label: 'Boundary', color: 'var(--persona-alex)' },
    follow_up: { icon: ICONS.repeat, label: 'Following up', color: 'var(--persona-peter)' },
  };

  // Group by type
  const byType = all.reduce<Record<string, Commitment[]>>((acc, c) => {
    const existing = acc[c.type] ?? [];
    acc[c.type] = [...existing, c];
    return acc;
  }, {});

  return `
    <div class="semantic-commitments-hero">
      <div class="semantic-commitments-hero__icon">${ICONS.heartHandshake}</div>
      <div class="semantic-commitments-hero__content">
        <h3 class="semantic-commitments-hero__title">What I'm holding for you</h3>
        <p class="semantic-commitments-hero__subtitle">
          ${all.length} thing${all.length !== 1 ? 's' : ''} I won't forget
        </p>
      </div>
    </div>
    
    <div class="semantic-commitments-stats">
      ${Object.entries(byType).map(([type, items]) => {
        const config = typeConfig[type] || { icon: ICONS.bookmark, label: type, color: 'var(--color-accent)' };
        return `
          <div class="semantic-commitment-stat" style="--stat-color: ${config.color}">
            <span class="semantic-commitment-stat__icon">${config.icon}</span>
            <span class="semantic-commitment-stat__value">${items.length}</span>
            <span class="semantic-commitment-stat__label">${config.label}</span>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="semantic-commitments-list">
      ${all.slice(0, 8).map((c, i) => {
        const config = typeConfig[c.type] || { icon: ICONS.bookmark, label: c.type, color: 'var(--color-accent)' };
        return `
          <div class="semantic-commitment-card" style="animation-delay: ${i * 50}ms; --commitment-color: ${config.color}">
            <div class="semantic-commitment-card__icon">${config.icon}</div>
            <div class="semantic-commitment-card__body">
              <p class="semantic-commitment-card__content">${c.content}</p>
              <span class="semantic-commitment-card__type">${config.label}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    ${all.length > 8 ? `
      <div class="semantic-show-more">
        <span class="semantic-show-more__text">+ ${all.length - 8} more things I'm holding</span>
      </div>
    ` : ''}
  `;
}

function renderRelationshipsTab(): string {
  if (isLoading) {
    return renderLoadingState('Looking at your world...');
  }

  if (!cachedRelationships || cachedRelationships.totalPeople === 0) {
    return renderEmptyTeaser('relationships');
  }

  const r = cachedRelationships;
  
  return `
    <div class="semantic-relationships-hero">
      <div class="semantic-relationships-hero__icon">${ICONS.users}</div>
      <div class="semantic-relationships-hero__content">
        <h3 class="semantic-relationships-hero__title">Your People</h3>
        <p class="semantic-relationships-hero__subtitle">
          ${r.totalPeople} people in your world that we've talked about
        </p>
      </div>
    </div>
    
    <div class="semantic-relationships-grid">
      ${r.topSupporter ? `
        <div class="semantic-relationship-card semantic-relationship-card--supporter">
          <div class="semantic-relationship-card__icon">${ICONS.heart}</div>
          <div class="semantic-relationship-card__body">
            <span class="semantic-relationship-card__label">Your supporter</span>
            <span class="semantic-relationship-card__name">${r.topSupporter}</span>
            <span class="semantic-relationship-card__insight">Brings you energy</span>
          </div>
      </div>
      ` : ''}
      
      ${r.mostMentioned ? `
        <div class="semantic-relationship-card semantic-relationship-card--mentioned">
          <div class="semantic-relationship-card__icon">${ICONS.messageCircle}</div>
          <div class="semantic-relationship-card__body">
            <span class="semantic-relationship-card__label">Most mentioned</span>
            <span class="semantic-relationship-card__name">${r.mostMentioned}</span>
            <span class="semantic-relationship-card__insight">On your mind often</span>
          </div>
      </div>
      ` : ''}
      
      ${r.energyDrainer ? `
        <div class="semantic-relationship-card semantic-relationship-card--drainer">
          <div class="semantic-relationship-card__icon">${ICONS.battery}</div>
          <div class="semantic-relationship-card__body">
            <span class="semantic-relationship-card__label">Energy aware</span>
            <span class="semantic-relationship-card__name">${r.energyDrainer}</span>
            <span class="semantic-relationship-card__insight">Worth paying attention to</span>
    </div>
        </div>
      ` : ''}
    </div>
    
    <div class="semantic-relationships-note">
      <span class="semantic-relationships-note__icon">${ICONS.eye}</span>
      <p class="semantic-relationships-note__text">
        I track who brings you energy and who drains it. This helps me understand your world better.
      </p>
    </div>
  `;
}

function renderPatternsTab(): string {
  if (isLoading) {
    return renderLoadingState('Connecting the dots...');
  }

  if (!cachedTemporal && !cachedBehavioral) {
    return renderEmptyTeaser('patterns');
  }

  return `
    <div class="semantic-patterns-hero">
      <div class="semantic-patterns-hero__icon">${ICONS.activity}</div>
      <div class="semantic-patterns-hero__content">
        <h3 class="semantic-patterns-hero__title">Your Rhythms</h3>
        <p class="semantic-patterns-hero__subtitle">
          Patterns I've noticed in how you move through your days
        </p>
      </div>
    </div>
    
    ${cachedTemporal ? `
      <div class="semantic-patterns-section">
        <h4 class="semantic-patterns-section__title">
          <span class="semantic-patterns-section__icon">${ICONS.clock}</span>
          Time Patterns
        </h4>
        <div class="semantic-patterns-cards">
          ${cachedTemporal.bestTimeOfDay ? `
            <div class="semantic-pattern-card">
              <div class="semantic-pattern-card__visual">
                ${cachedTemporal.bestTimeOfDay.toLowerCase().includes('morning') ? ICONS.sun : ICONS.moon}
        </div>
              <div class="semantic-pattern-card__content">
                <span class="semantic-pattern-card__label">Best time</span>
                <span class="semantic-pattern-card__value">${cachedTemporal.bestTimeOfDay}</span>
        </div>
            </div>
          ` : ''}
          ${cachedTemporal.currentEnergy ? `
            <div class="semantic-pattern-card">
              <div class="semantic-pattern-card__visual">${ICONS.battery}</div>
              <div class="semantic-pattern-card__content">
                <span class="semantic-pattern-card__label">Energy now</span>
                <span class="semantic-pattern-card__value">${cachedTemporal.currentEnergy}</span>
              </div>
            </div>
          ` : ''}
          ${cachedTemporal.seasonalPattern ? `
            <div class="semantic-pattern-card">
              <div class="semantic-pattern-card__visual">${ICONS.sun}</div>
              <div class="semantic-pattern-card__content">
                <span class="semantic-pattern-card__label">Seasonal</span>
                <span class="semantic-pattern-card__value">${cachedTemporal.seasonalPattern}</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}
    
    ${cachedBehavioral ? `
      <div class="semantic-patterns-section">
        <h4 class="semantic-patterns-section__title">
          <span class="semantic-patterns-section__icon">${ICONS.brain}</span>
          Behavioral Patterns
        </h4>
        
        ${cachedBehavioral.emotionalBaseline ? `
          <div class="semantic-emotional-baseline">
            <div class="semantic-emotional-baseline__emotion">
              <span class="semantic-emotional-baseline__label">Your baseline</span>
              <span class="semantic-emotional-baseline__value">${cachedBehavioral.emotionalBaseline.dominantEmotion}</span>
          </div>
            <div class="semantic-emotional-baseline__stability">
              <span class="semantic-emotional-baseline__label">Stability</span>
              <div class="semantic-emotional-baseline__bar">
                <div class="semantic-emotional-baseline__fill" style="width: ${Math.round(cachedBehavioral.emotionalBaseline.stability * 100)}%"></div>
          </div>
              <span class="semantic-emotional-baseline__percent">${Math.round(cachedBehavioral.emotionalBaseline.stability * 100)}%</span>
        </div>
          </div>
        ` : ''}
        
        ${cachedBehavioral.sabotagePatterns && cachedBehavioral.sabotagePatterns.length > 0 ? `
          <div class="semantic-sabotage-patterns">
            <span class="semantic-sabotage-patterns__title">Patterns worth watching</span>
            ${cachedBehavioral.sabotagePatterns.slice(0, 3).map(p => `
              <div class="semantic-sabotage-pattern">
                <span class="semantic-sabotage-pattern__icon">${ICONS.eye}</span>
                <span class="semantic-sabotage-pattern__text">${p.pattern}</span>
                <span class="semantic-sabotage-pattern__frequency">${p.frequency}x</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    ` : ''}
  `;
}

function renderCoachingTab(): string {
  if (isLoading) {
    return renderLoadingState('Thinking about your growth...');
  }

  if (!cachedCoaching) {
    return renderEmptyTeaser('coaching');
  }

  return `
    <div class="semantic-coaching-hero">
      <div class="semantic-coaching-hero__icon">${ICONS.sprout}</div>
      <div class="semantic-coaching-hero__content">
        <h3 class="semantic-coaching-hero__title">How You Grow</h3>
        <p class="semantic-coaching-hero__subtitle">
          What I've learned about supporting you best
        </p>
      </div>
    </div>
    
    <div class="semantic-coaching-profile">
      ${cachedCoaching.learningStyle ? `
        <div class="semantic-coaching-card">
          <div class="semantic-coaching-card__icon">${ICONS.brain}</div>
          <div class="semantic-coaching-card__content">
            <span class="semantic-coaching-card__label">How you learn</span>
            <span class="semantic-coaching-card__value">${cachedCoaching.learningStyle}</span>
      </div>
        </div>
      ` : ''}
      
      ${cachedCoaching.bestApproach ? `
        <div class="semantic-coaching-card">
          <div class="semantic-coaching-card__icon">${ICONS.compass}</div>
          <div class="semantic-coaching-card__content">
            <span class="semantic-coaching-card__label">What works</span>
            <span class="semantic-coaching-card__value">${cachedCoaching.bestApproach}</span>
      </div>
        </div>
      ` : ''}
    </div>
    
    ${cachedCoaching.resistanceTopics.length > 0 ? `
      <div class="semantic-coaching-boundaries">
        <h4 class="semantic-coaching-boundaries__title">
          <span class="semantic-coaching-boundaries__icon">${ICONS.shieldCheck}</span>
          Topics I approach gently
        </h4>
        <div class="semantic-coaching-boundaries__list">
          ${cachedCoaching.resistanceTopics.map(topic => `
            <span class="semantic-coaching-boundary">${topic}</span>
          `).join('')}
        </div>
        <p class="semantic-coaching-boundaries__note">
          These are areas where I tread carefully out of respect for you.
        </p>
      </div>
    ` : ''}
  `;
}

function renderAwarenessTab(): string {
  if (isLoading) {
    return renderLoadingState('Reflecting on your journey...');
  }

  if (!cachedSelfAwareness) {
    return renderEmptyTeaser('awareness');
  }

  const hasBlindSpots = cachedSelfAwareness.blindSpots.length > 0;
  const hasValuesMisalignment = cachedSelfAwareness.valuesMisalignment.length > 0;

  if (!hasBlindSpots && !hasValuesMisalignment) {
    return renderEmptyTeaser('awareness');
  }

  return `
    <div class="semantic-awareness-hero">
      <div class="semantic-awareness-hero__icon">${ICONS.eye}</div>
      <div class="semantic-awareness-hero__content">
        <h3 class="semantic-awareness-hero__title">Self-Awareness</h3>
        <p class="semantic-awareness-hero__subtitle">
          The mirrors I gently hold up for you
        </p>
      </div>
    </div>
    
    ${hasBlindSpots ? `
      <div class="semantic-awareness-section">
        <h4 class="semantic-awareness-section__title">
          <span class="semantic-awareness-section__icon">${ICONS.sparkles}</span>
          Patterns you might not see
        </h4>
        <div class="semantic-awareness-cards">
          ${cachedSelfAwareness.blindSpots.slice(0, 3).map((bs, i) => `
            <div class="semantic-awareness-card" style="animation-delay: ${i * 80}ms">
              <p class="semantic-awareness-card__area">${bs.area}</p>
              <p class="semantic-awareness-card__evidence">${bs.evidence}</p>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${hasValuesMisalignment ? `
      <div class="semantic-awareness-section">
        <h4 class="semantic-awareness-section__title">
          <span class="semantic-awareness-section__icon">${ICONS.compass}</span>
          Where actions meet values
        </h4>
        <div class="semantic-values-cards">
          ${cachedSelfAwareness.valuesMisalignment.slice(0, 3).map((v, i) => `
            <div class="semantic-values-card" style="animation-delay: ${i * 80}ms">
              <div class="semantic-values-card__value">
                <span class="semantic-values-card__label">You value</span>
                <span class="semantic-values-card__text">${v.value}</span>
              </div>
              <div class="semantic-values-card__divider">
                <span class="semantic-values-card__arrow">${ICONS.chevronRight}</span>
              </div>
              <div class="semantic-values-card__behavior">
                <span class="semantic-values-card__label">But I notice</span>
                <span class="semantic-values-card__text">${v.behavior}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <p class="semantic-awareness-note">
          No judgment here. Just observations to reflect on when you're ready.
        </p>
      </div>
    ` : ''}
  `;
}

function renderDeepAnalysisTab(): string {
  if (isLoading) {
    return renderLoadingState('Gathering deep insights from our conversations...');
  }

  if (!cachedDeepAnalysis || !cachedDeepAnalysis.hasAnalysis) {
    return renderEmptyTeaser('deepanalysis');
  }

  const { insights, hypotheses, outreachSuggestions, coachingGuidance, analysisTimestamp } = cachedDeepAnalysis;

  return `
    <div class="semantic-deep-hero">
      <div class="semantic-deep-hero__icon">${ICONS.sparkles}</div>
      <div class="semantic-deep-hero__content">
        <h3 class="semantic-deep-hero__title">Deep Analysis</h3>
        <p class="semantic-deep-hero__subtitle">
          Pattern mining across our conversations
        </p>
        ${analysisTimestamp ? `
          <span class="semantic-deep-hero__timestamp">
            Updated ${formatRelativeDate(analysisTimestamp)}
          </span>
        ` : ''}
      </div>
    </div>
    
    ${insights.length > 0 ? `
      <div class="semantic-deep-section">
        <h4 class="semantic-deep-section__title">
          <span class="semantic-deep-section__icon">${ICONS.brain}</span>
          What I've noticed
        </h4>
        <div class="semantic-deep-insights">
          ${insights.slice(0, 5).map((insight, i) => `
            <div class="semantic-deep-insight" style="animation-delay: ${i * 60}ms">
              <div class="semantic-deep-insight__confidence">
                <div class="semantic-deep-insight__confidence-bar" style="width: ${Math.round(insight.confidence * 100)}%"></div>
                <span class="semantic-deep-insight__confidence-label">${Math.round(insight.confidence * 100)}%</span>
        </div>
              <p class="semantic-deep-insight__observation">${insight.observation}</p>
              <p class="semantic-deep-insight__significance">${insight.significance}</p>
              ${insight.evidence.length > 0 ? `
                <div class="semantic-deep-insight__evidence">
                  ${insight.evidence.slice(0, 2).map(e => `<span class="semantic-deep-insight__evidence-item">${e}</span>`).join('')}
      </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${hypotheses.length > 0 ? `
      <div class="semantic-deep-section">
        <h4 class="semantic-deep-section__title">
          <span class="semantic-deep-section__icon">${ICONS.trendingUp}</span>
          What I anticipate
        </h4>
        <div class="semantic-deep-hypotheses">
          ${hypotheses.slice(0, 3).map((hyp, i) => `
            <div class="semantic-deep-hypothesis" style="animation-delay: ${i * 60}ms">
              <div class="semantic-deep-hypothesis__header">
                <span class="semantic-deep-hypothesis__probability">${Math.round(hyp.probability * 100)}% likely</span>
                <span class="semantic-deep-hypothesis__timeframe">${hyp.timeframe.replace('_', ' ')}</span>
        </div>
              <p class="semantic-deep-hypothesis__prediction">${hyp.prediction}</p>
              <p class="semantic-deep-hypothesis__reasoning">${hyp.reasoning}</p>
              ${hyp.testableSignals.length > 0 ? `
                <div class="semantic-deep-hypothesis__signals">
                  <span class="semantic-deep-hypothesis__signals-label">Watch for:</span>
                  ${hyp.testableSignals.slice(0, 2).map(s => `<span class="semantic-deep-hypothesis__signal">${s}</span>`).join('')}
      </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${outreachSuggestions.length > 0 ? `
      <div class="semantic-deep-section">
        <h4 class="semantic-deep-section__title">
          <span class="semantic-deep-section__icon">${ICONS.bellRing}</span>
          Good moments to reach out
        </h4>
        <div class="semantic-deep-outreach">
          ${outreachSuggestions.sort((a, b) => b.priority - a.priority).slice(0, 3).map((sug, i) => `
            <div class="semantic-deep-outreach-card" style="animation-delay: ${i * 60}ms">
              <p class="semantic-deep-outreach-card__message">${sug.message}</p>
              <div class="semantic-deep-outreach-card__meta">
                <span class="semantic-deep-outreach-card__timing">${sug.timing}</span>
                <span class="semantic-deep-outreach-card__rationale">${sug.rationale}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${coachingGuidance.length > 0 ? `
      <div class="semantic-deep-section">
        <h4 class="semantic-deep-section__title">
          <span class="semantic-deep-section__icon">${ICONS.compass}</span>
          How I approach you
        </h4>
        <div class="semantic-deep-guidance">
          ${coachingGuidance.slice(0, 4).map(g => `
            <div class="semantic-deep-guidance-item">
              <span class="semantic-deep-guidance-item__bullet">${ICONS.chevronRight}</span>
              <span class="semantic-deep-guidance-item__text">${g}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// LOADING & EMPTY STATE HELPERS
// ============================================================================

function renderLoadingState(message: string): string {
  return `
    <div class="semantic-loading">
      <div class="semantic-loading__spinner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
          </path>
        </svg>
        </div>
      <p class="semantic-loading__text">${message}</p>
      </div>
  `;
}

interface TeaserConfig {
  icon: string;
  title: string;
  description: string;
  previewItems: Array<{ icon: string; text: string }>;
  daysRequired: number;
}

const TEASER_CONFIGS = {
  insights: {
    icon: ICONS.brain,
    title: "What I'll notice",
    description: "As we talk more, I'll start seeing patterns you might not see yourself.",
    previewItems: [
      { icon: ICONS.lightbulb, text: '"Sunday evenings seem hard for you..."' },
      { icon: ICONS.eye, text: '"When you\'re stressed, you tend to..."' },
      { icon: ICONS.sparkles, text: '"I\'ve noticed you light up when..."' },
    ],
    daysRequired: 7,
  },
  loops: {
    icon: ICONS.repeat,
    title: 'Things I track',
    description: "I'll remember the threads of our conversations worth following up on.",
    previewItems: [
      { icon: ICONS.target, text: '"That goal you mentioned last week..."' },
      { icon: ICONS.calendar, text: '"How did that meeting go?"' },
      { icon: ICONS.helpCircle, text: '"You had a question about..."' },
    ],
    daysRequired: 3,
  },
  commitments: {
    icon: ICONS.heartHandshake,
    title: "What I hold for you",
    description: "I never forget the things you tell me matter.",
    previewItems: [
      { icon: ICONS.bellRing, text: '"Check back about that decision..."' },
      { icon: ICONS.shieldCheck, text: '"Boundary: Don\'t bring up..."' },
      { icon: ICONS.heart, text: '"Remember: You\'re working on..."' },
    ],
    daysRequired: 7,
  },
  relationships: {
    icon: ICONS.users,
    title: 'Your people',
    description: "I'll learn who brings you energy and who drains it.",
    previewItems: [
      { icon: ICONS.heart, text: '"Sarah seems to lift you up..."' },
      { icon: ICONS.battery, text: '"Meetings with X seem heavy..."' },
      { icon: ICONS.messageCircle, text: '"You talk about Mom often..."' },
    ],
    daysRequired: 14,
  },
  patterns: {
    icon: ICONS.activity,
    title: 'Your rhythms',
    description: "I'll notice when you're at your best and when things get hard.",
    previewItems: [
      { icon: ICONS.sun, text: '"Mornings are your best time..."' },
      { icon: ICONS.moon, text: '"End of month feels heavy..."' },
      { icon: ICONS.trendingUp, text: '"Exercise lifts your mood..."' },
    ],
    daysRequired: 14,
  },
  coaching: {
    icon: ICONS.sprout,
    title: 'How you grow',
    description: "I'll learn the best way to support you.",
    previewItems: [
      { icon: ICONS.brain, text: '"You learn best by doing..."' },
      { icon: ICONS.compass, text: '"Questions work better than advice..."' },
      { icon: ICONS.shieldCheck, text: '"Approach money topics gently..."' },
    ],
    daysRequired: 21,
  },
  awareness: {
    icon: ICONS.eye,
    title: 'Self-awareness',
    description: "I'll reflect back what you might not see.",
    previewItems: [
      { icon: ICONS.sparkles, text: '"You say you value X, but..."' },
      { icon: ICONS.eye, text: '"There\'s a pattern when..."' },
      { icon: ICONS.compass, text: '"Your actions show..."' },
    ],
    daysRequired: 30,
  },
  deepanalysis: {
    icon: ICONS.sparkles,
    title: 'Deep patterns',
    description: "After more conversations, I'll mine for deeper insights.",
    previewItems: [
      { icon: ICONS.brain, text: 'Cross-conversation patterns' },
      { icon: ICONS.trendingUp, text: 'Predictive insights' },
      { icon: ICONS.compass, text: 'Values alignment tracking' },
    ],
    daysRequired: 21,
  },
};

function getTeaserConfig(tab: string): TeaserConfig {
  switch (tab) {
    case 'insights': return TEASER_CONFIGS.insights;
    case 'loops': return TEASER_CONFIGS.loops;
    case 'commitments': return TEASER_CONFIGS.commitments;
    case 'relationships': return TEASER_CONFIGS.relationships;
    case 'patterns': return TEASER_CONFIGS.patterns;
    case 'coaching': return TEASER_CONFIGS.coaching;
    case 'awareness': return TEASER_CONFIGS.awareness;
    case 'deep': return TEASER_CONFIGS.deepanalysis;
    default: return TEASER_CONFIGS.insights;
  }
}

function renderEmptyTeaser(tab: string): string {
  const config = getTeaserConfig(tab);
  const metrics = relationshipStageService.getMetrics();
  const daysRemaining = Math.max(0, config.daysRequired - metrics.daysSinceFirstMeeting);
  const isAlmostUnlocked = daysRemaining <= 3 && daysRemaining > 0;

  return `
    <div class="semantic-teaser">
      <div class="semantic-teaser__badge">
        <span class="semantic-teaser__badge-icon">${ICONS.eye}</span>
        Preview
      </div>
      
      <div class="semantic-teaser__header">
        <div class="semantic-teaser__icon">${config.icon}</div>
        <h3 class="semantic-teaser__title">${config.title}</h3>
        <p class="semantic-teaser__description">${config.description}</p>
      </div>
      
      <div class="semantic-teaser__preview">
        ${config.previewItems.map((item, i) => `
          <div class="semantic-teaser__item" style="animation-delay: ${i * 100}ms">
            <span class="semantic-teaser__item-icon">${item.icon}</span>
            <span class="semantic-teaser__item-text">${item.text}</span>
          </div>
        `).join('')}
        <div class="semantic-teaser__fade"></div>
      </div>
      
      <div class="semantic-teaser__unlock ${isAlmostUnlocked ? 'semantic-teaser__unlock--soon' : ''}">
        ${daysRemaining > 0 
          ? `<p class="semantic-teaser__unlock-text">After ${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''}, this will be yours.</p>`
          : `<p class="semantic-teaser__unlock-text">Keep chatting to unlock these insights.</p>`
        }
      </div>
      
      <div class="semantic-teaser__cta">
        Every conversation brings us closer.
      </div>
    </div>
  `;
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
        <button class="semantic-panel-close" aria-label="${t('accessibility.close')}">
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

