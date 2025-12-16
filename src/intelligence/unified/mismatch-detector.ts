/**
 * Voice-Text Mismatch Detector
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is THE superhuman capability that makes Ferni "better than human."
 * Real humans pick up on incongruence between what's said and how it's said.
 * When someone says "I'm fine" with a trembling voice, we know they're not fine.
 *
 * This module gives Ferni that same intuition - and makes it a PRIORITY signal
 * that shapes the entire response.
 *
 * @module intelligence/unified/mismatch-detector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';

const log = createLogger({ module: 'MismatchDetector' });

// ============================================================================
// TYPES
// ============================================================================

export type MismatchType =
  | 'masking_negative' // Saying fine but voice says distressed
  | 'understating_positive' // Downplaying excitement
  | 'suppressing' // Trying to control emotion
  | 'contradicting' // Direct contradiction
  | 'deflecting' // Changing topic with emotional voice
  | 'none';

export interface MismatchResult {
  /** Is there a significant mismatch? */
  detected: boolean;

  /** Confidence in the mismatch detection (0-1) */
  confidence: number;

  /** What the text suggests */
  textEmotion: string;

  /** What the voice reveals */
  voiceEmotion: string;

  /** Type of mismatch */
  type: MismatchType;

  /** Human-readable interpretation */
  interpretation: string;

  /** How to approach this sensitively */
  suggestedApproach: string;

  /** Should we surface this to the user? */
  shouldSurface: boolean;

  /** If surfacing, what to say */
  surfacePhrase?: string;
}

export interface MismatchGuidance {
  /** Critical injection for the prompt */
  promptInjection: string;

  /** Priority level */
  priority: 'critical' | 'high' | 'standard';

  /** Whether to use high-emotion mode */
  useHighEmotionMode: boolean;
}

// ============================================================================
// EMOTION GROUPS
// ============================================================================

const POSITIVE_EMOTIONS = new Set([
  'happy',
  'excited',
  'joy',
  'grateful',
  'trust',
  'anticipation',
  'confident',
]);

const NEGATIVE_EMOTIONS = new Set([
  'sad',
  'angry',
  'fearful',
  'anxious',
  'distressed',
  'frustrated',
  'disgusted',
  'contempt',
  'sadness',
  'anger',
  'fear',
  'anxiety',
  'regret',
]);

const NEUTRAL_EMOTIONS = new Set(['neutral', 'curious', 'confused', 'bored']);

// Common phrases used to mask true feelings
const MASKING_PHRASES = [
  "i'm fine",
  "i'm okay",
  "i'm good",
  "i'm alright",
  "it's fine",
  "it's okay",
  'no big deal',
  "doesn't matter",
  'whatever',
  'it is what it is',
  "can't complain",
  'could be worse',
  'same old',
  'just tired',
  'just stressed',
  "it'll pass",
  "don't worry about me",
  "i'll be fine",
  "nothing's wrong",
  "everything's fine",
];

// ============================================================================
// MISMATCH DETECTOR CLASS
// ============================================================================

export class VoiceTextMismatchDetector {
  private static instance: VoiceTextMismatchDetector | null = null;

  static getInstance(): VoiceTextMismatchDetector {
    if (!VoiceTextMismatchDetector.instance) {
      VoiceTextMismatchDetector.instance = new VoiceTextMismatchDetector();
    }
    return VoiceTextMismatchDetector.instance;
  }

  /**
   * Detect mismatch between text sentiment and voice emotion
   */
  detect(
    userText: string,
    voiceEmotion: VoiceEmotionResult | null | undefined,
    textEmotion?: { primary: string; confidence: number; valence?: string }
  ): MismatchResult {
    // If no voice emotion, can't detect mismatch
    if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
      return this.noMismatch('Insufficient voice confidence');
    }

    const textLower = userText.toLowerCase();
    const textPrimary = textEmotion?.primary?.toLowerCase() || 'neutral';
    const textValence = textEmotion?.valence || 'neutral';
    const voicePrimary = voiceEmotion.primary.toLowerCase();

    // Check for masking phrases
    const isMaskingPhrase = MASKING_PHRASES.some((phrase) => textLower.includes(phrase));

