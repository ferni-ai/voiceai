/**
 * Naturalness Feedback Loop
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module creates a feedback loop that helps us learn what makes
 * responses feel natural and human. It:
 * 1. Tracks which context builders contributed to each response
 * 2. Monitors user reactions (engagement, emotional shift, continuation)
 * 3. Adjusts builder weights based on what works
 *
 * Over time, this helps Ferni get better at being human.
 *
 * @module intelligence/unified/feedback-loop
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UnifiedAnalysisResult } from './unified-analyzer.js';
import type { HumanizationResult } from './humanization-orchestrator.js';

const log = createLogger({ module: 'NaturalnessFeedback' });

// ============================================================================
// TYPES
// ============================================================================

export interface ResponseContext {
  /** Unique ID for this turn */
  turnId: string;

  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** The unified analysis that informed this response */
  analysis: UnifiedAnalysisResult;

  /** The humanization applied */
  humanization: HumanizationResult;

  /** Which context builders contributed */
  buildersUsed: string[];

  /** The final response generated */
  response: string;

  /** Timestamp */
  timestamp: Date;
}

export interface UserReaction {
  /** Did the user continue the conversation? */
  continuedConversation: boolean;

  /** Did the user's emotional state improve? */
  emotionalShift: 'improved' | 'stable' | 'declined' | 'unknown';

  /** Did the user open up more? */
  openedUpMore: boolean;

  /** Did the user ask a follow-up question? */
  askedFollowUp: boolean;

  /** Was there a topic shift (might indicate disengagement)? */
  topicShift: boolean;

  /** Response length (short might indicate disengagement) */
  responseLength: 'short' | 'medium' | 'long';

  /** Time to respond (long might indicate thinking or disengagement) */
  responseTimeMs: number;
}

export interface NaturalnessSignal {
  /** The turn this signal is about */
  turnId: string;

  /** Context that was used */
  context: ResponseContext;

  /** User reaction */
  reaction: UserReaction;

  /** Computed naturalness score (0-1) */
  naturalnessScore: number;

  /** What worked well */
  positiveSignals: string[];

  /** What might have been better */
  negativeSignals: string[];
}

export interface BuilderEffectiveness {
  /** Builder name */
  builderName: string;

  /** Number of times used */
  usageCount: number;

  /** Average naturalness score when used */
  avgNaturalnessScore: number;

  /** Correlation with positive reactions */
  positiveCorrelation: number;

  /** Recommended weight adjustment */
  weightAdjustment: 'increase' | 'maintain' | 'decrease' | 'unknown';
}

// ============================================================================
// FEEDBACK LOOP CLASS
// ============================================================================

export class NaturalnessFeedbackLoop {
  private static instance: NaturalnessFeedbackLoop | null = null;

  // In-memory storage for recent signals (would be persisted in production)
  private recentSignals: NaturalnessSignal[] = [];
  private builderStats: Map<string, { total: number; scoreSum: number; positiveCount: number }> =
    new Map();

  static getInstance(): NaturalnessFeedbackLoop {
    if (!NaturalnessFeedbackLoop.instance) {
      NaturalnessFeedbackLoop.instance = new NaturalnessFeedbackLoop();
    }
    return NaturalnessFeedbackLoop.instance;
  }

  /**
   * Record a response context for later feedback
   */
  recordResponseContext(context: ResponseContext): void {
    // Store for later correlation with user reaction
    this.recentSignals.push({
      turnId: context.turnId,
      context,
      reaction: {
        continuedConversation: false, // Will be updated
        emotionalShift: 'unknown',
        openedUpMore: false,
        askedFollowUp: false,
        topicShift: false,
        responseLength: 'medium',
        responseTimeMs: 0,
      },
      naturalnessScore: 0, // Will be computed
      positiveSignals: [],
      negativeSignals: [],
    });

    // Keep only last 100 signals in memory
    if (this.recentSignals.length > 100) {
      this.recentSignals.shift();
    }

    log.debug(
      { turnId: context.turnId, buildersUsed: context.buildersUsed.length },
      '📝 Recorded response context'
    );
  }

