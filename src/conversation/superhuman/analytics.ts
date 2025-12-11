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

export type SuperhumanCapability =
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
// IN-MEMORY STORAGE (For development - production should use proper analytics)
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
 */
export function trackCapabilityUsage(event: Omit<CapabilityUsageEvent, 'timestamp'>): void {
  const fullEvent: CapabilityUsageEvent = {
    ...event,
    timestamp: new Date(),
  };

  usageEvents.push(fullEvent);
  pruneEvents();

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
 */
export function trackCapabilityEffectiveness(
  event: Omit<CapabilityEffectivenessEvent, 'timestamp'>
): void {
  const fullEvent: CapabilityEffectivenessEvent = {
    ...event,
    timestamp: new Date(),
  };

  effectivenessEvents.push(fullEvent);
  pruneEvents();

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
 * Get statistics for all capabilities
 */
export function getCapabilityStats(): CapabilityStats[] {
  const capabilities: SuperhumanCapability[] = [
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
  const capabilities: SuperhumanCapability[] = [
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

  return capabilities.map((capability) => {
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
export function getRecentActivitySummary(minutes: number = 60): {
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