    // Type 1: Masking negative emotions with "I'm fine"
    if (isMaskingPhrase && this.isNegativeVoice(voiceEmotion)) {
      const result: MismatchResult = {
        detected: true,
        confidence: voiceEmotion.confidence * 0.9,
        textEmotion: textPrimary,
        voiceEmotion: voicePrimary,
        type: 'masking_negative',
        interpretation: `User says they're okay but voice reveals ${voicePrimary} emotion`,
        suggestedApproach: 'Acknowledge without pushing. Let them know you notice and care.',
        shouldSurface: voiceEmotion.confidence > 0.6 && (voiceEmotion.stressLevel || 0) > 0.3,
        surfacePhrase: this.getSurfacePhrase('masking_negative', voicePrimary),
      };

      log.info(
        { type: result.type, confidence: result.confidence.toFixed(2) },
        '🎯 Voice-text mismatch detected: masking negative'
      );

      return result;
    }

    // Type 2: Contradicting emotions (positive text, negative voice)
    if (this.isPositiveText(textValence, textPrimary) && this.isNegativeVoice(voiceEmotion)) {
      const result: MismatchResult = {
        detected: true,
        confidence: Math.min(textEmotion?.confidence || 0.5, voiceEmotion.confidence) * 0.85,
        textEmotion: textPrimary,
        voiceEmotion: voicePrimary,
        type: 'contradicting',
        interpretation: `Text sounds ${textPrimary} but voice sounds ${voicePrimary}`,
        suggestedApproach: 'Gently explore what might be behind the surface',
        shouldSurface: voiceEmotion.confidence > 0.65,
        surfacePhrase: this.getSurfacePhrase('contradicting', voicePrimary),
      };

      log.info(
        { type: result.type, confidence: result.confidence.toFixed(2) },
        '🎯 Voice-text mismatch detected: contradicting'
      );

      return result;
    }

    // Type 3: Understating positive emotions
    if (
      this.isNeutralText(textValence, textPrimary) &&
      this.isPositiveVoice(voiceEmotion) &&
      voiceEmotion.arousal > 0.5
    ) {
      const result: MismatchResult = {
        detected: true,
        confidence: voiceEmotion.confidence * 0.7,
        textEmotion: textPrimary,
        voiceEmotion: voicePrimary,
        type: 'understating_positive',
        interpretation: 'User is more excited than their words suggest',
        suggestedApproach: 'Match their underlying energy, celebrate with them',
        shouldSurface: voiceEmotion.arousal > 0.6,
        surfacePhrase: this.getSurfacePhrase('understating_positive', voicePrimary),
      };

      log.info(
        { type: result.type, confidence: result.confidence.toFixed(2) },
        '🎯 Voice-text mismatch detected: understating positive'
      );

      return result;
    }

    // Type 4: High stress with neutral text
    if (this.isNeutralText(textValence, textPrimary) && (voiceEmotion.stressLevel || 0) > 0.6) {
      const result: MismatchResult = {
        detected: true,
        confidence: (voiceEmotion.stressLevel || 0) * 0.8,
        textEmotion: textPrimary,
        voiceEmotion: voicePrimary,
        type: 'suppressing',
        interpretation: 'Voice reveals stress despite neutral words',
        suggestedApproach: 'Create space for them to share more if they want',
        shouldSurface: (voiceEmotion.stressLevel || 0) > 0.7,
        surfacePhrase: this.getSurfacePhrase('suppressing', 'stressed'),
      };

      log.info(
        { type: result.type, confidence: result.confidence.toFixed(2) },
        '🎯 Voice-text mismatch detected: suppressing stress'
      );

      return result;
    }

    // Type 5: Anxiety markers with "everything's fine"
    if (
      voiceEmotion.anxietyMarkers &&
      (isMaskingPhrase || this.isNeutralText(textValence, textPrimary))
    ) {
      const result: MismatchResult = {
        detected: true,
        confidence: voiceEmotion.confidence * 0.75,
        textEmotion: textPrimary,
        voiceEmotion: 'anxious',
        type: 'masking_negative',
        interpretation: 'Voice shows anxiety markers despite calm words',
        suggestedApproach: "Offer calm presence, don't call out the anxiety directly",
        shouldSurface: voiceEmotion.confidence > 0.6,
        surfacePhrase: this.getSurfacePhrase('masking_negative', 'anxious'),
      };

      log.info(
        { type: result.type, confidence: result.confidence.toFixed(2) },
        '🎯 Voice-text mismatch detected: anxiety markers'
      );

      return result;
    }

