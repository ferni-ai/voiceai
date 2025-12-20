/**
 * Implicit Signal Extraction
 *
 * Learn from HOW users talk, not just WHAT they say.
 *
 * Extracts behavioral signals that indicate engagement, comfort,
 * and emotional state without explicit feedback:
 *
 * - Utterance length trends (opening up vs. closing off)
 * - Session duration patterns
 * - Return intervals (coming back quickly vs. delayed)
 * - Speech pace changes
 * - Pause patterns (processing vs. disengaged)
 * - Topic depth progression
 * - Self-disclosure levels
 *
 * These signals feed into:
 * - Response quality inference
 * - Personalization learning
 * - Emotional forecasting
 * - Proactive outreach timing
 *
 * @module @ferni/implicit-signals
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ImplicitSignals' });

// ============================================================================
// TYPES
// ============================================================================

export type SpeechPace = 'rushed' | 'normal' | 'slow_thoughtful';
export type PauseType = 'processing' | 'disengaged' | 'emotional' | 'normal';
export type UtteranceLength = 'short' | 'normal' | 'opening_up';
export type TopicDepth = 'surface' | 'moderate' | 'deep_vulnerable';
export type SelfDisclosure = 'minimal' | 'moderate' | 'significant';

export interface ImplicitSignals {
  // Voice engagement signals
  speechPace: SpeechPace;
  pauseType: PauseType;
  utteranceLength: UtteranceLength;
  interruptions: boolean; // Did they cut us off?

  // Session signals
  sessionDuration: 'short_ended_early' | 'normal' | 'longer_than_usual';
  returnInterval: 'came_back_quickly' | 'normal' | 'delayed';

  // Content signals
  topicDepth: TopicDepth;
  selfDisclosure: SelfDisclosure;
  questionsAsked: number; // Curious? Engaged?

  // Calculated
  overallEngagement: number; // 0-1
  emotionalOpenness: number; // 0-1
}

export interface ResponseQualitySignal {
  responseWorked: boolean;
  confidence: number;
  whatWorked: string[];
  whatDidnt: string[];
  suggestedAdjustments: string[];
}

export interface TurnSignals {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  questionCount: number;
  emotionalWords: number;
  selfReferences: number; // "I", "me", "my"
  pauseDurationMs?: number;
  speechRateWpm?: number;
}

export interface SessionSignals {
  turnCount: number;
  totalWordCount: number;
  avgUtteranceLength: number;
  durationMinutes: number;
  topicChanges: number;
  deepMoments: number; // Turns with high emotional content
  laughs: number;
  silences: number;
}

// ============================================================================
// STATE
// ============================================================================

interface UserSignalProfile {
  // Baselines (personalized)
  baselineUtteranceLength: number;
  baselineSessionDuration: number;
  baselineReturnDays: number;
  baselineSpeechRateWpm: number;

  // History for trend detection
  recentSessions: SessionSummary[];
  recentTurns: TurnSummary[];

  // Learning
  responsesWorked: ResponseLearning[];
  responsesDidntWork: ResponseLearning[];

  // Last update
  updatedAt: Date;
}

interface SessionSummary {
  sessionId: string;
  date: Date;
  durationMinutes: number;
  turnCount: number;
  avgUtteranceLength: number;
  deepMoments: number;
  overallEngagement: number;
  topics: string[];
}

interface TurnSummary {
  sessionId: string;
  turnNumber: number;
  wordCount: number;
  hadEmotionalContent: boolean;
  hadSelfDisclosure: boolean;
  askedQuestion: boolean;
  pausedLong: boolean;
}

interface ResponseLearning {
  responseType: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'silence';
  topic: string;
  emotionalContext: string;
  userReaction: 'positive' | 'neutral' | 'negative';
  evidence: string;
  timestamp: Date;
}

const userProfiles = new Map<string, UserSignalProfile>();

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

function getOrCreateProfile(userId: string): UserSignalProfile {
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = {
      baselineUtteranceLength: 25, // words
      baselineSessionDuration: 8, // minutes
      baselineReturnDays: 3,
      baselineSpeechRateWpm: 150,
      recentSessions: [],
      recentTurns: [],
      responsesWorked: [],
      responsesDidntWork: [],
      updatedAt: new Date(),
    };
    userProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// SIGNAL EXTRACTION
// ============================================================================

/**
 * Extract implicit signals from a single turn
 */
