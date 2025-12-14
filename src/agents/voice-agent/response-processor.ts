/**
 * Voice Agent Response Processor
 *
 * Handles post-LLM response processing for voice output:
 * - Ambient awareness acknowledgments
 * - Unified post-LLM humanization (speech naturalization, deep humanization)
 * - SSML tagging and phase personality
 * - Response recording for repair detection and EvalOps
 * - Emotion mirroring and prosody adjustments
 * - Human listening SSML adjustments
 * - Dynamic speed control (persona-aware)
 * - Voice humanization (laughter, contagion, rhythm, breathing)
 *
 * Extracted from voice-agent.ts transcriptionNode method.
 *
 * @module voice-agent/response-processor
 */

import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getResponseDynamicsEngine } from '../../conversation/index.js';
import type { UserData } from '../shared/types.js';
import {
  enhanceResponseWithSesame,
  getPreparedResponse,
} from '../../speech/sesame-inspired/index.js';
import type { CartesiaEmotion } from '../../speech/cartesia-expressiveness.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ResponseProcessorContext {
  /** Original LLM response text */
  rawText: string;
  /** Current persona config */
  persona: PersonaConfig;
  /** User data from session */
  userData?: UserData;
  /** Session services */
  services?: SessionServices;
  /** Session ID for feature flags */
  sessionId?: string;
}

export interface ResponseProcessorResult {
  /** Processed text with all SSML and adjustments */
  processedText: string;
  /** Features that were applied */
  appliedFeatures: string[];
  /** Processing timing */
  timingMs: number;
}

