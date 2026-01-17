/**
 * Graph-Aware Timing Intelligence
 *
 * Uses relationship graph data from semantic intelligence to optimize
 * outreach timing and prioritization.
 *
 * - Strained relationships → more urgent outreach
 * - Low social health → reach out sooner
 * - Recent positive interactions → can wait longer
 *
 * @module services/outreach/graph-timing-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GraphTimingIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipNode {
  id: string;
  name: string;
  relationship: string; // 'friend', 'family', 'partner', 'colleague'
  health: 'thriving' | 'healthy' | 'neutral' | 'strained' | 'declining';
  lastMentionedDays: number;
  emotionalValence: number; // -1 to 1 (negative to positive)
  importance: number; // 0 to 1
}

export interface RelationshipGraph {
  nodes: RelationshipNode[];
  averageHealth: number;
  isolationRisk: number; // 0 to 1
  lastUpdated: string;
}

export interface OutreachTrigger {
  userId: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: {
    personMentioned?: string;
    relationshipType?: string;
    [key: string]: unknown;
  };
}

export interface TimingAdjustment {
  urgencyMultiplier: number; // 1.0 = normal, >1 = sooner, <1 = later
  reason: string;
  suggestedPersonaId?: string;
  additionalContext?: string;
}

// ============================================================================
// TIMING ADJUSTMENT FUNCTIONS
// ============================================================================

/**
 * Get timing adjustment based on relationship graph
 */
export function getGraphAwareTimingAdjustment(
  graph: RelationshipGraph,
  trigger: OutreachTrigger
): TimingAdjustment {
  // Default - no adjustment
  let adjustment: TimingAdjustment = {
    urgencyMultiplier: 1.0,
    reason: 'Standard timing',
  };

  // If outreach is about a specific person, check relationship health
  if (trigger.metadata?.personMentioned) {
    const person = graph.nodes.find(
      (n) => n.name.toLowerCase() === trigger.metadata?.personMentioned?.toLowerCase()
    );

    if (person) {
      adjustment = getPersonSpecificAdjustment(person, trigger);
    }
  }

  // Check overall social health
  const socialHealthAdjustment = getSocialHealthAdjustment(graph);

  // Use the more urgent of the two
  if (socialHealthAdjustment.urgencyMultiplier > adjustment.urgencyMultiplier) {
    adjustment = {
      ...socialHealthAdjustment,
      reason: `${adjustment.reason}; ${socialHealthAdjustment.reason}`,
    };
  }

  log.debug(
    {
      userId: trigger.userId,
      urgencyMultiplier: adjustment.urgencyMultiplier,
      reason: adjustment.reason,
    },
    '📊 Graph timing adjustment calculated'
  );

  return adjustment;
}

/**
 * Get adjustment for a specific mentioned person
 */
function getPersonSpecificAdjustment(
  person: RelationshipNode,
  trigger: OutreachTrigger
): TimingAdjustment {
  // Strained or declining relationship → more urgent
  if (person.health === 'strained' || person.health === 'declining') {
    return {
      urgencyMultiplier: 1.5,
      reason: `Relationship with ${person.name} is ${person.health}`,
      additionalContext: `Consider acknowledging the difficulty with ${person.name}`,
    };
  }

  // Important relationship not mentioned in a while → nudge sooner
  if (person.importance > 0.7 && person.lastMentionedDays > 14) {
    return {
      urgencyMultiplier: 1.2,
      reason: `Important person ${person.name} not discussed in ${person.lastMentionedDays} days`,
    };
  }

  // Negative emotional valence → reach out sooner
  if (person.emotionalValence < -0.3) {
    return {
      urgencyMultiplier: 1.3,
      reason: `Recent conversations about ${person.name} have been difficult`,
    };
  }

  // Thriving relationship → can wait
  if (person.health === 'thriving') {
    return {
      urgencyMultiplier: 0.8,
      reason: `Relationship with ${person.name} is healthy`,
    };
  }

  return {
    urgencyMultiplier: 1.0,
    reason: `Standard timing for ${person.name}`,
  };
}

/**
 * Get adjustment based on overall social health
 */