export function extractTurnSignals(
  userMessage: string,
  context?: {
    pauseDurationMs?: number;
    speechRateWpm?: number;
    didInterrupt?: boolean;
  }
): TurnSignals {
  const words = userMessage.split(/\s+/).filter((w) => w.length > 0);
  const sentences = userMessage.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const questions = (userMessage.match(/\?/g) || []).length;

  // Emotional word detection
  const emotionalPatterns =
    /\b(feel|feeling|felt|love|hate|scared|worried|anxious|happy|sad|angry|frustrated|excited|grateful|hurt|afraid|nervous|stressed|overwhelmed|hopeful|disappointed)\b/gi;
  const emotionalWords = (userMessage.match(emotionalPatterns) || []).length;

  // Self-reference detection
  const selfPatterns = /\b(I|me|my|myself|I'm|I've|I'll|I'd)\b/gi;
  const selfReferences = (userMessage.match(selfPatterns) || []).length;

  return {
    wordCount: words.length,
    sentenceCount: Math.max(1, sentences.length),
    avgWordsPerSentence: words.length / Math.max(1, sentences.length),
    questionCount: questions,
    emotionalWords,
    selfReferences,
    pauseDurationMs: context?.pauseDurationMs,
    speechRateWpm: context?.speechRateWpm,
  };
}

/**
 * Interpret turn signals relative to user's baseline
 */
export function interpretTurnSignals(
  userId: string,
  turnSignals: TurnSignals,
  context?: {
    didInterrupt?: boolean;
    previousSilenceMs?: number;
  }
): ImplicitSignals {
  const profile = getOrCreateProfile(userId);

  // Utterance length relative to baseline
  const lengthRatio = turnSignals.wordCount / profile.baselineUtteranceLength;
  let utteranceLength: UtteranceLength = 'normal';
  if (lengthRatio < 0.5) utteranceLength = 'short';
  else if (lengthRatio > 1.5) utteranceLength = 'opening_up';

  // Speech pace
  let speechPace: SpeechPace = 'normal';
  if (turnSignals.speechRateWpm) {
    const paceRatio = turnSignals.speechRateWpm / profile.baselineSpeechRateWpm;
    if (paceRatio > 1.2) speechPace = 'rushed';
    else if (paceRatio < 0.8) speechPace = 'slow_thoughtful';
  }

  // Pause type
  let pauseType: PauseType = 'normal';
  if (context?.previousSilenceMs) {
    if (context.previousSilenceMs > 5000) {
      // Long pause - could be processing or disengaged
      pauseType = turnSignals.wordCount > 20 ? 'processing' : 'disengaged';
    } else if (context.previousSilenceMs > 2000 && turnSignals.emotionalWords > 0) {
      pauseType = 'emotional';
    }
  }

  // Topic depth from content analysis
  let topicDepth: TopicDepth = 'surface';
  if (turnSignals.emotionalWords > 2 || turnSignals.selfReferences > 5) {
    topicDepth = 'deep_vulnerable';
  } else if (turnSignals.emotionalWords > 0 || turnSignals.selfReferences > 2) {
    topicDepth = 'moderate';
  }

  // Self-disclosure level
  let selfDisclosure: SelfDisclosure = 'minimal';
  if (turnSignals.selfReferences > 5 && turnSignals.wordCount > 30) {
    selfDisclosure = 'significant';
  } else if (turnSignals.selfReferences > 2) {
    selfDisclosure = 'moderate';
  }

  // Calculate overall metrics
  const engagementFactors = [
    utteranceLength === 'opening_up' ? 1 : utteranceLength === 'normal' ? 0.6 : 0.2,
    turnSignals.questionCount > 0 ? 0.8 : 0.4,
    pauseType === 'processing' || pauseType === 'emotional' ? 0.7 : 0.4,
    context?.didInterrupt ? 0.2 : 0.6, // Interrupting us is negative
  ];
  const overallEngagement = engagementFactors.reduce((a, b) => a + b, 0) / engagementFactors.length;

  const opennessFactors = [
    topicDepth === 'deep_vulnerable' ? 1 : topicDepth === 'moderate' ? 0.6 : 0.2,
    selfDisclosure === 'significant' ? 1 : selfDisclosure === 'moderate' ? 0.6 : 0.2,
    turnSignals.emotionalWords > 2 ? 0.9 : turnSignals.emotionalWords > 0 ? 0.5 : 0.2,
  ];
  const emotionalOpenness = opennessFactors.reduce((a, b) => a + b, 0) / opennessFactors.length;

  return {
    speechPace,
    pauseType,
    utteranceLength,
    interruptions: context?.didInterrupt || false,
    sessionDuration: 'normal', // Set at session level
    returnInterval: 'normal', // Set at session level
    topicDepth,
    selfDisclosure,
    questionsAsked: turnSignals.questionCount,
    overallEngagement,
    emotionalOpenness,
  };
}

// ============================================================================
// SESSION-LEVEL ANALYSIS
// ============================================================================

/**
 * Record session signals and update user profile
 */
