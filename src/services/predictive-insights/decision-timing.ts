/**
 * Decision Timing Optimizer
 *
 * > "You've been mulling over the job change for 6 weeks now.
 * > Your best decisions historically happen after you sleep on them twice.
 * > This one might be ready."
 *
 * Tracks decision incubation periods to predict when
 * a decision is "ready" to be made.
 *
 * Signals:
 * - Time since first mention
 * - Mention frequency
 * - Sentiment stability
 * - Pro/con exploration completeness
 * - Historical decision patterns
 *
 * @module PredictiveInsights/DecisionTiming
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { HistoricalDecisionPattern } from './types.js';

const log = createLogger({ module: 'DecisionTiming' });

// ============================================================================
// TYPES
// ============================================================================

export interface DecisionReadiness {
  userId: string;
  decisionId: string;
  topic: string;

  /** Is the decision ready to be made */
  isReady: boolean;

  /** Days spent mulling this over */
  incubationDays: number;

  /** Number of times mentioned */
  mentionCount: number;

  /** Has sentiment stabilized */
  sentimentStability: number; // 0-1, higher = more stable

  /** Historical pattern for this user */
  historicalPattern?: HistoricalDecisionPattern;

  /** Human-friendly message */
  message: string;

  /** Suggestion */
  suggestion: string;

  /** Confidence in this assessment (0-1) */
  confidence: number;

  /** Should surface */
  shouldSurface: boolean;
}

interface DecisionMention {
  timestamp: Date;
  sentiment: number; // -1 to 1
  themes: string[];
  consideredOptions: string[];
  expressedConcerns: string[];
}

interface TrackedDecision {
  id: string;
  topic: string;
  category: 'career' | 'relationship' | 'financial' | 'health' | 'lifestyle' | 'other';
  firstMentioned: Date;
  mentions: DecisionMention[];
  resolved: boolean;
  resolvedAt?: Date;
  outcome?: 'positive' | 'negative' | 'neutral';
}

