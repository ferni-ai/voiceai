/**
 * Emotion Predictor
 *
 * Predicts emotional trajectory from partial transcript for responsive prosody.
 * Consolidated from sesame-inspired/anticipatory-prosody.ts.
 *
 * @module speech/anticipation/emotion-predictor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { EmotionalPrediction, EmotionalTrajectory } from './types.js';

const log = createLogger({ module: 'EmotionPredictor' });

// ============================================================================
// TRAJECTORY PATTERNS
// ============================================================================

const TRAJECTORY_PATTERNS: Record<EmotionalTrajectory, RegExp[]> = {
  rising_excitement: [
    /\b(guess what|you won't believe|amazing|incredible|finally|I did it|we did it)\b/i,
    /\b(so excited|can't wait|just happened|best news)\b/i,
    /!+$/,
  ],
  rising_concern: [
    /\b(worried about|scared|nervous|anxious|I think something|not sure if)\b/i,
    /\b(I'm afraid|what if|might be|could be wrong)\b/i,
  ],
  falling_sadness: [
    /\b(I lost|they died|passed away|broke up|ended|failed|didn't work)\b/i,
    /\b(sad news|bad news|unfortunately|I'm sorry to say)\b/i,
    /\b(miss them|miss her|miss him|gone forever)\b/i,
  ],
  building_frustration: [
    /\b(so frustrated|can't believe|again and again|keeps happening)\b/i,
    /\b(sick of|tired of|fed up|had enough|this is ridiculous)\b/i,
    /\b(why does|why can't|why won't)\b/i,
  ],
  seeking_support: [
    /\b(need help|don't know what|confused about|struggling with)\b/i,
    /\b(what should I|how do I|can you help|I need)\b/i,
  ],
  sharing_vulnerability: [
    /\b(never told anyone|between us|honestly|the truth is)\b/i,
    /\b(I've been|I'm feeling|I feel like|sometimes I)\b/i,
    /\b(hard to admit|embarrassed|ashamed)\b/i,
  ],
  expressing_gratitude: [
    /\b(thank you|so grateful|means so much|appreciate)\b/i,
    /\b(you helped|because of you|couldn't have)\b/i,
  ],
  joking_playful: [
    /\b(funny thing|you know what's|hilarious|get this)\b/i,
    /\b(joking|kidding|just messing|haha|lol)\b/i,
  ],
  stable_neutral: [], // Default, no patterns
};

// ============================================================================
// TRAJECTORY MAPPINGS
// ============================================================================

const TRAJECTORY_TO_EMOTION: Record<EmotionalTrajectory, CartesiaEmotion | null> = {
  rising_excitement: 'excited',
  rising_concern: 'sympathetic',
  falling_sadness: 'sympathetic',
  building_frustration: 'sympathetic',
  seeking_support: 'affectionate',
  sharing_vulnerability: 'affectionate',
  expressing_gratitude: 'affectionate',
  joking_playful: 'joking/comedic',
  stable_neutral: null,
};

const TRAJECTORY_PROSODY: Record<EmotionalTrajectory, { speed: number; volume: number; pause: number }> = {
  rising_excitement: { speed: 1.1, volume: 1.1, pause: 0.8 },
  rising_concern: { speed: 0.9, volume: 0.95, pause: 1.2 },
  falling_sadness: { speed: 0.8, volume: 0.8, pause: 1.4 },
  building_frustration: { speed: 0.95, volume: 1.0, pause: 1.1 },
  seeking_support: { speed: 0.95, volume: 0.95, pause: 1.0 },
  sharing_vulnerability: { speed: 0.85, volume: 0.85, pause: 1.3 },
  expressing_gratitude: { speed: 0.95, volume: 1.0, pause: 1.0 },
  joking_playful: { speed: 1.05, volume: 1.05, pause: 0.9 },
  stable_neutral: { speed: 1.0, volume: 1.0, pause: 1.0 },
};

const TRAJECTORY_MICRO_REACTIONS: Record<EmotionalTrajectory, string[]> = {
  rising_excitement: [
    '<emotion value="excited"/>Oh!<break time="100ms"/>',
    '<emotion value="surprised"/>Wait—<break time="100ms"/>',
    '<emotion value="curious"/>Ooh!<break time="80ms"/>',
  ],
  rising_concern: [
    '<emotion value="sympathetic"/><speed ratio="0.9"/>Oh...<break time="150ms"/>',
    '<emotion value="sympathetic"/>Mm.<break time="100ms"/>',
  ],
  falling_sadness: [
    '<emotion value="sympathetic"/><speed ratio="0.85"/><volume ratio="0.85"/>Oh...<break time="200ms"/>',
    '<emotion value="sympathetic"/><speed ratio="0.8"/>I...<break time="150ms"/>',
    '<speed ratio="0.85"/><volume ratio="0.8"/><break time="200ms"/>',
  ],
  building_frustration: [
    '<emotion value="sympathetic"/>Ugh.<break time="100ms"/>',
    '<emotion value="sympathetic"/>I hear you.<break time="100ms"/>',
  ],
  seeking_support: [
    '<emotion value="affectionate"/><speed ratio="0.95"/>Okay.<break time="100ms"/>',
    '<emotion value="calm"/>Mm-hmm.<break time="100ms"/>',
  ],
  sharing_vulnerability: [
    '<emotion value="affectionate"/><speed ratio="0.9"/><volume ratio="0.9"/><break time="200ms"/>',
    '<emotion value="sympathetic"/><speed ratio="0.85"/>Hey.<break time="150ms"/>',
  ],
  expressing_gratitude: [
    '<emotion value="affectionate"/>Aww.<break time="100ms"/>',
    '<emotion value="happy"/>Oh!<break time="80ms"/>',
  ],
  joking_playful: [
    '<emotion value="joking/comedic"/>Ha!<break time="80ms"/>',
    '<emotion value="happy"/>Oh!<break time="80ms"/>',
  ],
  stable_neutral: [],
};

// ============================================================================
// PREDICTOR CLASS
// ============================================================================

/**
 * Emotional trajectory predictor for partial transcripts
 */
