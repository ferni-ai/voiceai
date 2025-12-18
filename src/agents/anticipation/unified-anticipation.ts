/**
 * Unified Anticipation Engine
 *
 * Single entry point for ALL anticipation systems:
 * - Intent prediction (what do they want?)
 * - Emotion prediction (how will they feel?)
 * - Prosody preparation (how should we sound?)
 * - Response pre-computation (be ready before they finish)
 *
 * This consolidates the previously fragmented anticipation systems:
 * - src/speech/anticipation/pipeline.ts
 * - src/speech/response-anticipation/service.ts
 * - src/speech/sesame-inspired/anticipatory-prosody.ts
 * - src/conversation/predictive-anticipation.ts
 *
 * @module UnifiedAnticipation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'UnifiedAnticipation' });

// ============================================================================
// TYPES
// ============================================================================

export interface PartialTranscript {
  /** The partial text spoken so far */
  text: string;
  /** Whether user is currently speaking */
  isSpeaking: boolean;
  /** Detected tone from voice */
  tone?: 'neutral' | 'excited' | 'sad' | 'frustrated' | 'curious' | 'anxious';
  /** Speech rate: slow/normal/fast */
  speechRate?: 'slow' | 'normal' | 'fast';
  /** Silence duration in ms (if paused) */
  silenceMs?: number;
  /** Timestamp */
  timestamp?: number;
}

export interface IntentPrediction {
  /** Predicted intent */
  intent: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Whether intent detection is complete */
  isComplete: boolean;
  /** Supporting signals */
  signals: string[];
}

export interface EmotionPrediction {
  /** Predicted emotion */
  emotion: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Valence: negative to positive */
  valence: number;
  /** Arousal: calm to excited */
  arousal: number;
}

export interface ProsodyPreparation {
  /** Speed multiplier */
  speedMultiplier: number;
  /** Volume multiplier */
  volumeMultiplier: number;
  /** Pause multiplier */
  pauseMultiplier: number;
  /** Whether to use softer delivery */
  softerDelivery: boolean;
  /** Opening micro-reaction SSML */
  microReactionSsml: string | null;
}

export interface AnticipationState {
  /** Intent prediction */
  intent: IntentPrediction;
  /** Emotion prediction */
  emotion: EmotionPrediction;
  /** Prosody preparation */
  prosody: ProsodyPreparation;
  /** Whether we're ready to respond */
  readyForResponse: boolean;
  /** Combined confidence */
  overallConfidence: number;
  /** Timestamp of last update */
  lastUpdateMs: number;
}

export interface PrecomputedResponse {
  /** The pre-computed response text */
  response: string;
  /** Confidence in this response */
  confidence: number;
  /** Intent this responds to */
  intent: string;
  /** Emotion context */
  emotionContext: string;
  /** When this was computed */
  computedAt: number;
}

// ============================================================================
// INTENT PATTERNS
// ============================================================================