function getSocialHealthAdjustment(graph: RelationshipGraph): TimingAdjustment {
  // High isolation risk → reach out sooner
  if (graph.isolationRisk > 0.7) {
    return {
      urgencyMultiplier: 1.5,
      reason: 'High isolation risk detected - user may be withdrawing',
      suggestedPersonaId: 'ferni',
      additionalContext: 'Prioritize connection and warmth',
    };
  }

  if (graph.isolationRisk > 0.5) {
    return {
      urgencyMultiplier: 1.3,
      reason: 'Elevated isolation risk',
    };
  }

  // Low average relationship health → more frequent check-ins
  if (graph.averageHealth < 0.4) {
    return {
      urgencyMultiplier: 1.3,
      reason: 'Overall relationship network health is low',
    };
  }

  // Healthy social network → standard timing
  return {
    urgencyMultiplier: 1.0,
    reason: 'Social health is stable',
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Calculate average relationship health (0-1)
 */
export function calculateAverageHealth(nodes: RelationshipNode[]): number {
  if (nodes.length === 0) return 0.5;

  const healthScores: Record<string, number> = {
    thriving: 1.0,
    healthy: 0.75,
    neutral: 0.5,
    strained: 0.25,
    declining: 0.0,
  };

  const totalScore = nodes.reduce((sum, node) => {
    return sum + (healthScores[node.health] ?? 0.5);
  }, 0);

  return totalScore / nodes.length;
}

/**
 * Calculate isolation risk (0-1)
 */
export function calculateIsolationRisk(nodes: RelationshipNode[]): number {
  if (nodes.length === 0) return 0.8; // No relationships = high isolation

  // Factors that increase isolation risk:
  // 1. Few relationships
  // 2. Long time since mentions
  // 3. Negative emotional valence
  // 4. Low importance (superficial relationships)

  const relationshipCountFactor = Math.max(0, 1 - nodes.length / 10); // Fewer than 10 relationships increases risk

  const recencyFactor =
    nodes.reduce((sum, node) => {
      // More than 30 days increases risk
      return sum + Math.min(1, node.lastMentionedDays / 30);
    }, 0) / nodes.length;

  const valenceFactor =
    nodes.reduce((sum, node) => {
      // Negative valence increases risk
      return sum + (1 - (node.emotionalValence + 1) / 2);
    }, 0) / nodes.length;

  const importanceFactor = 1 - nodes.reduce((sum, node) => sum + node.importance, 0) / nodes.length;

  // Weighted average
  const risk =
    relationshipCountFactor * 0.3 +
    recencyFactor * 0.25 +
    valenceFactor * 0.25 +
    importanceFactor * 0.2;

  return Math.min(1, Math.max(0, risk));
}

/**
 * Get people who might need attention
 */
export function getPeopleNeedingAttention(nodes: RelationshipNode[]): RelationshipNode[] {
  return nodes
    .filter((node) => {
      // Important person not mentioned in a while
      if (node.importance > 0.6 && node.lastMentionedDays > 14) return true;

      // Strained or declining relationship
      if (node.health === 'strained' || node.health === 'declining') return true;

      // Negative emotional valence
      if (node.emotionalValence < -0.3) return true;

      return false;
    })
    .sort((a, b) => {
      // Sort by urgency (importance * recency)
      const urgencyA = a.importance * (a.lastMentionedDays / 30);
      const urgencyB = b.importance * (b.lastMentionedDays / 30);
      return urgencyB - urgencyA;
    });
}

/**
 * Build a graph summary for logging/context
 */
export function buildGraphSummary(graph: RelationshipGraph): string {
  const healthyCount = graph.nodes.filter(
    (n) => n.health === 'thriving' || n.health === 'healthy'
  ).length;
  const strainedCount = graph.nodes.filter(
    (n) => n.health === 'strained' || n.health === 'declining'
  ).length;
  const needsAttention = getPeopleNeedingAttention(graph.nodes);

  let summary = `Social network: ${graph.nodes.length} relationships (${healthyCount} healthy, ${strainedCount} strained).`;

  if (graph.isolationRisk > 0.5) {
    summary += ` Isolation risk: ${Math.round(graph.isolationRisk * 100)}%.`;
  }

  if (needsAttention.length > 0) {
    summary += ` Needing attention: ${needsAttention
      .slice(0, 3)
      .map((n) => n.name)
      .join(', ')}.`;
  }

  return summary;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getGraphAwareTimingAdjustment,
  calculateAverageHealth,
  calculateIsolationRisk,
  getPeopleNeedingAttention,
  buildGraphSummary,
};
