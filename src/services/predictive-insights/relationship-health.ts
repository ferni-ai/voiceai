/**
 * Relationship Health Forecasting
 *
 * > "I've noticed your mentions of [partner] have shifted from 'we' to 'I' lately."
 *
 * Tracks sentiment and language patterns in how users talk about
 * key people in their lives to detect relationship strain early.
 *
 * Signals we track:
 * - Pronoun shifts (we→I, us→me)
 * - Sentiment trend over time
 * - Mention frequency changes
 * - Topic associations (what triggers mentions)
 * - Emotional tone when discussing the person
 *
 * @module PredictiveInsights/RelationshipHealth
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SentimentTrend, RelationshipSeverity, LanguageShift } from './types.js';

const log = createLogger({ module: 'RelationshipHealth' });

// ============================================================================
// TYPES
// ============================================================================

export interface RelationshipHealthAssessment {
  userId: string;
  relationshipId: string;
  personName: string;

  /** Overall sentiment trend */
  sentimentTrend: SentimentTrend;

  /** Detected language shifts */
  languageShift?: LanguageShift;

  /** Days since a clearly positive mention */
  daysSincePositiveMention: number;

  /** Human-friendly message */
  message: string;

  /** Suggested action */
  suggestion: string;

  /** How serious is this */
  severity: RelationshipSeverity;

  /** Confidence in assessment (0-1) */
  confidence: number;

  /** Should surface to user */
  shouldSurface: boolean;
}

interface RelationshipMention {
  timestamp: Date;
  sentiment: number; // -1 to 1
  pronouns: {
    we: number;
    i: number;
    they: number;
  };
  topics: string[];
  emotionalTone: string;
}

interface TrackedRelationship {
  id: string;
  personName: string;
  relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'other';
  mentions: RelationshipMention[];
  firstMentioned: Date;
  baselinePronounRatio?: number; // Historical we/(we+i) ratio
}

// ============================================================================
// STORAGE
// ============================================================================

const userRelationships = new Map<string, Map<string, TrackedRelationship>>();
const MAX_MENTIONS = 100;

// ============================================================================
// MAIN ASSESSMENT FUNCTION
// ============================================================================

/**
 * Assess health of all tracked relationships for a user
 */
export async function assessRelationshipHealth(
  userId: string
): Promise<RelationshipHealthAssessment[]> {
  const relationships = userRelationships.get(userId);
  if (!relationships || relationships.size === 0) {
    return [];
  }

  const assessments: RelationshipHealthAssessment[] = [];

  for (const [relId, relationship] of relationships) {
    const assessment = assessSingleRelationship(userId, relationship);
    if (assessment) {
      assessments.push(assessment);
    }
  }

  return assessments;
}

