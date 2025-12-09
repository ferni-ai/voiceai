/**
 * Adaptive Endpointing Service
 *
 * Dynamically adjusts VAD endpointing thresholds based on conversation context.
 * Prevents cutting off users during thinking pauses while staying responsive
 * for quick back-and-forth exchanges.
 *
 * Key insight from Sesame's research:
 * "Traditional VAD struggles with the one-to-many problem: there are countless
 * valid ways to end a turn, but only some fit a given setting."
 *
 * @see https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 */

import { getLogger } from '../utils/safe-logger.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { TopicWeight } from '../speech/speech-context.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EndpointingContext {
  /** Current topic emotional weight */
  topicWeight: TopicWeight;

  /** User's average speaking rate over recent turns (WPM) */
  userSpeakingRate?: number;

  /** How complete does the current sentence seem? (0-1) */
  sentenceCompleteness: number;

  /** User's current emotional intensity (0-1) */
  emotionalIntensity: number;

  /** Current conversation phase */
  conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing';

  /** How long has user been speaking this turn? (ms) */
  currentTurnDuration: number;

  /** Was user interrupted in recent turns? */
  wasRecentlyInterrupted: boolean;

  /** Is this a returning user we know? */
  isReturningUser: boolean;

  /** User's historical pause pattern (average pause length in ms) */
  userTypicalPauseLength?: number;
}

export interface EndpointingThresholds {
  /** Minimum silence before considering turn complete (ms) */
  minEndpointingDelay: number;

  /** Maximum wait time for user to continue (ms) */
  maxEndpointingDelay: number;

  /** Confidence that user is done (0-1) */
  turnCompletionConfidence: number;

