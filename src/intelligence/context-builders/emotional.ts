/**
 * Emotional Context Builder
 *
 * Handles emotional awareness and support:
 * - High distress detection and crisis support
 * - Validation needs detection
 * - Emotional mirroring (match user's energy)
 * - Voice + text emotion merging (via VoiceEmotionOrchestrator)
 * - Emotional context (positive/negative valence)
 *
 * Uses centralized:
 * - DISTRESS constants for consistent thresholds
 * - VoiceEmotionOrchestrator for voice+text merging
 * - SessionStateManager for session tracking
 *
 * Extracted from jack-bogle.ts lines 647-666, 897-917, 1102-1118
 */
import {
  getRandomPhraseClean,
  loadEmotionalIntelligence,
} from '../../services/persona-content-loader.js';
import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS } from '../distress-levels.js';
import {
  analyzeVoiceEmotion,
  formatVoiceEmotionForPrompt,
  type TextEmotionInput,
  type VoiceEmotionInput,
} from '../voice-emotion-orchestrator.js';
import { BuilderCategory } from './categories.js';
import {
  createCriticalInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'context:emotional' });

// ============================================================================
// EMOTIONAL CONTEXT BUILDER
// ============================================================================

/**
 * Build emotional awareness context
 *
 * Uses centralized infrastructure:
 * - VoiceEmotionOrchestrator for voice+text merging
 * - DISTRESS constants for consistent thresholds
 * - Persona-specific emotional intelligence content
 */
async function buildEmotionalContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, analysis, userData, persona, services, voiceEmotion } = input;
  const injections: ContextInjection[] = [];
  const sessionId = services.sessionId;

  // Load persona-specific emotional intelligence (if available)
  const emotionalIntelligence = await loadEmotionalIntelligence(persona.id);

  // -----------------------------------------------
  // VOICE + TEXT EMOTION MERGING (via Orchestrator)
  // -----------------------------------------------
  const textInput: TextEmotionInput = {
    primary: analysis.emotion.primary,
    intensity: analysis.emotion.intensity || 0.5,
    distressLevel: analysis.emotion.distressLevel ?? 0,
    valence: analysis.emotion.valence ?? 'neutral',
  };

  // Convert voiceEmotion to VoiceEmotionInput if available
  // Extended voice emotion may have additional properties
  const extendedVoice = voiceEmotion as
    | (typeof voiceEmotion & {
        stressLevel?: number;
        arousal?: number;
        valence?: number;
      })
    | undefined;

  const voiceInput: VoiceEmotionInput | undefined = voiceEmotion
    ? {
        emotion: voiceEmotion.emotion,
        confidence: voiceEmotion.confidence,
        speechRate: voiceEmotion.speechRate,
        pitch: voiceEmotion.pitch,
        stressLevel: extendedVoice?.stressLevel,
        arousal: extendedVoice?.arousal,
        valence: extendedVoice?.valence,
      }
    : undefined;

  // Use orchestrator for unified voice emotion analysis
  const voiceAnalysis = analyzeVoiceEmotion(sessionId, voiceInput, textInput, userText);
  const mergedDistress = voiceAnalysis.distressLevel;
  const distressCategory = voiceAnalysis.distressCategory;

  // Update analysis with merged distress (for other builders)
  analysis.emotion.distressLevel = mergedDistress;

  log.debug(
    {
      textEmotion: analysis.emotion.primary,
      voiceEmotion: voiceInput?.emotion,
      mergedDistress: mergedDistress.toFixed(2),
      category: distressCategory,
      trend: voiceAnalysis.trend,
    },
    'Emotional analysis complete'
  );

  // -----------------------------------------------
  // DISTRESS-BASED RESPONSE (using centralized constants)
  // -----------------------------------------------
  if (mergedDistress >= DISTRESS.HIGH) {
    // HIGH/CRISIS DISTRESS - Critical intervention
    injections.push(
      createCriticalInjection(
        'emotional_crisis',
        `[EMOTIONAL ${distressCategory} DETECTED - ${Math.round(mergedDistress * 100)}% distress]
STOP everything. This person needs you to be PRESENT, not helpful.
DO: "I can hear this is really hard." "I'm here." "Take your time."
DO NOT: Offer advice, solutions, or silver linings. Just be present.
VOICE: Soft, slow, gentle. Long pauses are okay.
If they need silence, give them silence.`
      )
    );
    log.warn(
      {
        distress: mergedDistress,
        category: distressCategory,
        emotion: analysis.emotion.primary,
      },
      'HIGH DISTRESS DETECTED'
    );

    // Add persona-specific distress response if available
    if (emotionalIntelligence) {
      const eiContent = emotionalIntelligence as Record<string, unknown>;
      const distressResponses = (eiContent.detecting_distress as Record<string, unknown>)
        ?.responses as Record<string, string[]>;
      if (distressResponses?.immediate_validation) {
        const phrase = getRandomPhraseClean(distressResponses.immediate_validation);
        if (phrase) {
          injections.push(
            createHintInjection('persona_ei_distress', `[PERSONA VOICE for distress]: "${phrase}"`)
          );
        }
      }
    }
  } else if (mergedDistress >= DISTRESS.MODERATE) {
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
    log.info({ feeling }, 'User needs validation');
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
  // VOICE PROSODY RESPONSE (via Orchestrator)
  // Respond to HOW they sound, not just what they say
  // -----------------------------------------------
  if (voiceInput && voiceAnalysis.guidance.messages.length > 0) {
    // Add voice-specific guidance from orchestrator
    const voiceGuidance = formatVoiceEmotionForPrompt(voiceAnalysis);
    if (voiceGuidance) {
      injections.push(
        createStandardInjection('voice_prosody', voiceGuidance, { category: 'voice-emotion' })
      );
    }
  }

  // -----------------------------------------------
  // EMOTIONAL TREND FEEDBACK
  // -----------------------------------------------
  if (voiceAnalysis.trend === 'improving') {
    injections.push(
      createHintInjection(
        'emotional_trend',
        `[EMOTIONAL TREND: IMPROVING] User seems to be feeling better during this conversation. Keep doing what you're doing.`
      )
    );
  } else if (voiceAnalysis.trend === 'declining') {
    injections.push(
      createStandardInjection(
        'emotional_trend',
        `[EMOTIONAL TREND: DECLINING] User's emotional state seems to be worsening. Consider a different approach or check in directly.`
      )
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'emotional',
  description: 'Emotional awareness, distress detection, voice+text emotion merging',
  priority: 20, // High priority - informs approach
  category: BuilderCategory.EMOTIONAL,
  build: buildEmotionalContext,
});

export { buildEmotionalContext };
