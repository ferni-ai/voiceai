/**
 * Unified Intelligence API
 *
 * Stub implementations for the unified intelligence system.
 * These functions were designed in CLAUDE.md but not yet fully implemented.
 * They provide the expected interface for unified-intelligence-integration.ts
 *
 * TODO: Implement full functionality as per CLAUDE.md architecture:
 * - Level 2: Context Assembly
 * - Level 4: Cross-Domain Correlation
 * - Level 5: Proactive Intelligence
 *
 * @module intelligence/unified-intelligence-api
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'unified-intelligence-api' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * When to surface insights
 */
export type SurfaceMoment = 'session_start' | 'natural_pause' | 'topic_relevant';

/**
 * Domain signal for cross-domain correlation
 */
export interface DomainSignal {
  domain: string;
  store: string;
  metric: string;
  direction: 'increased' | 'decreased' | 'changed' | 'stable';
  magnitude: 'minor' | 'moderate' | 'significant';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Immediate context about the current moment
 */
export interface ImmediateContext {
  timeOfDay: string;
  dayOfWeek: string;
  isWeekend: boolean;
  currentMood?: string;
  recentActivity?: string;
}

/**
 * Context window assembled for a turn
 */
export interface ContextWindow {
  immediate: ImmediateContext;
  activeDomains: string[];
  today?: {
    agenda: string[];
    upcomingMeetings: number;
  };
  recent?: {
    topicsDiscussed: string[];
    emotionalPatterns: string[];
  };
  relationship?: {
    trustLevel: number;
    sessionCount: number;
    activeCommitments: string[];
  };
  capacity?: {
    bandwidth: 'low' | 'medium' | 'high';
    stressIndicators: string[];
  };
}

/**
 * Cross-domain correlation detected
 */
export interface CrossDomainCorrelation {
  id: string;
  domains: string[];
  insight: string;
  confidence: 'suspected' | 'likely' | 'confirmed';
  lastObserved: Date;
  occurrences: number;
}

/**
 * Proactive intelligence insight ready to surface
 */
export interface ProactiveIntelligenceInsight {
  id: string;
  category: string;
  message: string;
  followUp?: string;
  priority: number;
  surfaceMoment: SurfaceMoment;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Result from getIntelligenceForTurn
 */
export interface IntelligenceForTurnResult {
  context: ContextWindow;
  correlations: CrossDomainCorrelation[];
  proactiveInsights: ProactiveIntelligenceInsight[];
}

// ============================================================================
// SESSION STATE (per-user)
// ============================================================================

interface UserIntelligenceState {
  initialized: boolean;
  signals: DomainSignal[];
  surfacedInsights: Set<string>;
  insightReactions: Map<string, 'positive' | 'neutral' | 'negative'>;
}

const userStates = new Map<string, UserIntelligenceState>();

function getOrCreateState(userId: string): UserIntelligenceState {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      initialized: false,
      signals: [],
      surfacedInsights: new Set(),
      insightReactions: new Map(),
    });
  }
  return userStates.get(userId)!;
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize intelligence for a new session
 */
export function initIntelligenceSession(userId: string): void {
  log.debug({ userId }, 'Initializing intelligence session');
  const state = getOrCreateState(userId);
  state.initialized = true;
  state.signals = [];
  state.surfacedInsights.clear();
  state.insightReactions.clear();
}

/**
 * Clean up intelligence at session end
 */
export function cleanupIntelligence(userId: string): void {
  log.debug({ userId }, 'Cleaning up intelligence session');
  userStates.delete(userId);
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get all intelligence for a conversation turn
 *
 * This is the main entry point for the unified intelligence system.
 * Currently returns stub data - TODO: implement full context assembly,
 * cross-domain correlation, and proactive insight generation.
 */
export async function getIntelligenceForTurn(
  userId: string,
  options: {
    moment: SurfaceMoment;
    voiceEmotion?: unknown;
    forceRefresh?: boolean;
  }
): Promise<IntelligenceForTurnResult> {
  log.debug({ userId, moment: options.moment }, 'Getting intelligence for turn');

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hour = now.getHours();

  // Build immediate context
  const immediate: ImmediateContext = {
    timeOfDay:
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'late_night',
    dayOfWeek: dayNames[now.getDay()],
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
  };

  // Build context window with stub data
  const context: ContextWindow = {
    immediate,
    activeDomains: [],
    today: {
      agenda: [],
      upcomingMeetings: 0,
    },
    recent: {
      topicsDiscussed: [],
      emotionalPatterns: [],
    },
    relationship: {
      trustLevel: 0.5,
      sessionCount: 1,
      activeCommitments: [],
    },
    capacity: {
      bandwidth: 'medium',
      stressIndicators: [],
    },
  };

  // TODO: Implement actual cross-domain correlation
  const correlations: CrossDomainCorrelation[] = [];

  // TODO: Implement actual proactive insight generation
  const proactiveInsights: ProactiveIntelligenceInsight[] = [];

  return {
    context,
    correlations,
    proactiveInsights,
  };
}

// ============================================================================
// DOMAIN SIGNALS
// ============================================================================

/**
 * Record a domain signal for cross-domain correlation
 */
export function recordDomainSignal(userId: string, signal: DomainSignal): void {
  log.debug({ userId, domain: signal.domain, metric: signal.metric }, 'Recording domain signal');
  const state = getOrCreateState(userId);
  state.signals.push(signal);

  // Keep only last 100 signals per user
  if (state.signals.length > 100) {
    state.signals = state.signals.slice(-100);
  }
}

// ============================================================================
// INSIGHT TRACKING
// ============================================================================

/**
 * Mark a proactive insight as surfaced (shown to user)
 */
export function markInsightSurfaced(userId: string, insightId: string): void {
  log.debug({ userId, insightId }, 'Marking insight as surfaced');
  const state = getOrCreateState(userId);
  state.surfacedInsights.add(insightId);
}

/**
 * Record user reaction to a proactive insight
 */
export function recordInsightReaction(
  userId: string,
  insightId: string,
  reaction: 'positive' | 'neutral' | 'negative'
): void {
  log.debug({ userId, insightId, reaction }, 'Recording insight reaction');
  const state = getOrCreateState(userId);
  state.insightReactions.set(insightId, reaction);
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Get all domain signals for a user (for debugging/testing)
 */
export function getDomainSignals(userId: string): DomainSignal[] {
  const state = userStates.get(userId);
  return state?.signals ?? [];
}

/**
 * Check if an insight was surfaced
 */
export function wasInsightSurfaced(userId: string, insightId: string): boolean {
  const state = userStates.get(userId);
  return state?.surfacedInsights.has(insightId) ?? false;
}

/**
 * Get reaction to an insight
 */
export function getInsightReaction(
  userId: string,
  insightId: string
): 'positive' | 'neutral' | 'negative' | undefined {
  const state = userStates.get(userId);
  return state?.insightReactions.get(insightId);
}
