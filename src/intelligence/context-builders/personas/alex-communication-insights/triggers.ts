/**
 * Proactive trigger detection for Alex's communication insights.
 *
 * Cross-Domain Integration:
 * - CEO Coaching: Surfaces blockers that need communication to resolve
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
import type { CEOBlocker } from '../../../../tools/domains/ceo-coaching/types.js';

// ============================================================================
// CEO COACHING INTEGRATION - Blockers needing communication
// ============================================================================

// Blocker keywords suggesting communication is needed
const COMMUNICATION_BLOCKER_PATTERNS = [
  /waiting on/i,
  /need.*from/i,
  /approval/i,
  /sign.*off/i,
  /feedback/i,
  /response/i,
  /meeting/i,
  /call/i,
  /email/i,
  /reach out/i,
  /follow up/i,
  /escalate/i,
  /clarif/i,
  /discuss/i,
  /alignment/i,
  /stakeholder/i,
  /decision.*from/i,
];

function needsCommunication(blocker: CEOBlocker): boolean {
  return COMMUNICATION_BLOCKER_PATTERNS.some((pattern) => pattern.test(blocker.text));
}

function getDaysOld(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Detect blockers that need communication to resolve.
 */
export function detectBlockerCommunicationNeeds(
  activeBlockers: CEOBlocker[] = []
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Find blockers that need communication
  const communicationBlockers = activeBlockers.filter(needsCommunication);

  for (const blocker of communicationBlockers.slice(0, 3)) {
    const daysOld = getDaysOld(blocker.createdAt);
    const priority = daysOld > 7 ? 'high' : daysOld > 3 ? 'medium' : 'low';

    triggers.push({
      type: 'coordination',
      message: `📞 BLOCKER (${daysOld}d): "${blocker.text}" - may need outreach to resolve`,
      priority,
      timing: daysOld > 7 ? 'immediate' : 'when_relevant',
    });
  }

  // Flag stale blockers needing escalation
  const staleBlockers = activeBlockers.filter((b) => getDaysOld(b.createdAt) > 14);
  if (staleBlockers.length > 0) {
    triggers.push({
      type: 'follow-up',
      message: `⚠️ ${staleBlockers.length} blocker(s) stale 14+ days - consider escalation`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  return triggers;
}

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

export function detectProactiveTriggers(
  userState: UserStateSnapshot,
  metrics: CommunicationMetrics,
  upcomingPriorities: UpcomingPriority[],
  communicationContext: CommunicationContext,
  activeBlockers: CEOBlocker[] = [] // Cross-Domain: CEO coaching blockers
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Cross-Domain: CEO Coaching blockers that need communication
  const blockerTriggers = detectBlockerCommunicationNeeds(activeBlockers);
  triggers.push(...blockerTriggers);

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
