/**
 * Enhanced Turn Prediction with Prosodic Phrase Boundaries
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Goes beyond basic silence detection to predict turn completion using:
 * 1. **Intonational Phrase Boundaries (IPBs)**: Falling pitch indicates statement end
 * 2. **Boundary Tone Analysis**: Final rising = question/continue, falling = complete
 * 3. **Pre-boundary Lengthening**: Words before boundaries are typically lengthened
 * 4. **Pause-Internal Cues**: Not all pauses are turn-final
 *
 * Research basis:
 * - Gravano & Hirschberg (2011): Turn-yielding cues in dialogue
 * - Heldner & Edlund (2010): Pauses, gaps and overlaps
 *
 * @module EnhancedTurnPrediction
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ProsodyFeatures } from '../audio-prosody.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const log = getLogger().child({ module: 'EnhancedTurnPrediction' });

// Check Rust availability at module load
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Intonational phrase boundary detection result
 */
export interface PhraseBoundaryResult {
  /** Is this likely an intonational phrase boundary? */
  isPhraseBoundary: boolean;
  /** Boundary type */
  boundaryType: 'continuation' | 'question' | 'statement' | 'emphasis' | 'none';
  /** Confidence (0-1) */
  confidence: number;
  /** Pitch contour at boundary */
  boundaryContour: 'rising' | 'falling' | 'level' | 'complex';
  /** Pre-boundary lengthening detected */
  hasPreBoundaryLengthening: boolean;
}

/**
 * Turn completion prediction with prosodic evidence
 */
export interface TurnPredictionResult {
  /** Probability that turn is complete (0-1) */
  completionProbability: number;
  /** Recommended action */
  recommendation: 'wait' | 'take_turn' | 'backchannel' | 'uncertain';
  /** Evidence supporting the prediction */
  evidence: {
    /** Phrase boundary analysis */
    phraseBoundary: PhraseBoundaryResult;
    /** Syntactic completeness estimate (from text) */
    syntacticComplete: boolean;
    /** Silence duration (ms) */
    silenceDuration: number;
    /** User's typical turn duration (ms) */
    typicalTurnDuration: number;
    /** Current turn duration (ms) */
    currentTurnDuration: number;
    /** Turn duration ratio (current / typical) */
    turnDurationRatio: number;
  };
  /** Explanation for debugging */
  reason: string;
}

/**
 * Turn history for learning patterns
 */
interface TurnHistoryEntry {
  duration: number;
  hadFinalFall: boolean;
  wasQuestion: boolean;
  silenceBeforeNext: number;
  timestamp: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Pitch thresholds for boundary detection
  PITCH_FALL_THRESHOLD: -30, // Hz drop for falling contour
  PITCH_RISE_THRESHOLD: 20, // Hz rise for rising contour
  PITCH_LEVEL_TOLERANCE: 10, // Hz variance for level contour

  // Pre-boundary lengthening
  LENGTHENING_RATIO: 1.3, // 30% longer = pre-boundary

  // Turn duration thresholds
  MIN_TURN_DURATION: 500, // ms - too short to be complete turn
  DEFAULT_TURN_DURATION: 4000, // ms - typical turn length
  MAX_TURN_DURATION: 15000, // ms - very long turn

  // Silence thresholds
  SHORT_PAUSE: 200, // ms - within-turn pause
  MEDIUM_PAUSE: 500, // ms - phrase boundary pause
  LONG_PAUSE: 800, // ms - potential turn boundary

  // Confidence thresholds
  HIGH_CONFIDENCE: 0.8,
  MEDIUM_CONFIDENCE: 0.5,
  LOW_CONFIDENCE: 0.3,

  // History settings
  MAX_HISTORY: 20,
};

// ============================================================================
// PHRASE BOUNDARY DETECTION
// ============================================================================

/**
 * Detect intonational phrase boundary from prosodic features
 */
