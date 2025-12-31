/**
 * Turn Prediction Service
 *
 * Predicts when a user has finished their turn, enabling:
 * - Earlier response generation (reduced latency)
 * - Better handling of thinking pauses vs actual completion
 * - More natural conversation flow
 *
 * Uses multiple signals:
 * 1. Sentence completion heuristics (punctuation, completeness)
 * 2. Semantic completeness (is this a complete thought?)
 * 3. Prosodic cues (falling pitch, slowdown - when available)
 * 4. Turn-final phrases ("you know?", "so yeah")
 * 5. User's historical patterns
 *
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  analyzeTurnBoundary,
  countWordsRust,
  isTurnAnalysisAvailable,
  isTokenCountingAvailable,
} from '../memory/rust-accelerator.js';

// Check Rust availability at module load
const RUST_TURN_AVAILABLE = isTurnAnalysisAvailable();
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

const log = getLogger();
if (RUST_TURN_AVAILABLE) {
  log.info('🦀 Turn prediction using Rust Aho-Corasick (38+ phrases → O(n) scan)');
}

// ============================================================================
// TYPES
// ============================================================================

export interface TurnPredictionContext {
  /** Current partial transcript */
  transcript: string;

  /** Time since user started speaking (ms) */
  speakingDurationMs: number;

  /** Current silence duration (ms) */
  silenceDurationMs: number;

  /** User's average WPM from this session */
  userWPM?: number;

  /** Is there a rising or falling intonation? (from audio analysis) */
  intonation?: 'rising' | 'falling' | 'neutral';

  /** Current topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';

  /** User's emotion state */
  emotionIntensity?: number;

  /** Turn count in conversation */
  turnCount: number;
}

export interface TurnPrediction {
  /** Is this likely a complete turn? */
  isComplete: boolean;

  /** Confidence in the prediction (0-1) */
  confidence: number;

  /** Estimated remaining words (0 = done) */
  estimatedRemainingWords: number;

  /** Should we start generating a response? */
  readyToRespond: boolean;

  /** Reason for the prediction */
  reason: string;

  /** Suggested wait time before responding (ms) */
  suggestedWaitMs: number;
}

export interface SentenceCompletenessResult {
  /** Is the sentence grammatically complete? */
  isComplete: boolean;

  /** Confidence (0-1) */
  confidence: number;

  /** Type of ending detected */
  endingType:
    | 'question'
    | 'statement'
    | 'exclamation'
    | 'trailing'
    | 'turn_final_phrase'
    | 'incomplete';

  /** Reason */
  reason: string;
}

// ============================================================================
// TURN-FINAL PHRASES
// ============================================================================

/**
 * Phrases that typically signal end of turn
 */
const TURN_FINAL_PHRASES = [
  // Questions seeking validation
  'you know?',
  'you know what i mean?',
  'know what i mean?',
  'right?',
  "isn't it?",
  "don't you think?",
  'what do you think?',
  'does that make sense?',
  'am i right?',

  // Trailing off / concluding
  'so yeah',
  'so...',
  'anyway',
  'anyway...',
  "that's basically it",
  "that's it",
  "that's all",
  "that's about it",
  'and stuff',
  'and everything',
  'or whatever',
  'something like that',
  'things like that',

  // Seeking response
  "what's your take?",
  'what about you?',
  'your thoughts?',
  "i don't know",
  "i'm not sure",

  // Emotional conclusion
  'i guess',
  'i suppose',
  'i think',
  'probably',
  'maybe',
];

/**
 * Phrases that typically indicate more is coming (NOT turn-final)
 */
const CONTINUATION_PHRASES = [
  'but',
  'and',
  'because',
  'so',
  'although',
  'however',
  'also',
  'plus',
  'first',
  'second',
  'on one hand',
  'on the other hand',
  'for example',
  'like',
  'i mean',
  'well',
  'actually',
  'basically',
  'honestly',
  'the thing is',
  'what i mean is',
];

// ============================================================================
// SENTENCE COMPLETION ANALYSIS
// ============================================================================

/**
 * Analyze if a transcript represents a complete sentence/thought
 */
