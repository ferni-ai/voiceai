/**
 * Proactive Engine - Unified Intelligence Level 5
 *
 * "Decides WHEN to share insights"
 *
 * This is the timing intelligence that makes Ferni feel truly present.
 * It's not enough to HAVE insights - you need to know WHEN to surface them.
 *
 * Priority System (from architecture):
 * 1. Late Night Check (Priority 1) - "You're up late..."
 * 2. Overwhelm Detection (Priority 2) - "Sounds like a lot..."
 * 3. Commitment Deadline (Priority 3) - "Remember you wanted to..."
 * 4. Habit Struggle (Priority 5) - "I noticed the habit streak..."
 * 5. Pattern Observation (Priority 6) - "I've been noticing..."
 * 6. Celebration Milestone (Priority 7) - "Wait - did you realize..."
 * 7. Inside Joke Callback (Priority 9) - "That reminds me of..."
 *
 * Rules:
 * - Max 2 proactive insights per session
 * - Cooldown periods honored
 * - Trust level requirements checked
 * - User preference learning applied
 *
 * @module intelligence/proactive/proactive-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextWindow } from '../core/context-assembler.js';
import type { CrossDomainCorrelation } from '../patterns/cross-domain-correlator.js';

const log = createLogger({ module: 'proactive-engine' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * When to surface an insight
 */
export type SurfaceMoment = 'session_start' | 'natural_pause' | 'topic_relevant' | 'session_end';

/**
 * Category of proactive insight
 */
export type InsightCategory =
  | 'late_night_support'
  | 'overwhelm_detection'
  | 'commitment_reminder'
  | 'habit_support'
  | 'pattern_observation'
  | 'milestone_celebration'
  | 'relationship_callback'
  | 'cross_domain_insight'
  | 'seasonal_awareness'
  | 'capacity_warning';

/**
 * A proactive insight ready to surface
 */
export interface ProactiveIntelligenceInsight {
  id: string;
  category: InsightCategory;
  message: string;
  followUp?: string;
  priority: number; // 1-10, lower = higher priority
  surfaceMoment: SurfaceMoment;
  createdAt: Date;
  expiresAt?: Date;
  requiresTrustLevel?: number; // 0-1
  metadata?: Record<string, unknown>;
}

/**
 * Result from checking proactive triggers
 */
export interface ProactiveTriggerResult {
  insights: ProactiveIntelligenceInsight[];
  sessionInsightCount: number;
  canSurfaceMore: boolean;
}

/**
 * User's proactive insight preferences (learned over time)
 */
export interface ProactivePreferences {
  enabled: boolean;
  maxPerSession: number;
  preferredMoments: SurfaceMoment[];
  dislikedCategories: InsightCategory[];
  cooldownDays: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_PREFERENCES: ProactivePreferences = {
  enabled: true,
  maxPerSession: 2,
  preferredMoments: ['session_start', 'natural_pause'],
  dislikedCategories: [],
  cooldownDays: 3,
};

const CATEGORY_PRIORITIES: Record<InsightCategory, number> = {
  late_night_support: 1,
  overwhelm_detection: 2,
  commitment_reminder: 3,
  capacity_warning: 4,
  habit_support: 5,
  pattern_observation: 6,
  milestone_celebration: 7,
  seasonal_awareness: 8,
  relationship_callback: 9,
  cross_domain_insight: 6,
};

const CATEGORY_TRUST_REQUIREMENTS: Record<InsightCategory, number> = {
  late_night_support: 0.2, // Can surface early
  overwhelm_detection: 0.3,
  commitment_reminder: 0.3,
  capacity_warning: 0.4,
  habit_support: 0.4,
  pattern_observation: 0.5, // Need more trust for "I noticed..."
  milestone_celebration: 0.3,
  seasonal_awareness: 0.2,
  relationship_callback: 0.6, // Inside jokes need relationship
  cross_domain_insight: 0.5,
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface SessionProactiveState {
  insightsSurfaced: string[];
  insightReactions: Map<string, 'positive' | 'neutral' | 'negative'>;
  lastSurfaceTime?: number;
}

interface UserProactiveState {
  preferences: ProactivePreferences;
  surfacedInsights: Map<string, Date>; // insightId -> when surfaced
  sessionState: SessionProactiveState;
}

const userStates = new Map<string, UserProactiveState>();

function getOrCreateState(userId: string): UserProactiveState {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      preferences: { ...DEFAULT_PREFERENCES },
      surfacedInsights: new Map(),
      sessionState: {
        insightsSurfaced: [],
        insightReactions: new Map(),
      },
    });
  }
  return userStates.get(userId)!;
}