function assessSingleRelationship(
  userId: string,
  relationship: TrackedRelationship
): RelationshipHealthAssessment | null {
  const { mentions, personName, id } = relationship;

  // Need at least 5 mentions to assess
  if (mentions.length < 5) {
    return null;
  }

  // Get recent vs older mentions
  const recentMentions = mentions.slice(-10);
  const olderMentions = mentions.slice(0, -10);

  // Calculate sentiment trend
  const recentSentiment = avgSentiment(recentMentions);
  const olderSentiment = olderMentions.length > 0 ? avgSentiment(olderMentions) : recentSentiment;
  const sentimentTrend = calculateSentimentTrend(recentSentiment, olderSentiment);

  // Check for pronoun shifts
  const languageShift = detectLanguageShift(recentMentions, olderMentions, relationship);

  // Days since positive mention
  const daysSincePositiveMention = calculateDaysSincePositive(mentions);

  // Calculate severity
  const { severity, shouldSurface } = determineSeverity(
    sentimentTrend,
    languageShift,
    daysSincePositiveMention,
    relationship.relationshipType
  );

  // Skip if not worth surfacing
  if (!shouldSurface) {
    return null;
  }

  // Generate message
  const { message, suggestion } = generateRelationshipMessage(
    personName,
    sentimentTrend,
    languageShift,
    daysSincePositiveMention,
    severity
  );

  // Calculate confidence
  const confidence = calculateConfidence(mentions.length, sentimentTrend !== 'stable');

  return {
    userId,
    relationshipId: id,
    personName,
    sentimentTrend,
    languageShift,
    daysSincePositiveMention,
    message,
    suggestion,
    severity,
    confidence,
    shouldSurface,
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function avgSentiment(mentions: RelationshipMention[]): number {
  if (mentions.length === 0) return 0;
  return mentions.reduce((sum, m) => sum + m.sentiment, 0) / mentions.length;
}

function calculateSentimentTrend(recent: number, older: number): SentimentTrend {
  const diff = recent - older;

  if (diff > 0.2) return 'improving';
  if (diff < -0.2) return 'declining';

  // Check for volatility in recent mentions
  // For now, simplified
  return 'stable';
}

function detectLanguageShift(
  recent: RelationshipMention[],
  older: RelationshipMention[],
  relationship: TrackedRelationship
): LanguageShift | undefined {
  if (older.length < 5) return undefined;

  // Calculate pronoun ratios
  const recentWeRatio = calculateWeRatio(recent);
  const olderWeRatio = calculateWeRatio(older);

  // Use baseline if available
  const baseline = relationship.baselinePronounRatio ?? olderWeRatio;

  // Significant shift: >30% change in we-usage
  const shift = baseline - recentWeRatio;

  if (shift > 0.3) {
    return {
      from: 'we/us',
      to: 'I/me',
      frequency: recentWeRatio,
      significance: shift,
    };
  }

  return undefined;
}

function calculateWeRatio(mentions: RelationshipMention[]): number {
  let totalWe = 0;
  let totalI = 0;

  for (const m of mentions) {
    totalWe += m.pronouns.we;
    totalI += m.pronouns.i;
  }

  const total = totalWe + totalI;
  return total > 0 ? totalWe / total : 0.5;
}

function calculateDaysSincePositive(mentions: RelationshipMention[]): number {
  const now = Date.now();

  for (let i = mentions.length - 1; i >= 0; i--) {
    if (mentions[i].sentiment > 0.3) {
      return Math.floor((now - mentions[i].timestamp.getTime()) / (24 * 60 * 60 * 1000));
    }
  }

  // No positive mention found
  return mentions.length > 0
    ? Math.floor((now - mentions[0].timestamp.getTime()) / (24 * 60 * 60 * 1000))
    : 0;
}

function determineSeverity(
  trend: SentimentTrend,
  languageShift: LanguageShift | undefined,
  daysSincePositive: number,
  relationshipType: string
): { severity: RelationshipSeverity; shouldSurface: boolean } {
  let score = 0;

  // Sentiment trend
  if (trend === 'declining') score += 2;
  if (trend === 'volatile') score += 1;

  // Language shift
  if (languageShift && languageShift.significance > 0.4) score += 2;
  else if (languageShift) score += 1;

  // Days since positive
  if (daysSincePositive > 30) score += 2;
  else if (daysSincePositive > 14) score += 1;

  // Weight by relationship type
  const typeMultiplier =
    relationshipType === 'partner' ? 1.5 : relationshipType === 'family' ? 1.2 : 1.0;

  score *= typeMultiplier;

  // Determine severity
  let severity: RelationshipSeverity = 'watch';
  if (score >= 6) severity = 'urgent';
  else if (score >= 3) severity = 'concern';

  // Should surface if concerning
  const shouldSurface = severity !== 'watch' && score >= 2;

  return { severity, shouldSurface };
}

function generateRelationshipMessage(
  personName: string,
  trend: SentimentTrend,
  languageShift: LanguageShift | undefined,
  daysSincePositive: number,
  severity: RelationshipSeverity
): { message: string; suggestion: string } {
  let message = '';
  let suggestion = '';

  if (languageShift && languageShift.significance > 0.3) {
    message = `I've noticed your mentions of ${personName} have shifted from "we" to "I" lately. Sometimes that signals something brewing.`;
    suggestion = 'Want to talk about how things are going with them?';
  } else if (trend === 'declining') {
    message = `The way you talk about ${personName} seems different lately. There's been a subtle shift.`;
    suggestion = "I'm here if you want to unpack what's going on there.";
  } else if (daysSincePositive > 21) {
    message = `It's been a while since you mentioned something positive about ${personName}. Just noticing.`;
    suggestion = 'How are things between you two?';
  } else {
    message = `I've been tracking how you talk about ${personName}. Something feels a bit off.`;
    suggestion = 'Is there something on your mind about them?';
  }

  if (severity === 'urgent') {
    suggestion = `This seems important. Let's make some time to really talk about ${personName}.`;
  }

  return { message, suggestion };
}

function calculateConfidence(mentionCount: number, hasSignal: boolean): number {
  let confidence = 0.3;

  if (mentionCount >= 20) confidence += 0.3;
  else if (mentionCount >= 10) confidence += 0.2;

  if (hasSignal) confidence += 0.2;

  return Math.min(confidence, 0.9);
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record a mention of a person in conversation
 */
export function recordRelationshipMention(
  userId: string,
  personName: string,
  relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'other',
  sentiment: number,
  pronouns: { we: number; i: number; they: number },
  topics: string[] = [],
  emotionalTone = 'neutral'
): void {
  let userRels = userRelationships.get(userId);
  if (!userRels) {
    userRels = new Map();
    userRelationships.set(userId, userRels);
  }

  const relId = `${personName.toLowerCase().replace(/\s+/g, '_')}`;
  let relationship = userRels.get(relId);

  if (!relationship) {
    relationship = {
      id: relId,
      personName,
      relationshipType,
      mentions: [],
      firstMentioned: new Date(),
    };
    userRels.set(relId, relationship);
  }

  const mention: RelationshipMention = {
    timestamp: new Date(),
    sentiment,
    pronouns,
    topics,
    emotionalTone,
  };

  relationship.mentions.push(mention);

  // Keep bounded
  if (relationship.mentions.length > MAX_MENTIONS) {
    // Calculate baseline before trimming
    if (!relationship.baselinePronounRatio && relationship.mentions.length > 20) {
      relationship.baselinePronounRatio = calculateWeRatio(relationship.mentions.slice(0, 20));
    }
    relationship.mentions = relationship.mentions.slice(-MAX_MENTIONS);
  }

  log.debug({ userId, personName, sentiment }, 'Recorded relationship mention');
}

/**
 * Get tracked relationships for a user
 */
export function getTrackedRelationships(userId: string): string[] {
  const userRels = userRelationships.get(userId);
  if (!userRels) return [];
  return Array.from(userRels.values()).map((r) => r.personName);
}

/**
 * Clear relationship data for a user
 */
export function clearRelationshipData(userId: string): void {
  userRelationships.delete(userId);
}

export default {
  assessRelationshipHealth,
  recordRelationshipMention,
  getTrackedRelationships,
  clearRelationshipData,
};