export function detectPhraseBoundary(
  prosody: ProsodyFeatures,
  previousProsody?: ProsodyFeatures
): PhraseBoundaryResult {
  // Analyze pitch contour at potential boundary
  const pitchChange = prosody.pitchMean - (previousProsody?.pitchMean || prosody.pitchMean);

  let boundaryContour: PhraseBoundaryResult['boundaryContour'] = 'level';
  if (pitchChange < CONFIG.PITCH_FALL_THRESHOLD) {
    boundaryContour = 'falling';
  } else if (pitchChange > CONFIG.PITCH_RISE_THRESHOLD) {
    boundaryContour = 'rising';
  } else if (Math.abs(pitchChange) <= CONFIG.PITCH_LEVEL_TOLERANCE) {
    boundaryContour = 'level';
  } else {
    boundaryContour = 'complex';
  }

  // Detect pre-boundary lengthening
  // Longer syllables before boundaries are common in natural speech
  const currentDuration = prosody.utteranceDuration || 0;
  const previousDuration = previousProsody?.utteranceDuration || currentDuration;
  const hasPreBoundaryLengthening = currentDuration > previousDuration * CONFIG.LENGTHENING_RATIO;

  // Determine boundary type
  let boundaryType: PhraseBoundaryResult['boundaryType'] = 'none';
  let confidence = 0;

  if (boundaryContour === 'falling') {
    // Falling pitch = statement end (most reliable cue)
    boundaryType = 'statement';
    confidence = 0.8;
    if (hasPreBoundaryLengthening) {
      confidence += 0.1; // Extra confidence
    }
  } else if (boundaryContour === 'rising') {
    // Rising pitch = question or continuation
    // Need context to disambiguate
    if (prosody.pitchRange > 100) {
      // Wide pitch range = question
      boundaryType = 'question';
      confidence = 0.7;
    } else {
      // Narrower rise = continuation
      boundaryType = 'continuation';
      confidence = 0.5;
    }
  } else if (boundaryContour === 'level' && hasPreBoundaryLengthening) {
    // Level with lengthening = emphasis or list item
    boundaryType = 'emphasis';
    confidence = 0.6;
  } else if (boundaryContour === 'complex') {
    // Complex contour - could be anything
    boundaryType = 'none';
    confidence = 0.3;
  }

  // Is this a phrase boundary?
  const isPhraseBoundary = boundaryType !== 'none' && confidence > 0.4;

  return {
    isPhraseBoundary,
    boundaryType,
    confidence,
    boundaryContour,
    hasPreBoundaryLengthening,
  };
}

// ============================================================================
// SYNTACTIC COMPLETENESS ESTIMATION
// ============================================================================

/**
 * Estimate if utterance is syntactically complete
 * This is a heuristic - not a full parser
 */
export function estimateSyntacticCompleteness(text: string): {
  isComplete: boolean;
  confidence: number;
  reason: string;
} {
  const trimmed = text.trim().toLowerCase();

  // Empty or very short
  if (trimmed.length < 3) {
    return { isComplete: false, confidence: 0.3, reason: 'Too short' };
  }

  // Check for incomplete patterns
  const incompletePatterns = [
    /\b(and|or|but|so|because|if|when|while|although|unless|since)\s*$/, // Conjunctions at end
    /\b(the|a|an|my|your|this|that|these|those)\s*$/, // Determiners at end
    /\b(is|are|was|were|will|would|could|should|have|has|had)\s*$/, // Auxiliary at end
    /\b(to|for|from|with|at|by|in|on)\s*$/, // Prepositions at end
    /\b(very|really|quite|pretty|so)\s*$/, // Adverbs expecting more
    /,\s*$/, // Trailing comma
    /\b(like|um|uh|well)\s*$/, // Hesitation markers
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(trimmed)) {
      return {
        isComplete: false,
        confidence: 0.7,
        reason: `Ends with incomplete word: ${trimmed.slice(-15)}`,
      };
    }
  }

  // Check for complete patterns
  const completePatterns = [
    /[.!?]$/, // Sentence-final punctuation
    /\b(yes|no|okay|sure|right|thanks|bye|goodbye)$/, // Complete single-word responses
    /\b(that's all|that's it|I'm done|nothing else)$/, // Explicit completion
  ];

  for (const pattern of completePatterns) {
    if (pattern.test(trimmed)) {
      return {
        isComplete: true,
        confidence: 0.8,
        reason: 'Ends with complete pattern',
      };
    }
  }

  // Heuristic: longer utterances are more likely complete
  // 🦀 Use Rust for O(1) word counting when available
  const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(trimmed) : trimmed.split(/\s+/).length;
  if (wordCount >= 5) {
    // Check for verb presence (crude)
    const hasVerb =
      /\b(is|are|was|were|do|does|did|have|has|had|will|would|can|could|should|may|might|go|come|want|need|think|feel|know|see|make|get|take|give)\b/.test(
        trimmed
      );
    if (hasVerb) {
      return {
        isComplete: true,
        confidence: 0.5,
        reason: 'Has verb and reasonable length',
      };
    }
  }

  // Default: uncertain
  return {
    isComplete: false,
    confidence: 0.3,
    reason: 'Uncertain syntactic status',
  };
}

