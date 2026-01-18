/**
 * Conversation Quality Scorer - Automated Session Quality Measurement
 *
 * Part of the "Better Than Human" automation layer.
 * Automatically scores each conversation after it ends to measure:
 * - User engagement (speaking ratio, questions asked)
 * - Emotional shift (did mood improve?)
 * - Actionable outcomes (commitments made, tasks created)
 * - Insight generation (new patterns discovered)
 * - Trust progression (did trust score improve?)
 *
 * These scores feed into learning loops to improve future conversations.
 *
 * @module services/automation/conversation-scorer
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'conversation-scorer' });

// ============================================================================
// Types
// ============================================================================

export interface ConversationMetrics {
  userEngagement: {
    speakingRatio: number;
    questionCount: number;
    averageResponseLength: number;
    initiatedTopics: number;
    deepDiveCount: number;
    silencePauses: number;
  };
  emotionalShift: {
    startMood: number;
    endMood: number;
    moodDelta: number;
    emotionalPeaks: number;
    emotionalValley: number;
    calmingMoments: number;
  };
  actionableOutcomes: {
    commitmentsCount: number;
    tasksCreated: number;
    goalsSet: number;
    decisionsClarity: number;
    nextStepsIdentified: number;
  };
  insightGeneration: {
    newPatternsDetected: number;
    connectionsFound: number;
    reframingMoments: number;
    ahaScore: number;
    memoryRetrievals: number;
  };
  trustProgression: {
    startTrustScore: number;
    endTrustScore: number;
    trustDelta: number;
    vulnerabilityShared: number;
    boundaryRespected: boolean;
    personalDisclosures: number;
  };
}

export interface ConversationScore {
  sessionId: string;
  userId: string;
  personaId: string;
  metrics: ConversationMetrics;
  scores: {
    engagement: number;
    emotionalImpact: number;
    outcomes: number;
    insights: number;
    trust: number;
    overall: number;
  };
  qualityTier: 'exceptional' | 'good' | 'average' | 'poor' | 'concerning';
  highlights: string[];
  improvementAreas: string[];
  sessionDuration: number;
  timestamp: string;
}

export interface QualityTrend {
  userId: string;
  period: 'week' | 'month' | 'quarter';
  averageScore: number;
  trend: 'improving' | 'stable' | 'declining';
  trendMagnitude: number;
  bestPersona: string;
  bestTimeOfDay: string;
  topHighlights: string[];
  persistentIssues: string[];
}

export interface SessionData {
  sessionId: string;
  userId: string;
  personaId: string;
  duration: number;
  turns: TurnData[];
  startMood?: number;
  endMood?: number;
  startTrust?: number;
  endTrust?: number;
  commitments?: string[];
  tasks?: string[];
  goals?: string[];
  patterns?: string[];
}

export interface TurnData {
  speaker: 'user' | 'agent';
  text: string;
  timestamp: string;
  sentiment?: number;
  isQuestion?: boolean;
  topics?: string[];
}

// ============================================================================
// Scoring Weights
// ============================================================================

const SCORE_WEIGHTS = {
  engagement: 0.2,
  emotionalImpact: 0.25,
  outcomes: 0.2,
  insights: 0.15,
  trust: 0.2,
};

const QUALITY_THRESHOLDS = {
  exceptional: 85,
  good: 70,
  average: 50,
  poor: 30,
};

// ============================================================================
// Core Functions
// ============================================================================

function calculateEngagementScore(engagement: ConversationMetrics['userEngagement']): number {
  let score = 0;

  // Speaking ratio: ideal is 40-60%
  const speakingScore = engagement.speakingRatio >= 0.3 && engagement.speakingRatio <= 0.7
    ? 100 - Math.abs(0.5 - engagement.speakingRatio) * 100
    : Math.max(0, 50 - Math.abs(0.5 - engagement.speakingRatio) * 100);
  score += speakingScore * 0.25;

  score += Math.min(engagement.questionCount / 10, 1) * 20;
  score += Math.min(engagement.initiatedTopics / 5, 1) * 15;
  score += Math.min(engagement.deepDiveCount / 3, 1) * 15;
  score -= Math.min(engagement.silencePauses * 5, 20);

  return Math.max(0, Math.min(100, score));
}

function calculateEmotionalScore(emotional: ConversationMetrics['emotionalShift']): number {
  let score = 50;
  score += emotional.moodDelta * 10;
  score += Math.min(emotional.emotionalPeaks * 5, 15);
  score += Math.min(emotional.calmingMoments * 8, 20);

  if (emotional.emotionalValley < 3 && emotional.endMood > emotional.emotionalValley + 2) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function calculateOutcomesScore(outcomes: ConversationMetrics['actionableOutcomes']): number {
  let score = 0;
  score += Math.min(outcomes.commitmentsCount * 15, 30);
  score += Math.min(outcomes.tasksCreated * 10, 20);
  score += Math.min(outcomes.goalsSet * 15, 20);
  score += outcomes.decisionsClarity * 2;
  score += Math.min(outcomes.nextStepsIdentified * 5, 15);
  return Math.max(0, Math.min(100, score));
}

function calculateInsightsScore(insights: ConversationMetrics['insightGeneration']): number {
  let score = 0;
  score += Math.min(insights.newPatternsDetected * 15, 30);
  score += Math.min(insights.connectionsFound * 10, 20);
  score += Math.min(insights.reframingMoments * 15, 25);
  score += insights.ahaScore * 2;
  score += Math.min(insights.memoryRetrievals * 5, 15);
  return Math.max(0, Math.min(100, score));
}

function calculateTrustScore(trust: ConversationMetrics['trustProgression']): number {
  let score = 50;
  score += trust.trustDelta * 0.5;
  score += Math.min(trust.vulnerabilityShared * 8, 25);
  score += Math.min(trust.personalDisclosures * 6, 20);
  if (!trust.boundaryRespected) score -= 30;
  return Math.max(0, Math.min(100, score));
}

function determineQualityTier(score: number): ConversationScore['qualityTier'] {
  if (score >= QUALITY_THRESHOLDS.exceptional) return 'exceptional';
  if (score >= QUALITY_THRESHOLDS.good) return 'good';
  if (score >= QUALITY_THRESHOLDS.average) return 'average';
  if (score >= QUALITY_THRESHOLDS.poor) return 'poor';
  return 'concerning';
}

function generateHighlights(metrics: ConversationMetrics, scores: ConversationScore['scores']): string[] {
  const highlights: string[] = [];

  if (metrics.emotionalShift.moodDelta >= 2) {
    highlights.push('Significant mood improvement');
  }
  if (metrics.actionableOutcomes.commitmentsCount >= 2) {
    highlights.push(`${metrics.actionableOutcomes.commitmentsCount} commitments captured`);
  }
  if (metrics.insightGeneration.ahaScore >= 7) {
    highlights.push('Strong "aha moment" achieved');
  }
  if (metrics.trustProgression.trustDelta >= 5) {
    highlights.push('Notable trust progression');
  }
  if (scores.engagement >= 80) {
    highlights.push('Excellent user engagement');
  }

  return highlights;
}

function generateImprovementAreas(metrics: ConversationMetrics, scores: ConversationScore['scores']): string[] {
  const areas: string[] = [];

  if (metrics.userEngagement.speakingRatio < 0.3) {
    areas.push('Encourage more user participation');
  }
  if (metrics.emotionalShift.moodDelta < 0) {
    areas.push('Review for missed support opportunities');
  }
  if (metrics.actionableOutcomes.commitmentsCount === 0) {
    areas.push('Consider prompting for next steps');
  }
  if (!metrics.trustProgression.boundaryRespected) {
    areas.push('CRITICAL: Review boundary respect');
  }

  return areas;
}

/**
 * Extract metrics from session data
 */
