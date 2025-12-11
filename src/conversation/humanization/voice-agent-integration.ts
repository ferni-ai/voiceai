/**
 * Voice Agent Humanization Integration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module integrates the advanced humanization system into the voice agent
 * pipeline. It provides hooks for:
 * - Session lifecycle (start, end)
 * - Message processing (user messages, agent responses)
 * - Voice analysis integration (voice prints, ambient awareness)
 * - Cross-session continuity
 *
 * @module @ferni/humanization/voice-agent-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getAmbientAwarenessEngine, type AmbientDetectionResult } from './ambient-awareness.js';
import {
  getBreathingSyncEngine,
  simulateBreathPattern,
  type BreathPattern,
} from './breathing-sync.js';
import { getCrossSessionVoiceEngine, type CrossSessionVoiceMemory } from './cross-session-voice.js';
import { getEmotionalLeadingEngine, type UserEmotionalState } from './emotional-leading.js';
import {
  getHumanizationOrchestrator,
  resetHumanization,
  type HumanizationOrchestratorConfig,
  type HumanizedResponseResult,
} from './index.js';
import { getVoicePrintEngine, type VoiceSnapshot } from './voice-print.js';

// Advanced Humanization Integration (10 deep capabilities)
import {
  initAdvancedHumanization,
  cleanupAdvancedHumanization,
  processAdvancedTurn,
  getResponseModifications,
  recordAdviceGiven,
  recordAgentResponse,
  type TurnGuidance,
  type ResponseModification,
} from '../advanced-humanization-integration.js';

const logger = createLogger({ module: 'HumanizationIntegration' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface HumanizationSessionState {
  sessionId: string;
  userId: string;
  personaId: string;
  startTime: Date;
  turnCount: number;
  comfortLevel: number;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  recentTopics: string[];
  isActive: boolean;
  /** Advanced humanization state */
  advancedHumanization: {
    enabled: boolean;
    lastGuidance: TurnGuidance | null;
    lastModifications: ResponseModification | null;
  };
}

const sessions = new Map<string, HumanizationSessionState>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize humanization for a new voice session
 */
export function onSessionStart(
  sessionId: string,
  userId: string,
  personaId: string,
  options?: {
    config?: Partial<HumanizationOrchestratorConfig>;
    crossSessionMemory?: CrossSessionVoiceMemory;
    initialVoice?: VoiceSnapshot;
    relationshipStage?: HumanizationSessionState['relationshipStage'];
    enableAdvancedHumanization?: boolean;
  }
): {
  advancedStart?: {
    greeting: string | null;
    eventFollowUp: string | null;
    milestoneAcknowledgment: string | null;
  };
} {
  // Create session state
  const state: HumanizationSessionState = {
    sessionId,
    userId,
    personaId,
    startTime: new Date(),
    turnCount: 0,
    comfortLevel: 0.25,
    relationshipStage: options?.relationshipStage || 'acquaintance',
    recentTopics: [],
    isActive: true,
    advancedHumanization: {
      enabled: options?.enableAdvancedHumanization ?? true,
      lastGuidance: null,
      lastModifications: null,
    },
  };
  sessions.set(sessionId, state);

  // Initialize the orchestrator
  getHumanizationOrchestrator(sessionId, options?.config, userId);

  // Initialize cross-session voice memory
  if (options?.crossSessionMemory) {
    const crossSession = getCrossSessionVoiceEngine(userId, options.crossSessionMemory);
    if (options.initialVoice) {
      crossSession.startSession(sessionId, options.initialVoice);
    }
  }

  // Initialize advanced humanization (10 deep capabilities)
  let advancedStart: {
    greeting: string | null;
    eventFollowUp: string | null;
    milestoneAcknowledgment: string | null;
  } | undefined;

  if (state.advancedHumanization.enabled) {
    const relationshipDepthMap: Record<
      HumanizationSessionState['relationshipStage'],
      'new' | 'developing' | 'established' | 'deep'
    > = {
      stranger: 'new',
      acquaintance: 'developing',
      friend: 'established',
      trusted_advisor: 'deep',
    };

    const result = initAdvancedHumanization({
      sessionId,
      userId,
      relationshipDepth: relationshipDepthMap[state.relationshipStage],
    });

    advancedStart = {
      greeting: result.greeting,
      eventFollowUp: result.eventFollowUp,
      milestoneAcknowledgment: result.milestoneAcknowledgment,
    };

    logger.info(
      {
        sessionId,
        hasGreeting: !!result.greeting,
        hasMilestone: !!result.milestoneAcknowledgment,
      },
      '🌟 Advanced humanization initialized'
    );
  }

  logger.info({ sessionId, userId, personaId }, '🎭 Humanization session started');

  return { advancedStart };
}