    return this.noMismatch('No significant mismatch detected');
  }

  /**
   * Build critical prompt injection for detected mismatch
   */
  buildGuidance(mismatch: MismatchResult): MismatchGuidance | null {
    if (!mismatch.detected) {
      return null;
    }

    const lines: string[] = [
      `🎯 [VOICE INSIGHT - THIS IS CRITICAL]`,
      `${mismatch.interpretation}`,
      ``,
      `How to respond: ${mismatch.suggestedApproach}`,
    ];

    if (mismatch.shouldSurface && mismatch.surfacePhrase) {
      lines.push(``, `If it feels right, you might say: "${mismatch.surfacePhrase}"`);
    }

    lines.push(
      ``,
      `DON'T: Call out the mismatch directly ("I can tell you're not fine")`,
      `DO: Create space and show you're present ("I'm here if there's more you want to share")`
    );

    return {
      promptInjection: lines.join('\n'),
      priority: mismatch.type === 'masking_negative' ? 'critical' : 'high',
      useHighEmotionMode: mismatch.type === 'masking_negative' || mismatch.type === 'suppressing',
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private noMismatch(reason: string): MismatchResult {
    return {
      detected: false,
      confidence: 0,
      textEmotion: 'neutral',
      voiceEmotion: 'neutral',
      type: 'none',
      interpretation: reason,
      suggestedApproach: '',
      shouldSurface: false,
    };
  }

  private isPositiveText(valence: string, primary: string): boolean {
    return valence === 'positive' || POSITIVE_EMOTIONS.has(primary.toLowerCase());
  }

  private isNegativeText(valence: string, primary: string): boolean {
    return valence === 'negative' || NEGATIVE_EMOTIONS.has(primary.toLowerCase());
  }

  private isNeutralText(valence: string, primary: string): boolean {
    return (
      valence === 'neutral' ||
      NEUTRAL_EMOTIONS.has(primary.toLowerCase()) ||
      (!POSITIVE_EMOTIONS.has(primary.toLowerCase()) &&
        !NEGATIVE_EMOTIONS.has(primary.toLowerCase()))
    );
  }

  private isPositiveVoice(voiceEmotion: VoiceEmotionResult): boolean {
    return voiceEmotion.valence > 0.2 || POSITIVE_EMOTIONS.has(voiceEmotion.primary.toLowerCase());
  }

  private isNegativeVoice(voiceEmotion: VoiceEmotionResult): boolean {
    return (
      voiceEmotion.valence < -0.2 ||
      (voiceEmotion.stressLevel || 0) > 0.5 ||
      NEGATIVE_EMOTIONS.has(voiceEmotion.primary.toLowerCase())
    );
  }

  private getSurfacePhrase(type: MismatchType, voiceEmotion: string): string {
    const phrases: Record<MismatchType, string[]> = {
      masking_negative: [
        "I hear you saying you're okay, but... I'm here if there's more you want to share.",
        "You don't have to be 'fine' with me. What's really going on?",
        "Something in your voice tells me there might be more to the story. No pressure, but I'm listening.",
        "I'm picking up on something. How are you *really* doing right now?",
      ],
      contradicting: [
        "I'm picking up on some mixed feelings. Want to talk about what's underneath?",
        "Your voice is telling me something different from your words. It's okay to share both.",
        "I sense there's more to this. What's really on your mind?",
      ],
      understating_positive: [
        'Wait, I can hear how excited you actually are! This sounds like a big deal!',
        'Your voice is lighting up! Tell me more about this!',
        "I can hear this means a lot to you. Don't hold back!",
      ],
      suppressing: [
        "I sense there might be some weight on your shoulders. We can talk about it if you'd like.",
        "No pressure at all, but I'm here if you want to share what's really on your mind.",
        "Sometimes it helps to just say what we're feeling. I'm listening.",
      ],
      deflecting: [
        "We can absolutely talk about that, but I also want to check in on how you're really doing.",
        'Before we move on... how are you feeling about everything?',
      ],
      none: [],
    };

    const options = phrases[type] || phrases.masking_negative;
    if (options.length === 0) return '';

    return options[Math.floor(Math.random() * options.length)];
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Quick detection function - use for single calls
 */
export function detectMismatch(
  userText: string,
  voiceEmotion: VoiceEmotionResult | null | undefined,
  textEmotion?: { primary: string; confidence: number; valence?: string }
): MismatchResult {
  return VoiceTextMismatchDetector.getInstance().detect(userText, voiceEmotion, textEmotion);
}

export default VoiceTextMismatchDetector;