export function recordSessionSignals(
  userId: string,
  sessionId: string,
  signals: SessionSignals,
  topics: string[]
): void {
  const profile = getOrCreateProfile(userId);

  // Calculate engagement
  const engagementScore =
    (signals.avgUtteranceLength / profile.baselineUtteranceLength) * 0.3 +
    (signals.deepMoments / Math.max(signals.turnCount, 1)) * 0.3 +
    (signals.laughs > 0 ? 0.2 : 0) +
    (signals.turnCount > 5 ? 0.2 : 0.1);

  const summary: SessionSummary = {
    sessionId,
    date: new Date(),
    durationMinutes: signals.durationMinutes,
    turnCount: signals.turnCount,
    avgUtteranceLength: signals.avgUtteranceLength,
    deepMoments: signals.deepMoments,
    overallEngagement: Math.min(1, engagementScore),
    topics,
  };

  profile.recentSessions.push(summary);

  // Keep last 30 sessions
  if (profile.recentSessions.length > 30) {
    profile.recentSessions.shift();
  }

  // Update baselines (weighted toward recent)
  if (profile.recentSessions.length >= 5) {
    const recentAvgUtterance =
      profile.recentSessions.slice(-5).reduce((sum, s) => sum + s.avgUtteranceLength, 0) / 5;
    const recentAvgDuration =
      profile.recentSessions.slice(-5).reduce((sum, s) => sum + s.durationMinutes, 0) / 5;

    profile.baselineUtteranceLength =
      profile.baselineUtteranceLength * 0.7 + recentAvgUtterance * 0.3;
    profile.baselineSessionDuration =
      profile.baselineSessionDuration * 0.7 + recentAvgDuration * 0.3;
  }

  profile.updatedAt = new Date();

  log.debug(
    {
      userId,
      sessionId,
      engagement: engagementScore.toFixed(2),
      deepMoments: signals.deepMoments,
    },
    '📊 Session signals recorded'
  );
}

/**
 * Calculate session duration classification
 */
export function classifySessionDuration(
  userId: string,
  durationMinutes: number
): 'short_ended_early' | 'normal' | 'longer_than_usual' {
  const profile = getOrCreateProfile(userId);
  const ratio = durationMinutes / profile.baselineSessionDuration;

  if (ratio < 0.5) return 'short_ended_early';
  if (ratio > 1.5) return 'longer_than_usual';
  return 'normal';
}

/**
 * Calculate return interval classification
 */
export function classifyReturnInterval(userId: string): 'came_back_quickly' | 'normal' | 'delayed' {
  const profile = getOrCreateProfile(userId);

  if (profile.recentSessions.length < 2) return 'normal';

  const lastSession = profile.recentSessions[profile.recentSessions.length - 1];
  const prevSession = profile.recentSessions[profile.recentSessions.length - 2];

  const daysBetween =
    (lastSession.date.getTime() - prevSession.date.getTime()) / (24 * 60 * 60 * 1000);
  const ratio = daysBetween / profile.baselineReturnDays;

  if (ratio < 0.5) return 'came_back_quickly';
  if (ratio > 2) return 'delayed';
  return 'normal';
}

// ============================================================================
// RESPONSE QUALITY INFERENCE
// ============================================================================

/**
 * Infer whether our response worked based on implicit signals
 */
export function inferResponseQuality(
  ourResponseType: ResponseLearning['responseType'],
  theirReaction: ImplicitSignals,
  context: {
    topic: string;
    emotionalContext: string;
  }
): ResponseQualitySignal {
  // Positive indicators
  const positiveIndicators: string[] = [];
  const negativeIndicators: string[] = [];

  if (theirReaction.utteranceLength === 'opening_up') {
    positiveIndicators.push('They opened up more');
  } else if (theirReaction.utteranceLength === 'short') {
    negativeIndicators.push('They gave a short response');
  }

  if (theirReaction.topicDepth === 'deep_vulnerable') {
    positiveIndicators.push('Conversation went deeper');
  }

  if (theirReaction.selfDisclosure === 'significant') {
    positiveIndicators.push('They shared something personal');
  }

  if (theirReaction.questionsAsked > 0) {
    positiveIndicators.push('They asked follow-up questions');
  }

  if (theirReaction.interruptions) {
    negativeIndicators.push('They interrupted us');
  }

  if (theirReaction.speechPace === 'rushed') {
    negativeIndicators.push('They seemed rushed');
  }

  if (theirReaction.pauseType === 'disengaged') {
    negativeIndicators.push('They seemed disengaged');
  }

  // Calculate overall
  const positiveScore = positiveIndicators.length;
  const negativeScore = negativeIndicators.length;
  const responseWorked = positiveScore > negativeScore;
  const confidence =
    Math.abs(positiveScore - negativeScore) / Math.max(positiveScore + negativeScore, 1);

  // Generate suggested adjustments
  const suggestedAdjustments: string[] = [];

  if (negativeIndicators.includes('They gave a short response')) {
    suggestedAdjustments.push('Try asking more open-ended questions');
  }
  if (negativeIndicators.includes('They seemed disengaged')) {
    suggestedAdjustments.push('Consider changing the topic or approach');
  }
  if (negativeIndicators.includes('They interrupted us')) {
    suggestedAdjustments.push('Keep responses shorter');
  }

  return {
    responseWorked,
    confidence,
    whatWorked: positiveIndicators,
    whatDidnt: negativeIndicators,
    suggestedAdjustments,
  };
}