/**
 * Clean up humanization for an ended session
 */
export function onSessionEnd(
  sessionId: string,
  options?: {
    endingVoice?: VoiceSnapshot;
  }
): {
  voicePrint: ReturnType<ReturnType<typeof getVoicePrintEngine>['getVoicePrint']>;
  crossSessionMemory: ReturnType<ReturnType<typeof getCrossSessionVoiceEngine>['getMemory']>;
} | null {
  const state = sessions.get(sessionId);
  if (!state) {
    logger.warn({ sessionId }, 'Session not found for cleanup');
    return null;
  }

  // End cross-session tracking
  const crossSession = getCrossSessionVoiceEngine(state.userId);
  if (options?.endingVoice) {
    crossSession.endSession(options.endingVoice);
  }

  // Get persistence data
  const voicePrint = getVoicePrintEngine(state.userId);
  const result = {
    voicePrint: voicePrint.getVoicePrint(),
    crossSessionMemory: crossSession.getMemory(),
  };

  // Clean up advanced humanization
  if (state.advancedHumanization.enabled) {
    cleanupAdvancedHumanization(sessionId);
  }

  // Clean up
  state.isActive = false;
  resetHumanization(sessionId, state.userId);
  sessions.delete(sessionId);

  logger.info(
    { sessionId, duration: Date.now() - state.startTime.getTime() },
    '🎭 Humanization session ended'
  );

  return result;
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * Detect vulnerability sharing in user messages
 * This is CRITICAL for relationship acceleration
 */
function detectVulnerabilitySharing(
  message: string,
  voiceEmotion?: { primary: string; confidence: number }
): {
  isVulnerable: boolean;
  type?: 'deep_disclosure' | 'first_time_share' | 'emotional_admission' | 'asking_for_help';
  confidence: number;
} {
  const lower = message.toLowerCase();

  // Patterns that indicate vulnerability
  const vulnerabilityPatterns = [
    { pattern: /i('ve| have) never told anyone/i, type: 'first_time_share' as const, weight: 0.95 },
    {
      pattern: /this is hard (to|for me to) (say|admit|talk about)/i,
      type: 'deep_disclosure' as const,
      weight: 0.9,
    },
    {
      pattern: /i('m| am) (scared|afraid|terrified)/i,
      type: 'emotional_admission' as const,
      weight: 0.85,
    },
    {
      pattern: /i don't know (who|what) (else )?to (talk|turn) to/i,
      type: 'asking_for_help' as const,
      weight: 0.9,
    },
    {
      pattern: /i('ve| have) been (struggling|dealing) with/i,
      type: 'emotional_admission' as const,
      weight: 0.75,
    },
    { pattern: /nobody (knows|understands)/i, type: 'deep_disclosure' as const, weight: 0.8 },
    {
      pattern: /i feel (so )?(alone|lonely|isolated)/i,
      type: 'emotional_admission' as const,
      weight: 0.85,
    },
    {
      pattern: /can i (tell|share|confess) (you )?something/i,
      type: 'first_time_share' as const,
      weight: 0.7,
    },
    {
      pattern: /i('m| am) (not|really) ok(ay)?/i,
      type: 'emotional_admission' as const,
      weight: 0.8,
    },
    { pattern: /i need (help|someone|to talk)/i, type: 'asking_for_help' as const, weight: 0.75 },
    {
      pattern: /i('ve| have) (never|been afraid to) (admitted|said|shared) this/i,
      type: 'first_time_share' as const,
      weight: 0.85,
    },
    {
      pattern: /i('m| am) (really )?struggling/i,
      type: 'emotional_admission' as const,
      weight: 0.7,
    },
    {
      pattern: /this is (embarrassing|humiliating|shameful)/i,
      type: 'deep_disclosure' as const,
      weight: 0.85,
    },
    {
      pattern: /i('ve| have) been (hiding|keeping)/i,
      type: 'deep_disclosure' as const,
      weight: 0.75,
    },
  ];

  let bestMatch: {
    type: 'deep_disclosure' | 'first_time_share' | 'emotional_admission' | 'asking_for_help';
    weight: number;
  } | null = null;

  for (const { pattern, type, weight } of vulnerabilityPatterns) {
    if (pattern.test(message)) {
      if (!bestMatch || weight > bestMatch.weight) {
        bestMatch = { type, weight };
      }
    }
  }

  // Boost confidence if voice emotion indicates vulnerability
  let voiceBoost = 0;
  if (voiceEmotion?.primary) {
    const vulnerableEmotions = ['sadness', 'fear', 'anxiety', 'distress'];
    if (vulnerableEmotions.includes(voiceEmotion.primary.toLowerCase())) {
      voiceBoost = voiceEmotion.confidence * 0.15;
    }
  }

  if (bestMatch) {
    return {
      isVulnerable: true,
      type: bestMatch.type,
      confidence: Math.min(1, bestMatch.weight + voiceBoost),
    };
  }

  return { isVulnerable: false, confidence: 0 };
}

/**
 * Process a user message through humanization
 * Call this when the user speaks
 */
export function processUserMessage(
  sessionId: string,
  message: string,
  context?: {
    voiceEmotion?: { primary: string; confidence: number };
    voiceSnapshot?: VoiceSnapshot;
    ambientDetection?: AmbientDetectionResult;
    breathPattern?: BreathPattern;
    topic?: string;
  }
): void {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    logger.warn({ sessionId }, 'Cannot process message - session not active');
    return;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);

  // Record the message for phonetic mirroring and pattern learning
  orchestrator.recordUserMessage(message);

  // VULNERABILITY DETECTION - Critical for relationship acceleration
  const vulnerability = detectVulnerabilitySharing(message, context?.voiceEmotion);
  if (vulnerability.isVulnerable) {
    // Record the comfort event immediately
    orchestrator.recordComfortEvent('user_shared_vulnerability', state.turnCount);

    // Log for debugging
    logger.info(
      { sessionId, type: vulnerability.type, confidence: vulnerability.confidence },
      '💜 Vulnerability detected - relationship accelerated'
    );

    // Also record specific types
    if (vulnerability.type === 'deep_disclosure' || vulnerability.type === 'first_time_share') {
      orchestrator.recordComfortEvent('deep_disclosure', state.turnCount);
    }
  }

  // Update turn count
  state.turnCount++;

  // Update topics
  if (context?.topic) {
    state.recentTopics.unshift(context.topic);
    if (state.recentTopics.length > 5) {
      state.recentTopics.pop();
    }
  }

  // Process voice snapshot if provided
  if (context?.voiceSnapshot) {
    const voicePrint = getVoicePrintEngine(state.userId);
    voicePrint.recordSnapshot(context.voiceSnapshot);
  }

  // Process ambient sounds if provided
  if (context?.ambientDetection) {
    const ambient = getAmbientAwarenessEngine(sessionId);
    ambient.processDetection(context.ambientDetection, state.turnCount);
  }

  // Process breath pattern if provided
  if (context?.breathPattern) {
    const breathing = getBreathingSyncEngine(sessionId);
    breathing.updateUserPattern(context.breathPattern);
  }

  // Process through advanced humanization (10 deep capabilities)
  if (state.advancedHumanization.enabled) {
    const advancedGuidance = processAdvancedTurn(sessionId, message, {
      detectedEmotion: context?.voiceEmotion?.primary,
      topic: context?.topic,
      prosodyHints: context?.voiceSnapshot
        ? {
            speechRate: context.voiceSnapshot.speechRate,
            volume: context.voiceSnapshot.energyMean,
            pitchVariance: context.voiceSnapshot.pitchVariance,
          }
        : undefined,
    });

    if (advancedGuidance) {
      state.advancedHumanization.lastGuidance = advancedGuidance;
      state.advancedHumanization.lastModifications = getResponseModifications(sessionId);
    }
  }

  logger.debug(
    {
      sessionId,
      turn: state.turnCount,
      messageLength: message.length,
      hasVoice: !!context?.voiceSnapshot,
      hasAmbient: !!context?.ambientDetection,
      hasAdvancedGuidance: !!state.advancedHumanization.lastGuidance,
    },
    '👤 User message processed'
  );
}

/**
 * Humanize an agent response
 * Call this before TTS to apply humanization
 */
export function humanizeResponse(
  sessionId: string,
  response: string,
  context: {
    userMessage: string;
    userEmotion?: string;
    userEnergy?: 'high' | 'medium' | 'low';
    isEmotionalContent?: boolean;
  }
): HumanizedResponseResult {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    logger.warn({ sessionId }, 'Cannot humanize - session not active');
    return {
      original: response,
      text: response,
      ssml: response,
      appliedHumanizations: [],
      skippedFeatures: [{ feature: 'all', reason: 'Session not active' }],
    };
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);

  // Estimate response complexity
  const wordCount = response.split(/\s+/).length;
  const responseComplexity = Math.min(1, wordCount > 50 ? 0.5 + (wordCount - 50) / 100 : 0.3);

  // Detect advice-giving patterns
  const isGivingAdvice =
    /\b(I think you should|you might want to|consider|my suggestion|I'd recommend)\b/i.test(
      response
    );

  // Build context for humanization
  const result = orchestrator.humanize(response, {
    userMessage: context.userMessage,
    userWordCount: context.userMessage.split(/\s+/).length,
    userEnergy: context.userEnergy || 'medium',
    userEmotion: context.userEmotion,
    turnCount: state.turnCount,
    sessionMinutes: Math.floor((Date.now() - state.startTime.getTime()) / 60000),
    comfortLevel: state.comfortLevel,
    relationshipStage: state.relationshipStage,
    personaId: state.personaId,
    recentTopics: state.recentTopics,
    recentHumanizations: [],
    isEmotionalContent: context.isEmotionalContent ?? false,
    responseComplexity,
    isGivingAdvice,
  });

  logger.debug(
    {
      sessionId,
      turn: state.turnCount,
      appliedCount: result.appliedHumanizations.length,
      applied: result.appliedHumanizations.map((h) => h.type),
    },
    '🎭 Response humanized'
  );

  return result;
}

// ============================================================================
// EMOTIONAL LEADING
// ============================================================================

/**
 * Get emotional leading guidance for current user state
 */
export function getEmotionalLeadingGuidance(
  sessionId: string,
  userState: UserEmotionalState,
  userMessage: string
): ReturnType<ReturnType<typeof getEmotionalLeadingEngine>['decideLeading']> | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const leading = getEmotionalLeadingEngine(sessionId);
  return leading.decideLeading(userState, userMessage, {
    turnCount: state.turnCount,
    comfortLevel: state.comfortLevel,
    recentTopics: state.recentTopics,
  });
}

// ============================================================================
// AMBIENT AWARENESS
// ============================================================================

/**
 * Get ambient context for conversation adaptation
 */
export function getAmbientContext(sessionId: string) {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const ambient = getAmbientAwarenessEngine(sessionId);
  return ambient.getCurrentContext();
}

/**
 * Get ambient acknowledgment if appropriate
 */
export function getAmbientAcknowledgment(sessionId: string): string | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const ambient = getAmbientAwarenessEngine(sessionId);
  const ack = ambient.getAcknowledgment();
  if (ack) {
    ambient.markAcknowledged();
  }
  return ack;
}

// ============================================================================
// VOICE STATE DETECTION
// ============================================================================

/**
 * Detect voice state changes from baseline
 */
export function detectVoiceState(
  sessionId: string,
  currentVoice: VoiceSnapshot
): ReturnType<ReturnType<typeof getVoicePrintEngine>['detectState']> | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const voicePrint = getVoicePrintEngine(state.userId);
  if (!voicePrint.isCalibrated()) {
    return null;
  }

  return voicePrint.detectState(currentVoice);
}

// ============================================================================
// CROSS-SESSION FEATURES
// ============================================================================

/**
 * Get cross-session acknowledgment if appropriate
 */
export function getCrossSessionAcknowledgment(
  sessionId: string,
  currentVoice: VoiceSnapshot
): ReturnType<ReturnType<typeof getCrossSessionVoiceEngine>['generateAcknowledgment']> | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const crossSession = getCrossSessionVoiceEngine(state.userId);
  return crossSession.generateAcknowledgment(currentVoice);
}

/**
 * Mark a cross-session acknowledgment as delivered
 */
export function markCrossSessionAcknowledged(sessionId: string, changeId: string): void {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return;
  }

  const crossSession = getCrossSessionVoiceEngine(state.userId);
  crossSession.markAcknowledged(changeId);
}

// ============================================================================
// BREATHING SYNC
// ============================================================================

/**
 * Get breathing sync adjustments for SSML
 */
export function getBreathingSyncAdjustments(
  sessionId: string,
  text: string,
  emotionalContext?: {
    isEmotional: boolean;
    isHeavy: boolean;
    isExcited: boolean;
  }
): ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']> | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const breathing = getBreathingSyncEngine(sessionId);
  if (!breathing.hasValidData()) {
    return null;
  }

  return breathing.calculateAdjustments(text, emotionalContext);
}

/**
 * Apply breathing sync to SSML
 */
export function applyBreathingSync(
  sessionId: string,
  ssml: string,
  adjustments: ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']>
): string {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return ssml;
  }

  const breathing = getBreathingSyncEngine(sessionId);
  return breathing.applyToSsml(ssml, adjustments);
}

