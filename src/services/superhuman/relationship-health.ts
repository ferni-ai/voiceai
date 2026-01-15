/**
 * Relationship Health Service
 *
 * Phase 15: Relationship Health Dashboard
 *
 * "Better Than Human" feature: Track relationship health over time
 * and proactively surface when relationships need attention.
 *
 * Features:
 * - Relationship health scores
 * - Drift detection (decreasing contact/mentions)
 * - Proactive nudges for neglected relationships
 * - Celebration of relationship milestones
 *
 * @module services/superhuman/relationship-health
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RelationshipHealth' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Relationship health score
 */
export interface RelationshipHealth {
  /** Person ID */
  personId: string;
  /** Person's name */
  name: string;
  /** Relationship type */
  relationshipType: RelationshipType;
  /** Overall health score (0-100) */
  healthScore: number;
  /** Health trend */
  trend: HealthTrend;
  /** Last interaction date */
  lastInteraction?: Date;
  /** Days since last mention */
  daysSinceLastMention: number;
  /** Interaction frequency (mentions per week) */
  interactionFrequency: number;
  /** Emotional sentiment trend */
  sentimentTrend: SentimentTrend;
  /** Risk level for drift */
  driftRisk: DriftRisk;
  /** Suggested actions */
  suggestedActions: SuggestedAction[];
  /** Health factors breakdown */
  healthFactors: HealthFactors;
}

/**
 * Relationship types
 */
export type RelationshipType =
  | 'family'
  | 'friend'
  | 'romantic'
  | 'colleague'
  | 'mentor'
  | 'other';

/**
 * Health trend direction
 */
export type HealthTrend = 'improving' | 'stable' | 'declining';

/**
 * Sentiment trend
 */
export type SentimentTrend = 'positive' | 'neutral' | 'negative' | 'mixed';

/**
 * Drift risk level
 */
export type DriftRisk = 'low' | 'medium' | 'high' | 'critical';

/**
 * Suggested action for relationship health
 */
export interface SuggestedAction {
  /** Action type */
  type: 'reach_out' | 'check_in' | 'celebrate' | 'reflect' | 'reconnect';
  /** Priority (1-100) */
  priority: number;
  /** Human-readable suggestion */
  suggestion: string;
  /** Reason for suggestion */
  reason: string;
}

/**
 * Health factors breakdown
 */
export interface HealthFactors {
  /** Recency score (0-1) */
  recency: number;
  /** Frequency score (0-1) */
  frequency: number;
  /** Sentiment score (0-1) */
  sentiment: number;
  /** Depth score (emotional depth of conversations) */
  depth: number;
  /** Balance score (bidirectional vs one-sided) */
  balance: number;
}

/**
 * Relationship interaction record
 */
export interface RelationshipInteraction {
  /** Interaction ID */
  id: string;
  /** Person ID */
  personId: string;
  /** Timestamp */
  timestamp: Date;
  /** Sentiment (-1 to 1) */
  sentiment: number;
  /** Topic of discussion */
  topic?: string;
  /** Emotional intensity (0-1) */
  emotionalIntensity: number;
  /** Whether user initiated */
  userInitiated: boolean;
}

/**
 * Drift alert for a relationship
 */