  /** Reason for adjustment */
  reason: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MIN_DELAY = 400;
const DEFAULT_MAX_DELAY = 1200;

/** Minimum thresholds to prevent cutting off users */
const ABSOLUTE_MIN_DELAY = 300;
const ABSOLUTE_MAX_DELAY = 2500;

/** Sentence completion indicators */
const COMPLETION_SIGNALS = {
  strong: ['?', '!', '.', 'so yeah', 'you know?', "that's it", 'anyway'],
  weak: ['...', 'um', 'like', 'I mean', 'well'],
  continuation: ['and', 'but', 'so', 'because', 'which', 'that'],
};

// ============================================================================
// ADAPTIVE ENDPOINTING
// ============================================================================

/**
 * Calculate optimal endpointing thresholds based on conversation context
 */
export function calculateEndpointingThresholds(ctx: EndpointingContext): EndpointingThresholds {
  let minDelay = DEFAULT_MIN_DELAY;
  let maxDelay = DEFAULT_MAX_DELAY;
  const reasons: string[] = [];

  // ===== TOPIC WEIGHT ADJUSTMENTS =====
  // Heavy topics (grief, anxiety, big decisions) need more space
  if (ctx.topicWeight === 'heavy') {
    minDelay += 200;
    maxDelay += 400;
    reasons.push('heavy_topic');
  } else if (ctx.topicWeight === 'medium') {
    minDelay += 100;
    maxDelay += 200;
  }

  // ===== SPEAKING RATE ADJUSTMENTS =====
  // Slow speakers (< 100 WPM) naturally pause longer
  if (ctx.userSpeakingRate !== undefined) {
    if (ctx.userSpeakingRate < 100) {
      minDelay += 200;
      maxDelay += 300;
      reasons.push('slow_speaker');
    } else if (ctx.userSpeakingRate > 160) {
      // Fast speakers - be more responsive
      minDelay = Math.max(ABSOLUTE_MIN_DELAY, minDelay - 100);
      maxDelay = Math.max(800, maxDelay - 200);
      reasons.push('fast_speaker');
    }
  }

  // ===== SENTENCE COMPLETENESS =====
  // Low completeness = probably still thinking
  if (ctx.sentenceCompleteness < 0.3) {
    minDelay += 400;
    maxDelay += 600;
    reasons.push('incomplete_thought');
  } else if (ctx.sentenceCompleteness < 0.6) {
    minDelay += 200;
    maxDelay += 300;
    reasons.push('partial_thought');
  }

  // ===== EMOTIONAL INTENSITY =====
  // High emotion = give more space for expression
  if (ctx.emotionalIntensity > 0.7) {
    minDelay += 200;
    maxDelay += 400;
    reasons.push('high_emotion');
  } else if (ctx.emotionalIntensity > 0.5) {
    minDelay += 100;
    maxDelay += 200;
  }

  // ===== CONVERSATION PHASE =====
  // Supporting phase = more patience
  if (ctx.conversationPhase === 'supporting') {
    minDelay += 150;
    maxDelay += 250;
    reasons.push('support_mode');
  } else if (ctx.conversationPhase === 'closing') {
    // Closing = can be more responsive
    minDelay = Math.max(ABSOLUTE_MIN_DELAY, minDelay - 50);
  }

  // ===== TURN DURATION =====
  // Long turn = user is elaborating, give more space
  if (ctx.currentTurnDuration > 30000) {
    // 30+ seconds
    minDelay += 200;
    maxDelay += 300;
    reasons.push('long_elaboration');
  } else if (ctx.currentTurnDuration > 15000) {
    minDelay += 100;
    maxDelay += 150;
  }

  // ===== INTERRUPTION RECOVERY =====
  // If we recently interrupted them, be extra patient
  if (ctx.wasRecentlyInterrupted) {
    minDelay += 250;
    maxDelay += 400;
    reasons.push('interruption_recovery');
  }

  // ===== USER HISTORY =====
  // Adapt to user's known pause patterns
  if (ctx.userTypicalPauseLength !== undefined) {
    // User's typical pause + 20% buffer
    const adaptedMin = Math.round(ctx.userTypicalPauseLength * 1.2);
    if (adaptedMin > minDelay) {
      minDelay = adaptedMin;
      reasons.push('user_pattern_adapted');
    }
  }

  // ===== CLAMP TO SAFE BOUNDS =====
  minDelay = Math.max(ABSOLUTE_MIN_DELAY, Math.min(minDelay, 1000));
  maxDelay = Math.max(minDelay + 200, Math.min(maxDelay, ABSOLUTE_MAX_DELAY));

  // ===== CALCULATE COMPLETION CONFIDENCE =====
  const turnCompletionConfidence = calculateCompletionConfidence(ctx);

  const result: EndpointingThresholds = {
    minEndpointingDelay: minDelay,
    maxEndpointingDelay: maxDelay,
    turnCompletionConfidence,
    reason: reasons.length > 0 ? reasons.join(', ') : 'default',
  };

  getLogger().debug(
    {
      ctx: {
        topicWeight: ctx.topicWeight,
        speakingRate: ctx.userSpeakingRate,
        completeness: ctx.sentenceCompleteness,
        emotion: ctx.emotionalIntensity,
        phase: ctx.conversationPhase,
      },
      result,
    },
    '🎚️ Adaptive endpointing calculated'
  );

  return result;
}

/**
 * Calculate confidence that user has finished their turn
 */
function calculateCompletionConfidence(ctx: EndpointingContext): number {
  let confidence = 0.5; // Start at neutral

  // Sentence completeness is strongest signal
  confidence += (ctx.sentenceCompleteness - 0.5) * 0.4;

  // Short turns with clear endings = higher confidence
  if (ctx.currentTurnDuration < 5000 && ctx.sentenceCompleteness > 0.8) {
    confidence += 0.2;
  }

  // Long turns with trailing off = lower confidence
  if (ctx.currentTurnDuration > 15000 && ctx.sentenceCompleteness < 0.5) {
    confidence -= 0.2;
  }

  // High emotion = might continue
  if (ctx.emotionalIntensity > 0.7) {
    confidence -= 0.15;
  }

  // Heavy topic = give benefit of doubt
  if (ctx.topicWeight === 'heavy') {
    confidence -= 0.1;
  }

  return Math.max(0, Math.min(1, confidence));
}

// ============================================================================
// SENTENCE COMPLETENESS ANALYSIS
// ============================================================================

/**
 * Analyze transcript to estimate sentence completeness
 * Returns 0-1 where 1 = definitely complete
 */
export function analyzeSentenceCompleteness(transcript: string): number {
  if (!transcript || transcript.trim().length === 0) {
    return 0;
  }

  const text = transcript.trim().toLowerCase();
  let score = 0.4; // Start slightly below neutral

  // ===== STRONG COMPLETION SIGNALS =====
  for (const signal of COMPLETION_SIGNALS.strong) {
    if (text.endsWith(signal)) {
      score += 0.4;
      break;
    }
  }

  // Question mark is strongest signal
  if (text.endsWith('?')) {
    score = Math.max(score, 0.95);
  }

  // ===== CONTINUATION SIGNALS =====
  for (const signal of COMPLETION_SIGNALS.continuation) {
    if (text.endsWith(signal) || text.endsWith(`${signal} `)) {
      score -= 0.3;
      break;
    }
  }

  // ===== WEAK/UNCERTAIN SIGNALS =====
  for (const signal of COMPLETION_SIGNALS.weak) {
    if (text.endsWith(signal)) {
      score -= 0.2;
      break;
    }
  }

  // ===== LENGTH HEURISTICS =====
  // Very short = might be incomplete
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 3) {
    score -= 0.1;
  }