// ============================================================================
// COMFORT & PHASE TRACKING
// ============================================================================

/**
 * Record a comfort-building event
 */
export function recordComfortEvent(
  sessionId: string,
  event:
    | 'user_shared_vulnerability'
    | 'shared_laughter'
    | 'accepted_feedback'
    | 'emotional_moment_navigated'
    | 'user_initiated_deeper_topic'
    | 'comfortable_silence'
    | 'deep_disclosure'
    | 'reciprocated_vulnerability'
): void {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  orchestrator.recordComfortEvent(event, state.turnCount);

  // Update local comfort level estimate
  const comfortIncrease: Record<typeof event, number> = {
    user_shared_vulnerability: 0.1,
    deep_disclosure: 0.12,
    reciprocated_vulnerability: 0.1,
    shared_laughter: 0.08,
    accepted_feedback: 0.05,
    emotional_moment_navigated: 0.12,
    user_initiated_deeper_topic: 0.07,
    comfortable_silence: 0.06,
  };
  state.comfortLevel = Math.min(1, state.comfortLevel + comfortIncrease[event]);

  logger.debug({ sessionId, event, newComfort: state.comfortLevel }, '💗 Comfort event recorded');
}

/**
 * Get current conversation phase
 */
export function getConversationPhase(sessionId: string): string {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return 'unknown';
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  return orchestrator.getConversationPhase();
}