export interface DriftAlert {
  /** Person ID */
  personId: string;
  /** Person's name */
  name: string;
  /** Alert type */
  alertType: 'drift_detected' | 'drift_warning' | 'reconnect_opportunity';
  /** Alert message */
  message: string;
  /** Priority (1-100) */
  priority: number;
  /** Days since last mention */
  daysSinceLastMention: number;
  /** Suggested action */
  suggestedAction: SuggestedAction;
  /** Created timestamp */
  createdAt: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface RelationshipHealthConfig {
  /** Days threshold for drift warning */
  driftWarningDays: Record<RelationshipType, number>;
  /** Days threshold for critical drift */
  criticalDriftDays: Record<RelationshipType, number>;
  /** Minimum interactions to establish baseline */
  minInteractionsForBaseline: number;
  /** Health score weights */
  healthWeights: {
    recency: number;
    frequency: number;
    sentiment: number;
    depth: number;
    balance: number;
  };
}

const DEFAULT_CONFIG: RelationshipHealthConfig = {
  driftWarningDays: {
    family: 14,
    friend: 21,
    romantic: 3,
    colleague: 30,
    mentor: 45,
    other: 30,
  },
  criticalDriftDays: {
    family: 30,
    friend: 45,
    romantic: 7,
    colleague: 60,
    mentor: 90,
    other: 60,
  },
  minInteractionsForBaseline: 3,
  healthWeights: {
    recency: 0.25,
    frequency: 0.2,
    sentiment: 0.25,
    depth: 0.15,
    balance: 0.15,
  },
};

let config: RelationshipHealthConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setRelationshipHealthConfig(newConfig: Partial<RelationshipHealthConfig>): void {
  config = {
    ...config,
    ...newConfig,
    driftWarningDays: { ...config.driftWarningDays, ...(newConfig.driftWarningDays || {}) },
    criticalDriftDays: { ...config.criticalDriftDays, ...(newConfig.criticalDriftDays || {}) },
    healthWeights: { ...config.healthWeights, ...(newConfig.healthWeights || {}) },
  };
}

/**
 * Get current configuration
 */
export function getRelationshipHealthConfig(): RelationshipHealthConfig {
  return { ...config };
}

// ============================================================================
// HEALTH CALCULATION
// ============================================================================

/**
 * Calculate relationship health score
 */
export function calculateRelationshipHealth(
  personId: string,
  name: string,
  relationshipType: RelationshipType,
  interactions: RelationshipInteraction[]
): RelationshipHealth {
  // Calculate health factors
  const healthFactors = calculateHealthFactors(interactions, relationshipType);

  // Calculate weighted health score
  const healthScore = Math.round(
    (healthFactors.recency * config.healthWeights.recency +
      healthFactors.frequency * config.healthWeights.frequency +
      healthFactors.sentiment * config.healthWeights.sentiment +
      healthFactors.depth * config.healthWeights.depth +
      healthFactors.balance * config.healthWeights.balance) *
      100
  );

  // Determine trend
  const trend = calculateTrend(interactions);

  // Determine sentiment trend
  const sentimentTrend = calculateSentimentTrend(interactions);

  // Calculate days since last mention
  const lastInteraction = interactions.length > 0
    ? new Date(Math.max(...interactions.map((i) => i.timestamp.getTime())))
    : undefined;
  const daysSinceLastMention = lastInteraction
    ? Math.floor((Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Calculate interaction frequency
  const interactionFrequency = calculateFrequency(interactions);

  // Determine drift risk
  const driftRisk = calculateDriftRisk(
    daysSinceLastMention,
    relationshipType,
    trend
  );

  // Generate suggested actions
  const suggestedActions = generateSuggestedActions(
    personId,
    name,
    healthScore,
    driftRisk,
    daysSinceLastMention,
    sentimentTrend
  );

  return {
    personId,
    name,
    relationshipType,
    healthScore,
    trend,
    lastInteraction,
    daysSinceLastMention,
    interactionFrequency,
    sentimentTrend,
    driftRisk,
    suggestedActions,
    healthFactors,
  };
}

/**
 * Calculate health factors from interactions
 */
function calculateHealthFactors(
  interactions: RelationshipInteraction[],
  relationshipType: RelationshipType
): HealthFactors {
  if (interactions.length === 0) {
    return {
      recency: 0,
      frequency: 0,
      sentiment: 0.5,
      depth: 0,
      balance: 0.5,
    };
  }

  // Recency (how recent was last interaction)
  const lastInteraction = Math.max(...interactions.map((i) => i.timestamp.getTime()));
  const daysSince = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24);
  const expectedDays = config.driftWarningDays[relationshipType];
  const recency = Math.max(0, 1 - daysSince / (expectedDays * 2));

  // Frequency (interactions per week, normalized)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentInteractions = interactions.filter((i) => i.timestamp.getTime() > thirtyDaysAgo);
  const weeklyFrequency = (recentInteractions.length / 30) * 7;
  const frequency = Math.min(1, weeklyFrequency / 2); // 2 per week = max

  // Sentiment (average sentiment)
  const avgSentiment = interactions.reduce((sum, i) => sum + i.sentiment, 0) / interactions.length;
  const sentiment = (avgSentiment + 1) / 2; // Normalize to 0-1

  // Depth (average emotional intensity)
  const depth = interactions.reduce((sum, i) => sum + i.emotionalIntensity, 0) / interactions.length;

  // Balance (user-initiated vs passive mentions)
  const userInitiated = interactions.filter((i) => i.userInitiated).length;
  const balance = Math.abs(0.5 - userInitiated / interactions.length) < 0.3 ? 1 : 0.5;

  return { recency, frequency, sentiment, depth, balance };
}

/**
 * Calculate health trend
 */
function calculateTrend(interactions: RelationshipInteraction[]): HealthTrend {
  if (interactions.length < 4) return 'stable';

  const sorted = [...interactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Compare frequency
  const firstFrequency = firstHalf.length;
  const secondFrequency = secondHalf.length;

  const frequencyChange = (secondFrequency - firstFrequency) / firstFrequency;

  if (frequencyChange > 0.2) return 'improving';
  if (frequencyChange < -0.2) return 'declining';
  return 'stable';
}

/**
 * Calculate sentiment trend
 */
function calculateSentimentTrend(interactions: RelationshipInteraction[]): SentimentTrend {
  if (interactions.length === 0) return 'neutral';

  const avgSentiment = interactions.reduce((sum, i) => sum + i.sentiment, 0) / interactions.length;
  const variance =
    interactions.reduce((sum, i) => sum + Math.pow(i.sentiment - avgSentiment, 2), 0) /
    interactions.length;

  if (variance > 0.5) return 'mixed';
  if (avgSentiment > 0.3) return 'positive';
  if (avgSentiment < -0.3) return 'negative';
  return 'neutral';
}

/**
 * Calculate interaction frequency (per week)
 */
function calculateFrequency(interactions: RelationshipInteraction[]): number {
  if (interactions.length === 0) return 0;

  const firstInteraction = Math.min(...interactions.map((i) => i.timestamp.getTime()));
  const lastInteraction = Math.max(...interactions.map((i) => i.timestamp.getTime()));
  const weeks = (lastInteraction - firstInteraction) / (1000 * 60 * 60 * 24 * 7);

  return weeks > 0 ? interactions.length / weeks : interactions.length;
}

// ============================================================================
// DRIFT DETECTION
// ============================================================================

/**
 * Calculate drift risk level
 */
function calculateDriftRisk(
  daysSinceLastMention: number,
  relationshipType: RelationshipType,
  trend: HealthTrend
): DriftRisk {
  const warningDays = config.driftWarningDays[relationshipType];
  const criticalDays = config.criticalDriftDays[relationshipType];

  if (daysSinceLastMention >= criticalDays) {
    return 'critical';
  }

  if (daysSinceLastMention >= warningDays) {
    // Declining trend makes it worse
    return trend === 'declining' ? 'high' : 'medium';
  }

  if (daysSinceLastMention >= warningDays * 0.7 && trend === 'declining') {
    return 'medium';
  }

  return 'low';
}

/**
 * Get drift alerts for a user's relationships
 */
export function getDriftAlerts(
  relationships: RelationshipHealth[]
): DriftAlert[] {
  const alerts: DriftAlert[] = [];

  for (const rel of relationships) {
    if (rel.driftRisk === 'critical' || rel.driftRisk === 'high') {
      alerts.push({
        personId: rel.personId,
        name: rel.name,
        alertType: rel.driftRisk === 'critical' ? 'drift_detected' : 'drift_warning',
        message: generateDriftMessage(rel),
        priority: rel.driftRisk === 'critical' ? 90 : 70,
        daysSinceLastMention: rel.daysSinceLastMention,
        suggestedAction: rel.suggestedActions[0] || {
          type: 'reach_out',
          priority: 80,
          suggestion: `Consider reaching out to ${rel.name}`,
          reason: 'Relationship drift detected',
        },
        createdAt: new Date(),
      });
    }
  }

  // Sort by priority
  alerts.sort((a, b) => b.priority - a.priority);

  return alerts;
}

/**
 * Generate drift message
 */
function generateDriftMessage(rel: RelationshipHealth): string {
  if (rel.driftRisk === 'critical') {
    return `It's been ${rel.daysSinceLastMention} days since you mentioned ${rel.name}. ` +
      `Would you like to reconnect?`;
  }

  if (rel.trend === 'declining') {
    return `You've been mentioning ${rel.name} less frequently lately. ` +
      `Everything okay there?`;
  }

  return `It's been a while since you talked about ${rel.name}. ` +
    `Might be nice to check in.`;
}

// ============================================================================
// SUGGESTED ACTIONS
// ============================================================================

/**
 * Generate suggested actions for relationship health
 */
function generateSuggestedActions(
  personId: string,
  name: string,
  healthScore: number,
  driftRisk: DriftRisk,
  daysSinceLastMention: number,
  sentimentTrend: SentimentTrend
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Critical drift - urgent reconnect
  if (driftRisk === 'critical') {
    actions.push({
      type: 'reconnect',
      priority: 95,
      suggestion: `Reach out to ${name} soon - it's been ${daysSinceLastMention} days`,
      reason: 'Critical relationship drift detected',
    });
  }

  // High drift - encourage reach out
  if (driftRisk === 'high') {
    actions.push({
      type: 'reach_out',
      priority: 80,
      suggestion: `Consider checking in with ${name}`,
      reason: 'Relationship showing signs of drift',
    });
  }

  // Negative sentiment trend - reflect
  if (sentimentTrend === 'negative') {
    actions.push({
      type: 'reflect',
      priority: 70,
      suggestion: `Your conversations about ${name} have been challenging lately. Want to talk about it?`,
      reason: 'Negative sentiment detected in relationship',
    });
  }

  // Good health - celebrate
  if (healthScore >= 80 && driftRisk === 'low') {
    actions.push({
      type: 'celebrate',
      priority: 40,
      suggestion: `Your relationship with ${name} seems healthy!`,
      reason: 'Strong relationship health',
    });
  }

  // Medium health - check in
  if (healthScore >= 50 && healthScore < 70 && driftRisk === 'low') {
    actions.push({
      type: 'check_in',
      priority: 50,
      suggestion: `How are things going with ${name}?`,
      reason: 'Regular check-in for relationship maintenance',
    });
  }

  return actions.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Calculate health for all relationships
 */
export function calculateAllRelationshipHealth(
  relationships: Array<{
    personId: string;
    name: string;
    relationshipType: RelationshipType;
    interactions: RelationshipInteraction[];
  }>
): RelationshipHealth[] {
  return relationships.map((r) =>
    calculateRelationshipHealth(r.personId, r.name, r.relationshipType, r.interactions)
  );
}

/**
 * Get relationships sorted by health priority
 */
export function getRelationshipsByHealthPriority(
  relationships: RelationshipHealth[]
): RelationshipHealth[] {
  return [...relationships].sort((a, b) => {
    // Critical drift first
    const driftOrder: Record<DriftRisk, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const driftDiff = driftOrder[a.driftRisk] - driftOrder[b.driftRisk];
    if (driftDiff !== 0) return driftDiff;

    // Then by health score (lower = needs more attention)
    return a.healthScore - b.healthScore;
  });
}

// ============================================================================
// OBSERVABILITY
// ============================================================================

/**
 * Get relationship health stats for observability
 */
export function getRelationshipHealthStats(
  relationships: RelationshipHealth[]
): {
  total: number;
  byDriftRisk: Record<DriftRisk, number>;
  byTrend: Record<HealthTrend, number>;
  averageHealth: number;
  alertCount: number;
} {
  const byDriftRisk: Record<DriftRisk, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const byTrend: Record<HealthTrend, number> = {
    improving: 0,
    stable: 0,
    declining: 0,
  };

  let totalHealth = 0;

  for (const rel of relationships) {
    byDriftRisk[rel.driftRisk]++;
    byTrend[rel.trend]++;
    totalHealth += rel.healthScore;
  }

  const alerts = getDriftAlerts(relationships);

  return {
    total: relationships.length,
    byDriftRisk,
    byTrend,
    averageHealth: relationships.length > 0 ? totalHealth / relationships.length : 0,
    alertCount: alerts.length,
  };
}
