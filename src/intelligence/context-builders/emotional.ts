/**
 * Emotional Context Builder
 *
 * Handles emotional awareness and support:
 * - High distress detection and crisis support
 * - Validation needs detection
 * - Emotional mirroring (match user's energy)
 * - Voice + text emotion merging
 * - Emotional context (positive/negative valence)
 *
 * Extracted from jack-bogle.ts lines 647-666, 897-917, 1102-1118
 */
import { log } from '@livekit/agents';
import {
  registerContextBuilder,
  createCriticalInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const getLogger = () => log();

// ============================================================================
// VOICE EMOTION TYPES (extended for prosody analysis)
// ============================================================================

interface VoiceEmotionExtended {
  primary: string;
  confidence: number;
  stressLevel: number;
  arousal: number;
  valence: number;
  anxietyMarkers?: boolean;
  speechRate?: number;
  pitch?: number;
}

interface ExtendedUserData {
  voiceEmotion?: VoiceEmotionExtended;
  [key: string]: unknown;
}

// ============================================================================
// EMOTIONAL CONTEXT BUILDER
// ============================================================================

/**
 * Build emotional awareness context
 */
function buildEmotionalContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, userData } = input;
  const injections: ContextInjection[] = [];
  // Merge voice emotion with text emotion if available
  const textDistress = analysis.emotion.distressLevel ?? 0;
  let mergedDistress = textDistress;
  const voiceEmotion = (userData as ExtendedUserData).voiceEmotion;
  if (voiceEmotion) {
    // Voice prosody provides physical stress indicators
    // Weight: 60% text emotion, 40% voice (voice can detect things text can't)
    mergedDistress = textDistress * 0.6 + voiceEmotion.stressLevel * 0.4;
    // If voice shows anxiety markers, boost distress
    if (voiceEmotion.anxietyMarkers) {
      mergedDistress = Math.min(1, mergedDistress + 0.15);
    }
    getLogger().debug(
      {
        textEmotion: analysis.emotion.primary,
        voiceEmotion: voiceEmotion.primary,
        textDistress: textDistress.toFixed(2),
        voiceStress: voiceEmotion.stressLevel.toFixed(2),
        mergedDistress: mergedDistress.toFixed(2),
      },
      'Merged text + voice emotion'
    );
    // Update analysis with merged distress (for other builders)
    analysis.emotion.distressLevel = mergedDistress;
  }
  // -----------------------------------------------
  // HIGH DISTRESS DETECTION (PRIORITY: CRITICAL)
  // -----------------------------------------------
  if (mergedDistress > 0.7) {
    injections.push(
      createCriticalInjection(
        'emotional_crisis',
        `[EMOTIONAL CRISIS DETECTED - ${Math.round(mergedDistress * 100)}% distress]
STOP everything. This person needs you to be PRESENT, not helpful.
DO: "I can hear this is really hard." "I'm here." "Take your time."
DO NOT: Offer advice, solutions, or silver linings. Just be present.
VOICE: Soft, slow, gentle. Long pauses are okay.
If they need silence, give them silence.`
      )
    );
    getLogger().warn(
      {
        distress: mergedDistress,
        emotion: analysis.emotion.primary,
      },
      'HIGH DISTRESS DETECTED'
    );
  } else if (mergedDistress > 0.5) {
    // MODERATE DISTRESS
    injections.push(
      createStandardInjection(
        'emotional_alert',
        `[EMOTIONAL ALERT: ${analysis.emotion.primary} at ${Math.round(mergedDistress * 100)}%]
Empathy FIRST, advice second. Slow down. Shorter sentences.
Acknowledge: "That sounds really difficult." Listen more than you speak.`
      )
    );
  } else if (analysis.emotion.valence === 'negative') {
    // NEGATIVE EMOTION (but not high distress)
    injections.push(
      createStandardInjection(
        'emotional_context',
        `[EMOTIONAL CONTEXT: User seems ${analysis.emotion.primary}. Acknowledge their feelings before any advice.]`
      )
    );
  } else if (analysis.emotion.valence === 'positive') {
    // POSITIVE EMOTION - match energy!
    injections.push(
      createHintInjection(
        'emotional_positive',
        `[EMOTIONAL CONTEXT: User is ${analysis.emotion.primary}! Match their energy. Share in the good moment.]`
      )
    );
  }
  // -----------------------------------------------
  // VALIDATION NEEDED DETECTION
  // -----------------------------------------------
  const validationPatterns =
    /\b(am i crazy|is it wrong|should i feel|normal to|stupid for|bad for|wrong to want|crazy to think)\b/i;
  const needsValidation =
    (analysis.emotion.primary === 'fear' && mergedDistress > 0.3 && mergedDistress < 0.7) ||
    (analysis.intent.primary === 'confiding' && analysis.emotion.valence === 'negative') ||
    validationPatterns.test(userText);
  if (needsValidation) {
    const feeling = analysis.emotion.primary || 'worried';
    injections.push(
      createStandardInjection(
        'validation_needed',
        `[VALIDATION NEEDED]
User is seeking validation for feeling ${feeling}.
VALIDATE BEFORE any advice:
  - "That makes complete sense."
  - "Anyone would feel that way."
  - "Of course you're worried about that."
  - "That's a very human response."
  - "I'd feel the same way."
DO NOT say "but..." after validating.`
      )
    );
    getLogger().info({ feeling }, 'User needs validation');
  }
  // -----------------------------------------------
  // EMOTIONAL MIRRORING
  // -----------------------------------------------
  const userEnergy = analysis.emotion.intensity || 0.5;
  const userValence = analysis.emotion.valence;
  if (userEnergy > 0.7) {
    // High energy user - match their enthusiasm
    injections.push(
      createHintInjection(
        'emotional_mirroring',
        `[EMOTIONAL MIRRORING: User has HIGH energy (${Math.round(userEnergy * 100)}%). Match their enthusiasm while staying authentic. Be warmer, more animated.]`
      )
    );
  } else if (userEnergy < 0.3) {
    // Low energy user - be gentle
    injections.push(
      createHintInjection(
        'emotional_mirroring',
        `[EMOTIONAL MIRRORING: User has LOW energy (${Math.round(userEnergy * 100)}%). Be gentle, calm, don't overwhelm. Short responses. Give space.]`
      )
    );
  }
  if (userValence === 'positive' && userEnergy > 0.6) {
    injections.push(
      createHintInjection(
        'emotional_celebration',
        `[EMOTIONAL MIRRORING: User seems HAPPY/EXCITED! Share in their joy. Match their warmth. Celebrate with them.]`
      )
    );
  }
  // -----------------------------------------------
  // VOICE PROSODY RESPONSE
  // Respond to HOW they sound, not just what they say
  // -----------------------------------------------
  if (voiceEmotion) {
    const prosodyResponse = buildVoiceProsodyGuidance(voiceEmotion);
    if (prosodyResponse) {
      injections.push(prosodyResponse);
    }
  }
  return injections;
}
/**
 * Build guidance based on voice prosody analysis
 */
