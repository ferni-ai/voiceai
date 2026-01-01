/**
 * Proactive trigger detection for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/triggers
 */

import type {
  UserStateSnapshot,
  UpcomingPriority,
  CommunicationContext,
  CommunicationMetrics,
  ProactiveTrigger,
} from './types.js';

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

export function detectProactiveTriggers(
  userState: UserStateSnapshot,
  metrics: CommunicationMetrics,
  upcomingPriorities: UpcomingPriority[],
  communicationContext: CommunicationContext
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Follow-up triggers
  if (communicationContext.pendingFollowUps.length > 0) {
    triggers.push({
      type: 'follow-up',
      message: `${communicationContext.pendingFollowUps.length} pending follow-ups need attention`,
      priority: communicationContext.pendingFollowUps.length >= 3 ? 'high' : 'medium',
      timing: 'immediate',
    });
  }

  // Check-in triggers
  if (userState.stressLevel === 'high') {
    triggers.push({
      type: 'check-in',
      message: 'High stress detected - offer to help clear communication backlog',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Deadline coordination
  const criticalDeadlines = upcomingPriorities.filter((p) => p.urgency === 'critical');
  for (const deadline of criticalDeadlines) {
    triggers.push({
      type: 'coordination',
      message: `CRITICAL: ${deadline.description}`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Celebration opportunities
  const celebrations = upcomingPriorities.filter(
    (p) => p.type === 'event' && p.description.includes('🎉')
  );
  for (const celebration of celebrations) {
    triggers.push({
      type: 'celebration',
      message: celebration.description,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Difficult conversation prep
  if (
    communicationContext.recentDifficultTopics.length > 0 &&
    metrics.communicationReadiness > 60
  ) {
    triggers.push({
      type: 'coordination',
      message: 'Good readiness for difficult conversations - consider tackling now',
      priority: 'medium',
      timing: 'when_relevant',
    });
  } else if (
    communicationContext.recentDifficultTopics.length > 0 &&
    metrics.communicationReadiness < 40
  ) {
    triggers.push({
      type: 'reminder',
      message: 'Difficult conversation pending but readiness is low - prep work first',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  // Optimal timing suggestions
  if (userState.optimalCommunicationWindow) {
    triggers.push({
      type: 'reminder',
      message: `Best communication window: ${userState.optimalCommunicationWindow}`,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  return triggers;
}
