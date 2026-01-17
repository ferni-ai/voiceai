/**
 * Better Than Human Analytics
 *
 * Tracks usage and effectiveness of superhuman capabilities.
 * Helps us understand what's working and optimize.
 *
 * @module @ferni/superhuman/analytics
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'BetterThanHumanAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * All 30+ superhuman capabilities tracked by Ferni.
 *
 * ORIGINAL 10 (Core Superhuman Capabilities - Jan 2024):
 * These are the foundational "better than any human friend" features
 *
 * ENHANCED 9 (December 2024):
 * Context and timing intelligence
 *
 * LEGACY 12 (Earlier capabilities):
 * Original tracking categories
 */
export type SuperhumanCapability =
  // ============================================================================
  // ORIGINAL 10 - Core "Better Than Human" Capabilities
  // ============================================================================
  | 'commitment_keeper' // Tracks promises, intentions, decisions
  | 'capacity_guardian' // Monitors energy, prevents burnout
  | 'values_alignment' // Detects when actions contradict values
  | 'dream_keeper' // Guards long-term aspirations
  | 'life_narrative' // Builds coherent story of user's journey
  | 'relationship_network' // Maps all relationships with sentiment
  | 'seasonal_awareness' // Connects to seasonal patterns
  | 'relationship_milestones' // Tracks important dates, anniversaries
  | 'emotional_first_aid' // Immediate crisis support
  | 'predictive_coaching' // Anticipates struggles before they happen

  // ============================================================================
  // ENHANCED 9 - Context & Timing Intelligence (Dec 2024)
  // ============================================================================
  | 'silence_interpreter' // Classifies silence types
  | 'contradiction_comfort' // Validates mixed emotions
  | 'perfect_timing' // Learns optimal timing for topics
  | 'pattern_mirror' // Tracks energizing/draining topics
  | 'first_time_vulnerability' // Detects first-time shares
  | 'ambient_context' // Classifies user's environment
  | 'protective_memory' // Tracks premature advice, boundary softening
  | 'voice_biomarkers' // Voice health indicators
  | 'inside_joke_memory' // Remembers shared humor moments

  // ============================================================================
  // LEGACY 12 - Original Tracking Categories
  // ============================================================================
  | 'emotional_memory'
  | 'anticipatory_presence'
  | 'linguistic_mirroring'
  | 'visible_vulnerability'
  | 'spontaneous_delight'
  | 'protective_instincts'
  | 'evolving_jokes'
  | 'team_coherence'
  | 'temporal_emotional'
  | 'meta_relationship'
  | 'somatic_presence'
  | 'superhuman_observations';

export interface CapabilityUsageEvent {
  capability: SuperhumanCapability;
  actionType: string;
  userId: string;
  sessionId: string;
  personaId: string;
  turnCount: number;
  sessionCount: number;
  priority: number;
  wasApplied: boolean;
  timestamp: Date;
}

export interface CapabilityEffectivenessEvent {
  capability: SuperhumanCapability;
  userId: string;
  sessionId: string;
  userReaction: 'positive' | 'neutral' | 'negative';
  engagementIncrease: boolean;
  timestamp: Date;
}

export interface CapabilityStats {
  capability: SuperhumanCapability;
  totalUsage: number;
  appliedCount: number;
  positiveReactions: number;
  neutralReactions: number;
  negativeReactions: number;
  averagePriority: number;
}

// ============================================================================
// PERSISTENCE LAYER
// ============================================================================

import {
  persistUsageEvent,
  persistEffectivenessEvent,
  getPersistedCapabilityStats,
  getTopCapabilities as getTopCapabilitiesFromDb,
  getUserFeedbackHistory,
  getEffectivenessTrend,
  updateAggregates,
} from './analytics-persistence.js';

// Re-export persistence functions for external use
export { getUserFeedbackHistory, getEffectivenessTrend, updateAggregates };

// ============================================================================
// IN-MEMORY STORAGE (Backup + Fast Access)
// Falls back to Firestore for durability
// ============================================================================

const usageEvents: CapabilityUsageEvent[] = [];
const effectivenessEvents: CapabilityEffectivenessEvent[] = [];

// Keep only last N events to prevent memory issues
const MAX_EVENTS = 10000;

