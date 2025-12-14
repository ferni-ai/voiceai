/**
 * Real-Time Engagement Scoring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks whether the user is present and engaged, or becoming distracted.
 * Real humans notice when someone's attention drifts. This module gives
 * Ferni that awareness to adjust accordingly.
 *
 * Engagement signals:
 * - Response latency (faster = more engaged)
 * - Response length trends
 * - Question asking (engaged users ask questions)
 * - Topic continuity
 * - Backchanneling responsiveness
 *
 * @module EngagementScoring
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'EngagementScoring' });

// ============================================================================
// TYPES
// ============================================================================

export type EngagementLevel = 'high' | 'medium' | 'low' | 'distracted';

export type EngagementAction =
  | 'continue' // Keep going as normal
  | 'check_in' // Ask if they're still with you
  | 'shift_topic' // Try a different approach
  | 'wrap_up' // Consider ending
  | 'energize'; // Try to re-engage

export interface EngagementObservation {
  timestamp: number;
  /** Response latency from agent's last message (ms) */
  responseLatencyMs: number;
  /** Word count in user's response */
  wordCount: number;
  /** Did user ask a question? */
  askedQuestion: boolean;
  /** Is response on-topic? */
  onTopic: boolean;
  /** Any engagement phrases ("interesting", "tell me more") */
  engagementPhrases: number;
  /** Disengagement phrases ("uh huh", "sure", "okay") */
  disengagementPhrases: number;
}

export interface EngagementSignals {
  /** Average response latency trend */
  latencyTrend: 'faster' | 'slower' | 'stable';
  /** Response length trend */
  lengthTrend: 'longer' | 'shorter' | 'stable';
  /** Question asking rate (per 5 turns) */
  questionRate: number;
  /** Topic continuity (0-1) */
  topicContinuity: number;
  /** Backchannel-only response rate */
  backchannelRate: number;
}

export interface EngagementScoringResult {
  /** Current engagement level */
  level: EngagementLevel;

  /** Numeric score (0-1) */
  score: number;

  /** Underlying signals */
  signals: EngagementSignals;

  /** Is engagement declining? */
  declining: boolean;

  /** Suggested action */
  suggestedAction: EngagementAction;

