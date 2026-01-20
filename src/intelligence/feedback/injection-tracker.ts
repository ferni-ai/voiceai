/**
 * Injection Effectiveness Tracker
 *
 * Phase 1 of BTH Communication System Overhaul:
 * Track which injections actually influence LLM responses and user reactions.
 *
 * The problem: We generate 90+ context injections but only 6 reach the LLM.
 * We have NO IDEA if those 6 are actually helping.
 *
 * This module tracks:
 * 1. Which injections were delivered to the LLM
 * 2. Whether the LLM response aligned with the injection (semantic similarity)
 * 3. How the user reacted in their next turn
 * 4. Builder-level ROI metrics
 *
 * @module intelligence/feedback/injection-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { nanoid } from 'nanoid';

const log = createLogger({ module: 'injection-tracker' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Minimal injection interface - works with both processor and context-builder types.
 * Both ContextInjection types have these core fields.
 */
export interface MinimalInjection {
  /** Category of the injection */
  category: string;
  /** The injection content */
  content: string;
  /** Priority level */
  priority: number | string;
  /** Source builder (may be missing in processor type) */
  source?: string;
}

/**
 * Tracking ID attached to each injection for attribution
 */
export interface TrackedInjection extends MinimalInjection {
  /** Unique tracking ID for attribution */
  trackingId: string;
  /** Timestamp when delivered to LLM */
  deliveredAt: number;
  /** Builder that produced this injection */
  builderName: string;
}

/**
 * Feedback about a single injection's effectiveness
 */
export interface InjectionFeedback {
  /** Unique tracking ID */
  trackingId: string;
  /** Session ID for grouping */
  sessionId: string;
  /** User ID for personalization learning */
  userId: string;
  /** Injection category */
  category: string;
  /** Builder that produced this */
  builderName: string;
  /** Was the LLM response semantically aligned with the injection? */
  wasUsedInResponse: boolean;
  /** Semantic similarity score (0-1) between injection and response */
  responseAlignment: number;
  /** User's reaction in next turn (null if session ended) */
  userReaction: 'positive' | 'neutral' | 'negative' | null;
  /** Conversation mode when injection was delivered */
  conversationMode: string;
  /** Injection priority level */
  priority: string;
  /** Injection content (truncated for storage) */
  contentPreview: string;
  /** Timestamp of injection delivery */
  deliveredAt: Date;
  /** Timestamp of feedback capture */
  capturedAt: Date;
}

/**
 * Aggregated metrics for a builder
 */
export interface BuilderMetrics {
  builderName: string;
  category: string;
  /** Total times this builder produced an injection that was delivered */
  deliveryCount: number;
  /** Times the LLM response aligned with the injection */
  alignmentCount: number;
  /** Times user reacted positively */
  positiveReactionCount: number;
  /** Times user reacted negatively */
  negativeReactionCount: number;
  /** Times user reacted neutrally */
  neutralReactionCount: number;
  /** Average alignment score */
  avgAlignmentScore: number;
  /** Calculated ROI score (0-100) */
  roiScore: number;
  /** Last updated */
  updatedAt: Date;
}

/**
 * Session-level tracking state
 */
interface SessionTrackingState {
  /** Injections delivered in the last turn */
  lastTurnInjections: TrackedInjection[];
  /** Last LLM response for comparison */
  lastResponse: string | null;
  /** Pending feedback waiting for user reaction */
  pendingFeedback: Map<string, Partial<InjectionFeedback>>;
  /** All feedback collected this session */
  sessionFeedback: InjectionFeedback[];
}

// ============================================================================
// STATE
// ============================================================================

/**
 * Per-session tracking state
 */
const sessionState = new Map<string, SessionTrackingState>();

/**
 * Get or create session state
 */
