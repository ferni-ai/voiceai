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

import { createLogger } from '../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../speech/audio-prosody.js';
import { detectEmotion } from '../services/emotion-detection.js';
import { recordInsight, type PersonaId } from '../services/cross-persona-insights.js';

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
  | 'masking_negative'     // Saying fine but voice says distressed
  | 'understating_positive' // Downplaying excitement
  | 'deflecting'           // Changing topic with emotional voice
  | 'suppressing'          // Trying to control emotion
  | 'contradicting'        // Direct contradiction
  | 'incongruent'          // General mismatch
  | 'none';                // No mismatch

// ============================================================================
// EMOTION GROUPS
// ============================================================================

const POSITIVE_EMOTIONS = ['happy', 'excited', 'joy', 'grateful', 'trust', 'anticipation', 'confident'];
const NEGATIVE_EMOTIONS = ['sad', 'angry', 'fearful', 'anxious', 'distressed', 'frustrated', 'disgusted', 'contempt'];
const NEUTRAL_EMOTIONS = ['neutral', 'curious', 'confused', 'bored'];

// Common phrases used to mask true feelings
const MASKING_PHRASES = [
  "i'm fine",
  "i'm okay",
  "i'm good",
  "i'm alright",
  "it's fine",
  "it's okay",
  "no big deal",
  "doesn't matter",
  "whatever",
  "it is what it is",
  "can't complain",
  "could be worse",
  "same old",
  "just tired",
  "just stressed",
  "it'll pass",
];

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Detect mismatch between text sentiment and voice emotion
 */
export function detectMismatch(
  userText: string,
  voiceEmotion: VoiceEmotionResult | null,
  textEmotion?: MinimalEmotionResult
): MismatchResult {
  // If no voice emotion, can't detect mismatch
  if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
    return noMismatch('Insufficient voice confidence');
  }

  // Get text emotion if not provided
  const textResult = textEmotion || detectEmotion(userText);
  const textPrimary = textResult.primary.toLowerCase();
  const voicePrimary = voiceEmotion.primary.toLowerCase();

  // Check for masking phrases
  const textLower = userText.toLowerCase();
  const isMaskingPhrase = MASKING_PHRASES.some(phrase => textLower.includes(phrase));

  // Detect different types of mismatch
  
  // Type 1: Masking negative emotions with "I'm fine"
  if (isMaskingPhrase && isNegativeEmotion(voicePrimary)) {
    return {
      hasMismatch: true,
      confidence: voiceEmotion.confidence * 0.9,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'masking_negative',
      interpretation: `User says they're okay but voice reveals ${voicePrimary} emotion`,
      suggestedApproach: 'Acknowledge without pushing. Let them know you notice and care.',
      shouldSurface: voiceEmotion.confidence > 0.6 && voiceEmotion.stressLevel > 0.3,
      surfacePhrase: generateSurfacePhrase('masking_negative', voicePrimary),
    };
  }

  // Type 2: Contradicting emotions (positive text, negative voice or vice versa)
  if (isPositiveEmotion(textPrimary) && isNegativeEmotion(voicePrimary)) {
    return {
      hasMismatch: true,
      confidence: Math.min(textResult.confidence, voiceEmotion.confidence) * 0.85,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'contradicting',
      interpretation: `Text sounds ${textPrimary} but voice sounds ${voicePrimary}`,
      suggestedApproach: 'Gently explore what might be behind the surface',
      shouldSurface: voiceEmotion.confidence > 0.65,
      surfacePhrase: generateSurfacePhrase('contradicting', voicePrimary),
    };
  }

  // Type 3: Understating positive emotions
  if (isNeutralEmotion(textPrimary) && isPositiveEmotion(voicePrimary) && voiceEmotion.arousal > 0.5) {
    return {
      hasMismatch: true,
      confidence: voiceEmotion.confidence * 0.7,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'understating_positive',
      interpretation: 'User is more excited than their words suggest',
      suggestedApproach: 'Match their underlying energy, celebrate with them',
      shouldSurface: voiceEmotion.arousal > 0.6,
      surfacePhrase: generateSurfacePhrase('understating_positive', voicePrimary),
    };
  }

  // Type 4: High stress with neutral text
  if (isNeutralEmotion(textPrimary) && voiceEmotion.stressLevel > 0.6) {
    return {
      hasMismatch: true,
      confidence: voiceEmotion.stressLevel * 0.8,
      textEmotion: textPrimary,
      voiceEmotion: voicePrimary,
      type: 'suppressing',
      interpretation: 'Voice reveals stress despite neutral words',
      suggestedApproach: 'Create space for them to share more if they want',
      shouldSurface: voiceEmotion.stressLevel > 0.7,
      surfacePhrase: generateSurfacePhrase('suppressing', 'stressed'),
    };
  }

  // Type 5: Anxiety markers with "everything's fine"
  if (voiceEmotion.anxietyMarkers && (isMaskingPhrase || isNeutralEmotion(textPrimary))) {
    return {
      hasMismatch: true,
      confidence: voiceEmotion.confidence * 0.75,
      textEmotion: textPrimary,
      voiceEmotion: 'anxious',
      type: 'masking_negative',
      interpretation: 'Voice shows anxiety markers despite calm words',
      suggestedApproach: 'Offer calm presence, don\'t call out the anxiety directly',
      shouldSurface: voiceEmotion.confidence > 0.6,
      surfacePhrase: generateSurfacePhrase('masking_negative', 'anxious'),
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

  await recordInsight(userId, personaId, {
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
      "Wait, I can hear how excited you actually are! This sounds like a big deal!",
      "Your voice is lighting up! Tell me more about this!",
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