export function extractMetrics(sessionData: SessionData): ConversationMetrics {
  const { turns } = sessionData;
  const userTurns = turns.filter((t) => t.speaker === 'user');
  const agentTurns = turns.filter((t) => t.speaker === 'agent');

  const userWords = userTurns.reduce((sum, t) => sum + t.text.split(' ').length, 0);
  const agentWords = agentTurns.reduce((sum, t) => sum + t.text.split(' ').length, 0);
  const totalWords = userWords + agentWords;

  const userQuestions = userTurns.filter((t) => t.isQuestion || t.text.includes('?')).length;
  const userTopics = new Set(userTurns.flatMap((t) => t.topics || []));

  const sentiments = turns
    .filter((t) => t.sentiment !== undefined)
    .map((t) => t.sentiment as number);

  return {
    userEngagement: {
      speakingRatio: totalWords > 0 ? userWords / totalWords : 0.5,
      questionCount: userQuestions,
      averageResponseLength: userTurns.length > 0 ? userWords / userTurns.length : 0,
      initiatedTopics: userTopics.size,
      deepDiveCount: 0,
      silencePauses: 0,
    },
    emotionalShift: {
      startMood: sessionData.startMood || 5,
      endMood: sessionData.endMood || 5,
      moodDelta: (sessionData.endMood || 5) - (sessionData.startMood || 5),
      emotionalPeaks: sentiments.filter((s) => s >= 0.7).length,
      emotionalValley: sentiments.length > 0 ? Math.min(...sentiments) * 10 : 5,
      calmingMoments: 0,
    },
    actionableOutcomes: {
      commitmentsCount: sessionData.commitments?.length || 0,
      tasksCreated: sessionData.tasks?.length || 0,
      goalsSet: sessionData.goals?.length || 0,
      decisionsClarity: 5,
      nextStepsIdentified: sessionData.commitments?.length || 0,
    },
    insightGeneration: {
      newPatternsDetected: sessionData.patterns?.length || 0,
      connectionsFound: 0,
      reframingMoments: 0,
      ahaScore: 5,
      memoryRetrievals: 0,
    },
    trustProgression: {
      startTrustScore: sessionData.startTrust || 50,
      endTrustScore: sessionData.endTrust || 50,
      trustDelta: (sessionData.endTrust || 50) - (sessionData.startTrust || 50),
      vulnerabilityShared: 0,
      boundaryRespected: true,
      personalDisclosures: 0,
    },
  };
}