interface UserDecisionProfile {
  userId: string;
  activeDecisions: Map<string, TrackedDecision>;
  historicalDecisions: TrackedDecision[];
  avgIncubationDays: number;
  avgMentionsBeforeDecision: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const userDecisionProfiles = new Map<string, UserDecisionProfile>();

// ============================================================================
// MAIN ASSESSMENT FUNCTION
// ============================================================================

/**
 * Assess readiness of all pending decisions for a user
 */
export async function assessDecisionReadiness(
  userId: string
): Promise<DecisionReadiness[]> {
  const profile = userDecisionProfiles.get(userId);
  if (!profile || profile.activeDecisions.size === 0) {
    return [];
  }

  const assessments: DecisionReadiness[] = [];

  for (const [decisionId, decision] of profile.activeDecisions) {
    const assessment = assessSingleDecision(userId, decision, profile);
    if (assessment) {
      assessments.push(assessment);
    }
  }

  return assessments;
}

function assessSingleDecision(
  userId: string,
  decision: TrackedDecision,
  profile: UserDecisionProfile
): DecisionReadiness | null {
  const { mentions, topic, id } = decision;

  // Need at least 2 mentions to assess
  if (mentions.length < 2) {
    return null;
  }

  // Calculate incubation time
  const incubationDays = Math.floor(
    (Date.now() - decision.firstMentioned.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Calculate mention frequency
  const mentionCount = mentions.length;

  // Calculate sentiment stability
  const sentimentStability = calculateSentimentStability(mentions);

  // Get historical pattern
  const historicalPattern = getHistoricalPattern(profile);

  // Determine if decision is ready
  const { isReady, readinessScore } = calculateReadiness(
    incubationDays,
    mentionCount,
    sentimentStability,
    historicalPattern,
    mentions
  );

  // Generate message
  const { message, suggestion } = generateDecisionMessage(
    topic,
    isReady,
    incubationDays,
    mentionCount,
    historicalPattern
  );

  // Calculate confidence
  const confidence = calculateConfidence(
    mentions.length,
    profile.historicalDecisions.length,
    sentimentStability
  );

  // Should surface if decision seems ready or has been pending too long
  const shouldSurface =
    (isReady && confidence >= 0.5) ||
    (incubationDays > 30 && mentionCount >= 5);

  return {
    userId,
    decisionId: id,
    topic,
    isReady,
    incubationDays,
    mentionCount,
    sentimentStability,
    historicalPattern,
    message,
    suggestion,
    confidence,
    shouldSurface,
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function calculateSentimentStability(mentions: DecisionMention[]): number {
  if (mentions.length < 3) return 0.5;

  // Get recent mentions
  const recent = mentions.slice(-5);
  const sentiments = recent.map((m) => m.sentiment);

  // Calculate variance
  const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const variance =
    sentiments.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / sentiments.length;

  // Lower variance = higher stability
  // Variance of 0 = stability of 1
  // Variance of 1 = stability of 0
  return Math.max(0, 1 - Math.sqrt(variance));
}

function getHistoricalPattern(
  profile: UserDecisionProfile
): HistoricalDecisionPattern | undefined {
  const resolved = profile.historicalDecisions.filter((d) => d.resolved);

  if (resolved.length < 3) return undefined;

  const incubationDays = resolved.map((d) => {
    const resolved = d.resolvedAt || d.mentions[d.mentions.length - 1]?.timestamp;
    if (!resolved) return 0;
    return (resolved.getTime() - d.firstMentioned.getTime()) / (24 * 60 * 60 * 1000);
  });

  const mentionCounts = resolved.map((d) => d.mentions.length);

  // Find successful decisions
  const successful = resolved.filter((d) => d.outcome === 'positive');
  const bestConditions: string[] = [];

  if (successful.length > 0) {
    // What did successful decisions have in common?
    const avgSuccessIncubation =
      successful.reduce((sum, d) => {
        const resolved = d.resolvedAt || d.mentions[d.mentions.length - 1]?.timestamp;
        if (!resolved) return sum;
        return sum + (resolved.getTime() - d.firstMentioned.getTime()) / (24 * 60 * 60 * 1000);
      }, 0) / successful.length;

    if (avgSuccessIncubation > 7) {
      bestConditions.push('Slept on it multiple nights');
    }
    if (avgSuccessIncubation > 14) {
      bestConditions.push('Took at least 2 weeks to decide');
    }

    const avgSuccessMentions =
      successful.reduce((sum, d) => sum + d.mentions.length, 0) / successful.length;
    if (avgSuccessMentions > 5) {
      bestConditions.push('Talked it through extensively');
    }
  }

  return {
    avgIncubationDays:
      incubationDays.reduce((a, b) => a + b, 0) / incubationDays.length,
    optimalMentionCount: Math.round(
      mentionCounts.reduce((a, b) => a + b, 0) / mentionCounts.length
    ),
    bestOutcomeConditions: bestConditions,
  };
}

function calculateReadiness(
  incubationDays: number,
  mentionCount: number,
  sentimentStability: number,
  historicalPattern: HistoricalDecisionPattern | undefined,
  mentions: DecisionMention[]
): { isReady: boolean; readinessScore: number } {
  let score = 0;

  // Factor 1: Incubation time (max 30 points)
  if (historicalPattern) {
    const timeRatio = incubationDays / historicalPattern.avgIncubationDays;
    if (timeRatio >= 1) score += 30;
    else if (timeRatio >= 0.7) score += 20;
    else if (timeRatio >= 0.5) score += 10;
  } else {
    // Default: decisions need at least a few days
    if (incubationDays >= 7) score += 30;
    else if (incubationDays >= 3) score += 20;
    else if (incubationDays >= 1) score += 10;
  }

  // Factor 2: Mention count (max 25 points)
  if (historicalPattern) {
    const mentionRatio = mentionCount / historicalPattern.optimalMentionCount;
    if (mentionRatio >= 1) score += 25;
    else if (mentionRatio >= 0.7) score += 15;
  } else {
    if (mentionCount >= 5) score += 25;
    else if (mentionCount >= 3) score += 15;
  }

  // Factor 3: Sentiment stability (max 25 points)
  score += sentimentStability * 25;

  // Factor 4: Options explored (max 20 points)
  const uniqueOptions = new Set<string>();
  const uniqueConcerns = new Set<string>();
  for (const m of mentions) {
    m.consideredOptions.forEach((o) => uniqueOptions.add(o));
    m.expressedConcerns.forEach((c) => uniqueConcerns.add(c));
  }

  if (uniqueOptions.size >= 2 && uniqueConcerns.size >= 1) {
    score += 20; // Both pros and cons considered
  } else if (uniqueOptions.size >= 1 || uniqueConcerns.size >= 1) {
    score += 10;
  }

  const isReady = score >= 70;
  return { isReady, readinessScore: score };
}

function generateDecisionMessage(
  topic: string,
  isReady: boolean,
  incubationDays: number,
  mentionCount: number,
  pattern?: HistoricalDecisionPattern
): { message: string; suggestion: string } {
  let message = '';
  let suggestion = '';

  if (isReady) {
    message = `You've been mulling over "${topic}" for ${incubationDays} days now.`;
    if (pattern && pattern.bestOutcomeConditions.length > 0) {
      message += ` Your best decisions typically happen when you've ${pattern.bestOutcomeConditions[0].toLowerCase()}.`;
    }
    message += ' This one might be ready.';
    suggestion = "Want to talk through the final decision?";
  } else if (incubationDays > 30) {
    message = `"${topic}" has been on your mind for over a month. That's a long time to carry uncertainty.`;
    suggestion = "Sometimes decisions need a deadline. Want to set one?";
  } else if (mentionCount >= 5 && incubationDays < 7) {
    message = `You've mentioned "${topic}" ${mentionCount} times this week. It's clearly on your mind.`;
    suggestion = "But maybe give it a few more days to settle. Your best decisions aren't rushed.";
  } else {
    message = `"${topic}" is still percolating. ${mentionCount} mentions over ${incubationDays} days.`;
    suggestion = "Keep thinking. I'm here when you're ready to decide.";
  }

  return { message, suggestion };
}

function calculateConfidence(
  mentionCount: number,
  historicalCount: number,
  stability: number
): number {
  let confidence = 0.3;

  if (mentionCount >= 5) confidence += 0.2;
  if (historicalCount >= 5) confidence += 0.2;
  if (stability >= 0.7) confidence += 0.2;

  return Math.min(confidence, 0.9);
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record a decision mention
 */
export function recordDecisionMention(
  userId: string,
  topic: string,
  category: TrackedDecision['category'],
  sentiment: number,
  themes: string[] = [],
  consideredOptions: string[] = [],
  expressedConcerns: string[] = []
): void {
  let profile = userDecisionProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      activeDecisions: new Map(),
      historicalDecisions: [],
      avgIncubationDays: 7,
      avgMentionsBeforeDecision: 5,
    };
    userDecisionProfiles.set(userId, profile);
  }

  const decisionId = topic.toLowerCase().replace(/\s+/g, '_').slice(0, 50);
  let decision = profile.activeDecisions.get(decisionId);

  if (!decision) {
    decision = {
      id: decisionId,
      topic,
      category,
      firstMentioned: new Date(),
      mentions: [],
      resolved: false,
    };
    profile.activeDecisions.set(decisionId, decision);
  }

  decision.mentions.push({
    timestamp: new Date(),
    sentiment,
    themes,
    consideredOptions,
    expressedConcerns,
  });

  log.debug({ userId, topic, mentionCount: decision.mentions.length }, 'Recorded decision mention');
}

/**
 * Mark a decision as resolved
 */
export function resolveDecision(
  userId: string,
  topic: string,
  outcome: 'positive' | 'negative' | 'neutral'
): void {
  const profile = userDecisionProfiles.get(userId);
  if (!profile) return;

  const decisionId = topic.toLowerCase().replace(/\s+/g, '_').slice(0, 50);
  const decision = profile.activeDecisions.get(decisionId);

  if (!decision) return;

  decision.resolved = true;
  decision.resolvedAt = new Date();
  decision.outcome = outcome;

  // Move to historical
  profile.historicalDecisions.push(decision);
  profile.activeDecisions.delete(decisionId);

  // Update averages
  if (profile.historicalDecisions.length > 0) {
    const resolved = profile.historicalDecisions;
    profile.avgIncubationDays =
      resolved.reduce((sum, d) => {
        const resDate = d.resolvedAt || d.mentions[d.mentions.length - 1]?.timestamp;
        if (!resDate) return sum;
        return sum + (resDate.getTime() - d.firstMentioned.getTime()) / (24 * 60 * 60 * 1000);
      }, 0) / resolved.length;

    profile.avgMentionsBeforeDecision =
      resolved.reduce((sum, d) => sum + d.mentions.length, 0) / resolved.length;
  }

  log.info({ userId, topic, outcome }, 'Decision resolved');
}

/**
 * Get active decisions for a user
 */
export function getActiveDecisions(userId: string): string[] {
  const profile = userDecisionProfiles.get(userId);
  if (!profile) return [];
  return Array.from(profile.activeDecisions.values()).map((d) => d.topic);
}

/**
 * Clear decision data for a user
 */
export function clearDecisionData(userId: string): void {
  userDecisionProfiles.delete(userId);
}

export default {
  assessDecisionReadiness,
  recordDecisionMention,
  resolveDecision,
  getActiveDecisions,
  clearDecisionData,
};