/**
 * Get phase-specific behavior guidance
 */
export function getPhaseBehavior(sessionId: string) {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  return orchestrator.getPhaseBehavior();
}

/**
 * Check if a behavior is unlocked at current comfort level
 */
export function isBehaviorUnlocked(sessionId: string, behaviorName: string): boolean {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return false;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  return orchestrator.isBehaviorUnlocked(behaviorName);
}

// ============================================================================
// STATE ACCESS
// ============================================================================

/**
 * Get current session state
 */
export function getSessionState(sessionId: string): HumanizationSessionState | null {
  return sessions.get(sessionId) || null;
}

/**
 * Get all engine states for debugging
 */
export function getEngineStates(sessionId: string): Record<string, unknown> | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  return {
    sessionState: state,
    engines: orchestrator.getEngineStates(),
  };
}

// ============================================================================
// UTILITY: Create voice snapshot from prosody data
// ============================================================================

/**
 * Create a VoiceSnapshot from prosody analysis data
 * Use this to convert LiveKit audio prosody to humanization format
 */
export function createVoiceSnapshot(prosodyData: {
  pitchHz?: number;
  pitchMin?: number;
  pitchMax?: number;
  speechRate?: number;
  energy?: number;
  breathiness?: number;
  roughness?: number;
  strain?: number;
  valence?: number;
  arousal?: number;
}): VoiceSnapshot {
  return {
    pitchMean: prosodyData.pitchHz || 150,
    pitchMin: prosodyData.pitchMin || 100,
    pitchMax: prosodyData.pitchMax || 200,
    pitchVariance:
      prosodyData.pitchMax && prosodyData.pitchMin
        ? (prosodyData.pitchMax - prosodyData.pitchMin) / 4
        : 25,
    speechRate: prosodyData.speechRate || 150,
    pauseRate: 8,
    avgPauseDuration: 400,
    energyMean: prosodyData.energy || 0.5,
    energyVariance: 0.15,
    breathiness: prosodyData.breathiness || 0.3,
    roughness: prosodyData.roughness || 0.2,
    strain: prosodyData.strain || 0.1,
    valence: prosodyData.valence || 0,
    arousal: prosodyData.arousal || 0.5,
    timestamp: new Date(),
  };
}