// ============================================================================
// TRIGGER CHECKS
// ============================================================================

/**
 * Check all proactive triggers and return applicable insights.
 *
 * Call this at key moments:
 * - Session start
 * - Natural pauses in conversation
 * - When relevant topics come up
 * - Session end
 */
export function checkProactiveTriggers(
  userId: string,
  context: ContextWindow,
  moment: SurfaceMoment,
  correlations?: CrossDomainCorrelation[]
): ProactiveTriggerResult {
  const state = getOrCreateState(userId);
  const insights: ProactiveIntelligenceInsight[] = [];

  // Check if we can surface more
  const canSurfaceMore =
    state.sessionState.insightsSurfaced.length < state.preferences.maxPerSession;

  if (!canSurfaceMore || !state.preferences.enabled) {
    return {
      insights: [],
      sessionInsightCount: state.sessionState.insightsSurfaced.length,
      canSurfaceMore: false,
    };
  }

  // Run all trigger checks
  const lateNight = checkLateNightTrigger(context, moment);
  if (lateNight) insights.push(lateNight);

  const overwhelm = checkOverwhelmTrigger(context, moment);
  if (overwhelm) insights.push(overwhelm);

  const commitment = checkCommitmentTrigger(context, moment);
  if (commitment) insights.push(commitment);

  const capacity = checkCapacityTrigger(context, moment);
  if (capacity) insights.push(capacity);

  const habit = checkHabitTrigger(context, moment);
  if (habit) insights.push(habit);

  const milestone = checkMilestoneTrigger(context, moment);
  if (milestone) insights.push(milestone);

  // Add cross-domain correlation insights
  if (correlations?.length) {
    const corrInsights = correlations.map((c) => correlationToInsight(c, moment));
    insights.push(...corrInsights);
  }

  // Filter by trust level
  const trustLevel = context.relationship.trustLevel;
  const trustFiltered = insights.filter((i) => {
    const required = CATEGORY_TRUST_REQUIREMENTS[i.category] || 0.5;
    return trustLevel >= required;
  });

  // Filter by cooldown
  const cooldownFiltered = trustFiltered.filter((i) => {
    const lastSurfaced = state.surfacedInsights.get(i.id);
    if (!lastSurfaced) return true;

    const daysSince = (Date.now() - lastSurfaced.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= state.preferences.cooldownDays;
  });

  // Filter by preferred moments
  const momentFiltered = cooldownFiltered.filter(
    (i) => i.surfaceMoment === moment || state.preferences.preferredMoments.includes(moment)
  );

  // Filter by disliked categories
  const categoryFiltered = momentFiltered.filter(
    (i) => !state.preferences.dislikedCategories.includes(i.category)
  );

  // Sort by priority
  categoryFiltered.sort((a, b) => a.priority - b.priority);

  // Return top insights (respect max per session)
  const remaining = state.preferences.maxPerSession - state.sessionState.insightsSurfaced.length;
  const toReturn = categoryFiltered.slice(0, remaining);

  log.debug(
    {
      userId,
      moment,
      totalGenerated: insights.length,
      afterFilters: toReturn.length,
      sessionCount: state.sessionState.insightsSurfaced.length,
    },
    '🎯 Proactive trigger check'
  );

  return {
    insights: toReturn,
    sessionInsightCount: state.sessionState.insightsSurfaced.length,
    canSurfaceMore: toReturn.length > 0,
  };
}

// ============================================================================
// INDIVIDUAL TRIGGER CHECKS
// ============================================================================

/**
 * Late night support trigger (Priority 1)
 */
function checkLateNightTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  if (!context.immediate.isLateNight) return null;
  if (moment !== 'session_start') return null;

  const hour = context.immediate.hour;
  const messages = {
    late: "Hey, you're up late. Everything okay?",
    veryLate: "It's pretty late - I'm glad you reached out. What's on your mind?",
    earlyMorning: "You're up early. Couldn't sleep, or getting a head start?",
  };

  let message: string;
  if (hour >= 0 && hour < 5) {
    message = messages.veryLate;
  } else if (hour >= 22) {
    message = messages.late;
  } else {
    message = messages.earlyMorning;
  }

  return {
    id: `late_night_${Date.now()}`,
    category: 'late_night_support',
    message,
    followUp: 'Sometimes the quiet hours are when things feel heaviest.',
    priority: CATEGORY_PRIORITIES.late_night_support,
    surfaceMoment: 'session_start',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
  };
}