function buildVoiceProsodyGuidance(voiceEmotion: VoiceEmotionExtended): ContextInjection | null {
  const { arousal, valence, stressLevel, primary, anxietyMarkers } = voiceEmotion;
  // High stress detected in voice
  if (stressLevel > 0.6) {
    let guidance = "User's voice shows stress. Slow down, be extra gentle.";
    let emotionalMirror;
    if (anxietyMarkers) {
      guidance =
        'Voice analysis detects anxiety markers (trembling, pitch variation). This person needs calm presence.';
      emotionalMirror = "I can hear there's a lot on your mind. Take your time.";
    } else if (arousal > 0.7 && valence < 0.3) {
      guidance = 'Voice is agitated and negative. They may be frustrated or upset.';
      emotionalMirror = 'I sense this is really weighing on you.';
    }
    return createStandardInjection(
      'voice_prosody',
      `[VOICE ANALYSIS: ${guidance}${emotionalMirror ? ` You could say: "${emotionalMirror}"` : ''}]`
    );
  }
  // Voice emotion differs significantly from text content
  if (primary === 'sad' && valence < 0.3) {
    return createHintInjection(
      'voice_prosody',
      `[VOICE ANALYSIS: Voice sounds sad, even if words don't say it. Be extra attentive to emotional undertones.]`
    );
  }
  // Very positive voice - match the energy
  if (valence > 0.7 && arousal > 0.5) {
    return createHintInjection(
      'voice_prosody',
      `[VOICE ANALYSIS: Voice sounds genuinely happy/excited! Match this positive energy.]`
    );
  }
  return null;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('emotional', buildEmotionalContext);
export { buildEmotionalContext };