  /**
   * Record user reaction to a response
   */
  recordUserReaction(turnId: string, reaction: UserReaction): NaturalnessSignal | null {
    const signalIndex = this.recentSignals.findIndex((s) => s.turnId === turnId);
    if (signalIndex === -1) {
      log.warn({ turnId }, 'No context found for turn');
      return null;
    }

    const signal = this.recentSignals[signalIndex];
    signal.reaction = reaction;

    // Compute naturalness score
    signal.naturalnessScore = this.computeNaturalnessScore(signal.context, reaction);

    // Identify what worked and what didn't
    const { positive, negative } = this.analyzeSignals(signal.context, reaction);
    signal.positiveSignals = positive;
    signal.negativeSignals = negative;

    // Update builder stats
    this.updateBuilderStats(signal);

    log.info(
      {
        turnId,
        naturalnessScore: signal.naturalnessScore.toFixed(2),
        positiveSignals: signal.positiveSignals.length,
        negativeSignals: signal.negativeSignals.length,
      },
      '📊 Recorded user reaction'
    );

    return signal;
  }

  /**
   * Get effectiveness report for all builders
   */
  getBuilderEffectiveness(): BuilderEffectiveness[] {
    const effectiveness: BuilderEffectiveness[] = [];

    for (const [builderName, stats] of this.builderStats.entries()) {
      const avgScore = stats.total > 0 ? stats.scoreSum / stats.total : 0;
      const positiveRate = stats.total > 0 ? stats.positiveCount / stats.total : 0;

      let weightAdjustment: BuilderEffectiveness['weightAdjustment'] = 'unknown';
      if (stats.total >= 10) {
        if (avgScore > 0.7 && positiveRate > 0.6) {
          weightAdjustment = 'increase';
        } else if (avgScore < 0.4 || positiveRate < 0.3) {
          weightAdjustment = 'decrease';
        } else {
          weightAdjustment = 'maintain';
        }
      }

      effectiveness.push({
        builderName,
        usageCount: stats.total,
        avgNaturalnessScore: avgScore,
        positiveCorrelation: positiveRate,
        weightAdjustment,
      });
    }

    return effectiveness.sort((a, b) => b.avgNaturalnessScore - a.avgNaturalnessScore);
  }