/**
 * Overwhelm detection trigger (Priority 2)
 */
function checkOverwhelmTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  if (moment !== 'session_start' && moment !== 'natural_pause') return null;

  const signals = [];

  // Check capacity signals
  if (context.capacity.bandwidth === 'low') signals.push('low_bandwidth');
  if (context.capacity.burnoutRisk === 'high' || context.capacity.burnoutRisk === 'critical') {
    signals.push('burnout_risk');
  }
  if (context.capacity.stressIndicators.length > 2) signals.push('multiple_stressors');

  // Check schedule signals
  if (context.today.upcomingMeetings > 5) signals.push('packed_schedule');

  // Need at least 2 signals
  if (signals.length < 2) return null;

  return {
    id: `overwhelm_${Date.now()}`,
    category: 'overwhelm_detection',
    message: "Sounds like you've got a lot going on. Before we dive in - how are you really doing?",
    followUp: 'Sometimes the most productive thing is taking a breath first.',
    priority: CATEGORY_PRIORITIES.overwhelm_detection,
    surfaceMoment: moment,
    createdAt: new Date(),
    metadata: { signals },
  };
}

/**
 * Commitment reminder trigger (Priority 3)
 */
function checkCommitmentTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  if (moment !== 'session_start') return null;

  const commitments = context.relationship.activeCommitments;
  if (!commitments.length) return null;

  // Pick the most relevant commitment
  const commitment = commitments[0];

  return {
    id: `commitment_${Date.now()}`,
    category: 'commitment_reminder',
    message: `Hey, I remember you mentioned wanting to ${commitment.toLowerCase()}. How's that going?`,
    followUp: 'No pressure - just wanted to check in on something that seemed important to you.',
    priority: CATEGORY_PRIORITIES.commitment_reminder,
    surfaceMoment: 'session_start',
    createdAt: new Date(),
    metadata: { commitment },
  };
}

/**
 * Capacity warning trigger (Priority 4)
 */
function checkCapacityTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  if (context.capacity.burnoutRisk !== 'critical') return null;
  if (moment !== 'session_start' && moment !== 'natural_pause') return null;

  return {
    id: `capacity_${Date.now()}`,
    category: 'capacity_warning',
    message: "I want to gently mention - I've been noticing some signs of exhaustion lately.",
    followUp: "You've been pushing hard. What would it look like to give yourself some grace?",
    priority: CATEGORY_PRIORITIES.capacity_warning,
    surfaceMoment: moment,
    createdAt: new Date(),
  };
}

/**
 * Habit support trigger (Priority 5)
 */
function checkHabitTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  // Check if habits domain is active
  if (!context.activeDomains.includes('habits')) return null;
  if (moment !== 'topic_relevant') return null;

  // This would integrate with habit tracking data
  // For now, return null - real implementation would check habit streaks
  return null;
}

/**
 * Milestone celebration trigger (Priority 7)
 */
