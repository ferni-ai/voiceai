/**
 * Voice Agent Integration for Superhuman Trigger Intelligence
 *
 * Integrates Phase 2 (Personal Memory), Phase 3 (Temporal Intelligence),
 * Phase 4 (Effectiveness Learning), and Phase 5 (Anticipatory Triggers)
 * into the voice agent session lifecycle.
 *
 * Usage:
 * 1. On session start: loadUserTriggerContext(userId)
 * 2. On each turn: recordTriggerOutcome(...) when a trigger fires
 * 3. On session end: saveUserTriggerContext(userId)
 *
 * @module voice-agent-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getUserTriggerProfileService } from './user-trigger-profile-service.js';
import {
  generatePersonalContextBoost,
  type PersonalContextBoost,
} from './personal-context-integrator.js';
import {
  calculateTemporalBoost,
  createTriggerFiringEvent,
  recordFiringEvent,
  analyzeTemporalPatterns,
  recordTemporalBoost,
  recordFiringEventAnalytics,
  getDayOfWeek,
  getTimeOfDayBucket,
  type TemporalBoostResult,
} from './temporal-pattern-detector.js';
import {
  analyzeUserEffectiveness,
  getEffectivenessMultiplier,
  recordEffectivenessAnalytics,
  type UserEffectivenessAnalysis,
} from './effectiveness-calculator.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  UserTriggerProfile,
  SignificantDate,
  TriggerFiringEvent,
} from './user-trigger-profile.types.js';

const log = createLogger({ module: 'trigger-voice-integration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Combined context from Phase 2 + Phase 3 + Phase 4
 */
export interface TriggerContext {
  /** User ID */
  userId: string;
  /** User's trigger profile */
  profile: UserTriggerProfile;
  /** Personal context boost (Phase 2) */
  personalBoost: PersonalContextBoost;
  /** Temporal boost (Phase 3) */
  temporalBoost: TemporalBoostResult;
  /** Effectiveness analysis (Phase 4) */
  effectivenessAnalysis: UserEffectivenessAnalysis | null;
  /** Session-scoped firing events (not yet persisted) */
  sessionFirings: TriggerFiringEvent[];
  /** Whether the profile has been modified */
  isDirty: boolean;
}

// In-memory session contexts
const sessionContexts = new Map<string, TriggerContext>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Load user trigger context at session start
 * Combines Phase 2 (personal memory) and Phase 3 (temporal patterns)
 */
export async function loadUserTriggerContext(
  userId: string,
  sessionId: string
): Promise<TriggerContext> {
  const startTime = Date.now();

  try {
    // Load user profile from service (Phase 2)
    const profileService = getUserTriggerProfileService();
    const profile = await profileService.loadProfile(userId);

    // Analyze temporal patterns if we have enough data (Phase 3)
    const analyzedProfile = analyzeTemporalPatterns(profile);

    // Generate personal context boost (Phase 2)
    // At session start, we don't have user text yet, so pass empty string
    // Personal boost will be recalculated when we have text in getCombinedTriggerBoost
    const triggerContext = {
      userId,
      currentTime: new Date(),
      currentHour: new Date().getHours(),
    };
    const personalBoost = generatePersonalContextBoost(
      '', // No user text at session start
      analyzedProfile,
      triggerContext,
      {
        enabled: true,
        dateProximityDays: 14,
        maxBoostMultiplier: 1.5,
        relationshipBoostWeight: 0.3,
        patternBoostWeight: 0.25,
        temporalBoostWeight: 0.2,
      }
    );

    // Calculate temporal boost (Phase 3)
    const temporalBoost = calculateTemporalBoost(analyzedProfile);

    // Analyze effectiveness (Phase 4)
    const effectivenessAnalysis =
      analyzedProfile.triggerEffectiveness.length > 0
        ? analyzeUserEffectiveness(analyzedProfile)
        : null;

    // Record effectiveness analytics
    if (effectivenessAnalysis) {
      recordEffectivenessAnalytics(effectivenessAnalysis);
    }

    const context: TriggerContext = {
      userId,
      profile: analyzedProfile,
      personalBoost,
      temporalBoost,
      effectivenessAnalysis,
      sessionFirings: [],
      isDirty: false,
    };

    // Store in session contexts
    sessionContexts.set(sessionId, context);

    // Record analytics
    const now = new Date();
    recordTemporalBoost(
      temporalBoost,
      getDayOfWeek(now),
      getTimeOfDayBucket(now.getHours()),
      Date.now() - startTime
    );

    log.info(
      {
        userId,
        sessionId,
        profileAge: profile.updatedAt ? Date.now() - profile.updatedAt.getTime() : 'new',
        significantDates: profile.significantDates.length,
        relationships: profile.relationships.length,
        firingHistory: profile.temporalIntelligence?.recentFirings.length ?? 0,
        personalBoosts: personalBoost.triggerBoosts.length,
        temporalMultiplier: temporalBoost.overallMultiplier,
        nearSignificantDate: temporalBoost.nearSignificantDate?.description,
        effectivenessTriggers: effectivenessAnalysis?.triggerResults.length ?? 0,
        triggersToBoost: effectivenessAnalysis?.triggersToBoost.length ?? 0,
        triggersToSuppress: effectivenessAnalysis?.triggersToSuppress.length ?? 0,
        loadTimeMs: Date.now() - startTime,
      },
      '🧠 User trigger context loaded'
    );

    return context;
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Failed to load trigger context');

    // Return a minimal default context on error
    const defaultContext: TriggerContext = {
      userId,
      profile: {
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        schemaVersion: 3,
        significantDates: [],
        relationships: [],
        communicationPatterns: {
          phrasePatterns: [],
          sensitiveTopics: [],
          temporalPatterns: [],
        },
        triggerEffectiveness: [],
        conversationsAnalyzed: 0,
        profileConfidence: 0,
      },
      personalBoost: {
        overallMultiplier: 1.0,
        categoryBoosts: {},
        triggerBoosts: [],
        appliedContext: {
          upcomingDates: [],
          mentionedRelationships: [],
          detectedPatterns: [],
          temporalFlags: [],
        },
        metadata: {
          profileAge: 0,
          processingTimeMs: 0,
        },
      },
      temporalBoost: {
        overallMultiplier: 1.0,
        categoryBoosts: {},
        triggerAdjustments: [],
        contextNotes: [],
      },
      effectivenessAnalysis: null,
      sessionFirings: [],
      isDirty: false,
    };

    sessionContexts.set(sessionId, defaultContext);
    return defaultContext;
  }
}