// ============================================================================
// TURN PREDICTION SERVICE
// ============================================================================

export class EnhancedTurnPredictionService {
  private turnHistory: TurnHistoryEntry[] = [];
  private currentTurnStart: number | null = null;
  private lastProsody: ProsodyFeatures | null = null;
  private userTypicalTurnDuration: number = CONFIG.DEFAULT_TURN_DURATION;

  constructor(private sessionId: string) {
    log.debug({ sessionId }, '🎯 Enhanced turn prediction service initialized');
  }

  /**
   * Predict if user has completed their turn
   */
  predict(
    prosody: ProsodyFeatures,
    transcriptSoFar: string,
    silenceDuration: number
  ): TurnPredictionResult {
    // Track turn start
    if (!this.currentTurnStart) {
      this.currentTurnStart = Date.now();
    }

    const currentTurnDuration = Date.now() - this.currentTurnStart;
    const turnDurationRatio = currentTurnDuration / this.userTypicalTurnDuration;

    // Analyze phrase boundary
    const phraseBoundary = detectPhraseBoundary(prosody, this.lastProsody || undefined);
    this.lastProsody = prosody;

    // Estimate syntactic completeness
    const syntactic = estimateSyntacticCompleteness(transcriptSoFar);

    // Calculate completion probability using multiple cues
    let completionProbability = 0;
    const reasons: string[] = [];

    // 1. Phrase boundary evidence (strongest cue)
    if (phraseBoundary.boundaryType === 'statement') {
      completionProbability += 0.35 * phraseBoundary.confidence;
      reasons.push('Falling pitch (statement)');
    } else if (phraseBoundary.boundaryType === 'question') {
      completionProbability += 0.3 * phraseBoundary.confidence;
      reasons.push('Rising pitch (question)');
    } else if (phraseBoundary.boundaryType === 'continuation') {
      completionProbability -= 0.15; // User wants to continue
      reasons.push('Continuation contour (wait)');
    }

    // 2. Syntactic evidence
    if (syntactic.isComplete) {
      completionProbability += 0.25 * syntactic.confidence;
      reasons.push('Syntactically complete');
    } else {
      completionProbability -= 0.1;
      reasons.push(syntactic.reason);
    }

    // 3. Silence duration evidence
    if (silenceDuration > CONFIG.LONG_PAUSE) {
      completionProbability += 0.25;
      reasons.push(`Long pause (${silenceDuration}ms)`);
    } else if (silenceDuration > CONFIG.MEDIUM_PAUSE) {
      completionProbability += 0.15;
      reasons.push(`Medium pause (${silenceDuration}ms)`);
    } else if (silenceDuration < CONFIG.SHORT_PAUSE) {
      completionProbability -= 0.1;
      reasons.push('Short pause (likely mid-utterance)');
    }

    // 4. Turn duration evidence
    if (turnDurationRatio > 1.5) {
      completionProbability += 0.1; // Longer than usual
      reasons.push('Longer than typical turn');
    } else if (turnDurationRatio < 0.3) {
      completionProbability -= 0.15; // Very short
      reasons.push('Very short turn');
    }

    // Clamp to 0-1
    completionProbability = Math.max(0, Math.min(1, completionProbability));

    // Determine recommendation
    let recommendation: TurnPredictionResult['recommendation'];
    if (completionProbability > CONFIG.HIGH_CONFIDENCE) {
      recommendation = 'take_turn';
    } else if (completionProbability > CONFIG.MEDIUM_CONFIDENCE) {
      // If syntactically incomplete, wait; otherwise backchannel
      recommendation = syntactic.isComplete ? 'backchannel' : 'wait';
    } else if (completionProbability > CONFIG.LOW_CONFIDENCE) {
      recommendation = 'uncertain';
    } else {
      recommendation = 'wait';
    }

    return {
      completionProbability,
      recommendation,
      evidence: {
        phraseBoundary,
        syntacticComplete: syntactic.isComplete,
        silenceDuration,
        typicalTurnDuration: this.userTypicalTurnDuration,
        currentTurnDuration,
        turnDurationRatio,
      },
      reason: reasons.join('; '),
    };
  }