function checkMilestoneTrigger(
  context: ContextWindow,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight | null {
  if (moment !== 'session_start') return null;

  // Check relationship milestone
  if (context.relationship.relationshipMilestone) {
    return {
      id: `milestone_${Date.now()}`,
      category: 'milestone_celebration',
      message: context.relationship.relationshipMilestone,
      priority: CATEGORY_PRIORITIES.milestone_celebration,
      surfaceMoment: 'session_start',
      createdAt: new Date(),
    };
  }

  return null;
}

/**
 * Convert a cross-domain correlation to a proactive insight
 */
function correlationToInsight(
  correlation: CrossDomainCorrelation,
  moment: SurfaceMoment
): ProactiveIntelligenceInsight {
  return {
    id: `corr_${correlation.id}`,
    category: 'cross_domain_insight',
    message: `I've been noticing something... ${correlation.insight}`,
    followUp: correlation.suggestion,
    priority: CATEGORY_PRIORITIES.cross_domain_insight,
    surfaceMoment: correlation.surfaceStrategy === 'proactively' ? 'session_start' : moment,
    createdAt: new Date(),
    requiresTrustLevel: 0.5,
    metadata: {
      correlationId: correlation.id,
      domains: [correlation.domainA.domain, correlation.domainB.domain],
    },
  };
}

// ============================================================================
// INSIGHT LIFECYCLE
// ============================================================================

/**
 * Mark an insight as surfaced (shown to user).
 */
export function markInsightSurfaced(userId: string, insightId: string): void {
  const state = getOrCreateState(userId);

  state.sessionState.insightsSurfaced.push(insightId);
  state.sessionState.lastSurfaceTime = Date.now();
  state.surfacedInsights.set(insightId, new Date());

  log.debug({ userId, insightId }, '✨ Insight surfaced');
}

/**
 * Record user reaction to an insight.
 */
export function recordInsightReaction(
  userId: string,
  insightId: string,
  reaction: 'positive' | 'neutral' | 'negative'
): void {
  const state = getOrCreateState(userId);
  state.sessionState.insightReactions.set(insightId, reaction);

  // Learn from negative reactions
  if (reaction === 'negative') {
    // Could adjust preferences based on category
    log.debug({ userId, insightId, reaction }, '📉 Negative reaction recorded');
  }

  log.debug({ userId, insightId, reaction }, '📊 Insight reaction recorded');
}

/**
 * Check if an insight was already surfaced.
 */
export function wasInsightSurfaced(userId: string, insightId: string): boolean {
  const state = userStates.get(userId);
  return state?.surfacedInsights.has(insightId) ?? false;
}

/**
 * Get reaction to an insight.
 */
export function getInsightReaction(
  userId: string,
  insightId: string
): 'positive' | 'neutral' | 'negative' | undefined {
  const state = userStates.get(userId);
  return state?.sessionState.insightReactions.get(insightId);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Initialize proactive state for a new session.
 */
export function initProactiveSession(userId: string): void {
  const state = getOrCreateState(userId);
  state.sessionState = {
    insightsSurfaced: [],
    insightReactions: new Map(),
  };
  log.debug({ userId }, '🎬 Proactive session initialized');
}

/**
 * Clean up proactive state at session end.
 */
export function cleanupProactiveSession(userId: string): void {
  const state = userStates.get(userId);
  if (state) {
    // Keep user-level state, just reset session
    state.sessionState = {
      insightsSurfaced: [],
      insightReactions: new Map(),
    };
  }
}

/**
 * Get proactive preferences for a user.
 */
export function getProactivePreferences(userId: string): ProactivePreferences {
  const state = userStates.get(userId);
  return state?.preferences ?? { ...DEFAULT_PREFERENCES };
}

/**
 * Update proactive preferences.
 */
export function updateProactivePreferences(
  userId: string,
  updates: Partial<ProactivePreferences>
): void {
  const state = getOrCreateState(userId);
  state.preferences = { ...state.preferences, ...updates };
  log.debug({ userId, updates }, '⚙️ Proactive preferences updated');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all proactive state for a user.
 */
export function clearProactiveState(userId?: string): void {
  if (userId) {
    userStates.delete(userId);
  } else {
    userStates.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveEngine = {
  check: checkProactiveTriggers,
  markSurfaced: markInsightSurfaced,
  recordReaction: recordInsightReaction,
  wasSurfaced: wasInsightSurfaced,
  getReaction: getInsightReaction,
  initSession: initProactiveSession,
  cleanup: cleanupProactiveSession,
  getPreferences: getProactivePreferences,
  updatePreferences: updateProactivePreferences,
  clear: clearProactiveState,
};