/**
 * Get current session trigger context (must be loaded first)
 */
export function getSessionTriggerContext(sessionId: string): TriggerContext | undefined {
  return sessionContexts.get(sessionId);
}

/**
 * Record trigger outcome during conversation
 * Called when a trigger fires and user responds
 */
export function recordTriggerOutcome(
  sessionId: string,
  triggerName: string,
  triggerCategory: string,
  outcome: 'engaged' | 'deflected' | 'neutral' | 'unknown'
): void {
  const context = sessionContexts.get(sessionId);
  if (!context) {
    log.warn({ sessionId, triggerName }, 'No trigger context for session');
    return;
  }

  // Create firing event
  const event = createTriggerFiringEvent(
    triggerName,
    triggerCategory,
    outcome,
    sessionId,
    context.profile.significantDates
  );

  // Add to session firings
  context.sessionFirings.push(event);
  context.isDirty = true;

  // Record analytics
  recordFiringEventAnalytics(event);

  log.debug(
    {
      sessionId,
      triggerName,
      triggerCategory,
      outcome,
      dayOfWeek: event.dayOfWeek,
      timeOfDay: event.timeOfDay,
      dateProximity: event.dateProximity,
    },
    'Recorded trigger outcome'
  );
}

/**
 * Save user trigger context at session end
 * Persists firing events and updates temporal patterns
 */
export async function saveUserTriggerContext(sessionId: string): Promise<boolean> {
  const context = sessionContexts.get(sessionId);
  if (!context) {
    log.debug({ sessionId }, 'No trigger context to save');
    return false;
  }

  // Only save if dirty (has new firing events or modifications)
  if (!context.isDirty && context.sessionFirings.length === 0) {
    sessionContexts.delete(sessionId);
    log.debug({ sessionId }, 'Trigger context unchanged, skipping save');
    return true;
  }

  try {
    // Add session firings to profile
    let profile = context.profile;
    for (const event of context.sessionFirings) {
      profile = recordFiringEvent(profile, event);
    }

    // Re-analyze temporal patterns with new data
    profile = analyzeTemporalPatterns(profile);

    // Save to Firestore
    const profileService = getUserTriggerProfileService();
    const saved = await profileService.saveProfile(context.userId, profile);

    // Clean up session context
    sessionContexts.delete(sessionId);

    log.info(
      {
        sessionId,
        userId: context.userId,
        newFirings: context.sessionFirings.length,
        totalFirings: profile.temporalIntelligence?.recentFirings.length ?? 0,
        saved,
      },
      '🧠 User trigger context saved'
    );

    return saved;
  } catch (error) {
    log.error({ error: String(error), sessionId }, 'Failed to save trigger context');
    sessionContexts.delete(sessionId);
    return false;
  }
}