/**
 * Simulate breath pattern from emotional state
 * Use this when actual breath detection is unavailable
 */
export function simulateBreathFromEmotion(emotion: string): BreathPattern {
  const emotionMap: Record<string, Parameters<typeof simulateBreathPattern>[0]> = {
    calm: { isCalm: true },
    relaxed: { isCalm: true },
    peaceful: { isCalm: true },
    anxious: { isAnxious: true },
    worried: { isAnxious: true },
    stressed: { isAnxious: true },
    tired: { isTired: true },
    exhausted: { isTired: true },
    excited: { isExcited: true },
    happy: { isExcited: true },
    enthusiastic: { isExcited: true },
  };

  const hints = emotionMap[emotion.toLowerCase()] || {};
  return simulateBreathPattern(hints);
}

// ============================================================================
// ADVANCED HUMANIZATION ACCESS
// ============================================================================

/**
 * Get advanced humanization guidance from last processed turn
 */
export function getAdvancedGuidance(sessionId: string): TurnGuidance | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return null;
  }
  return state.advancedHumanization.lastGuidance;
}

/**
 * Get response modifications from advanced humanization
 */
export function getAdvancedModifications(sessionId: string): ResponseModification | null {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return null;
  }
  return state.advancedHumanization.lastModifications;
}

/**
 * Record that agent gave advice (for resistance tracking)
 */
export function recordAdvice(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return;
  }
  recordAdviceGiven(sessionId);
}

/**
 * Record agent response (for repair detection on next turn)
 */
export function recordResponse(sessionId: string, response: string): void {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return;
  }
  recordAgentResponse(sessionId, response);
}

/**
 * Check if we should stop giving direct advice
 */
export function shouldStopAdvice(sessionId: string): boolean {
  const state = sessions.get(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return false;
  }
  return state.advancedHumanization.lastGuidance?.stopDirectAdvice ?? false;
}

/**
 * Get system prompt additions from advanced humanization
 */
export function getAdvancedSystemPromptAdditions(sessionId: string): string[] {
  const mods = getAdvancedModifications(sessionId);
  return mods?.systemPromptAdditions ?? [];
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Export only types that aren't already exported from other modules
export type { HumanizationSessionState, TurnGuidance, ResponseModification };
