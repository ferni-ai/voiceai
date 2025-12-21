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
} from '../../../services/persona-content-loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { DISTRESS } from '../../distress-levels.js';
import {
  analyzeVoiceEmotion,
  formatVoiceEmotionForPrompt,
  type TextEmotionInput,
  type VoiceEmotionInput,
} from '../../voice-emotion-orchestrator.js';
import { BuilderCategory } from '../core/categories.js';
import {
  createCriticalInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import {
  checkDynamicTriggers,
  buildTriggerContext,
  recordTriggerCheck,
  recordTriggerMatch,
  recordTriggerFired,
  type ProactiveTrigger,
} from '../dynamic-trigger-utils.js';

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
  const sessionId = services.sessionId ?? 'default';

  // Load persona-specific emotional intelligence (if available)
  const emotionalIntelligence = await loadEmotionalIntelligence(persona.id);

  // -----------------------------------------------
  // DYNAMIC TRIGGERS FROM EMOTIONAL INTELLIGENCE
  // -----------------------------------------------
  if (emotionalIntelligence?.proactive_triggers) {
    // Record that we're checking triggers for analytics
    recordTriggerCheck('emotional');

    // Build context for trigger matching
    const triggerContext = buildTriggerContext(userText, analysis, userData as Record<string, unknown>);

    // Extract triggers (skip usage_rules which contains metadata)
    const rawTriggers = emotionalIntelligence.proactive_triggers as Record<string, unknown>;
    const triggers: Record<string, ProactiveTrigger> = {};
    for (const [name, value] of Object.entries(rawTriggers)) {
      if (name === 'usage_rules' || typeof value !== 'object' || value === null) continue;
      const triggerObj = value as { trigger?: string; behavior?: string };
      if (triggerObj.trigger && triggerObj.behavior) {
        triggers[name] = { trigger: triggerObj.trigger, behavior: triggerObj.behavior };
      }
    }

    // Check for matching trigger (returns single best match or null)
    const matchedTrigger = checkDynamicTriggers(triggers, triggerContext);

    if (matchedTrigger) {
      // Record the match for analytics
      recordTriggerMatch(matchedTrigger.triggerName, 'emotional', matchedTrigger.confidence, services.userId);

      // Fire the trigger (probability gate could be added here in the future)
      recordTriggerFired(matchedTrigger.triggerName, 'emotional');

      injections.push(
        createHintInjection(
          `emotional_trigger_${matchedTrigger.triggerName}`,
          `[EMOTIONAL TRIGGER: ${matchedTrigger.triggerName}]\n${matchedTrigger.behavior}`
        )
      );
      log.debug(
        { trigger: matchedTrigger.triggerName, confidence: matchedTrigger.confidence },
        'Emotional trigger matched and fired'
      );
    }
  }

  // -----------------------------------------------
  // VOICE + TEXT EMOTION MERGING (via Orchestrator)
  // -----------------------------------------------
  const textInput: TextEmotionInput = {
    primary: analysis.emotion.primary,
    intensity: analysis.emotion.intensity || 0.5,
    distressLevel: analysis.emotion.distressLevel ?? 0,
    valence: analysis.emotion.valence ?? 'neutral',
  };

  // Convert voice emotion to VoiceEmotionInput if available.
  // Backward-compatibility: some callers provide voice emotion under `userData.voiceEmotion`
  // and/or use `primary` instead of `emotion`.
  const rawVoiceEmotion =
    voiceEmotion ??
    (typeof userData === 'object' && userData !== null
      ? (userData as { voiceEmotion?: unknown }).voiceEmotion
      : undefined);

  const extendedVoice = rawVoiceEmotion as
    | (typeof rawVoiceEmotion & {
        primary?: string;
        emotion?: string;
        confidence?: number;
        speechRate?: number;
        pitch?: number;
        stressLevel?: number;
        arousal?: number;
        valence?: number;
        anxietyMarkers?: boolean;
      })
    | undefined;

  const voiceInput: VoiceEmotionInput | undefined =
    extendedVoice && typeof extendedVoice.confidence === 'number'
      ? {
          emotion: extendedVoice.emotion ?? extendedVoice.primary ?? 'neutral',
          confidence: extendedVoice.confidence,
          speechRate: extendedVoice.speechRate,
          pitch: extendedVoice.pitch,
          stressLevel: extendedVoice.stressLevel,
          arousal: extendedVoice.arousal,
          valence: extendedVoice.valence,
          anxietyMarkers: extendedVoice.anxietyMarkers,
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
      // Note: Don't inject literal phrases - the LLM copies them verbatim
      // Just indicate high distress needs validation
      injections.push(
        createHintInjection(
          'persona_ei_distress',
          `[HIGH DISTRESS: Immediately validate their feelings. No advice yet - just presence and acknowledgment.]`
        )
      );
    }
  } else if (mergedDistress >= DISTRESS.MODERATE) {
    // MODERATE DISTRESS - Don't script literal responses
    injections.push(
      createStandardInjection(
        'emotional_alert',
        `[EMOTIONAL ALERT: ${analysis.emotion.primary} at ${Math.round(mergedDistress * 100)}%]
Empathy FIRST, advice second. Slow down. Shorter sentences. Listen more than you speak.`
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
  const shouldSurfaceTrend =
    mergedDistress >= DISTRESS.MILD ||
    analysis.emotion.valence !== 'neutral' ||
    (voiceInput && voiceAnalysis.guidance.messages.length > 0);

  if (shouldSurfaceTrend && voiceAnalysis.trend === 'improving') {
    injections.push(
      createHintInjection(
        'emotional_trend',
        `[EMOTIONAL TREND: IMPROVING] User seems to be feeling better during this conversation. Keep doing what you're doing.`
      )
    );
  } else if (shouldSurfaceTrend && voiceAnalysis.trend === 'declining') {
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