export function analyzeTranscriptCompleteness(transcript: string): SentenceCompletenessResult {
  const trimmed = transcript.trim();
  const lower = trimmed.toLowerCase();

  // Empty transcript
  if (!trimmed) {
    return {
      isComplete: false,
      confidence: 1,
      endingType: 'incomplete',
      reason: 'Empty transcript',
    };
  }

  // Get word count (Rust or JS fallback)
  const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(trimmed) : trimmed.split(/\s+/).length;

  // Very short (< 3 words) - probably incomplete
  if (wordCount < 3) {
    return {
      isComplete: false,
      confidence: 0.7,
      endingType: 'incomplete',
      reason: 'Too short (< 3 words)',
    };
  }

  // Check for explicit punctuation
  if (trimmed.endsWith('?')) {
    return {
      isComplete: true,
      confidence: 0.95,
      endingType: 'question',
      reason: 'Ends with question mark',
    };
  }

  if (trimmed.endsWith('.')) {
    return {
      isComplete: true,
      confidence: 0.9,
      endingType: 'statement',
      reason: 'Ends with period',
    };
  }

  if (trimmed.endsWith('!')) {
    return {
      isComplete: true,
      confidence: 0.9,
      endingType: 'exclamation',
      reason: 'Ends with exclamation',
    };
  }

  // 🦀 FAST PATH: Use Rust Aho-Corasick for O(n) multi-pattern matching
  // Instead of 38 + 21 = 59 separate string comparisons, scan ALL patterns at once
  if (RUST_TURN_AVAILABLE) {
    const turnAnalysis = analyzeTurnBoundary(lower);

    // Check for turn-final phrases (38+ patterns matched in one pass)
    if (turnAnalysis.turnFinalCount > 0 || turnAnalysis.likelyTurnComplete) {
      return {
        isComplete: true,
        confidence: 0.85,
        endingType: 'turn_final_phrase',
        reason: `Turn-final phrase detected (Rust: ${turnAnalysis.turnFinalCount} matches)`,
      };
    }

    // Check for continuation phrases (21+ patterns matched in one pass)
    if (turnAnalysis.continuationCount > 0 || turnAnalysis.likelyContinuing) {
      return {
        isComplete: false,
        confidence: 0.8,
        endingType: 'incomplete',
        reason: `Continuation phrase detected (Rust: ${turnAnalysis.continuationCount} matches)`,
      };
    }
  } else {
    // 🐢 SLOW PATH: JS fallback (59 separate string comparisons)
    // Check for turn-final phrases
    for (const phrase of TURN_FINAL_PHRASES) {
      if (lower.endsWith(phrase) || lower.endsWith(phrase.replace('?', ''))) {
        return {
          isComplete: true,
          confidence: 0.85,
          endingType: 'turn_final_phrase',
          reason: `Turn-final phrase: "${phrase}"`,
        };
      }
    }

    // Check for continuation phrases at end (NOT complete)
    for (const phrase of CONTINUATION_PHRASES) {
      if (lower.endsWith(phrase) || lower.endsWith(`${phrase},`)) {
        return {
          isComplete: false,
          confidence: 0.8,
          endingType: 'incomplete',
          reason: `Continuation phrase: "${phrase}"`,
        };
      }
    }
  }

  // Check for trailing off (ends with common words that suggest completion)
  const trailingWords = ['it', 'that', 'this', 'them', 'him', 'her', 'me', 'us'];
  const lastWord = lower.split(/\s+/).pop() || '';
  if (trailingWords.includes(lastWord) && wordCount >= 5) {
    return {
      isComplete: true,
      confidence: 0.6,
      endingType: 'trailing',
      reason: 'Trailing pronoun suggests completion',
    };
  }

  // Grammatical completeness heuristics
  const hasSubject = /\b(i|you|he|she|it|we|they|that|this|there)\b/i.test(trimmed);
  const hasVerb =
    /\b(is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|might|'m|'re|'s|'ve|'d|'ll)\b/i.test(
      trimmed
    );

  if (hasSubject && hasVerb && wordCount >= 4) {
    return {
      isComplete: true,
      confidence: 0.55,
      endingType: 'statement',
      reason: 'Has subject and verb, reasonable length',
    };
  }

  // Default: uncertain
  return {
    isComplete: false,
    confidence: 0.4,
    endingType: 'incomplete',
    reason: 'No clear completion signal',
  };
}

// ============================================================================
// TURN PREDICTION SERVICE
// ============================================================================