/**
 * Score a conversation
 */
export function scoreConversation(sessionData: SessionData): ConversationScore {
  const metrics = extractMetrics(sessionData);

  const engagementScore = calculateEngagementScore(metrics.userEngagement);
  const emotionalScore = calculateEmotionalScore(metrics.emotionalShift);
  const outcomesScore = calculateOutcomesScore(metrics.actionableOutcomes);
  const insightsScore = calculateInsightsScore(metrics.insightGeneration);
  const trustScore = calculateTrustScore(metrics.trustProgression);

  const overallScore =
    engagementScore * SCORE_WEIGHTS.engagement +
    emotionalScore * SCORE_WEIGHTS.emotionalImpact +
    outcomesScore * SCORE_WEIGHTS.outcomes +
    insightsScore * SCORE_WEIGHTS.insights +
    trustScore * SCORE_WEIGHTS.trust;

  const scores = {
    engagement: Math.round(engagementScore),
    emotionalImpact: Math.round(emotionalScore),
    outcomes: Math.round(outcomesScore),
    insights: Math.round(insightsScore),
    trust: Math.round(trustScore),
    overall: Math.round(overallScore),
  };

  return {
    sessionId: sessionData.sessionId,
    userId: sessionData.userId,
    personaId: sessionData.personaId,
    metrics,
    scores,
    qualityTier: determineQualityTier(overallScore),
    highlights: generateHighlights(metrics, scores),
    improvementAreas: generateImprovementAreas(metrics, scores),
    sessionDuration: sessionData.duration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Store a conversation score
 */
export async function storeConversationScore(score: ConversationScore): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(score.userId)
      .collection('conversation_scores')
      .doc(score.sessionId)
      .set(score);

    log.info(
      { userId: score.userId, sessionId: score.sessionId, overall: score.scores.overall },
      'Stored conversation score'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store score');
  }
}

/**
 * Get quality trend for a user
 */
export async function getQualityTrend(
  userId: string,
  period: 'week' | 'month' | 'quarter' = 'week'
): Promise<QualityTrend | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const periodDays = { week: 7, month: 30, quarter: 90 };
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays[period]);

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversation_scores')
      .where('timestamp', '>=', startDate.toISOString())
      .orderBy('timestamp', 'asc')
      .get();

    if (snapshot.empty) return null;

    const scores = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as ConversationScore);
    const averageScore = scores.reduce((sum: number, s: ConversationScore) => sum + s.scores.overall, 0) / scores.length;

    const halfPoint = Math.floor(scores.length / 2);
    const firstAvg = scores.slice(0, halfPoint).reduce((sum: number, s: ConversationScore) => sum + s.scores.overall, 0) / halfPoint || 0;
    const secondAvg = scores.slice(halfPoint).reduce((sum: number, s: ConversationScore) => sum + s.scores.overall, 0) / (scores.length - halfPoint) || 0;

    const trendMagnitude = Math.abs(secondAvg - firstAvg);
    let trend: QualityTrend['trend'] = 'stable';
    if (secondAvg - firstAvg > 5) trend = 'improving';
    if (firstAvg - secondAvg > 5) trend = 'declining';

    const personaScores = new Map<string, number[]>();
    scores.forEach((s: ConversationScore) => {
      const existing = personaScores.get(s.personaId) || [];
      existing.push(s.scores.overall);
      personaScores.set(s.personaId, existing);
    });

    let bestPersona = '';
    let bestPersonaAvg = 0;
    personaScores.forEach((values, persona) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg > bestPersonaAvg) {
        bestPersonaAvg = avg;
        bestPersona = persona;
      }
    });

    return {
      userId,
      period,
      averageScore: Math.round(averageScore),
      trend,
      trendMagnitude: Math.round(trendMagnitude),
      bestPersona,
      bestTimeOfDay: 'evening',
      topHighlights: [],
      persistentIssues: [],
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get quality trend');
    return null;
  }
}

/**
 * Process session end and score it
 */
export async function processSessionEnd(sessionData: SessionData): Promise<ConversationScore> {
  const score = scoreConversation(sessionData);
  await storeConversationScore(score);

  if (score.qualityTier === 'concerning' || score.qualityTier === 'poor') {
    log.warn(
      { userId: score.userId, sessionId: score.sessionId, tier: score.qualityTier },
      'Low quality conversation detected'
    );
  }

  return score;
}
