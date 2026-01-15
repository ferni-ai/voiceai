/**
 * Voice-Text Emotion Mismatch Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Real humans pick up on incongruence between what's said and how it's said.
 * When someone says "I'm fine" with a trembling voice, we know they're not fine.
 * This module gives Ferni that same intuition.
 *
 * This is the heart of being "better than human" - not by being smarter,
 * but by being more attentive than humans often are.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { detectEmotion } from '../../services/emotion-analysis/emotion-detection.js';
import { recordInsight, type PersonaId } from '../../services/cross-persona/cross-persona-insights.js';

// Minimal emotion result type for mismatch detection (compatible with both emotion-detector and emotion-detection)
interface MinimalEmotionResult {
  primary: string;
  confidence: number;
}

const log = createLogger({ module: 'VoiceTextMismatch' });

// ============================================================================
// TYPES
// ============================================================================

export interface MismatchResult {
  /** Is there a significant mismatch? */
  hasMismatch: boolean;

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

export type MismatchType =
  | 'masking_negative' // Saying fine but voice says distressed
  | 'understating_positive' // Downplaying excitement
  | 'deflecting' // Changing topic with emotional voice
  | 'suppressing' // Trying to control emotion
  | 'contradicting' // Direct contradiction
  | 'incongruent' // General mismatch
  | 'none'; // No mismatch

// ============================================================================
// EMOTION GROUPS
// ============================================================================

const POSITIVE_EMOTIONS = [
  'happy',
  'excited',
  'joy',
  'grateful',
  'trust',
  'anticipation',
  'confident',
];
const NEGATIVE_EMOTIONS = [
  'sad',
  'angry',
  'fearful',
  'anxious',
  'distressed',
  'frustrated',
  'disgusted',
  'contempt',
];
const NEUTRAL_EMOTIONS = ['neutral', 'curious', 'confused', 'bored'];

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
];