const INTENT_PATTERNS: Record<string, RegExp[]> = {
  seeking_advice: [
    /what (should|do) (i|you think)/i,
    /how (should|can|do) i/i,
    /any (advice|suggestions|thoughts)/i,
    /what would you/i,
  ],
  venting: [
    /i (just )?need to (vent|talk|get this out)/i,
    /can i (just )?tell you/i,
    /i('m| am) so (frustrated|angry|upset)/i,
    /ugh|argh/i,
  ],
  sharing_news: [
    /guess what/i,
    /i (have|got) (some )?(news|something to tell)/i,
    /you('ll| will) never (guess|believe)/i,
    /so (get this|listen)/i,
  ],
  asking_question: [
    /\?$/,
    /^(what|why|how|when|where|who|is|are|do|does|can|could|would|should)/i,
    /i('m| am) wondering/i,
    /do you (think|know)/i,
  ],
  seeking_validation: [
    /was (i|that) (right|wrong|okay)/i,
    /did i (do|handle) (it|that|this) (right|well|okay)/i,
    /am i (being|over)/i,
    /is (it|that) (normal|okay|weird)/i,
  ],
  celebrating: [/i did it/i, /it (worked|happened)/i, /finally/i, /yes!/i, /woo/i],
  struggling: [
    /i (can't|cannot|don't know how to)/i,
    /i('m| am) (stuck|lost|confused)/i,
    /nothing (is )?working/i,
    /i (don't|do not) know what to do/i,
  ],
  checking_in: [
    /how are you/i,
    /what('s| is) up/i,
    /hey|hi|hello/i,
    /good (morning|afternoon|evening)/i,
  ],
};

// ============================================================================
// EMOTION PATTERNS
// ============================================================================

const EMOTION_PATTERNS: Record<string, { patterns: RegExp[]; valence: number; arousal: number }> = {
  excited: {
    patterns: [/!+/, /amazing|awesome|incredible|fantastic/i, /can't wait|so excited/i],
    valence: 0.8,
    arousal: 0.8,
  },
  happy: {
    patterns: [/happy|glad|pleased|delighted/i, /great|good|wonderful/i, /smile|laugh/i],
    valence: 0.7,
    arousal: 0.5,
  },
  sad: {
    patterns: [/sad|down|blue|depressed/i, /miss|lost|gone/i, /cry|tears/i],
    valence: -0.7,
    arousal: 0.3,
  },
  anxious: {
    patterns: [/anxious|worried|nervous|scared/i, /what if|afraid/i, /stress|overwhelm/i],
    valence: -0.5,
    arousal: 0.7,
  },
  frustrated: {
    patterns: [/frustrated|annoyed|irritated/i, /ugh|argh|damn/i, /why (won't|can't|doesn't)/i],
    valence: -0.6,
    arousal: 0.7,
  },
  calm: {
    patterns: [/calm|peaceful|relaxed/i, /okay|fine|alright/i, /quiet|still/i],
    valence: 0.3,
    arousal: 0.2,
  },
  neutral: {
    patterns: [/.*/],
    valence: 0,
    arousal: 0.4,
  },
};

// ============================================================================
// PROSODY MAPPINGS
// ============================================================================

const EMOTION_TO_PROSODY: Record<
  string,
  { speed: number; volume: number; pause: number; softer: boolean }
> = {
  excited: { speed: 1.1, volume: 1.1, pause: 0.8, softer: false },
  happy: { speed: 1.05, volume: 1.0, pause: 0.9, softer: false },
  sad: { speed: 0.9, volume: 0.9, pause: 1.3, softer: true },
  anxious: { speed: 0.95, volume: 0.95, pause: 1.1, softer: true },
  frustrated: { speed: 1.0, volume: 1.0, pause: 1.0, softer: false },
  calm: { speed: 0.95, volume: 0.95, pause: 1.1, softer: true },
  neutral: { speed: 1.0, volume: 1.0, pause: 1.0, softer: false },
};

const MICRO_REACTIONS: Record<string, string[]> = {
  excited: ['Oh!', 'Wow!', 'Yes!'],
  happy: ["That's great!", 'Wonderful!', 'Nice!'],
  sad: ['Oh...', 'I see...', 'Mm...'],
  anxious: ['I hear you.', 'Okay...', "Let's..."],
  frustrated: ['I get it.', 'Yeah...', 'Mm-hmm.'],
  celebrating: ['Congratulations!', 'Amazing!', 'Yes!'],
  struggling: ["I'm here.", 'Okay...', "Let's figure this out."],
};

// ============================================================================
// UNIFIED ANTICIPATION ENGINE
// ============================================================================

const engines = new Map<string, UnifiedAnticipationEngine>();

export class UnifiedAnticipationEngine {
  private readonly sessionId: string;
  private state: AnticipationState;
  private precomputedResponses: Map<string, PrecomputedResponse> = new Map();
  private updateThrottleMs = 100;
  private lastUpdateTime = 0;
  private partialHistory: string[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = this.createInitialState();

    log.debug({ sessionId }, '🔮 Unified anticipation engine initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Process partial transcript and update anticipation state.
   * Call this repeatedly during user speech.
   */
  process(partial: PartialTranscript): AnticipationState {
    // Throttle updates
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThrottleMs) {
      return this.state;
    }
    this.lastUpdateTime = now;

    // Skip very short transcripts
    if (partial.text.trim().length < 3) {
      return this.state;
    }

    // Track partial history for pattern detection
    this.partialHistory.push(partial.text);
    if (this.partialHistory.length > 10) {
      this.partialHistory.shift();
    }

    // Predict intent
    const intent = this.predictIntent(partial.text);

    // Predict emotion
    const emotion = this.predictEmotion(partial.text, partial.tone);

    // Prepare prosody
    const prosody = this.prepareProsody(emotion, partial);

    // Calculate overall confidence
    const overallConfidence =
      intent.confidence * 0.4 + emotion.confidence * 0.4 + (partial.silenceMs ? 0.2 : 0);

    // Determine readiness
    const readyForResponse = overallConfidence > 0.7 && intent.isComplete;

    // Update state
    this.state = {
      intent,
      emotion,
      prosody,
      readyForResponse,
      overallConfidence,
      lastUpdateMs: now,
    };

    // If high confidence, pre-compute response context
    if (readyForResponse) {
      this.prepareResponseContext(intent, emotion);
    }

    log.debug(
      {
        intent: intent.intent,
        emotion: emotion.emotion,
        confidence: overallConfidence.toFixed(2),
        ready: readyForResponse,
      },
      '🔮 Anticipation updated'
    );

    return this.state;
  }

  /**
   * Get the current anticipation state.
   */
  getState(): AnticipationState {
    return this.state;
  }

  /**
   * Get pre-computed response if available and confident.
   */
  getPrecomputed(): PrecomputedResponse | null {
    // Find best match
    let best: PrecomputedResponse | null = null;
    const responses = Array.from(this.precomputedResponses.values());
    for (const response of responses) {
      if (!best || response.confidence > best.confidence) {
        best = response;
      }
    }

    // Only return if confident and recent
    if (best && best.confidence > 0.7) {
      const age = Date.now() - best.computedAt;
      if (age < 5000) {
        // Max 5 seconds old
        return best;
      }
    }

    return null;
  }

  /**
   * Clear pre-computed responses (call after turn completes).
   */
  clearPrecomputed(): void {
    this.precomputedResponses.clear();
    this.partialHistory = [];
    this.state = this.createInitialState();
  }

  // ==========================================================================
  // PREDICTORS
  // ==========================================================================

  private predictIntent(text: string): IntentPrediction {
    let bestIntent = 'unknown';
    let bestConfidence = 0;
    const signals: string[] = [];

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          signals.push(`${intent}:${pattern.source}`);

          // Calculate confidence based on match quality
          const confidence = this.calculatePatternConfidence(text, pattern);
          if (confidence > bestConfidence) {
            bestIntent = intent;
            bestConfidence = confidence;
          }
        }
      }
    }

    // Check if intent seems complete (sentence ending)
    const isComplete =
      /[.!?]$/.test(text.trim()) || (bestConfidence > 0.8 && text.split(' ').length > 5);

    return {
      intent: bestIntent,
      confidence: bestConfidence,
      isComplete,
      signals,
    };
  }

  private predictEmotion(text: string, tone?: PartialTranscript['tone']): EmotionPrediction {
    let bestEmotion = 'neutral';
    let bestConfidence = 0.3;
    let valence = 0;
    let arousal = 0.4;

    // Text-based emotion detection
    for (const [emotion, config] of Object.entries(EMOTION_PATTERNS)) {
      if (emotion === 'neutral') continue;

      for (const pattern of config.patterns) {
        if (pattern.test(text)) {
          const confidence = this.calculatePatternConfidence(text, pattern);
          if (confidence > bestConfidence) {
            bestEmotion = emotion;
            bestConfidence = confidence;
            valence = config.valence;
            arousal = config.arousal;
          }
        }
      }
    }

    // Voice tone amplifies confidence
    if (tone && tone !== 'neutral') {
      if (tone === bestEmotion || this.emotionsAreRelated(tone, bestEmotion)) {
        bestConfidence = Math.min(1.0, bestConfidence + 0.2);
      } else {
        // Voice tone overrides text
        bestEmotion = tone;
        bestConfidence = 0.7;
        const config = EMOTION_PATTERNS[tone] || EMOTION_PATTERNS.neutral;
        valence = config.valence;
        arousal = config.arousal;
      }
    }

    return {
      emotion: bestEmotion,
      confidence: bestConfidence,
      valence,
      arousal,
    };
  }

  private prepareProsody(
    emotion: EmotionPrediction,
    partial: PartialTranscript
  ): ProsodyPreparation {
    const base = EMOTION_TO_PROSODY[emotion.emotion] || EMOTION_TO_PROSODY.neutral;

    // Adjust based on speech rate
    let speedMultiplier = base.speed;
    if (partial.speechRate === 'fast') {
      speedMultiplier = Math.min(1.2, speedMultiplier + 0.1);
    } else if (partial.speechRate === 'slow') {
      speedMultiplier = Math.max(0.8, speedMultiplier - 0.1);
    }

    // Select micro-reaction
    let microReactionSsml: string | null = null;
    const reactions = MICRO_REACTIONS[emotion.emotion] || MICRO_REACTIONS[this.state.intent.intent];
    if (reactions && emotion.confidence > 0.6) {
      const reaction = reactions[Math.floor(Math.random() * reactions.length)];
      microReactionSsml = `<break time="100ms"/>${reaction}<break time="200ms"/>`;
    }

    return {
      speedMultiplier,
      volumeMultiplier: base.volume,
      pauseMultiplier: base.pause,
      softerDelivery: base.softer,
      microReactionSsml,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createInitialState(): AnticipationState {
    return {
      intent: { intent: 'unknown', confidence: 0, isComplete: false, signals: [] },
      emotion: { emotion: 'neutral', confidence: 0.3, valence: 0, arousal: 0.4 },
      prosody: {
        speedMultiplier: 1.0,
        volumeMultiplier: 1.0,
        pauseMultiplier: 1.0,
        softerDelivery: false,
        microReactionSsml: null,
      },
      readyForResponse: false,
      overallConfidence: 0,
      lastUpdateMs: Date.now(),
    };
  }

  private calculatePatternConfidence(text: string, pattern: RegExp): number {
    const match = text.match(pattern);
    if (!match) return 0;

    // Base confidence
    let confidence = 0.5;

    // Boost for longer matches
    if (match[0].length > 5) confidence += 0.1;
    if (match[0].length > 10) confidence += 0.1;

    // Boost for being near start or end
    const position = text.indexOf(match[0]);
    if (position < 10) confidence += 0.1;
    if (position > text.length - 15) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private emotionsAreRelated(e1: string, e2: string): boolean {
    const related: Record<string, string[]> = {
      sad: ['anxious', 'frustrated'],
      anxious: ['sad', 'frustrated'],
      frustrated: ['anxious', 'sad'],
      excited: ['happy'],
      happy: ['excited', 'calm'],
    };

    return related[e1]?.includes(e2) || related[e2]?.includes(e1) || false;
  }

  private prepareResponseContext(intent: IntentPrediction, emotion: EmotionPrediction): void {
    // Store response context for quick retrieval
    const key = `${intent.intent}:${emotion.emotion}`;
    this.precomputedResponses.set(key, {
      response: '', // Would be filled by LLM in full implementation
      confidence: Math.min(intent.confidence, emotion.confidence),
      intent: intent.intent,
      emotionContext: emotion.emotion,
      computedAt: Date.now(),
    });
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

/**
 * Get or create anticipation engine for a session.
 */
export function getAnticipationEngine(sessionId: string): UnifiedAnticipationEngine {
  let engine = engines.get(sessionId);
  if (!engine) {
    engine = new UnifiedAnticipationEngine(sessionId);
    engines.set(sessionId, engine);
  }
  return engine;
}

/**
 * Reset anticipation engine for a session.
 */
export function resetAnticipationEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.clearPrecomputed();
  }
  engines.delete(sessionId);
}

/**
 * Cleanup all engines (for shutdown).
 */
export function cleanupAllEngines(): void {
  engines.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getAnticipationEngine,
  resetAnticipationEngine,
  cleanupAllEngines,
  UnifiedAnticipationEngine,
};
