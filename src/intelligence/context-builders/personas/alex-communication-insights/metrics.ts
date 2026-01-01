/**
 * Computed communication metrics for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/metrics
 */

import type {
  UserStateSnapshot,
  UpcomingPriority,
  CommunicationContext,
  CommunicationMetrics,
} from './types.js';

// ============================================================================
// COMPUTED COMMUNICATION METRICS
// ============================================================================

export function computeCommunicationMetrics(
  userState: UserStateSnapshot,
  upcomingPriorities: UpcomingPriority[],
  communicationContext: CommunicationContext
): CommunicationMetrics {
  const metrics: CommunicationMetrics = {
    communicationReadiness: 50,
    calendarDensity: 0,
    responseVelocity: 50,
    delegationClarity: 50,
    contextSwitchLoad: 0,
    patterns: [],
  };

  // Communication Readiness: Based on energy, stress, and pending difficult topics
  let readinessScore = 50;
  if (userState.energyLevel === 'high') readinessScore += 25;
  else if (userState.energyLevel === 'low') readinessScore -= 20;

  if (userState.stressLevel === 'low') readinessScore += 15;
  else if (userState.stressLevel === 'high') readinessScore -= 25;

  if (communicationContext.scriptingNeeds.length > 0) readinessScore -= 10;
  metrics.communicationReadiness = Math.max(0, Math.min(100, readinessScore));

  // Calendar Density: Based on upcoming priorities
  const criticalPriorities = upcomingPriorities.filter((p) => p.urgency === 'critical').length;
  const highPriorities = upcomingPriorities.filter((p) => p.urgency === 'high').length;
  metrics.calendarDensity = Math.min(
    100,
    criticalPriorities * 30 + highPriorities * 15 + upcomingPriorities.length * 5
  );

  // Response Velocity: Based on pending follow-ups
  const pendingCount = communicationContext.pendingFollowUps.length;
  metrics.responseVelocity = Math.max(0, 100 - pendingCount * 15);

  // Delegation Clarity: Based on whether they have clear handoffs
  if (upcomingPriorities.some((p) => p.actionNeeded)) {
    metrics.delegationClarity = 70; // Has clear action items
  }
  if (communicationContext.boundaryConversations.length > 0) {
    metrics.delegationClarity -= 15; // Boundary issues affect delegation
  }

  // Context Switch Load: Based on variety of priority types
  const uniqueTypes = new Set(upcomingPriorities.map((p) => p.type)).size;
  const uniqueSources = new Set(upcomingPriorities.map((p) => p.source)).size;
  metrics.contextSwitchLoad = Math.min(100, uniqueTypes * 15 + uniqueSources * 10);

  // Detect patterns
  if (metrics.communicationReadiness > 70) {
    metrics.patterns.push('High readiness - good time for difficult conversations');
  } else if (metrics.communicationReadiness < 40) {
    metrics.patterns.push('Low readiness - prep work needed before big conversations');
  }

  if (metrics.calendarDensity > 70) {
    metrics.patterns.push('Heavy schedule - prioritization needed');
  }

  if (metrics.responseVelocity < 50) {
    metrics.patterns.push('Follow-ups piling up - batch processing recommended');
  }

  if (metrics.contextSwitchLoad > 60) {
    metrics.patterns.push('High context switching - block time for focus');
  }

  return metrics;
}