export class TurnPredictionService {
  // Track user's typical turn patterns
  private userTurnLengths: number[] = [];
  private userPauseLengths: number[] = [];
  private lastPrediction: TurnPrediction | null = null;

  /**
   * Predict if the user has finished their turn
   */
  predict(ctx: TurnPredictionContext): TurnPrediction {
    const sentenceAnalysis = analyzeTranscriptCompleteness(ctx.transcript);

    // Start with sentence completeness
    let { isComplete } = sentenceAnalysis;
    let { confidence } = sentenceAnalysis;
    let { reason } = sentenceAnalysis;

    // Adjust based on silence duration
    if (ctx.silenceDurationMs > 0) {
      const silenceConfidenceBoost = this.getSilenceConfidenceBoost(
        ctx.silenceDurationMs,
        ctx.topicWeight,
        ctx.emotionIntensity
      );
      confidence = Math.min(1, confidence + silenceConfidenceBoost);

      if (ctx.silenceDurationMs > 800 && !isComplete) {
        // Long silence even on incomplete sentence suggests they might be done
        isComplete = true;
        reason += ` + ${ctx.silenceDurationMs}ms silence`;
      }
    }

    // Adjust based on intonation
    if (ctx.intonation) {
      if (ctx.intonation === 'falling' && !isComplete) {
        isComplete = true;
        confidence = Math.min(1, confidence + 0.15);
        reason += ' + falling intonation';
      } else if (ctx.intonation === 'rising' && isComplete) {
        // Rising intonation might mean they're not done
        confidence = Math.max(0, confidence - 0.1);
        reason += ' - rising intonation';
      }
    }

    // Adjust based on user's historical patterns
    if (this.userTurnLengths.length >= 3) {
      const avgTurnLength = this.getAverageValue(this.userTurnLengths);
      const wordCount = RUST_COUNTING_AVAILABLE
        ? countWordsRust(ctx.transcript)
        : ctx.transcript.split(/\s+/).length;

      if (wordCount > avgTurnLength * 1.2) {
        // They've said more than usual - more likely done
        confidence = Math.min(1, confidence + 0.1);
        reason += ' + above avg length';
      }
    }

    // Calculate suggested wait time
    const suggestedWaitMs = this.calculateSuggestedWait(
      isComplete,
      confidence,
      ctx.topicWeight,
      ctx.emotionIntensity
    );

    // Determine if we should start responding
    const readyToRespond = isComplete && confidence >= 0.6;

    // Estimate remaining words (rough heuristic)
    const estimatedRemainingWords = isComplete ? 0 : this.estimateRemainingWords(ctx);

    const prediction: TurnPrediction = {
      isComplete,
      confidence,
      estimatedRemainingWords,
      readyToRespond,
      reason,
      suggestedWaitMs,
    };

    this.lastPrediction = prediction;

    getLogger().debug(
      {
        transcript: ctx.transcript.slice(0, 50),
        isComplete,
        confidence: confidence.toFixed(2),
        readyToRespond,
        reason,
      },
      '🔮 Turn prediction'
    );

    return prediction;
  }

  /**
   * Record actual turn completion for learning
   */
  recordTurnCompletion(wordCount: number, pauseBeforeResponseMs: number): void {
    this.userTurnLengths.push(wordCount);
    this.userPauseLengths.push(pauseBeforeResponseMs);

    // Keep only recent history
    if (this.userTurnLengths.length > 20) {
      this.userTurnLengths.shift();
    }
    if (this.userPauseLengths.length > 20) {
      this.userPauseLengths.shift();
    }
  }

  /**
   * Get confidence boost from silence duration
   */
  private getSilenceConfidenceBoost(
    silenceMs: number,
    topicWeight?: string,
    emotionIntensity?: number
  ): number {
    // Base boost from silence
    let boost = 0;

    if (silenceMs > 300) boost += 0.1;
    if (silenceMs > 500) boost += 0.1;
    if (silenceMs > 800) boost += 0.15;
    if (silenceMs > 1200) boost += 0.15;

    // Heavy topics or high emotion = silence is meaningful, not a completion signal
    if (topicWeight === 'heavy') {
      boost *= 0.7; // Reduce boost
    }
    if (emotionIntensity && emotionIntensity > 0.7) {
      boost *= 0.6; // Reduce boost further
    }

    return boost;
  }