// ============================================================================
// TRIGGER MATCHING ENHANCEMENT
// ============================================================================

/**
 * Get combined trigger boost for a trigger name
 * Merges personal boost (Phase 2), temporal boost (Phase 3), and effectiveness (Phase 4)
 */
export function getCombinedTriggerBoost(
  sessionId: string,
  triggerName: string,
  triggerCategory: string
): {
  multiplier: number;
  shouldBoost: boolean;
  shouldSuppress: boolean;
  shouldExplore: boolean;
  contextNotes: string[];
} {
  const context = sessionContexts.get(sessionId);
  if (!context) {
    return {
      multiplier: 1.0,
      shouldBoost: false,
      shouldSuppress: false,
      shouldExplore: false,
      contextNotes: [],
    };
  }

  let multiplier = context.temporalBoost.overallMultiplier;
  const contextNotes: string[] = [...context.temporalBoost.contextNotes];
  let shouldExplore = false;

  // Check category boosts (Phase 3)
  const categoryBoost = context.temporalBoost.categoryBoosts[triggerCategory];
  if (categoryBoost) {
    multiplier *= categoryBoost;
  }

  // Check trigger-specific temporal adjustments (Phase 3)
  const triggerAdjustment = context.temporalBoost.triggerAdjustments.find(
    (a) => a.triggerName === triggerName
  );
  if (triggerAdjustment) {
    multiplier += triggerAdjustment.adjustment;
    contextNotes.push(triggerAdjustment.reason);
  }

  // Check personal trigger boosts (Phase 2)
  const triggerBoostEntry = context.personalBoost.triggerBoosts.find(
    (t) => t.triggerName === triggerName
  );
  const shouldBoost = !!triggerBoostEntry;

  if (triggerBoostEntry) {
    multiplier *= triggerBoostEntry.boost;
    contextNotes.push(triggerBoostEntry.reason);
  }

  // Check category boosts from personal context
  const personalCategoryBoost = context.personalBoost.categoryBoosts[triggerCategory];
  if (personalCategoryBoost) {
    multiplier *= personalCategoryBoost;
  }

  // Apply effectiveness learning (Phase 4)
  const effectiveness = getEffectivenessMultiplier(triggerName, context.profile);
  let shouldSuppress = false;
  if (effectiveness.confidence > 0) {
    multiplier *= effectiveness.multiplier;
    shouldExplore = effectiveness.shouldExplore;
    shouldSuppress = effectiveness.multiplier < 0.8; // Consider suppressed if significantly reduced

    if (effectiveness.multiplier > 1.1) {
      contextNotes.push(
        `Trigger "${triggerName}" has high historical effectiveness (${(effectiveness.confidence * 100).toFixed(0)}% confident)`
      );
    } else if (effectiveness.multiplier < 0.9) {
      contextNotes.push(`Trigger "${triggerName}" has low historical effectiveness`);
    }
  }

  // Add context from applied personal context
  const { appliedContext } = context.personalBoost;
  if (appliedContext.upcomingDates.length > 0) {
    contextNotes.push(`${appliedContext.upcomingDates.length} significant date(s) approaching`);
  }
  if (appliedContext.detectedPatterns.length > 0) {
    contextNotes.push(...appliedContext.detectedPatterns);
  }

  return {
    multiplier: Math.min(Math.max(multiplier, 0.1), 3.0), // Cap between 0.1 and 3.0
    shouldBoost,
    shouldSuppress,
    shouldExplore,
    contextNotes,
  };
}

/**
 * Get significant dates approaching (for proactive mentions)
 */
export function getApproachingSignificantDates(
  sessionId: string,
  withinDays = 7
): SignificantDate[] {
  const context = sessionContexts.get(sessionId);
  if (!context) return [];

  // Filter dates approaching within the window
  const now = new Date();
  return context.profile.significantDates.filter((date) => {
    if (!date.isRecurring) return false;

    const parts = date.date.split('-');
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const thisYear = now.getFullYear();
    let nextOccurrence = new Date(thisYear, month, day);
    if (nextOccurrence < now) {
      nextOccurrence = new Date(thisYear + 1, month, day);
    }

    const daysUntil = Math.round(
      (nextOccurrence.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    return daysUntil >= 0 && daysUntil <= withinDays;
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all session contexts (for testing)
 */
export function clearAllSessionContexts(): void {
  sessionContexts.clear();
}

/**
 * Get number of active session contexts (for monitoring)
 */
export function getActiveSessionCount(): number {
  return sessionContexts.size;
}