function pruneEvents(): void {
  if (usageEvents.length > MAX_EVENTS) {
    usageEvents.splice(0, usageEvents.length - MAX_EVENTS);
  }
  if (effectivenessEvents.length > MAX_EVENTS) {
    effectivenessEvents.splice(0, effectivenessEvents.length - MAX_EVENTS);
  }
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Track when a capability is used
 * Persists to both in-memory (fast) and Firestore (durable)
 */
export function trackCapabilityUsage(event: Omit<CapabilityUsageEvent, 'timestamp'>): void {
  const fullEvent: CapabilityUsageEvent = {
    ...event,
    timestamp: new Date(),
  };

  // In-memory for fast access
  usageEvents.push(fullEvent);
  pruneEvents();

  // Persist to Firestore (fire-and-forget, don't block)
  persistUsageEvent(fullEvent).catch((e) => {
    logger.debug({ error: String(e) }, 'Failed to persist usage event');
  });

  logger.debug(
    {
      capability: event.capability,
      actionType: event.actionType,
      wasApplied: event.wasApplied,
      userId: event.userId,
    },
    'Capability usage tracked'
  );
}

/**
 * Track user reaction to a capability
 * Persists to both in-memory (fast) and Firestore (durable)
 */
export function trackCapabilityEffectiveness(
  event: Omit<CapabilityEffectivenessEvent, 'timestamp'>,
  context?: { insight?: string; userTranscript?: string }
): void {
  const fullEvent: CapabilityEffectivenessEvent = {
    ...event,
    timestamp: new Date(),
  };

  // In-memory for fast access
  effectivenessEvents.push(fullEvent);
  pruneEvents();

  // Persist to Firestore (fire-and-forget, don't block)
  persistEffectivenessEvent(fullEvent, context).catch((e) => {
    logger.debug({ error: String(e) }, 'Failed to persist effectiveness event');
  });

  logger.debug(
    {
      capability: event.capability,
      reaction: event.userReaction,
      userId: event.userId,
    },
    'Capability effectiveness tracked'
  );
}

/**
 * Track an action from the orchestrator
 */
export function trackAction(
  capability: SuperhumanCapability,
  actionType: string,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    turnCount: number;
    sessionCount: number;
    priority: number;
    wasApplied: boolean;
  }
): void {
  trackCapabilityUsage({
    capability,
    actionType,
    ...context,
  });
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * All capabilities for iteration
 */
export const ALL_CAPABILITIES: SuperhumanCapability[] = [
  // Original 10
  'commitment_keeper',
  'capacity_guardian',
  'values_alignment',
  'dream_keeper',
  'life_narrative',
  'relationship_network',
  'seasonal_awareness',
  'relationship_milestones',
  'emotional_first_aid',
  'predictive_coaching',
  // Enhanced 9
  'silence_interpreter',
  'contradiction_comfort',
  'perfect_timing',
  'pattern_mirror',
  'first_time_vulnerability',
  'ambient_context',
  'protective_memory',
  'voice_biomarkers',
  'inside_joke_memory',
  // Legacy 12
  'emotional_memory',
  'anticipatory_presence',
  'linguistic_mirroring',
  'visible_vulnerability',
  'spontaneous_delight',
  'protective_instincts',
  'evolving_jokes',
  'team_coherence',
  'temporal_emotional',
  'meta_relationship',
  'somatic_presence',
  'superhuman_observations',
];

/**
 * Get statistics for all capabilities
 */
export function getCapabilityStats(): CapabilityStats[] {
  const capabilities = ALL_CAPABILITIES;

  return capabilities.map((capability) => {
    const usage = usageEvents.filter((e) => e.capability === capability);
    const effectiveness = effectivenessEvents.filter((e) => e.capability === capability);

    return {
      capability,
      totalUsage: usage.length,
      appliedCount: usage.filter((e) => e.wasApplied).length,
      positiveReactions: effectiveness.filter((e) => e.userReaction === 'positive').length,
      neutralReactions: effectiveness.filter((e) => e.userReaction === 'neutral').length,
      negativeReactions: effectiveness.filter((e) => e.userReaction === 'negative').length,
      averagePriority:
        usage.length > 0 ? usage.reduce((sum, e) => sum + e.priority, 0) / usage.length : 0,
    };
  });
}

/**
 * Get stats for a specific user
 */
export function getUserCapabilityStats(userId: string): CapabilityStats[] {
  return ALL_CAPABILITIES.map((capability) => {
    const usage = usageEvents.filter((e) => e.capability === capability && e.userId === userId);
    const effectiveness = effectivenessEvents.filter(
      (e) => e.capability === capability && e.userId === userId
    );

    return {
      capability,
      totalUsage: usage.length,
      appliedCount: usage.filter((e) => e.wasApplied).length,
      positiveReactions: effectiveness.filter((e) => e.userReaction === 'positive').length,
      neutralReactions: effectiveness.filter((e) => e.userReaction === 'neutral').length,
      negativeReactions: effectiveness.filter((e) => e.userReaction === 'negative').length,
      averagePriority:
        usage.length > 0 ? usage.reduce((sum, e) => sum + e.priority, 0) / usage.length : 0,
    };
  });
}

/**
 * Get most effective capabilities (by positive reaction rate)
 */
export function getMostEffectiveCapabilities(): Array<{
  capability: SuperhumanCapability;
  effectivenessRate: number;
  sampleSize: number;
}> {
  const stats = getCapabilityStats();

  return stats
    .map((s) => {
      const totalReactions = s.positiveReactions + s.neutralReactions + s.negativeReactions;
      return {
        capability: s.capability,
        effectivenessRate: totalReactions > 0 ? s.positiveReactions / totalReactions : 0,
        sampleSize: totalReactions,
      };
    })
    .filter((s) => s.sampleSize >= 5) // Only include capabilities with enough data
    .sort((a, b) => b.effectivenessRate - a.effectivenessRate);
}

/**
 * Get recent activity summary
 */
export function getRecentActivitySummary(minutes = 60): {
  totalUsage: number;
  appliedCount: number;
  byCapability: Record<SuperhumanCapability, number>;
} {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const recentUsage = usageEvents.filter((e) => e.timestamp > cutoff);

  const byCapability = {} as Record<SuperhumanCapability, number>;
  for (const event of recentUsage) {
    byCapability[event.capability] = (byCapability[event.capability] || 0) + 1;
  }

  return {
    totalUsage: recentUsage.length,
    appliedCount: recentUsage.filter((e) => e.wasApplied).length,
    byCapability,
  };
}

/**
 * Clear all analytics (for testing)
 */
export function clearAnalytics(): void {
  usageEvents.length = 0;
  effectivenessEvents.length = 0;
  logger.debug('Analytics cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const betterThanHumanAnalytics = {
  trackUsage: trackCapabilityUsage,
  trackEffectiveness: trackCapabilityEffectiveness,
  trackAction,
  getStats: getCapabilityStats,
  getUserStats: getUserCapabilityStats,
  getMostEffective: getMostEffectiveCapabilities,
  getRecentActivity: getRecentActivitySummary,
  clear: clearAnalytics,
};

export default betterThanHumanAnalytics;