  /**
   * Calculate how long to wait before responding
   */
  private calculateSuggestedWait(
    isComplete: boolean,
    confidence: number,
    topicWeight?: string,
    emotionIntensity?: number
  ): number {
    if (!isComplete) {
      // Not complete - wait longer
      return 1500;
    }

    // Base wait based on confidence
    let waitMs = 400 - confidence * 200; // 400ms at 0 confidence, 200ms at 1.0

    // Heavy topics need more space
    if (topicWeight === 'heavy') {
      waitMs += 150;
    }

    // High emotion needs more space
    if (emotionIntensity && emotionIntensity > 0.7) {
      waitMs += 200;
    }

    // Use historical pause preferences if available
    if (this.userPauseLengths.length >= 3) {
      const avgPause = this.getAverageValue(this.userPauseLengths);
      waitMs = Math.max(waitMs, avgPause * 0.8); // Match their preference (slightly faster)
    }

    return Math.max(100, Math.min(waitMs, 1000));
  }

  /**
   * Estimate remaining words in the turn
   */
  private estimateRemainingWords(ctx: TurnPredictionContext): number {
    const currentWords = RUST_COUNTING_AVAILABLE
      ? countWordsRust(ctx.transcript)
      : ctx.transcript.split(/\s+/).length;

    if (this.userTurnLengths.length >= 3) {
      const avgTurn = this.getAverageValue(this.userTurnLengths);
      const remaining = Math.max(0, avgTurn - currentWords);
      return Math.round(remaining);
    }

    // Default estimate based on how far along they seem
    if (currentWords < 5) return 5;
    if (currentWords < 10) return 3;
    return 1;
  }

  /**
   * Get average of an array
   */
  private getAverageValue(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Get the last prediction
   */
  getLastPrediction(): TurnPrediction | null {
    return this.lastPrediction;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.userTurnLengths = [];
    this.userPauseLengths = [];
    this.lastPrediction = null;
  }
}

// ============================================================================
// PRE-EMPTIVE RESPONSE GENERATION
// ============================================================================

export interface PreemptiveGenerationDecision {
  /** Should we start generating? */
  shouldGenerate: boolean;

  /** What confidence threshold triggered this? */
  triggerConfidence: number;

  /** How much to prepare (full response vs. opening) */
  preparationLevel: 'opening_only' | 'partial' | 'full';

  /** Reason */
  reason: string;
}

/**
 * Decide if we should start generating a response preemptively
 */
export function decidePreemptiveGeneration(
  prediction: TurnPrediction,
  currentLatencyMs: number
): PreemptiveGenerationDecision {
  // If highly confident they're done, go full
  if (prediction.confidence >= 0.85 && prediction.isComplete) {
    return {
      shouldGenerate: true,
      triggerConfidence: prediction.confidence,
      preparationLevel: 'full',
      reason: 'High confidence completion',
    };
  }

  // If moderately confident and latency is high, start partial
  if (prediction.confidence >= 0.65 && currentLatencyMs > 500) {
    return {
      shouldGenerate: true,
      triggerConfidence: prediction.confidence,
      preparationLevel: 'partial',
      reason: 'Moderate confidence + high latency',
    };
  }

  // If low confidence but sentence seems complete, prepare opening
  if (prediction.confidence >= 0.5 && prediction.isComplete) {
    return {
      shouldGenerate: true,
      triggerConfidence: prediction.confidence,
      preparationLevel: 'opening_only',
      reason: 'Complete sentence, moderate confidence',
    };
  }

  // Don't generate yet
  return {
    shouldGenerate: false,
    triggerConfidence: prediction.confidence,
    preparationLevel: 'opening_only',
    reason: 'Insufficient confidence',
  };
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const turnPredictionRegistry = createSessionRegistry(
  (sessionId: string) => new TurnPredictionService(),
  { name: 'TurnPrediction', cleanup: (service) => service.reset(), verbose: false }
);

registerGlobalRegistry(turnPredictionRegistry);

export function getTurnPredictionService(sessionId: string): TurnPredictionService {
  return turnPredictionRegistry.get(sessionId);
}

export function resetTurnPredictionService(sessionId: string): void {
  turnPredictionRegistry.reset(sessionId);
}

export function resetAllTurnPrediction(): void {
  turnPredictionRegistry.resetAll();
}

export function getActiveTurnPredictionCount(): number {
  return turnPredictionRegistry.getActiveCount();
}