function getSessionState(sessionId: string): SessionTrackingState {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastTurnInjections: [],
      lastResponse: null,
      pendingFeedback: new Map(),
      sessionFeedback: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// INJECTION TAGGING
// ============================================================================

/**
 * Tag injections with tracking IDs before delivery to LLM.
 * Call this AFTER filtering, on the injections that will actually be used.
 */
export function tagInjectionsForTracking(
  injections: MinimalInjection[],
  sessionId: string
): TrackedInjection[] {
  const state = getSessionState(sessionId);
  const now = Date.now();

  const tracked: TrackedInjection[] = injections.map((injection) => ({
    ...injection,
    trackingId: `inj_${nanoid(10)}`,
    deliveredAt: now,
    builderName: injection.source || 'unknown',
  }));

  // Store for later attribution
  state.lastTurnInjections = tracked;

  log.debug(
    { sessionId, count: tracked.length },
    'Tagged injections for tracking'
  );

  return tracked;
}

// ============================================================================
// RESPONSE ATTRIBUTION
// ============================================================================

/**
 * Simple keyword extraction for similarity comparison.
 * Intentionally lightweight - we don't need embeddings here.
 */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

/**
 * Calculate Jaccard similarity between two texts.
 * Returns 0-1 where 1 = identical keyword sets.
 */
function calculateSimilarity(text1: string, text2: string): number {
  const a = extractKeywords(text1);
  const b = extractKeywords(text2);

  if (a.size === 0 || b.size === 0) return 0;

  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

/**
 * Determine if an injection was "used" based on response alignment.
 * Threshold tuned empirically - 0.15 catches most intentional references.
 */
const ALIGNMENT_THRESHOLD = 0.15;

/**
 * Analyze the LLM response to determine which injections influenced it.
 * Call this AFTER receiving the LLM response.
 */
export function analyzeResponseAlignment(
  sessionId: string,
  userId: string,
  llmResponse: string,
  conversationMode: string
): void {
  const state = getSessionState(sessionId);

  if (state.lastTurnInjections.length === 0) {
    return; // No injections to track
  }

  state.lastResponse = llmResponse;
  const now = new Date();

  for (const injection of state.lastTurnInjections) {
    const alignment = calculateSimilarity(injection.content, llmResponse);
    const wasUsed = alignment >= ALIGNMENT_THRESHOLD;

    const feedback: Partial<InjectionFeedback> = {
      trackingId: injection.trackingId,
      sessionId,
      userId,
      category: injection.category || 'unknown',
      builderName: injection.builderName,
      wasUsedInResponse: wasUsed,
      responseAlignment: alignment,
      userReaction: null, // Will be filled in on next turn
      conversationMode,
      priority: String(injection.priority),
      contentPreview: injection.content.slice(0, 100),
      deliveredAt: new Date(injection.deliveredAt),
      capturedAt: now,
    };

    // Store as pending - waiting for user reaction
    state.pendingFeedback.set(injection.trackingId, feedback);
  }

  log.debug(
    {
      sessionId,
      injectionCount: state.lastTurnInjections.length,
      avgAlignment: (
        state.lastTurnInjections.reduce(
          (sum, inj) =>
            sum + calculateSimilarity(inj.content, llmResponse),
          0
        ) / state.lastTurnInjections.length
      ).toFixed(3),
    },
    'Analyzed response alignment'
  );

  // Clear last turn injections after analysis
  state.lastTurnInjections = [];
}

// ============================================================================
// USER REACTION CAPTURE
// ============================================================================

/**
 * Keywords indicating positive user reaction
 */
const POSITIVE_INDICATORS = new Set([
  'yes',
  'yeah',
  'thanks',
  'thank',
  'helpful',
  'great',
  'perfect',
  'exactly',
  'right',
  'good',
  'love',
  'appreciate',
  'understand',
  'makes sense',
  '!',
]);

/**
 * Keywords indicating negative user reaction
 */
const NEGATIVE_INDICATORS = new Set([
  'no',
  'not',
  "don't",
  "doesn't",
  "didn't",
  'wrong',
  'but',
  'however',
  'actually',
  'confused',
  'wait',
  'stop',
  'hold on',
  "that's not",
  '?', // Questions after response often indicate confusion
]);

/**
 * Analyze user's next turn to determine reaction to previous response.
 * This is heuristic - not perfect, but captures signal over time.
 */
function analyzeUserReaction(
  userText: string
): 'positive' | 'neutral' | 'negative' {
  const text = userText.toLowerCase();
  const words = text.split(/\s+/);

  let positiveScore = 0;
  let negativeScore = 0;

  for (const word of words) {
    if (POSITIVE_INDICATORS.has(word)) positiveScore++;
    if (NEGATIVE_INDICATORS.has(word)) negativeScore++;
  }

  // Check for phrases
  if (text.includes('makes sense')) positiveScore += 2;
  if (text.includes("that's not")) negativeScore += 2;
  if (text.includes('hold on')) negativeScore += 2;

  // Short positive responses are likely agreement
  if (text.length < 20 && (text.includes('yeah') || text.includes('yes'))) {
    positiveScore += 2;
  }

  // Questions after response may indicate confusion
  if (text.endsWith('?') && text.length < 50) {
    negativeScore += 1;
  }

  if (positiveScore > negativeScore && positiveScore > 0) return 'positive';
  if (negativeScore > positiveScore && negativeScore > 0) return 'negative';
  return 'neutral';
}

/**
 * Record the user's reaction to complete pending feedback.
 * Call this at the START of each new turn (before processing).
 */
export function recordUserReaction(
  sessionId: string,
  userText: string
): void {
  const state = getSessionState(sessionId);

  if (state.pendingFeedback.size === 0) {
    return; // No pending feedback
  }

  const reaction = analyzeUserReaction(userText);

  // Complete all pending feedback with this reaction
  for (const [, partialFeedback] of state.pendingFeedback) {
    const completeFeedback: InjectionFeedback = {
      ...partialFeedback,
      userReaction: reaction,
    } as InjectionFeedback;

    state.sessionFeedback.push(completeFeedback);
  }

  log.debug(
    {
      sessionId,
      pendingCount: state.pendingFeedback.size,
      reaction,
    },
    'Recorded user reaction for pending injections'
  );

  // Clear pending
  state.pendingFeedback.clear();
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Get all feedback collected in a session.
 * Call this before session cleanup to persist to Firestore.
 */
export function getSessionFeedback(sessionId: string): InjectionFeedback[] {
  const state = sessionState.get(sessionId);
  if (!state) return [];

  // Include any pending feedback (without user reaction)
  const pending = Array.from(state.pendingFeedback.values()) as InjectionFeedback[];

  return [...state.sessionFeedback, ...pending];
}

/**
 * Get summary metrics for a session
 */
export function getSessionMetrics(sessionId: string): {
  totalInjections: number;
  usedCount: number;
  positiveReactions: number;
  negativeReactions: number;
  avgAlignment: number;
} {
  const feedback = getSessionFeedback(sessionId);

  if (feedback.length === 0) {
    return {
      totalInjections: 0,
      usedCount: 0,
      positiveReactions: 0,
      negativeReactions: 0,
      avgAlignment: 0,
    };
  }

  const usedCount = feedback.filter((f) => f.wasUsedInResponse).length;
  const positiveReactions = feedback.filter(
    (f) => f.userReaction === 'positive'
  ).length;
  const negativeReactions = feedback.filter(
    (f) => f.userReaction === 'negative'
  ).length;
  const avgAlignment =
    feedback.reduce((sum, f) => sum + f.responseAlignment, 0) /
    feedback.length;

  return {
    totalInjections: feedback.length,
    usedCount,
    positiveReactions,
    negativeReactions,
    avgAlignment,
  };
}

/**
 * Clean up session state
 */
export function cleanupSession(sessionId: string): void {
  sessionState.delete(sessionId);
  log.debug({ sessionId }, 'Cleaned up injection tracking state');
}

// ============================================================================
// BUILDER METRICS AGGREGATION
// ============================================================================

/**
 * Aggregate feedback into builder-level metrics.
 * This should be called periodically or on session end to update Firestore.
 */
export function aggregateBuilderMetrics(
  feedbackItems: InjectionFeedback[]
): Map<string, BuilderMetrics> {
  const metrics = new Map<string, BuilderMetrics>();

  for (const feedback of feedbackItems) {
    const key = feedback.builderName;

    if (!metrics.has(key)) {
      metrics.set(key, {
        builderName: feedback.builderName,
        category: feedback.category,
        deliveryCount: 0,
        alignmentCount: 0,
        positiveReactionCount: 0,
        negativeReactionCount: 0,
        neutralReactionCount: 0,
        avgAlignmentScore: 0,
        roiScore: 0,
        updatedAt: new Date(),
      });
    }

    const m = metrics.get(key)!;
    m.deliveryCount++;

    if (feedback.wasUsedInResponse) {
      m.alignmentCount++;
    }

    switch (feedback.userReaction) {
      case 'positive':
        m.positiveReactionCount++;
        break;
      case 'negative':
        m.negativeReactionCount++;
        break;
      case 'neutral':
        m.neutralReactionCount++;
        break;
    }

    // Running average for alignment score
    m.avgAlignmentScore =
      (m.avgAlignmentScore * (m.deliveryCount - 1) +
        feedback.responseAlignment) /
      m.deliveryCount;
  }

  // Calculate ROI score for each builder
  for (const m of metrics.values()) {
    // ROI = (alignment rate * 50) + (positive rate * 30) - (negative rate * 20)
    const alignmentRate = m.alignmentCount / Math.max(m.deliveryCount, 1);
    const totalReactions =
      m.positiveReactionCount +
      m.negativeReactionCount +
      m.neutralReactionCount;
    const positiveRate =
      m.positiveReactionCount / Math.max(totalReactions, 1);
    const negativeRate =
      m.negativeReactionCount / Math.max(totalReactions, 1);

    m.roiScore = Math.round(
      alignmentRate * 50 + positiveRate * 30 - negativeRate * 20
    );
    m.roiScore = Math.max(0, Math.min(100, m.roiScore)); // Clamp to 0-100
  }

  return metrics;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  tagInjectionsForTracking,
  analyzeResponseAlignment,
  recordUserReaction,
  getSessionFeedback,
  getSessionMetrics,
  cleanupSession,
  aggregateBuilderMetrics,
};