/**
 * Record response outcome for learning
 */
export function recordResponseOutcome(
  userId: string,
  responseType: ResponseLearning['responseType'],
  topic: string,
  emotionalContext: string,
  reaction: 'positive' | 'neutral' | 'negative',
  evidence: string
): void {
  const profile = getOrCreateProfile(userId);

  const learning: ResponseLearning = {
    responseType,
    topic,
    emotionalContext,
    userReaction: reaction,
    evidence,
    timestamp: new Date(),
  };

  if (reaction === 'positive') {
    profile.responsesWorked.push(learning);
    // Keep last 100
    if (profile.responsesWorked.length > 100) {
      profile.responsesWorked.shift();
    }
  } else if (reaction === 'negative') {
    profile.responsesDidntWork.push(learning);
    if (profile.responsesDidntWork.length > 100) {
      profile.responsesDidntWork.shift();
    }
  }

  log.debug({ userId, responseType, reaction, topic }, '📝 Response outcome recorded');
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Get engagement trend over recent sessions
 */
export function getEngagementTrend(userId: string): {
  trend: 'increasing' | 'stable' | 'declining';
  confidence: number;
  details: string;
} {
  const profile = getOrCreateProfile(userId);

  if (profile.recentSessions.length < 5) {
    return { trend: 'stable', confidence: 0.3, details: 'Not enough data' };
  }

  const recent = profile.recentSessions.slice(-5);
  const older = profile.recentSessions.slice(-10, -5);

  if (older.length < 3) {
    return { trend: 'stable', confidence: 0.4, details: 'Limited historical data' };
  }

  const recentAvg = recent.reduce((sum, s) => sum + s.overallEngagement, 0) / recent.length;
  const olderAvg = older.reduce((sum, s) => sum + s.overallEngagement, 0) / older.length;

  const diff = recentAvg - olderAvg;

  if (diff > 0.15) {
    return {
      trend: 'increasing',
      confidence: Math.min(0.9, 0.5 + diff),
      details: `Engagement up ${(diff * 100).toFixed(0)}% over last 5 sessions`,
    };
  } else if (diff < -0.15) {
    return {
      trend: 'declining',
      confidence: Math.min(0.9, 0.5 + Math.abs(diff)),
      details: `Engagement down ${(Math.abs(diff) * 100).toFixed(0)}% over last 5 sessions`,
    };
  }

  return { trend: 'stable', confidence: 0.7, details: 'Engagement stable' };
}

/**
 * Get what response types work best for this user
 */
export function getEffectiveResponseTypes(userId: string): Array<{
  type: ResponseLearning['responseType'];
  effectiveness: number;
  bestFor: string[];
}> {
  const profile = getOrCreateProfile(userId);

  const typeStats = new Map<
    ResponseLearning['responseType'],
    { positive: number; negative: number; contexts: Set<string> }
  >();

  // Aggregate positive outcomes
  for (const r of profile.responsesWorked) {
    const stats = typeStats.get(r.responseType) || {
      positive: 0,
      negative: 0,
      contexts: new Set(),
    };
    stats.positive++;
    stats.contexts.add(r.emotionalContext);
    typeStats.set(r.responseType, stats);
  }

  // Aggregate negative outcomes
  for (const r of profile.responsesDidntWork) {
    const stats = typeStats.get(r.responseType) || {
      positive: 0,
      negative: 0,
      contexts: new Set(),
    };
    stats.negative++;
    typeStats.set(r.responseType, stats);
  }

  // Calculate effectiveness
  const results: Array<{
    type: ResponseLearning['responseType'];
    effectiveness: number;
    bestFor: string[];
  }> = [];

  for (const [type, stats] of typeStats) {
    const total = stats.positive + stats.negative;
    if (total < 3) continue; // Need enough data

    const effectiveness = stats.positive / total;
    results.push({
      type,
      effectiveness,
      bestFor: Array.from(stats.contexts).slice(0, 3),
    });
  }

  // Sort by effectiveness
  results.sort((a, b) => b.effectiveness - a.effectiveness);

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getOrCreateProfile as _getOrCreateProfile, // For testing
};
