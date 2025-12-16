/**
 * Intent Predictor
 *
 * Predicts user intent from partial transcript for faster responses.
 * Consolidated from response-anticipation/service.ts.
 *
 * @module speech/anticipation/intent-predictor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { IntentCategory, IntentPrediction } from './types.js';

const log = createLogger({ module: 'IntentPredictor' });

// ============================================================================
// INTENT PATTERNS
// ============================================================================

interface IntentPattern {
  intent: IntentCategory;
  patterns: RegExp[];
  templates?: string[];
  contextHint?: string;
  minLength?: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'greeting',
    patterns: [
      /^(hi|hey|hello|good morning|good afternoon|good evening)/i,
      /^(what's up|howdy|hiya|yo)\b/i,
    ],
    templates: ["Hey! Great to hear from you. What's on your mind?"],
    contextHint: 'User is greeting - respond warmly',
    minLength: 2,
  },
  {
    intent: 'farewell',
    patterns: [
      /\b(goodbye|bye|see you|talk later|gotta go|have to go|need to go)\b/i,
      /\b(that's all|I'm done|nothing else)\b/i,
    ],
    templates: ['Take care! Talk soon.'],
    contextHint: 'User is ending conversation - close warmly',
    minLength: 3,
  },
  {
    intent: 'help_request',
    patterns: [
      /\b(can you help|help me|I need help|I need you to)\b/i,
      /\b(how do I|how can I|what should I)\b/i,
      /\b(I don't know how|I'm stuck|I can't figure out)\b/i,
    ],
    contextHint: 'User needs assistance - offer support',
    minLength: 5,
  },
  {
    intent: 'question',
    patterns: [/\b(what is|what's|who is|where is|when is|why is|how is)\b/i, /\?$/],
    contextHint: 'User has a question - provide clear answer',
    minLength: 4,
  },
  {
    intent: 'emotional_share',
    patterns: [
      /\b(I feel|I'm feeling|I've been feeling)\b/i,
      /\b(I'm so|I'm really|I'm very)\s+(sad|happy|angry|frustrated|anxious|worried|scared)/i,
      /\b(I'm struggling|I'm having a hard time|it's been tough)\b/i,
    ],
    contextHint: 'User sharing emotions - respond with empathy',
    minLength: 5,
  },
  {
    intent: 'celebration',
    patterns: [
      /\b(I did it|I got|I made it|I passed|I won|I achieved)\b/i,
      /\b(great news|amazing news|I'm so happy|I'm excited)\b/i,
      /\b(guess what|you won't believe)\b/i,
    ],
    contextHint: 'User celebrating - share their joy',
    minLength: 4,
  },
  {
    intent: 'complaint',
    patterns: [
      /\b(I hate|I can't stand|so frustrating|so annoying)\b/i,
      /\b(this is ridiculous|this is stupid|this is unfair)\b/i,
      /\b(keeps happening|again and again|sick of)\b/i,
    ],
    contextHint: 'User frustrated - validate then help',
    minLength: 5,
  },
  {
    intent: 'gratitude',
    patterns: [
      /\b(thank you|thanks|appreciate|grateful)\b/i,
      /\b(that helps|that's helpful|you helped me)\b/i,
    ],
    templates: ["You're welcome! Happy to help."],
    contextHint: 'User expressing gratitude - acknowledge warmly',
    minLength: 3,
  },
  {
    intent: 'affirmation',
    patterns: [
      /^(yes|yeah|yep|sure|okay|ok|right|correct|exactly)\b/i,
      /\b(that's right|you got it)\b/i,
    ],
    contextHint: 'User affirming - continue or expand',
    minLength: 2,
  },
];

// ============================================================================
// PREDICTOR CLASS
// ============================================================================

/**
 * Intent predictor for partial transcripts
 */
export class IntentPredictor {
  private stats = {
    predictions: 0,
    highConfidence: 0,
    intentCounts: new Map<IntentCategory, number>(),
  };

  /**
   * Predict intent from partial transcript
   */
  predict(text: string): IntentPrediction {
    this.stats.predictions++;

    // Clean text
    const cleaned = text.trim().toLowerCase();
    if (cleaned.length < 2) {
      return this.unknownIntent();
    }

    // Check each pattern
    let bestMatch: IntentPrediction | null = null;
    let bestConfidence = 0;

    for (const pattern of INTENT_PATTERNS) {
      // Check minimum length
      if (pattern.minLength && cleaned.length < pattern.minLength) {
        continue;
      }

      // Check patterns
      for (const regex of pattern.patterns) {
        if (regex.test(cleaned)) {
          // Calculate confidence based on match quality
          const confidence = this.calculateConfidence(cleaned, regex, pattern);

          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = {
              intent: pattern.intent,
              confidence,
              template: pattern.templates?.[0],
              variables: [],
              contextHint: pattern.contextHint,
            };
          }
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.5) {
      // Track stats
      const count = this.stats.intentCounts.get(bestMatch.intent) || 0;
      this.stats.intentCounts.set(bestMatch.intent, count + 1);

      if (bestMatch.confidence >= 0.7) {
        this.stats.highConfidence++;
      }

      log.debug(
        { intent: bestMatch.intent, confidence: bestMatch.confidence.toFixed(2) },
        '🎯 Intent predicted'
      );

      return bestMatch;
    }

    return this.unknownIntent();
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(text: string, regex: RegExp, pattern: IntentPattern): number {
    const match = text.match(regex);
    if (!match) return 0;

    let confidence = 0.6; // Base confidence for match

    // Boost for longer matches
    const matchLength = match[0].length;
    const textLength = text.length;
    const matchRatio = matchLength / textLength;
    confidence += matchRatio * 0.2;

    // Boost for start-of-text matches
    if (text.startsWith(match[0])) {
      confidence += 0.1;
    }

    // Boost if text is long enough for pattern
    if (pattern.minLength && text.length >= pattern.minLength * 2) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Return unknown intent
   */
  private unknownIntent(): IntentPrediction {
    return {
      intent: 'unknown',
      confidence: 0,
      contextHint: undefined,
    };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      intentCounts: Object.fromEntries(this.stats.intentCounts),
    };
  }

  /**
   * Reset stats
   */
  reset(): void {
    this.stats = {
      predictions: 0,
      highConfidence: 0,
      intentCounts: new Map(),
    };
  }
}