export interface EmotionModulation {
  emotion: string;
  intensity: number;
  confidence: number;
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process an LLM response for voice output
 *
 * This function applies all post-LLM processing in the correct order:
 * 0. STAGE DIRECTION SANITIZATION (CRITICAL - prevents *grinning*, *laughing* being spoken)
 * 1. Ambient awareness prepending
 * 2. Unified humanization
 * 3. SSML tagging
 * 4. Response recording
 * 5. Sesame-inspired prosody (anticipatory, micro-reactions, disfluencies)
 * 6. Emotion prosody mirroring
 * 7. Human listening adjustments
 * 8. Emotional arc adjustments
 * 9. Dynamic speed control
 * 10. Voice humanization
 * 11. Track response for dynamics
 * 12. FINAL SANITIZATION (safety net)
 */
export async function processResponse(ctx: ResponseProcessorContext): Promise<ResponseProcessorResult> {
  const startTime = Date.now();
  const appliedFeatures: string[] = [];

  let processedText = ctx.rawText;
  const { persona, userData, services, sessionId } = ctx;

  // ============================================================
  // 0. STAGE DIRECTION SANITIZATION (CRITICAL)
  // Remove *grinning*, *laughing*, [smiles], etc. BEFORE any processing
  // These must NEVER be spoken aloud - this is the safety net
  // ============================================================
  try {
    const { sanitizeSsml } = await import('../../ssml/core.js');
    processedText = sanitizeSsml(processedText);
    appliedFeatures.push('stage_direction_sanitized');
  } catch (sanitizeErr) {
    diag.warn('Stage direction sanitization failed (critical!)', { error: String(sanitizeErr) });
  }

  // ============================================================
  // 1. AMBIENT AWARENESS: Prepend offer to pause for noisy environments
  // ============================================================
  if (userData?.pendingAmbientAcknowledgment) {
    processedText = applyAmbientAwareness(processedText, userData);
    appliedFeatures.push('ambient_awareness');
  }

  // ============================================================
  // 2. UNIFIED POST-LLM HUMANIZATION
  // ============================================================
  const humanizationResult = await applyUnifiedHumanization(
    processedText,
    ctx.rawText,
    userData,
    sessionId,
    persona
  );
  if (humanizationResult.wasApplied) {
    processedText = humanizationResult.text;
    appliedFeatures.push(...humanizationResult.features);
  }

  // ============================================================
  // 3. SSML TAGGING (if not already done by humanizer)
  // ============================================================
  if (!hasSsmlTags(processedText) && services) {
    const ssmlResult = await applySsmlTagging(processedText, ctx.rawText, services, userData);
    processedText = ssmlResult.text;
    if (ssmlResult.wasApplied) {
      appliedFeatures.push('ssml_tagging');
    }
  }

  // ============================================================
  // 4. RESPONSE RECORDING (for repair detection, EvalOps)
  // ============================================================
  if (userData?.services?.sessionId) {
    void recordResponse(userData.services.sessionId, ctx.rawText, userData, persona);
  }

  // ============================================================
  // 5. SESAME-INSPIRED PROSODY ENHANCEMENT
  // Apply anticipatory prosody from partial transcript analysis
  // Adds micro-reactions, speed/volume, contextual pauses, disfluencies
  // ============================================================
  if (sessionId) {
    const sesameResult = applySesameEnhancement(
      processedText,
      sessionId,
      userData,
      appliedFeatures
    );
    if (sesameResult.wasApplied) {
      processedText = sesameResult.text;
      appliedFeatures.push(...sesameResult.features);
    }
  }

  // ============================================================
  // 6. EMOTION PROSODY MIRRORING
  // ============================================================
  const emotionModulation = userData?.emotionModulation;
  if (emotionModulation && emotionModulation.confidence > 0.4) {
    const { wrapWithEmotionProsody } = await import('../../speech/emotion-matching.js');
    processedText = wrapWithEmotionProsody(processedText, emotionModulation);
    appliedFeatures.push('emotion_prosody');
  }

  // ============================================================
  // 7. HUMAN LISTENING SSML ADJUSTMENTS
  // ============================================================
  if (sessionId) {
    const listeningResult = await applyHumanListeningAdjustments(processedText, sessionId);
    if (listeningResult.wasApplied) {
      processedText = listeningResult.text;
      appliedFeatures.push('human_listening');
    }
  }

  // ============================================================
  // 8. EMOTIONAL ARC ADJUSTMENTS
  // ============================================================
  const arcResult = applyEmotionalArcAdjustments(processedText);
  if (arcResult.wasApplied) {
    processedText = arcResult.text;
    appliedFeatures.push('emotional_arc');
  }

  // ============================================================
  // 9. DYNAMIC SPEED CONTROL
  // ============================================================
  if (sessionId && userData) {
    const speedResult = await applyDynamicSpeedControl(processedText, sessionId, persona, userData);
    if (speedResult.wasApplied) {
      processedText = speedResult.text;
      appliedFeatures.push('dynamic_speed');
    }
  }

  // ============================================================
  // 10. VOICE HUMANIZATION (laughter, contagion, rhythm, breathing)
  // ============================================================
  if (sessionId) {
    const voiceHumanResult = await applyVoiceHumanization(
      processedText,
      sessionId,
      userData
    );
    if (voiceHumanResult.wasApplied) {
      processedText = voiceHumanResult.text;
      appliedFeatures.push(...voiceHumanResult.features);
    }
  }

  // ============================================================
  // 11. TRACK RESPONSE FOR DYNAMICS
  // ============================================================
  const responseDynamics = getResponseDynamicsEngine();
  responseDynamics.recordMessage('agent', ctx.rawText);

  // ============================================================
  // 12. DETECT FAREWELL - Signal auto-disconnect
  // ============================================================
  if (detectAgentFarewell(ctx.rawText)) {
    diag.info('🌅 Agent farewell detected - signaling auto-disconnect');
    void signalConversationEnd(sessionId);
  }

  // ============================================================
  // 13. FINAL SANITIZATION (safety net)
  // Catch any stage directions that slipped through humanization
  // ============================================================
  try {
    const { sanitizeSsml } = await import('../../ssml/core.js');
    const finalText = sanitizeSsml(processedText);
    if (finalText !== processedText) {
      diag.debug('Final sanitization caught escaped stage directions');
      processedText = finalText;
      appliedFeatures.push('final_sanitization');
    }
  } catch {
    // Non-critical at this point, text was already sanitized at step 0
  }

  return {
    processedText,
    appliedFeatures,
    timingMs: Date.now() - startTime,
  };
}

// ============================================================================
// FAREWELL DETECTION & AUTO-DISCONNECT
// ============================================================================

/**
 * Patterns that indicate the agent is saying goodbye.
 * More strict than user goodbye patterns - we want the actual farewell phrase.
 */
const AGENT_FAREWELL_PATTERNS = [
  // Direct farewells
  /\b(take care|see you|until next time|goodbye|bye for now|talk soon|catch you later)\b/i,
  // Session closings
  /\b(here whenever you need|i['']m here for you|looking forward to|can['']t wait to)\s+\w+\s+(again|next|soon)/i,
  // Warm endings with punctuation
  /\b(be well|stay (safe|well)|take it easy)[.!]/i,
];

/**
 * Detect if agent response contains a farewell.
 * Must be in the last portion of the response to count.
 */
function detectAgentFarewell(text: string): boolean {
  // Only check the last 150 characters to avoid false positives
  const lastPart = text.slice(-150);
  return AGENT_FAREWELL_PATTERNS.some(pattern => pattern.test(lastPart));
}

/**
 * Signal the frontend to auto-disconnect.
 */
async function signalConversationEnd(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;

  try {
    const { sendFrontendSignal } = await import('../../services/frontend-signal.js');
    await sendFrontendSignal('conversation_end', {
      reason: 'goodbye_complete',
      disconnectDelay: 2500, // Give time for farewell to be spoken
      timestamp: Date.now(),
    });
  } catch {
    // Non-critical - frontend will just not auto-disconnect
    diag.debug('Failed to send conversation_end signal');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if text contains SSML tags
 */
function hasSsmlTags(text: string): boolean {
  return (
    /<(speed|volume|emotion|break|spell)\b/.test(text) ||
    /<\/(speed|volume|emotion|spell)>/.test(text)
  );
}

/**
 * Apply ambient awareness acknowledgment
 */
function applyAmbientAwareness(text: string, userData: UserData): string {
  const acknowledgment = userData.pendingAmbientAcknowledgment;
  userData.pendingAmbientAcknowledgment = null; // Clear after use

  // Only prepend if response isn't already about pausing
  const lowerText = text.toLowerCase();
  if (
    !lowerText.includes('pause') &&
    !lowerText.includes('later') &&
    !lowerText.includes('busy')
  ) {
    diag.info('🔊 Offered to pause due to noisy environment', { acknowledgment });
    return `${acknowledgment} But if you'd like to keep going - ${text}`;
  }

  return text;
}

/**
 * Apply unified post-LLM humanization
 */
async function applyUnifiedHumanization(
  text: string,
  rawText: string,
  userData: UserData | undefined,
  sessionId: string | undefined,
  persona: PersonaConfig
): Promise<{ text: string; wasApplied: boolean; features: string[] }> {
  if (!sessionId || !userData) {
    return { text, wasApplied: false, features: [] };
  }

  const agentSessionId =
    (userData.sessionData as { sessionId?: string } | undefined)?.sessionId ||
    `session-${persona.id}`;

  try {
    const { humanizeAgentResponse, recordVulnerabilityEvent } = await import(
      '../integrations/conversation-session-integration.js'
    );

    const humanized = await humanizeAgentResponse(agentSessionId, rawText, {
      userMessage: userData.lastUserMessage || '',
      userEmotion: userData.lastEmotionAnalysis?.primary,
      topic: userData.lastTopic,
      isSeriousContext: (userData.lastEmotionAnalysis?.distressLevel ?? 0) > 0.3,
      wasPersonalSharing: (userData.lastEmotionAnalysis?.intensity ?? 0) > 0.7,
      sessionData: userData.sessionData,
    });

    if (!humanized) {
      return { text, wasApplied: false, features: [] };
    }

    let result = humanized.text;
    const features: string[] = [...humanized.appliedFeatures];

    // Add memory callback if appropriate
    if (humanized.memoryCallback && Math.random() < 0.3) {
      result = `${humanized.memoryCallback.text} ${result}`;
      features.push('memory_callback');
    }

    // Add follow-up question if appropriate
    if (humanized.followUpQuestion && !result.includes('?')) {
      result = `${result} ${humanized.followUpQuestion.text}`;
      features.push('follow_up_question');
    }

    // Use SSML version if available
    if (humanized.ssml && humanized.ssml !== humanized.text) {
      result = humanized.ssml;
      features.push('ssml_enhanced');
    }

    // Track vulnerability for relationship building
    if ((userData.lastEmotionAnalysis?.intensity ?? 0) > 0.8) {
      recordVulnerabilityEvent(agentSessionId);
    }

    diag.debug('Post-LLM humanization applied', {
      features,
      pacing: humanized.pacing,
      timing: `${humanized.timing.total.toFixed(0)}ms`,
    });

    return { text: result, wasApplied: true, features };
  } catch (error) {
    diag.warn('Post-LLM humanization failed (non-fatal)', { error: String(error) });
    return { text, wasApplied: false, features: [] };
  }
}

/**
 * Apply SSML tagging and phase personality
 */
async function applySsmlTagging(
  text: string,
  rawText: string,
  services: SessionServices,
  userData: UserData | undefined
): Promise<{ text: string; wasApplied: boolean }> {
  let result = services.tagWithSsml(text);

  try {
    const currentPhase = services.getPromptContext()
      .phase as import('../../intelligence/conversation-state.js').ConversationPhase;
    const speechContext = services.getSpeechContext();

    if (currentPhase && speechContext) {
      const { applyPhasePersonality } = await import('../../speech/adaptive-ssml.js');
      result = applyPhasePersonality(result, currentPhase, speechContext);
    }
  } catch (e) {
    diag.debug('Phase personality application failed (non-blocking)', { error: String(e) });
  }

  // Record turn and track humor/story
  services.addTurn('assistant', rawText);

  if (userData) {
    userData.lastAgentResponse = rawText;
    userData.lastAgentResponseTime = Date.now();

    // Track humor and story for calibration
    const lowerText = rawText.toLowerCase();
    const humorIndicators = /\b(haha|joke|kidding|😄|😂|funny|amusing|ironic)\b|!.*!/.test(lowerText);
    const storyIndicators =
      /\b(remember when|back when|once upon|let me tell you|there was|i knew a|story|reminds me)\b/.test(
        lowerText
      );

    if (humorIndicators) {
      userData.lastResponseHadHumor = true;
      const topic = userData.lastTopic || 'general';
      services.humorCalibration.recordHumorAttempt(rawText.slice(0, 200), topic);
    }

    if (storyIndicators) {
      userData.lastResponseHadStory = true;
      const topic = userData.lastTopic || 'general';
      services.storyPreference.recordStory(rawText, topic);
    }
  }

  return { text: result, wasApplied: true };
}

/**
 * Record response for repair detection and EvalOps
 */
async function recordResponse(
  sessionId: string,
  rawText: string,
  userData: UserData,
  persona: PersonaConfig
): Promise<void> {
  // Record for repair detection
  try {
    const { recordAdviceGivenToSession } = await import('../processors/injection-builders.js');
    const { recordAgentResponse } = await import(
      '../../conversation/advanced-humanization-integration.js'
    );

    // Check if this was advice
    const lowerResponse = rawText.toLowerCase();
    const adviceIndicators = [
      'you should',
      'try to',
      'i suggest',
      'consider',
      'why not',
      'have you tried',
      "it's important to",
      'make sure to',
    ];
    const wasAdvice = adviceIndicators.some((i) => lowerResponse.includes(i));
    if (wasAdvice) {
      await recordAdviceGivenToSession(sessionId);
    }

    // Record full response
    recordAgentResponse(sessionId, rawText);
  } catch {
    // Non-critical
  }

  // EvalOps evaluation (fire-and-forget)
  try {
    const { evaluateAgentResponse } = await import(
      '../../services/evalops/voice-agent-integration.js'
    );
    const lastUserMsg = userData.lastUserMessage || '';

    if (lastUserMsg) {
      void evaluateAgentResponse(sessionId, persona.id, lastUserMsg, rawText, {
        userId: userData.services?.userId,
        turnNumber: userData.turnCount || 1,
        emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
        isNewUser: userData.turnCount === 1,
      }).catch(() => {});
    }
  } catch {
    // Non-critical
  }
}

/**
 * Apply human listening SSML adjustments
 */
async function applyHumanListeningAdjustments(
  text: string,
  sessionId: string
): Promise<{ text: string; wasApplied: boolean }> {
  try {
    const { getHumanListeningResult } = await import(
      '../../intelligence/context-builders/human-listening.js'
    );
    const { applyHumanListeningAdjustments: applySsml } = await import(
      '../../speech/emotion-matching.js'
    );

    const listeningResult = getHumanListeningResult(sessionId);

    if (listeningResult?.ssmlSuggestions) {
      const adjusted = applySsml(text, listeningResult.ssmlSuggestions);
      return { text: adjusted, wasApplied: true };
    }
  } catch (error) {
    diag.debug('Human listening SSML adjustment skipped', { error: String(error) });
  }

  return { text, wasApplied: false };
}

/**
 * Apply Sesame-inspired prosody enhancement
 *
 * Uses pre-computed anticipatory data from partial transcript processing
 * to add more natural, responsive prosody to the agent's output.
 */
function applySesameEnhancement(
  text: string,
  sessionId: string,
  userData: UserData | undefined,
  existingFeatures: string[]
): { text: string; wasApplied: boolean; features: string[] } {
  try {
    // Check if we have prepared response from anticipatory processing
    const prepared = getPreparedResponse(sessionId);

    // Determine the detected emotion to use
    const detectedEmotion: CartesiaEmotion =
      (userData?.voiceEmotion?.primary as CartesiaEmotion) ||
      (userData?.lastEmotionAnalysis?.primary as CartesiaEmotion) ||
      'neutral';

    const turnNumber = userData?.turnCount || 1;

    // Only apply if we have anticipation data OR on every 3rd turn for natural variation
    const shouldApply = prepared !== null || turnNumber % 3 === 0;

    if (!shouldApply) {
      return { text, wasApplied: false, features: [] };
    }

    // Apply the Sesame enhancement pipeline
    const result = enhanceResponseWithSesame(
      sessionId,
      text,
      detectedEmotion,
      turnNumber
    );

    // Filter out features that were already applied by other processors
    const newFeatures = result.features.filter(
      (f) => !existingFeatures.includes(f) && !existingFeatures.includes(`sesame_${f}`)
    );

    if (newFeatures.length === 0) {
      return { text, wasApplied: false, features: [] };
    }

    diag.debug('🎭 Sesame enhancement applied', {
      sessionId,
      features: newFeatures,
      processingMs: result.processingMs,
      usedAnticipation: prepared !== null,
    });

    return {
      text: result.enhanced,
      wasApplied: true,
      features: newFeatures.map((f) => `sesame_${f}`),
    };
  } catch (error) {
    diag.debug('Sesame enhancement failed (non-fatal)', { error: String(error) });
    return { text, wasApplied: false, features: [] };
  }
}

/**
 * Apply emotional arc adjustments
 */
function applyEmotionalArcAdjustments(text: string): { text: string; wasApplied: boolean } {
  const { getEmotionalArcTracker } = require('../../conversation/index.js');
  const emotionalArc = getEmotionalArcTracker();
  const arcAdjustments = emotionalArc.getSsmlAdjustments();

  if (arcAdjustments.addBreaks && !text.includes('<break')) {
    return { text: `<break time="200ms"/>${text}`, wasApplied: true };
  }

  return { text, wasApplied: false };
}

/**
 * Apply dynamic speed control based on context
 */
async function applyDynamicSpeedControl(
  text: string,
  sessionId: string,
  persona: PersonaConfig,
  userData: UserData
): Promise<{ text: string; wasApplied: boolean }> {
  try {
    const { getHumanListeningResult } = await import(
      '../../intelligence/context-builders/human-listening.js'
    );
    const { applyDynamicSpeed, getPersonaSpeedProfile, calculatePersonaAdjustedSpeed } =
      await import('../integrations/dynamic-speed-integration.js');
    const { getEmotionalArcTracker } = await import('../../conversation/index.js');

    const listeningResult = getHumanListeningResult(sessionId);
    const emotionalArc = getEmotionalArcTracker();
    const personaProfile = getPersonaSpeedProfile(persona.id);

    // Derive emotional intensity
    const arcData = emotionalArc.getArc();
    const tremorIntensity = listeningResult?.audio?.tremor?.intensity;
    const tremorScore =
      tremorIntensity === 'pronounced'
        ? 0.9
        : tremorIntensity === 'noticeable'
          ? 0.6
          : tremorIntensity === 'subtle'
            ? 0.3
            : 0;
    const emotionalIntensity = Math.max(
      Math.abs(arcData.currentValence || 0),
      arcData.currentArousal || 0,
      tremorScore
    );

    // Derive content complexity
    const contentComplexity =
      listeningResult?.text?.cognitiveLoad?.level === 'high'
        ? 0.8
        : listeningResult?.text?.cognitiveLoad?.level === 'medium'
          ? 0.5
          : 0.3;

    // Determine topic weight
    const topicWeight: 'light' | 'medium' | 'heavy' =
      (arcData.currentValence ?? 0) < -0.3 || emotionalIntensity > 0.7
        ? 'heavy'
        : (arcData.currentValence ?? 0) > 0.3
          ? 'light'
          : 'medium';

    // Calculate persona-adjusted speed
    const personaSpeed = calculatePersonaAdjustedSpeed(persona.id, {
      emotionalIntensity,
      contentComplexity,
      topicWeight,
      isQuestion: text.includes('?'),
    });

    const speedResult = applyDynamicSpeed(text, {
      sessionId,
      personaId: persona.id,
      emotionalArc: arcData,
      listeningResult: listeningResult || undefined,
      topicWeight,
      turnNumber: userData.turnCount || 0,
      baseSpeed: personaSpeed.speed,
    });

    if (speedResult.wasAdjusted) {
      diag.debug('⏱️ Dynamic speed applied', {
        speed: speedResult.speedResult.speedMultiplier,
        personaBase: personaProfile.baseSpeed,
        personaAdjusted: personaSpeed.speed.toFixed(2),
        reason: speedResult.speedResult.reason,
      });
      return { text: speedResult.ssmlText, wasApplied: true };
    }
  } catch {
    // Non-critical
  }

  return { text, wasApplied: false };
}

/**
 * Apply voice humanization (laughter, contagion, rhythm, breathing)
 */
async function applyVoiceHumanization(
  text: string,
  sessionId: string,
  userData: UserData | undefined
): Promise<{ text: string; wasApplied: boolean; features: string[] }> {
  const features: string[] = [];
  let result = text;

  try {
    const { getVoiceHumanizationService } = await import(
      '../../speech/voice-humanization.js'
    );
    const { getEmotionalContagionService } = await import('../../speech/emotional-contagion.js');
    const { getSessionFlags } = await import('../../config/voice-humanization-flags.js');
    const { getWordTimingRhythmService } = await import('../../speech/word-timing-rhythm.js');
    const { getEmotionalArcTracker } = await import('../../conversation/index.js');

    const voiceHumanService = getVoiceHumanizationService(sessionId);

    // 1. Laughter response
    const laughterDetected = userData?.detectedLaughter;
    if (laughterDetected?.isLaughing && laughterDetected.confidence > 0.7) {
      if (!result.includes('<laugh>') && !result.startsWith('<break')) {
        result = `<break time="100ms"/>${result}`;
        features.push('laughter_warmth');
      }
      if (userData) {
        userData.detectedLaughter = undefined;
      }
    }

    // 2. Emotional contagion
    const contagionService = getEmotionalContagionService(sessionId);
    const voiceEmotion = userData?.voiceEmotion;
    if (voiceEmotion) {
      const emotionalArc = getEmotionalArcTracker();
      const hints = contagionService.getContinuityHints(emotionalArc.getArc(), voiceEmotion.primary);

      if (hints.prosody.speedAdjust !== 0 || hints.prosody.volumeAdjust !== 1.0) {
        const speedRatio = Math.max(0.6, Math.min(1.5, 1 + hints.prosody.speedAdjust));
        const volumeRatio = Math.max(0.5, Math.min(2.0, hints.prosody.volumeAdjust));

        if (!result.includes('<speed') && !result.includes('<volume')) {
          result = `<speed ratio="${speedRatio.toFixed(2)}"/><volume ratio="${volumeRatio.toFixed(2)}"/>${result}`;
          features.push('emotional_contagion');
        }
      }

      if (hints.closingWarmth && result.match(/[.!?]$/)) {
        result = result.replace(/([.!?])$/, '<break time="100ms"/>$1');
      }

      contagionService.recordUtterance({
        emotion: voiceEmotion.primary || 'neutral',
        valence: voiceEmotion.valence || 0,
        arousal: voiceEmotion.arousal || 0.5,
        warmth:
          voiceEmotion.arousal > 0.6 ? 'high' : voiceEmotion.arousal > 0.4 ? 'medium' : 'low',
        wasSupporting: voiceEmotion.stressLevel > 0.5,
      });
    }

    // 3. Rhythm mirroring
    const rhythmAdjustments = voiceHumanService.getRhythmMirroringAdjustments();
    if (rhythmAdjustments.pauseMultiplier > 1.1 && !result.includes('<break')) {
      result = result.replace(/([,])\s+/g, '$1<break time="100ms"/> ');
      features.push('rhythm_mirroring');
    }
    if (rhythmAdjustments.phraseBreakMs !== 200) {
      const breakMs = Math.min(500, Math.max(100, rhythmAdjustments.phraseBreakMs));
      result = result.replace(/([.!?])\s+/g, `$1<break time="${breakMs}ms"/> `);
    }

    // 4. Word-timing rhythm
    const flags = getSessionFlags(sessionId);
    if (flags.enableWordTimingRhythm) {
      try {
        const wordTimingService = getWordTimingRhythmService(sessionId);
        const ssmlAdjustments = wordTimingService.getCurrentAdjustments();

        if (ssmlAdjustments.rate !== 1.0 && !result.includes('<speed')) {
          const speedRatio = Math.max(0.6, Math.min(1.5, ssmlAdjustments.rate));
          if (speedRatio !== 1.0) {
            result = `<speed ratio="${speedRatio.toFixed(2)}"/>${result}`;
            features.push('word_timing_rhythm');
          }
        }

        if (ssmlAdjustments.addMicroPauses && ssmlAdjustments.microPauseDuration > 0) {
          const microMs = ssmlAdjustments.microPauseDuration;
          result = result.replace(/([,;])\s+/g, `$1<break time="${microMs}ms"/> `);
        }
      } catch {
        // Word timing is non-critical
      }
    }

    return { text: result, wasApplied: features.length > 0, features };
  } catch (error) {
    diag.debug('Voice humanization failed (non-fatal)', { error: String(error) });
    return { text, wasApplied: false, features: [] };
  }
}

export default processResponse;