  /** Specific guidance for agent */
  actionGuidance: string;

  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// ENGAGEMENT PATTERNS
// ============================================================================

/** Phrases that suggest high engagement */
const ENGAGEMENT_PHRASES = [
  /\b(interesting|fascinating|tell me more|really|wow|no way)\b/gi,
  /\b(I never thought|that makes sense|I see|go on)\b/gi,
  /\b(can you explain|what do you mean|how does|why is)\b/gi,
  /\b(I'm curious|I wonder|what if|hmm)\b/gi,
];

/** Phrases that suggest low engagement / going through motions */
const DISENGAGEMENT_PHRASES = [
  /^(okay|ok|sure|uh huh|yeah|yep|right|mm hmm|mhm)[\.\!\?]?$/gi,
  /^(I see|got it|makes sense|alright|fine)[\.\!\?]?$/gi,
  /\b(I guess|whatever|if you say so|I suppose)\b/gi,
];

/** Questions indicate engagement */
const QUESTION_PATTERN = /\?$/;

// ============================================================================
// ENGAGEMENT SCORER
// ============================================================================

export class EngagementScorer {
  private observations: EngagementObservation[] = [];
  private readonly maxObservations = 15;
  private lastAgentMessageTime = 0;
  private topicKeywords: string[] = [];

  constructor() {
    log.debug('EngagementScorer initialized');
  }

  /**
   * Record an observation when user responds
   */
  recordResponse(
    text: string,
    options?: {
      lastAgentMessageTime?: number;
      currentTopic?: string;
    }
  ): EngagementScoringResult {
    const now = Date.now();
    const latency = options?.lastAgentMessageTime
      ? now - options.lastAgentMessageTime
      : now - this.lastAgentMessageTime;

    // Analyze the response
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Count engagement/disengagement phrases
    let engagementPhrases = 0;
    let disengagementPhrases = 0;

    for (const pattern of ENGAGEMENT_PHRASES) {
      const matches = text.match(pattern);
      if (matches) engagementPhrases += matches.length;
    }

    for (const pattern of DISENGAGEMENT_PHRASES) {
      const matches = text.match(pattern);
      if (matches) disengagementPhrases += matches.length;
    }

    // Check if asked a question
    const askedQuestion = QUESTION_PATTERN.test(text.trim());

    // Check topic continuity
    const onTopic = this.checkTopicContinuity(text, options?.currentTopic);

    // Update topic keywords
    if (options?.currentTopic) {
      this.updateTopicKeywords(options.currentTopic);
    }

    const observation: EngagementObservation = {
      timestamp: now,
      responseLatencyMs: latency,
      wordCount,
      askedQuestion,
      onTopic,
      engagementPhrases,
      disengagementPhrases,
    };

    this.observations.push(observation);
    if (this.observations.length > this.maxObservations) {
      this.observations.shift();
    }

    return this.computeEngagement();
  }

  /**
   * Record when agent sends a message (for latency calculation)
   */
  recordAgentMessage(): void {
    this.lastAgentMessageTime = Date.now();
  }

  /**
   * Get current engagement state without new observation
   */
  getCurrentEngagement(): EngagementScoringResult {
    return this.computeEngagement();
  }

  /**
   * Reset scorer
   */
  reset(): void {
    this.observations = [];
    this.lastAgentMessageTime = 0;
    this.topicKeywords = [];
    log.debug('EngagementScorer reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private computeEngagement(): EngagementScoringResult {
    if (this.observations.length < 2) {
      return this.getDefaultResult();
    }

    // Calculate signals
    const signals = this.calculateSignals();

    // Calculate engagement score
    let score = 0.5; // Start neutral

    // Latency factor (faster = more engaged)
    // Typical engaged response: 1-3 seconds
    // Distracted: 5+ seconds
    const avgLatency =
      this.observations.reduce((sum, o) => sum + o.responseLatencyMs, 0) / this.observations.length;
    if (avgLatency < 2000) score += 0.15;
    else if (avgLatency < 4000) score += 0.05;
    else if (avgLatency > 6000) score -= 0.15;

    // Length factor
    const avgLength =
      this.observations.reduce((sum, o) => sum + o.wordCount, 0) / this.observations.length;
    if (avgLength > 20) score += 0.1;
    else if (avgLength < 5) score -= 0.15;

    // Question rate factor
    if (signals.questionRate > 0.3) score += 0.15;
    else if (signals.questionRate > 0.1) score += 0.05;

    // Topic continuity factor
    score += (signals.topicContinuity - 0.5) * 0.2;

    // Backchannel rate factor (high backchannel = low engagement)
    if (signals.backchannelRate > 0.5) score -= 0.2;
    else if (signals.backchannelRate > 0.3) score -= 0.1;

    // Engagement vs disengagement phrase ratio
    const recent = this.observations.slice(-5);
    const totalEngagement = recent.reduce((sum, o) => sum + o.engagementPhrases, 0);
    const totalDisengagement = recent.reduce((sum, o) => sum + o.disengagementPhrases, 0);
    if (totalEngagement > totalDisengagement * 2) score += 0.1;
    if (totalDisengagement > totalEngagement * 2) score -= 0.15;

    // Clamp score
    score = Math.max(0, Math.min(1, score));

    // Determine level
    let level: EngagementLevel;
    if (score > 0.7) level = 'high';
    else if (score > 0.5) level = 'medium';
    else if (score > 0.3) level = 'low';
    else level = 'distracted';

    // Detect decline
    const declining = this.detectDecline();

    // Determine action
    const { action, guidance } = this.determineAction(level, declining, signals);

    // Confidence based on observation count
    const confidence = Math.min(1, this.observations.length / 5);

    const result: EngagementScoringResult = {
      level,
      score,
      signals,
      declining,
      suggestedAction: action,
      actionGuidance: guidance,
      confidence,
    };

    if (level === 'low' || level === 'distracted' || declining) {
      log.debug(
        {
          level,
          score: score.toFixed(2),
          declining,
          action,
        },
        '👀 Engagement signal'
      );
    }

    return result;
  }

  private calculateSignals(): EngagementSignals {
    if (this.observations.length < 3) {
      return {
        latencyTrend: 'stable',
        lengthTrend: 'stable',
        questionRate: 0,
        topicContinuity: 0.5,
        backchannelRate: 0,
      };
    }

    const recent = this.observations.slice(-5);

    // Latency trend
    const firstHalfLatency = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalfLatency = recent.slice(Math.floor(recent.length / 2));
    const firstAvgLatency =
      firstHalfLatency.reduce((sum, o) => sum + o.responseLatencyMs, 0) / firstHalfLatency.length;
    const secondAvgLatency =
      secondHalfLatency.reduce((sum, o) => sum + o.responseLatencyMs, 0) / secondHalfLatency.length;

    let latencyTrend: 'faster' | 'slower' | 'stable' = 'stable';
    if (secondAvgLatency < firstAvgLatency * 0.7) latencyTrend = 'faster';
    else if (secondAvgLatency > firstAvgLatency * 1.5) latencyTrend = 'slower';

    // Length trend
    const firstAvgLength =
      firstHalfLatency.reduce((sum, o) => sum + o.wordCount, 0) / firstHalfLatency.length;
    const secondAvgLength =
      secondHalfLatency.reduce((sum, o) => sum + o.wordCount, 0) / secondHalfLatency.length;

    let lengthTrend: 'longer' | 'shorter' | 'stable' = 'stable';
    if (secondAvgLength > firstAvgLength * 1.3) lengthTrend = 'longer';
    else if (secondAvgLength < firstAvgLength * 0.7) lengthTrend = 'shorter';

    // Question rate
    const questions = recent.filter((o) => o.askedQuestion).length;
    const questionRate = questions / recent.length;

    // Topic continuity
    const onTopicCount = recent.filter((o) => o.onTopic).length;
    const topicContinuity = onTopicCount / recent.length;

    // Backchannel rate (very short responses with disengagement phrases)
    const backchannelResponses = recent.filter(
      (o) => o.wordCount <= 3 && o.disengagementPhrases > 0
    ).length;
    const backchannelRate = backchannelResponses / recent.length;

    return {
      latencyTrend,
      lengthTrend,
      questionRate,
      topicContinuity,
      backchannelRate,
    };
  }

  private detectDecline(): boolean {
    if (this.observations.length < 4) return false;

    const firstHalf = this.observations.slice(0, Math.floor(this.observations.length / 2));
    const secondHalf = this.observations.slice(Math.floor(this.observations.length / 2));

    // Calculate engagement indicators for each half
    const firstScore = this.calculateHalfScore(firstHalf);
    const secondScore = this.calculateHalfScore(secondHalf);

    return secondScore < firstScore - 0.15;
  }

  private calculateHalfScore(observations: EngagementObservation[]): number {
    if (observations.length === 0) return 0.5;

    let score = 0.5;
    const avgLength = observations.reduce((sum, o) => sum + o.wordCount, 0) / observations.length;
    const avgLatency =
      observations.reduce((sum, o) => sum + o.responseLatencyMs, 0) / observations.length;
    const questionCount = observations.filter((o) => o.askedQuestion).length;
    const engagementCount = observations.reduce((sum, o) => sum + o.engagementPhrases, 0);
    const disengagementCount = observations.reduce((sum, o) => sum + o.disengagementPhrases, 0);

    if (avgLength > 15) score += 0.1;
    if (avgLength < 5) score -= 0.1;
    if (avgLatency < 3000) score += 0.1;
    if (avgLatency > 5000) score -= 0.1;
    if (questionCount > 0) score += 0.1;
    if (engagementCount > disengagementCount) score += 0.1;
    if (disengagementCount > engagementCount) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private determineAction(
    level: EngagementLevel,
    declining: boolean,
    signals: EngagementSignals
  ): { action: EngagementAction; guidance: string } {
    if (level === 'distracted') {
      if (signals.backchannelRate > 0.5) {
        return {
          action: 'check_in',
          guidance:
            'User seems to be just nodding along. Check in: "Are you still with me?" or "What\'s on your mind?"',
        };
      }
      return {
        action: 'shift_topic',
        guidance:
          "User seems distracted. Try a different approach or ask what they'd like to talk about.",
      };
    }

    if (level === 'low') {
      if (declining) {
        return {
          action: 'energize',
          guidance:
            'Engagement is dropping. Try asking a direct question or introducing something new.',
        };
      }
      return {
        action: 'check_in',
        guidance: 'Engagement is low. Gently check if this topic is resonating.',
      };
    }

    if (declining && level === 'medium') {
      return {
        action: 'check_in',
        guidance: 'Engagement trending down. Consider checking in or wrapping up this thread.',
      };
    }

    if (signals.lengthTrend === 'shorter' && signals.latencyTrend === 'slower') {
      return {
        action: 'wrap_up',
        guidance: 'Responses getting shorter and slower. Consider wrapping up this topic.',
      };
    }

    return {
      action: 'continue',
      guidance: 'Engagement looks good. Continue the conversation naturally.',
    };
  }

  private checkTopicContinuity(text: string, currentTopic?: string): boolean {
    if (!currentTopic && this.topicKeywords.length === 0) {
      return true; // No baseline to compare
    }

    const lower = text.toLowerCase();
    const keywords = currentTopic
      ? currentTopic
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      : this.topicKeywords;

    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return true;
      }
    }

    // Check for pronouns referring to previous content
    if (/\b(it|that|this|they|them)\b/.test(lower)) {
      return true;
    }

    return false;
  }

  private updateTopicKeywords(topic: string): void {
    const words = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const combined = [...this.topicKeywords, ...words];
    const uniqueSet = new Set<string>();
    combined.forEach((w) => uniqueSet.add(w));
    this.topicKeywords = Array.from(uniqueSet).slice(-10);
  }

  private getDefaultResult(): EngagementScoringResult {
    return {
      level: 'medium',
      score: 0.5,
      signals: {
        latencyTrend: 'stable',
        lengthTrend: 'stable',
        questionRate: 0,
        topicContinuity: 0.5,
        backchannelRate: 0,
      },
      declining: false,
      suggestedAction: 'continue',
      actionGuidance: 'Insufficient data for engagement scoring. Continue naturally.',
      confidence: 0.3,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const engagementScorerRegistry = createSessionRegistry(
  (sessionId: string) => new EngagementScorer(),
  { name: 'EngagementScorer', cleanup: (scorer) => scorer.reset(), verbose: false }
);

registerGlobalRegistry(engagementScorerRegistry);

export function getEngagementScorer(sessionId: string): EngagementScorer {
  return engagementScorerRegistry.get(sessionId);
}

export function resetEngagementScorer(sessionId: string): void {
  engagementScorerRegistry.reset(sessionId);
}

export function resetAllEngagementScorers(): void {
  engagementScorerRegistry.resetAll();
}

export function getActiveEngagementScorerCount(): number {
  return engagementScorerRegistry.getActiveCount();
}

export default EngagementScorer;