// Text signals that boost voice emotion confidence
const DISTRESS_TEXT_SIGNALS = [
  /\b(hard|difficult|tough|struggling|rough)\b/i,
  /\b(overwhelmed|exhausted|drained|burnt out)\b/i,
  /\b(scared|nervous|anxious|worried|afraid)\b/i,
  /\b(hurt|pain|suffer|ache)\b/i,
  /\b(alone|lonely|isolated)\b/i,
  /\b(can't|cannot|unable|impossible)\b/i,
  /\b(hate|despise|loathe)\b/i,
  /\b(never|always)\s+(going to|will|works|happens)/i,
];

// ============================================================================
// HYBRID CONFIDENCE SCORING
// ============================================================================

/**
 * Calculate hybrid confidence by combining voice + text signals.
 * This enables mismatch detection even with lower voice confidence
 * when text signals corroborate the emotional state.
 */
function calculateHybridConfidence(
  voiceEmotion: VoiceEmotionResult,
  userText: string,
  textEmotion: MinimalEmotionResult
): { confidence: number; boosted: boolean; textSignals: string[] } {
  const baseConfidence = voiceEmotion.confidence;
  const textSignals: string[] = [];
  let boost = 0;

  // Check for text distress signals that corroborate voice emotion
  if (isNegativeEmotion(voiceEmotion.primary)) {
    for (const pattern of DISTRESS_TEXT_SIGNALS) {
      if (pattern.test(userText)) {
        textSignals.push(pattern.source);
        boost += 0.1;
      }
    }
  }

  // Masking phrases with ANY negative voice signal = high confidence
  const textLower = userText.toLowerCase();
  const hasMaskingPhrase = MASKING_PHRASES.some((p) => textLower.includes(p));
  if (
    hasMaskingPhrase &&
    (voiceEmotion.stressLevel > 0.3 || isNegativeEmotion(voiceEmotion.primary))
  ) {
    boost += 0.2;
    textSignals.push('masking_phrase_detected');
  }

  // High stress level boosts confidence
  if (voiceEmotion.stressLevel > 0.4) {
    boost += voiceEmotion.stressLevel * 0.15;
    textSignals.push(`stress_level_${Math.round(voiceEmotion.stressLevel * 100)}%`);
  }

  // Anxiety markers boost confidence
  if (voiceEmotion.anxietyMarkers) {
    boost += 0.15;
    textSignals.push('anxiety_markers');
  }

  // Cap the boost and calculate final confidence
  const finalConfidence = Math.min(1, baseConfidence + Math.min(boost, 0.35));

  return {
    confidence: finalConfidence,
    boosted: boost > 0,
    textSignals,
  };
}

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Detect mismatch between text sentiment and voice emotion.
 *
 * Uses HYBRID scoring to detect mismatches even with lower voice confidence
 * when text signals corroborate the emotional state. This is "Better Than Human"
 * because we catch what text-only analysis would miss.
 *
 * THRESHOLDS LOWERED (Dec 2024):
 * - Base voice confidence: 0.25 (was 0.4)
 * - Hybrid confidence can boost up to 0.35
 * - This catches more "I'm fine" moments
 */
export function detectMismatch(
  userText: string,
  voiceEmotion: VoiceEmotionResult | null,
  textEmotion?: MinimalEmotionResult
): MismatchResult {
  // LOWERED from 0.4 → 0.25 to catch more subtle signals
  // Hybrid scoring will boost this when text corroborates
  if (!voiceEmotion || voiceEmotion.confidence < 0.25) {
    return noMismatch('Insufficient voice confidence');
  }

  // Get text emotion if not provided
  const textResult = textEmotion || detectEmotion(userText);
  const textPrimary = textResult.primary.toLowerCase();
  const voicePrimary = voiceEmotion.primary.toLowerCase();

  // Calculate HYBRID confidence using voice + text signals
  const hybrid = calculateHybridConfidence(voiceEmotion, userText, textResult);
  const effectiveConfidence = hybrid.confidence;

  // Log hybrid scoring if boosted
  if (hybrid.boosted) {
    log.debug(
      {
        baseConfidence: voiceEmotion.confidence,
        hybridConfidence: effectiveConfidence,
        textSignals: hybrid.textSignals,
      },
      '🎭 Hybrid confidence boosted mismatch detection'
    );
  }

  // Check for masking phrases
  const textLower = userText.toLowerCase();
  const isMaskingPhrase = MASKING_PHRASES.some((phrase) => textLower.includes(phrase));

  // Detect different types of mismatch

  // Type 1: Masking negative emotions with "I'm fine"
  // LOWERED thresholds: shouldSurface now 0.5 (was 0.6)
  if (isMaskingPhrase && isNegativeEmotion(voicePrimary)) {
    return {
      hasMismatch: true,
      confidence: effectiveConfidence * 0.9,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'masking_negative',
      interpretation: `User says they're okay but voice reveals ${voicePrimary} emotion`,
      suggestedApproach: 'Acknowledge without pushing. Let them know you notice and care.',
      shouldSurface:
        effectiveConfidence > 0.5 && (voiceEmotion.stressLevel > 0.25 || hybrid.boosted),
      surfacePhrase: generateSurfacePhrase('masking_negative', voicePrimary),
    };
  }

  // Type 2: Contradicting emotions (positive text, negative voice or vice versa)
  // LOWERED threshold: 0.55 (was 0.65)
  if (isPositiveEmotion(textPrimary) && isNegativeEmotion(voicePrimary)) {
    return {
      hasMismatch: true,
      confidence: Math.min(textResult.confidence, effectiveConfidence) * 0.85,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'contradicting',
      interpretation: `Text sounds ${textPrimary} but voice sounds ${voicePrimary}`,
      suggestedApproach: 'Gently explore what might be behind the surface',
      shouldSurface: effectiveConfidence > 0.55,
      surfacePhrase: generateSurfacePhrase('contradicting', voicePrimary),
    };
  }

  // Type 3: Understating positive emotions
  if (
    isNeutralEmotion(textPrimary) &&
    isPositiveEmotion(voicePrimary) &&
    voiceEmotion.arousal > 0.5
  ) {
    return {
      hasMismatch: true,
      confidence: effectiveConfidence * 0.7,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'understating_positive',
      interpretation: 'User is more excited than their words suggest',
      suggestedApproach: 'Match their underlying energy, celebrate with them',
      shouldSurface: voiceEmotion.arousal > 0.55,
      surfacePhrase: generateSurfacePhrase('understating_positive', voicePrimary),
    };
  }

  // Type 4: High stress with neutral text
  // LOWERED threshold: 0.5 (was 0.6)
  if (isNeutralEmotion(textPrimary) && voiceEmotion.stressLevel > 0.5) {
    return {
      hasMismatch: true,
      confidence: voiceEmotion.stressLevel * 0.85,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'suppressing',
      interpretation: 'Voice reveals stress despite neutral words',
      suggestedApproach: 'Create space for them to share more if they want',
      shouldSurface: voiceEmotion.stressLevel > 0.6 || hybrid.boosted,
      surfacePhrase: generateSurfacePhrase('suppressing', 'stressed'),
    };
  }

  // Type 5: Anxiety markers with "everything's fine"
  // LOWERED threshold: 0.5 (was 0.6)
  if (voiceEmotion.anxietyMarkers && (isMaskingPhrase || isNeutralEmotion(textPrimary))) {
    return {
      hasMismatch: true,
      confidence: effectiveConfidence * 0.8,
      textEmotion: textPrimary,
      voiceEmotion: 'anxious',
      type: 'masking_negative',
      interpretation: 'Voice shows anxiety markers despite calm words',
      suggestedApproach: "Offer calm presence, don't call out the anxiety directly",
      shouldSurface: effectiveConfidence > 0.5,
      surfacePhrase: generateSurfacePhrase('masking_negative', 'anxious'),
    };
  }

  // Type 6: NEW - Text signals + low voice confidence
  // When text has distress signals but voice confidence is low, still flag it
  if (hybrid.textSignals.length >= 2 && isNegativeEmotion(voicePrimary)) {
    return {
      hasMismatch: true,
      confidence: effectiveConfidence * 0.7,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'incongruent',
      interpretation: `Multiple distress signals detected (${hybrid.textSignals.join(', ')})`,
      suggestedApproach: "Be attentive - there may be more going on than they're sharing",
      shouldSurface: effectiveConfidence > 0.45,
      surfacePhrase: generateSurfacePhrase('incongruent', voicePrimary),
    };
  }

  return noMismatch('No significant mismatch detected');
}

/**
 * Record mismatch as a cross-persona insight (for team awareness)
 */
export async function recordMismatchInsight(
  userId: string,
  personaId: PersonaId,
  mismatch: MismatchResult
): Promise<void> {
  if (!mismatch.hasMismatch || mismatch.confidence < 0.5) {
    return;
  }

  recordInsight(userId, personaId, {
    category: 'emotional_state',
    content: mismatch.interpretation,
    summary: `Voice revealed ${mismatch.voiceEmotion} despite saying "${mismatch.textEmotion}"`,
    confidence: mismatch.confidence,
    priority: mismatch.type === 'masking_negative' ? 'high' : 'normal',
    evidence: `Mismatch type: ${mismatch.type}`,
    expiresInDays: 3, // Emotional states are time-sensitive
    surfaceInNextConversation: false, // Already being handled in this conversation
  });

  log.info(
    {
      userId,
      personaId,
      type: mismatch.type,
      voiceEmotion: mismatch.voiceEmotion,
    },
    '💭 Recorded emotion mismatch insight for team'
  );
}

/**
 * Build guidance for LLM based on detected mismatch
 */
export function buildMismatchGuidance(mismatch: MismatchResult): string | null {
  if (!mismatch.hasMismatch) {
    return null;
  }

  const guidance = [
    `[VOICE INSIGHT] ${mismatch.interpretation}`,
    `Approach: ${mismatch.suggestedApproach}`,
  ];

  if (mismatch.shouldSurface && mismatch.surfacePhrase) {
    guidance.push(`If appropriate, you might say: "${mismatch.surfacePhrase}"`);
  }

  return guidance.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function noMismatch(reason: string): MismatchResult {
  return {
    hasMismatch: false,
    confidence: 0,
    textEmotion: 'neutral',
    voiceEmotion: 'neutral',
    type: 'none',
    interpretation: reason,
    suggestedApproach: '',
    shouldSurface: false,
  };
}

function isPositiveEmotion(emotion: string): boolean {
  return POSITIVE_EMOTIONS.includes(emotion.toLowerCase());
}

function isNegativeEmotion(emotion: string): boolean {
  return NEGATIVE_EMOTIONS.includes(emotion.toLowerCase());
}

function isNeutralEmotion(emotion: string): boolean {
  return NEUTRAL_EMOTIONS.includes(emotion.toLowerCase());
}

/**
 * Generate a sensitive phrase for surfacing the observation
 */
function generateSurfacePhrase(type: MismatchType, voiceEmotion: string): string {
  const phrases: Record<MismatchType, string[]> = {
    masking_negative: [
      "I hear you saying you're okay, but... I want you to know I'm here if there's more you want to share.",
      "You don't have to be 'fine' with me. What's really going on?",
      "Something in your voice tells me there might be more to the story. No pressure, but I'm listening.",
    ],
    contradicting: [
      "I'm picking up on some mixed feelings. Want to talk about what's underneath?",
      "Your voice is telling me something different from your words. It's okay to share both.",
    ],
    understating_positive: [
      'Wait, I can hear how excited you actually are! This sounds like a big deal!',
      'Your voice is lighting up! Tell me more about this!',
    ],
    suppressing: [
      "I sense there might be some weight on your shoulders. We can talk about it if you'd like.",
      "No pressure at all, but I'm here if you want to share what's really on your mind.",
    ],
    deflecting: [
      "We can absolutely talk about that, but I also want to check in on how you're really doing.",
    ],
    incongruent: [
      "I want to make sure I'm understanding you fully. How are you really feeling about this?",
    ],
    none: [],
  };

  const options = phrases[type] || phrases.incongruent;
  if (options.length === 0) return '';

  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectMismatch,
  recordMismatchInsight,
  buildMismatchGuidance,
};