  /**
   * Get recommendations for improving naturalness
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const effectiveness = this.getBuilderEffectiveness();

    // Find underperforming builders
    const underperforming = effectiveness.filter(
      (e) => e.usageCount >= 10 && e.avgNaturalnessScore < 0.5
    );
    if (underperforming.length > 0) {
      recommendations.push(
        `Consider reviewing these builders (low naturalness scores): ${underperforming.map((e) => e.builderName).join(', ')}`
      );
    }

    // Find high-performing builders that could be used more
    const highPerforming = effectiveness.filter(
      (e) => e.usageCount >= 5 && e.avgNaturalnessScore > 0.7
    );
    if (highPerforming.length > 0) {
      recommendations.push(
        `These builders are working well: ${highPerforming.map((e) => e.builderName).join(', ')}`
      );
    }

    // Analyze recent signals for patterns
    const recentLowScores = this.recentSignals.filter((s) => s.naturalnessScore < 0.5);
    if (recentLowScores.length > this.recentSignals.length * 0.3) {
      recommendations.push('Recent naturalness scores are declining. Review recent changes.');
    }

    // Check if mismatch detection is being used effectively
    const mismatchSignals = this.recentSignals.filter(
      (s) => s.context.analysis.mismatch.detected
    );
    if (mismatchSignals.length > 0) {
      const avgMismatchScore =
        mismatchSignals.reduce((sum, s) => sum + s.naturalnessScore, 0) / mismatchSignals.length;
      if (avgMismatchScore > 0.7) {
        recommendations.push('Voice-text mismatch detection is working well!');
      } else if (avgMismatchScore < 0.5) {
        recommendations.push(
          'Voice-text mismatch responses may need refinement. Review approach.'
        );
      }
    }

    return recommendations;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private computeNaturalnessScore(
    context: ResponseContext,
    reaction: UserReaction
  ): number {
    let score = 0.5; // Start neutral

    // Positive signals
    if (reaction.continuedConversation) score += 0.15;
    if (reaction.emotionalShift === 'improved') score += 0.2;
    if (reaction.openedUpMore) score += 0.15;
    if (reaction.askedFollowUp) score += 0.1;
    if (reaction.responseLength === 'long') score += 0.05;

    // Negative signals
    if (!reaction.continuedConversation) score -= 0.2;
    if (reaction.emotionalShift === 'declined') score -= 0.2;
    if (reaction.topicShift && !context.analysis.context.isTopicShift) score -= 0.1;
    if (reaction.responseLength === 'short') score -= 0.1;

    // Bonus for mismatch handling
    if (context.analysis.mismatch.detected) {
      if (reaction.openedUpMore || reaction.emotionalShift === 'improved') {
        score += 0.15; // Mismatch detected AND user responded well
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  private analyzeSignals(
    context: ResponseContext,
    reaction: UserReaction
  ): { positive: string[]; negative: string[] } {
    const positive: string[] = [];
    const negative: string[] = [];

    if (reaction.continuedConversation) {
      positive.push('User continued conversation');
    } else {
      negative.push('Conversation ended');
    }

    if (reaction.emotionalShift === 'improved') {
      positive.push('User emotional state improved');
    } else if (reaction.emotionalShift === 'declined') {
      negative.push('User emotional state declined');
    }

    if (reaction.openedUpMore) {
      positive.push('User opened up more');
    }

    if (reaction.askedFollowUp) {
      positive.push('User asked follow-up question');
    }

    if (reaction.topicShift && !context.analysis.context.isTopicShift) {
      negative.push('Unexpected topic shift (possible disengagement)');
    }

    if (context.analysis.mismatch.detected && reaction.openedUpMore) {
      positive.push('Voice-text mismatch led to deeper sharing');
    }

    if (context.humanization.focusedSupportMode && reaction.emotionalShift === 'improved') {
      positive.push('Focused support mode was effective');
    }

    return { positive, negative };
  }

  private updateBuilderStats(signal: NaturalnessSignal): void {
    for (const builderName of signal.context.buildersUsed) {
      const stats = this.builderStats.get(builderName) || {
        total: 0,
        scoreSum: 0,
        positiveCount: 0,
      };

      stats.total++;
      stats.scoreSum += signal.naturalnessScore;
      if (
        signal.reaction.continuedConversation &&
        (signal.reaction.emotionalShift === 'improved' || signal.reaction.openedUpMore)
      ) {
        stats.positiveCount++;
      }

      this.builderStats.set(builderName, stats);
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Record response context for feedback
 */
export function recordResponse(context: ResponseContext): void {
  NaturalnessFeedbackLoop.getInstance().recordResponseContext(context);
}

/**
 * Record user reaction
 */
export function recordReaction(turnId: string, reaction: UserReaction): NaturalnessSignal | null {
  return NaturalnessFeedbackLoop.getInstance().recordUserReaction(turnId, reaction);
}

/**
 * Get builder effectiveness report
 */
export function getEffectivenessReport(): BuilderEffectiveness[] {
  return NaturalnessFeedbackLoop.getInstance().getBuilderEffectiveness();
}

/**
 * Get recommendations for improvement
 */
export function getRecommendations(): string[] {
  return NaturalnessFeedbackLoop.getInstance().getRecommendations();
}

export default NaturalnessFeedbackLoop;