  // Sentence structure: starts with question word, should end with ?
  const questionStarts = [
    'who',
    'what',
    'where',
    'when',
    'why',
    'how',
    'can',
    'could',
    'would',
    'should',
  ];
  for (const q of questionStarts) {
    if (text.startsWith(`${q} `) && !text.includes('?')) {
      score -= 0.15;
      break;
    }
  }

  // ===== TRAILING PATTERNS =====
  // "I think..." or "maybe..." = probably continuing
  const trailingPatterns = [
    /i think\.?\.?\.?$/,
    /maybe\.?\.?\.?$/,
    /probably\.?\.?\.?$/,
    /like\.?\.?\.?$/,
    /you know\.?\.?\.?$/,
  ];
  for (const pattern of trailingPatterns) {
    if (pattern.test(text)) {
      score -= 0.2;
      break;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// ADAPTIVE ENDPOINTING SERVICE
// ============================================================================

/**
 * Service that tracks context and provides real-time endpointing recommendations
 */
export class AdaptiveEndpointingService {
  private userSpeakingHistory: number[] = []; // WPM samples
  private userPauseHistory: number[] = []; // pause lengths in ms
  private recentInterruptionTime = 0;
  private currentPhase: EndpointingContext['conversationPhase'] = 'opening';

  /**
   * Record user's speaking rate for adaptation
   */
  recordSpeakingRate(wpm: number): void {
    this.userSpeakingHistory.push(wpm);
    if (this.userSpeakingHistory.length > 10) {
      this.userSpeakingHistory.shift();
    }
  }

  /**
   * Record a pause length for pattern learning
   */
  recordPauseLength(pauseMs: number): void {
    if (pauseMs > 100 && pauseMs < 5000) {
      // Reasonable pause range
      this.userPauseHistory.push(pauseMs);
      if (this.userPauseHistory.length > 20) {
        this.userPauseHistory.shift();
      }
    }
  }

  /**
   * Record that an interruption occurred
   */
  recordInterruption(): void {
    this.recentInterruptionTime = Date.now();
  }

  /**
   * Update conversation phase
   */
  setConversationPhase(phase: EndpointingContext['conversationPhase']): void {
    this.currentPhase = phase;
  }

  /**
   * Get average user speaking rate
   */
  getAverageSpeakingRate(): number | undefined {
    if (this.userSpeakingHistory.length < 3) return undefined;
    return this.userSpeakingHistory.reduce((a, b) => a + b, 0) / this.userSpeakingHistory.length;
  }

  /**
   * Get user's typical pause length
   */
  getTypicalPauseLength(): number | undefined {
    if (this.userPauseHistory.length < 5) return undefined;
    // Use median for robustness
    const sorted = [...this.userPauseHistory].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /**
   * Check if user was recently interrupted
   */
  wasRecentlyInterrupted(): boolean {
    return Date.now() - this.recentInterruptionTime < 60000; // Within last minute
  }

  /**
   * Get current optimal thresholds
   * @param isReturningUser - Whether this is a returning user (affects timing sensitivity)
   */
  getThresholds(
    transcript: string,
    topicWeight: TopicWeight,
    emotion: EmotionResult,
    turnDurationMs: number,
    isReturningUser = false
  ): EndpointingThresholds {
    const ctx: EndpointingContext = {
      topicWeight,
      userSpeakingRate: this.getAverageSpeakingRate(),
      sentenceCompleteness: analyzeSentenceCompleteness(transcript),
      emotionalIntensity: emotion.intensity,
      conversationPhase: this.currentPhase,
      currentTurnDuration: turnDurationMs,
      wasRecentlyInterrupted: this.wasRecentlyInterrupted(),
      isReturningUser,
      userTypicalPauseLength: this.getTypicalPauseLength(),
    };

    return calculateEndpointingThresholds(ctx);
  }

  /**
   * Reset service state (e.g., for new session)
   */
  reset(): void {
    this.userSpeakingHistory = [];
    this.userPauseHistory = [];
    this.recentInterruptionTime = 0;
    this.currentPhase = 'opening';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let serviceInstance: AdaptiveEndpointingService | null = null;

export function getAdaptiveEndpointingService(): AdaptiveEndpointingService {
  if (!serviceInstance) {
    serviceInstance = new AdaptiveEndpointingService();
  }
  return serviceInstance;
}

export function resetAdaptiveEndpointingService(): void {
  serviceInstance?.reset();
  serviceInstance = null;
}