export class EmotionPredictor {
  private stats = {
    predictions: 0,
    highConfidence: 0,
    trajectoryCounts: new Map<EmotionalTrajectory, number>(),
  };

  /**
   * Predict emotional trajectory from partial transcript
   */
  predict(text: string, tone?: string): EmotionalPrediction {
    this.stats.predictions++;

    const cleaned = text.trim();
    if (cleaned.length < 3) {
      return this.neutralPrediction();
    }

    // Detect trajectory from patterns
    let bestTrajectory: EmotionalTrajectory = 'stable_neutral';
    let bestConfidence = 0;

    for (const [trajectory, patterns] of Object.entries(TRAJECTORY_PATTERNS)) {
      if (patterns.length === 0) continue;

      for (const pattern of patterns) {
        if (pattern.test(cleaned)) {
          const confidence = this.calculateConfidence(cleaned, pattern, tone);

          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestTrajectory = trajectory as EmotionalTrajectory;
          }
        }
      }
    }

    // Boost confidence based on tone
    if (tone && bestConfidence > 0) {
      if (
        (tone === 'excited' && bestTrajectory === 'rising_excitement') ||
        (tone === 'sad' && bestTrajectory === 'falling_sadness') ||
        (tone === 'frustrated' && bestTrajectory === 'building_frustration')
      ) {
        bestConfidence = Math.min(bestConfidence + 0.15, 0.95);
      }
    }

    // Build prediction
    const prosody = TRAJECTORY_PROSODY[bestTrajectory];
    const emotion = TRAJECTORY_TO_EMOTION[bestTrajectory];
    const reactions = TRAJECTORY_MICRO_REACTIONS[bestTrajectory];

    const prediction: EmotionalPrediction = {
      trajectory: bestTrajectory,
      confidence: bestConfidence,
      anticipatedEmotion: emotion,
      speedMultiplier: prosody.speed,
      volumeMultiplier: prosody.volume,
      pauseMultiplier: prosody.pause,
      microReactionSsml: reactions.length > 0 ? reactions[Math.floor(Math.random() * reactions.length)] : null,
      softerDelivery: bestTrajectory === 'falling_sadness' || bestTrajectory === 'sharing_vulnerability',
    };

    // Track stats
    if (bestConfidence >= 0.5) {
      const count = this.stats.trajectoryCounts.get(bestTrajectory) || 0;
      this.stats.trajectoryCounts.set(bestTrajectory, count + 1);

      if (bestConfidence >= 0.7) {
        this.stats.highConfidence++;
      }

      log.debug(
        { trajectory: bestTrajectory, confidence: bestConfidence.toFixed(2), emotion },
        '🎭 Emotion predicted'
      );
    }

    return prediction;
  }

  /**
   * Calculate confidence for a pattern match
   */
  private calculateConfidence(text: string, pattern: RegExp, tone?: string): number {
    const match = text.match(pattern);
    if (!match) return 0;

    let confidence = 0.55; // Base confidence

    // Boost for longer text (more context)
    if (text.length > 20) confidence += 0.1;
    if (text.length > 50) confidence += 0.1;

    // Boost for multiple emotional markers
    const markers = text.match(/(!+|\?|\.\.\.)/g);
    if (markers && markers.length > 1) confidence += 0.1;

    // Boost for explicit emotion words
    if (/\b(feel|feeling|felt|emotion|emotions)\b/i.test(text)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.9);
  }

  /**
   * Return neutral prediction
   */
  private neutralPrediction(): EmotionalPrediction {
    return {
      trajectory: 'stable_neutral',
      confidence: 0,
      anticipatedEmotion: null,
      speedMultiplier: 1.0,
      volumeMultiplier: 1.0,
      pauseMultiplier: 1.0,
      microReactionSsml: null,
      softerDelivery: false,
    };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      trajectoryCounts: Object.fromEntries(this.stats.trajectoryCounts),
    };
  }

  /**
   * Reset stats
   */
  reset(): void {
    this.stats = {
      predictions: 0,
      highConfidence: 0,
      trajectoryCounts: new Map(),
    };
  }
}