  /**
   * Record completed turn for learning
   */
  recordTurnComplete(
    duration: number,
    hadFinalFall: boolean,
    wasQuestion: boolean,
    silenceBeforeNext: number
  ): void {
    this.turnHistory.push({
      duration,
      hadFinalFall,
      wasQuestion,
      silenceBeforeNext,
      timestamp: Date.now(),
    });

    if (this.turnHistory.length > CONFIG.MAX_HISTORY) {
      this.turnHistory.shift();
    }

    // Update typical turn duration (exponential moving average)
    const alpha = 0.3;
    this.userTypicalTurnDuration = alpha * duration + (1 - alpha) * this.userTypicalTurnDuration;

    // Reset current turn
    this.currentTurnStart = null;
    this.lastProsody = null;

    log.debug(
      {
        duration,
        typicalDuration: Math.round(this.userTypicalTurnDuration),
        historySize: this.turnHistory.length,
      },
      '🎯 Turn recorded, pattern updated'
    );
  }

  /**
   * Get user's turn-taking patterns
   */
  getPatterns(): {
    typicalTurnDuration: number;
    typicalSilence: number;
    questionRatio: number;
    fallingEndRatio: number;
  } {
    if (this.turnHistory.length === 0) {
      return {
        typicalTurnDuration: CONFIG.DEFAULT_TURN_DURATION,
        typicalSilence: CONFIG.MEDIUM_PAUSE,
        questionRatio: 0.2,
        fallingEndRatio: 0.7,
      };
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const ratio = (arr: boolean[]) => arr.filter(Boolean).length / arr.length;

    return {
      typicalTurnDuration: avg(this.turnHistory.map((t) => t.duration)),
      typicalSilence: avg(this.turnHistory.map((t) => t.silenceBeforeNext)),
      questionRatio: ratio(this.turnHistory.map((t) => t.wasQuestion)),
      fallingEndRatio: ratio(this.turnHistory.map((t) => t.hadFinalFall)),
    };
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.turnHistory = [];
    this.currentTurnStart = null;
    this.lastProsody = null;
    this.userTypicalTurnDuration = CONFIG.DEFAULT_TURN_DURATION;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

const enhancedTurnPredictorRegistry = createSessionRegistry(
  (sessionId: string) => new EnhancedTurnPredictionService(sessionId),
  { name: 'EnhancedTurnPredictor', cleanup: (service) => service.reset(), verbose: false }
);

registerGlobalRegistry(enhancedTurnPredictorRegistry);

export function getEnhancedTurnPredictor(sessionId: string): EnhancedTurnPredictionService {
  return enhancedTurnPredictorRegistry.get(sessionId);
}

export function resetEnhancedTurnPredictor(sessionId: string): void {
  enhancedTurnPredictorRegistry.reset(sessionId);
  log.debug({ sessionId }, '🎯 Enhanced turn predictor reset');
}

export function getActiveEnhancedTurnPredictorCount(): number {
  return enhancedTurnPredictorRegistry.getActiveCount();
}
