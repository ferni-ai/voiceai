/**
 * Voice Agent Turn Handler
 *
 * Orchestrates the processing of each user turn with:
 * - Slash command detection
 * - Turn processing via TurnProcessor
 * - "Better Than Human" personality injection
 * - Context injection for LLM
 * - Event dispatch (emotion, behavior, celebration)
 * - Trust systems recording
 * - Dead air prevention (thinking fillers, error recovery)
 *
 * This module has been refactored from a 1065-line monolith into focused modules:
 * - turn-personality.ts - Personality system integration
 * - turn-events.ts - Event dispatch to frontend
 * - turn-learning.ts - Trust systems and collective learning
 *
 * @module voice-agent/turn-handler
 */

import { log, type llm } from '@livekit/agents';
import { getGracefulErrorResponse } from '../../intelligence/conversation-quality.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getContextAwareThinkingFiller } from '../../speech/persona-phrases.js';
import type { SessionStateManager } from '../session/session-state.js';
import { PROCESSING_TIMEOUTS } from '../shared/constants.js';
import type { UserData } from '../shared/types.js';
import { handleSlashCommand, sendCelebrationEvents } from './index.js';

// Import extracted modules
import {
  processPersonality,
  cleanupPersonalityState as cleanupPersonalityStateInternal,
  type PersonalityContext,
} from './turn-personality.js';
import { dispatchAllTurnEvents, type EventDispatchContext } from './turn-events.js';
import { recordAllLearningData, type LearningContext } from './turn-learning.js';

// Performance optimization imports
import {
  getTurnProfiler,
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
} from '../../services/performance/turn-profiler.js';
import { speculateTTS } from '../../services/performance/speculative-tts.js';

// "Better Than Human" emotion dispatch for frontend EQ system
import {
  dispatchEmotionEvents,
  dispatchHolisticEvents,
  dispatchExpressionUpdate,
  // BTH signal dispatchers (10 superhuman capabilities)
  dispatchSpontaneousDelight,
  dispatchVisibleVulnerability,
  dispatchTemporalInsight,
  dispatchAnticipatoryPresence,
  dispatchProtectiveInstinct,
  dispatchSuperhumanObservation,
  dispatchEmotionalBondDeepen,
  dispatchMicroExpression,
  dispatchMetaRelationshipMoment,
  dispatchSomaticPresence,
  dispatchInsideJokeCallback,
  // BTH detection helpers
  detectUserDelight,
  detectMetaRelationship,
  getTimeContext,
} from '../realtime/emotion-event-dispatcher.js';
// Safe fire-and-forget pattern for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
// "Better Than Human" concern detection with voice prosody
import {
  getConcernDetectionEngine,
  type ProsodySignals,
} from '../../conversation/concern-detection.js';
import type { ProsodyFeatures } from '../../speech/audio-prosody/types.js';
// Adaptive timing for "Better than Human" response latency
import {
  getAdaptiveTimeouts,
  shouldInjectFiller,
  recordFillerInjection,
  startTurnProfile,
  completeTurnProfile,
} from '../shared/performance/adaptive-timing.js';
// Unified Naturalness Engine - combines stress, patterns, ambient, rapport
import {
  getNaturalnessEngine,
  processTurn as processNaturalnessTurn,
  type TurnInput as NaturalnessTurnInput,
  type NaturalnessResult,
} from '../../speech/naturalness/index.js';

// "Better Than Human v3" - Semantic Intelligence System
import {
  processSemanticIntelligence,
  type TurnSemanticData,
} from '../../services/superhuman/semantic-intelligence/integration.js';
import { getPrimaryPersonName } from '../../services/superhuman/semantic-intelligence/person-extractor.js';

// NEW: Unified Intelligence System (Levels 2-5)
import {
  getUnifiedIntelligence,
  processTurnLearning,
  markProactiveInsightSurfaced,
} from '../integrations/unified-intelligence-integration.js';

// "Better Than Human" dynamic memory capture - LLM-powered extraction
import { fastCapture } from '../../memory/dynamic/index.js';

// "Better Than Human" memory retrieval - Phase 9 real-time integration
import {
  buildMemoryRetrievalContext,
  getSurfacedMemoryIds,
  type MemoryRetrievalBuilderInput,
} from '../../intelligence/context-builders/memory-retrieval-builder.js';

// Redis cache for real-time state (emotional state, voice biomarkers)
import { getRedisCache } from '../../memory/redis-cache.js';

// Phase 11: Voice-Memory Integration - record prosody signals with memories
import {
  recordVoiceContext,
  calculateEmotionalWeight as calculateVoiceEmotionalWeight,
  type VoiceContext,
} from '../integrations/voice-memory-integration.js';

// Note: Live superhuman injections are handled by the turn-processor pipeline
// via src/agents/processors/live-superhuman-injections.ts
// No need to duplicate here - the processor runs those injections

// Re-export cleanupPersonalityState for backwards compatibility
export { cleanupPersonalityState } from './turn-personality.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TurnHandlerContext {
  /** LLM chat context */
  turnCtx: llm.ChatContext;
  /** User message text */
  userText: string;
  /** Current persona config */
  persona: PersonaConfig;
  /** Bundle runtime (optional) */
  bundleRuntime?: BundleRuntimeEngine;
  /** Session services */
  services: SessionServices;
  /** User data (proxy to SessionStateManager) */
  userData: {
    turnCount?: number;
    extensibilitySessionPrompt?: string | null;
    preSessionBriefing?: string;
    // Voice/prosody signals for personality system (optional)
    speechRateWPM?: number;
    pauseBeforeMs?: number;
    totalConversations?: number;
    sharedVulnerabilities?: number;
    relationshipStage?: string;
    lastEmotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
    /** Current emotion for cache-aware TTS lookup (set during turn processing) */
    currentEmotion?: string;
    // macOS context from menubar app (sent via data channel)
    macOS?: import('../../intelligence/context-builders/external/macos-context.js').MacOSContextPayload;
    // Better Than Human: Calendar awareness (loaded async at session start)
    calendarAwareness?: string;
    // Greeting awareness: Tell LLM what greeting was spoken
    greetingText?: string;
    greetingInjected?: boolean;
  };
  /** Voice emotion result (optional, from voice agent) */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  /** Session state manager (single source of truth) */
  sessionStateManager?: SessionStateManager;
  /** Current session for speaking */
  currentSession?: {
    say: (text: string, opts?: { allowInterruptions?: boolean }) => void;
  };
  /** Room for data messages (optional) */
  room?: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
  /** Send data message callback */
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  /** Previous turn history for personality system */
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
  }>;
}

// ============================================================================
// PROSODY → CONCERN DETECTION BRIDGE
// Maps voice prosody features to concern detection signals
// ============================================================================

/**
 * Map ProsodyFeatures (from audio analysis) to ProsodySignals (for concern detection).
 *
 * This bridge enables "Better Than Human" concern detection:
 * - Voice strain detection (from jitter, breathiness)
 * - Pitch instability (from pitch variance)
 * - Speech rate deviation (from baseline)
 * - Tremor detection (from shimmer, voice quality)
 * - Energy level tracking
 */
function mapProsodyToConcernSignals(prosody: ProsodyFeatures): ProsodySignals {
  // Calculate voice strain from jitter and breathiness
  // High jitter + high breathiness = voice strain
  const strain = Math.min(1, (prosody.jitter || 0) * 2 + (prosody.breathiness || 0) * 0.5);

  // Pitch instability from pitch variance (normalized)
  // Normal pitch variance is 20-50Hz, elevated is 60+Hz
  const pitchInstability = Math.min(1, (prosody.pitchVariance || 0) / 80);

  // Speech rate deviation from baseline (150 wpm normal)
  // Deviation > 0 means faster than normal, < 0 means slower
  const baselineSpeechRate = 150;
  const speechRateDeviation = prosody.speechRate
    ? (prosody.speechRate - baselineSpeechRate) / baselineSpeechRate
    : 0;

  // Pause irregularity from pause frequency and duration
  // High pause frequency + long pauses = irregularity
  const pauseIrregularity = Math.min(
    1,
    ((prosody.pauseFrequency || 0) / 10) * ((prosody.pauseDuration || 0) / 500)
  );

  // Tremor detection from shimmer and voice quality
  const tremor =
    (prosody.shimmer || 0) > 0.15 ||
    prosody.voiceQuality === 'trembling' ||
    prosody.voiceQuality === 'strained';

  // Energy level normalized (typical range is -60 to 0 dB)
  const energy = Math.min(1, Math.max(0, (prosody.energyMean + 60) / 60));

  return {
    strain,
    pitchInstability,
    speechRateDeviation,
    pauseIrregularity,
    tremor,
    energy,
  };
}

// ============================================================================
// PROSODY → NATURALNESS ENGINE BRIDGE
// Maps voice prosody and turn data to naturalness engine input
// ============================================================================

/**
 * Build NaturalnessEngine input from turn handler context.
 *
 * This bridges the turn handler's data to the naturalness engine's expected format,
 * enabling unified voice adaptation across stress, patterns, ambient, and rapport.
 */
function buildNaturalnessInput(ctx: {
  sessionId: string;
  userId: string;
  turnNumber: number;
  userText: string;
  agentWordCount?: number;
  voiceEmotion?: {
    primary?: string;
    confidence?: number;
    prosody?: ProsodyFeatures;
  };
  emotionalResult?: {
    primary: string;
    distressLevel?: number;
  };
  userData?: {
    speechRateWPM?: number;
    pauseBeforeMs?: number;
  };
  userAskedQuestion?: boolean;
  agentInterrupted?: boolean;
  userInterrupted?: boolean;
}): NaturalnessTurnInput {
  const userWordCount = ctx.userText.split(/\s+/).filter(Boolean).length;
  const agentWordCount = ctx.agentWordCount ?? 0;

  // Build audio signals from prosody (if available)
  const audio = ctx.voiceEmotion?.prosody
    ? {
        stressLevel: calculateStressFromProsody(ctx.voiceEmotion.prosody),
        anxietyMarkers: detectAnxietyMarkers(ctx.voiceEmotion.prosody),
        breathPattern: detectBreathPattern(ctx.voiceEmotion.prosody),
        voiceTremor: ctx.voiceEmotion.prosody.shimmer ?? 0,
        concernLevel: ctx.emotionalResult?.distressLevel ?? 0,
      }
    : undefined;

  return {
    audio,
    context: {
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      turnNumber: ctx.turnNumber,
      userWordCount,
      agentWordCount,
      userEmotion: ctx.emotionalResult?.primary,
      userAskedQuestion: ctx.userAskedQuestion,
      silenceDurationMs: ctx.userData?.pauseBeforeMs,
      agentInterrupted: ctx.agentInterrupted,
      userInterrupted: ctx.userInterrupted,
    },
  };
}

/**
 * Calculate stress level from prosody features
 */
function calculateStressFromProsody(prosody: ProsodyFeatures): number {
  // Combine multiple stress indicators
  const jitterContrib = Math.min(1, (prosody.jitter || 0) * 2);
  const shimmerContrib = Math.min(1, (prosody.shimmer || 0) * 1.5);
  const pitchVarContrib = Math.min(1, (prosody.pitchVariance || 0) / 100);
  const breathContrib = (prosody.breathiness || 0) * 0.5;

  // Weighted average
  return Math.min(
    1,
    jitterContrib * 0.3 + shimmerContrib * 0.25 + pitchVarContrib * 0.25 + breathContrib * 0.2
  );
}

/**
 * Detect anxiety markers from prosody
 */
function detectAnxietyMarkers(prosody: ProsodyFeatures): boolean {
  // High jitter + high pitch variance often indicates anxiety
  const jitterHigh = (prosody.jitter || 0) > 0.02;
  const pitchUnstable = (prosody.pitchVariance || 0) > 50;
  const speechFast = (prosody.speechRate || 150) > 180;

  return (jitterHigh && pitchUnstable) || (pitchUnstable && speechFast);
}

/**
 * Detect breath pattern from prosody
 */
function detectBreathPattern(
  prosody: ProsodyFeatures
): 'normal' | 'shallow' | 'deep' | 'held' | 'irregular' | 'relaxing' {
  const pauseFreq = prosody.pauseFrequency || 0;
  const pauseDur = prosody.pauseDuration || 0;
  const breathiness = prosody.breathiness || 0;

  // High pause frequency with short pauses = shallow breathing
  if (pauseFreq > 8 && pauseDur < 200) return 'shallow';

  // Low pause frequency with long pauses = held breath
  if (pauseFreq < 2 && pauseDur > 1000) return 'held';

  // High breathiness with moderate pauses = deep breathing
  if (breathiness > 0.4 && pauseDur > 500) return 'deep';

  // High pause variance = irregular
  if (pauseFreq > 5 && Math.abs(pauseDur - 400) > 300) return 'irregular';

  // Low energy with slow speech = relaxing
  if ((prosody.speechRate || 150) < 120 && breathiness > 0.2) return 'relaxing';

  return 'normal';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a completed user turn.
 *
 * This is the main turn processing pipeline that orchestrates:
 * 1. Slash command detection and handling
 * 2. Turn processing through TurnProcessor
 * 3. Crisis detection and safety rails
 * 4. Personality system integration
 * 5. Context injection into LLM
 * 6. Session state updates
 * 7. Extensibility hooks
 * 8. Event dispatch (emotion, behavior, celebration)
 * 9. Trust systems recording
 * 10. Error recovery with graceful fallbacks
 */
export async function handleUserTurn(ctx: TurnHandlerContext): Promise<void> {
  const {
    turnCtx,
    userText,
    persona,
    bundleRuntime,
    services,
    userData,
    sessionStateManager,
    currentSession,
    room,
    sendDataMessage,
  } = ctx;
  const logger = log();

  if (!userText || userText.trim().length === 0) {
    return;
  }

  // ================================================================
  // PERFORMANCE: Start turn profiling
  // ================================================================
  const turnNumber = userData.turnCount || 1;
  startTurnProfiling(services.sessionId, turnNumber);

  // ================================================================
  // 🌙 BTH: ANTICIPATORY PRESENCE - Time-of-day awareness
  // Fire this early so frontend avatar shows appropriate presence
  // (e.g., gentle expression at 2am, energized on Monday morning)
  // ================================================================
  const timeContext = getTimeContext();
  if (timeContext) {
    fireAndForget(async () => {
      await dispatchAnticipatoryPresence(sendDataMessage, {
        timeContext,
        intensity: timeContext === 'late_night' ? 0.9 : 0.7,
      });
    }, 'bth-anticipatory-presence');
  }

  // ================================================================
  // EXTENSIBILITY: Slash command detection
  // ================================================================
  const trimmedText = userText.trim();
  if (trimmedText.startsWith('/')) {
    const slashResult = await handleSlashCommand({
      text: trimmedText,
      turnCtx,
      personaId: persona.id,
      services: { userId: services.userId, sessionId: services.sessionId },
    });
    if (slashResult.handled) {
      return; // Slash command fully handled
    }
  }

  try {
    // Import the turn processor (cached after first load)
    const { processTurn, injectTurnContext, getCelebrationEvents } =
      await import('../processors/index.js');

    // Build turn context - cast userData to UserData for processor compatibility
    const turnContext = {
      turnCtx,
      userText,
      persona,
      bundleRuntime,
      services,
      userData: userData as UserData,
      logger,
    };

    // ================================================================
    // ADAPTIVE TIMING: Start profiling for "Better than Human" latency
    // ================================================================
    const turnStartTime = Date.now();
    startTurnProfile(services.sessionId, turnNumber);

    // Get adaptive timeouts based on session performance
    const adaptiveTimeouts = getAdaptiveTimeouts(services.sessionId);

    // ================================================================
    // 🎤 PHASE 11: VOICE-MEMORY INTEGRATION
    // Record voice context with prosody signals for emotional memory weighting
    // "Better Than Human" - memories tied to how they sounded, not just what they said
    // ================================================================
    if (services.userId && ctx.voiceEmotion) {
      try {
        const voiceContext: VoiceContext = {
          sessionId: services.sessionId,
          userId: services.userId,
          turnNumber,
          prosody: undefined, // Prosody features would come from audio analysis
          voiceEmotion: {
            primary: ctx.voiceEmotion.primary,
            confidence: ctx.voiceEmotion.confidence,
            arousal: ctx.voiceEmotion.arousal,
            valence: ctx.voiceEmotion.valence,
          },
          textEmotion: userData.lastEmotionAnalysis
            ? {
                primary: userData.lastEmotionAnalysis.primary,
                intensity: userData.lastEmotionAnalysis.intensity,
              }
            : undefined,
          timestamp: new Date(),
        };

        recordVoiceContext(voiceContext);

        // Calculate emotional weight for this turn's memories
        const emotionalWeight = calculateVoiceEmotionalWeight(voiceContext);
        if (emotionalWeight.voiceModifier !== 1.0) {
          diag.state('🎤 Voice-memory: Emotional weighting applied', {
            factors: emotionalWeight.factors,
            modifier: emotionalWeight.voiceModifier.toFixed(2),
          });
        }
      } catch {
        // Voice-memory integration is non-critical
      }
    }

    // ================================================================
    // ⚡ PREDICTIVE TOOL PRELOAD: Start preloading likely tools immediately
    // This runs in background so tools are ready when needed later.
    // Fire-and-forget - doesn't block turn processing.
    // ================================================================
    void (async () => {
      try {
        const { predictAndPreload } =
          await import('../shared/performance/predictive-tool-preload.js');
        predictAndPreload(userText);
      } catch {
        // Non-critical - tools will load normally if preload fails
      }
    })();

    // ================================================================
    // EARLY RECEIPT ACKNOWLEDGMENT: "Better than Human" instant presence
    // Fire an immediate brief acknowledgment (80-100ms) to show we heard.
    // This is BEFORE the thinking filler (500ms) - just shows presence.
    // UPDATED Jan 2026: Smarter conditions for human-like conversation
    // - Only on turns 2+ to avoid awkward double-greeting
    // - Only for longer messages (>20 chars) - short messages feel instant anyway
    // - Skip for direct questions (ending with ?) - those need immediate response
    // ================================================================
    const EARLY_RECEIPT_ENABLED = true;
    const EARLY_RECEIPT_DELAY_MS = 80; // Fire at 80ms after user stops (was 150ms)
    let spokeEarlyReceipt = false;

    // Smart conditions for early receipt
    const isLongEnoughMessage = userText.length > 20;
    const isNotQuestion = !userText.trim().endsWith('?');
    const shouldDoEarlyReceipt =
      EARLY_RECEIPT_ENABLED &&
      turnNumber >= 2 &&
      isLongEnoughMessage &&
      isNotQuestion &&
      currentSession;

    if (shouldDoEarlyReceipt) {
      setTimeout(() => {
        // Only speak if we haven't already started the full response
        if (!spokeEarlyReceipt && currentSession) {
          spokeEarlyReceipt = true;
          // Ultra-brief receipt sound - varied for naturalness
          const receiptSounds = [
            '<break time="30ms"/>Mm.<break time="30ms"/>',
            '<break time="30ms"/>Mhm.<break time="30ms"/>',
            '<break time="30ms"/>Yeah.<break time="30ms"/>',
          ];
          const receiptSound = receiptSounds[Math.floor(Math.random() * receiptSounds.length)];
          currentSession.say(receiptSound, { allowInterruptions: true });
          diag.filler('Spoke early receipt acknowledgment', {
            personaId: persona.id,
            elapsedMs: EARLY_RECEIPT_DELAY_MS,
            receiptSound: receiptSound.replace(/<[^>]+>/g, '').trim(),
          });
        }
      }, EARLY_RECEIPT_DELAY_MS);
    }

    // ================================================================
    // DEAD AIR FIX: Adaptive filler injection
    // Uses session-specific timing instead of static 4s timeout
    // ================================================================
    let spokeFiller = false;
    let fillerCheckInterval: ReturnType<typeof setInterval> | null = null;

    // Check periodically if we should inject a filler (more responsive than fixed timeout)
    fillerCheckInterval = setInterval(() => {
      const elapsed = Date.now() - turnStartTime;
      if (!spokeFiller && currentSession && shouldInjectFiller(services.sessionId, elapsed)) {
        spokeFiller = true;
        recordFillerInjection(services.sessionId);

        const filler = getContextAwareThinkingFiller(persona.id, {
          forDeadAirPrevention: true,
        });
        currentSession.say(filler, { allowInterruptions: true });
        diag.filler('Spoke adaptive thinking filler', {
          personaId: persona.id,
          filler,
          elapsedMs: elapsed,
          adaptiveTimeoutMs: adaptiveTimeouts.fillerTimeoutMs,
          strategy: adaptiveTimeouts.strategy,
        });

        // Stop checking after filler
        if (fillerCheckInterval) {
          clearInterval(fillerCheckInterval);
          fillerCheckInterval = null;
        }
      }
    }, 200); // Check every 200ms for responsive filler injection

    // ================================================================
    // 🧠 UNIFIED INTELLIGENCE: Get context, correlations, proactive insights
    // This runs in parallel with turn processing for minimal latency impact
    // ================================================================
    const intelligencePromise = services.userId
      ? getUnifiedIntelligence({
          userId: services.userId,
          sessionId: services.sessionId,
          turnNumber,
          transcript: userText,
          voiceEmotion: ctx.voiceEmotion
            ? { emotion: ctx.voiceEmotion.primary, confidence: ctx.voiceEmotion.confidence }
            : undefined,
          detectedTopics: [], // Will be populated from analysis
        }).catch((err) => {
          diag.debug('Unified intelligence failed (non-fatal)', { error: String(err) });
          return null;
        })
      : Promise.resolve(null);

    // ================================================================
    // 🧠 BETTER THAN HUMAN: Memory Retrieval (Phase 9)
    // Retrieve relevant memories to inject into the conversation
    // This runs in parallel with turn processing for minimal latency (<100ms target)
    // ================================================================
    const memoryRetrievalPromise = services.userId
      ? buildMemoryRetrievalContext({
          userText,
          analysis: {
            emotion: { primary: 'neutral', intensity: 0.5 }, // Will be updated after analysis
            intent: { primary: 'unknown' },
            topics: { detected: [] },
            state: {},
          },
          userData: { turnCount: turnNumber },
          services: {
            userId: services.userId,
            sessionId: services.sessionId,
          },
          persona: { identity: { id: persona.id } },
          userProfile: services.userProfile || undefined,
          surfacedMemoryIds: getSurfacedMemoryIds(services.sessionId),
        } as unknown as MemoryRetrievalBuilderInput).catch((err) => {
          diag.debug('Memory retrieval failed (non-fatal)', { error: String(err) });
          return null;
        })
      : Promise.resolve(null);

    // Process the turn with adaptive hard timeout
    const result = await Promise.race([
      processTurn(turnContext),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Turn processing hard timeout')),
          adaptiveTimeouts.hardTimeoutMs
        );
      }),
    ]).finally(() => {
      if (fillerCheckInterval) {
        clearInterval(fillerCheckInterval);
      }
      // Record turn latency for future adaptive calculations
      completeTurnProfile(services.sessionId, turnNumber);
    });

    // Get unified intelligence result (should be ready by now)
    const intelligence = await intelligencePromise;

    // Get memory retrieval result (should be ready by now)
    const memoryRetrievalResult = await memoryRetrievalPromise;

    // Mark memory retrieval complete for profiling
    markTurnCheckpoint(services.sessionId, turnNumber, 'memoryRetrievalComplete');

    // ================================================================
    // 🧠 BETTER THAN HUMAN: Inject retrieved memories into context
    // Memory injections are added with high priority so LLM can use them
    // ================================================================
    if (memoryRetrievalResult && memoryRetrievalResult.injections.length > 0) {
      for (const memoryInjection of memoryRetrievalResult.injections) {
        result.context.injections.push({
          category: memoryInjection.category || 'memory',
          content: memoryInjection.content,
          priority: 80, // High priority - memory is important context
        });
      }

      diag.state('🧠 Memory retrieval injected', {
        memoriesRetrieved: memoryRetrievalResult.memoryContext?.memories.length || 0,
        hasProactive: memoryRetrievalResult.memoryContext?.hasProactiveSuggestion || false,
        totalMs: memoryRetrievalResult.memoryContext?.metrics.totalTimeMs || 0,
      });

      // ================================================================
      // ⏳ BTH: TEMPORAL INSIGHT - Cross-session memory reference
      // Trigger avatar micro-expression when surfacing temporal memories
      // ================================================================
      const hasTemporalMemory = memoryRetrievalResult.injections.some(
        (inj) =>
          /remember|last (week|month|time)|ago|before|earlier/i.test(inj.content)
      );
      if (hasTemporalMemory) {
        const memoryContent = memoryRetrievalResult.injections[0]?.content || '';
        fireAndForget(async () => {
          await dispatchTemporalInsight(sendDataMessage, {
            memoryReference: memoryContent.slice(0, 100),
            intensity: 0.8,
          });
        }, 'bth-temporal-insight');
      }

      // ================================================================
      // 😄 BTH: INSIDE JOKE CALLBACK - Shared humor history detected
      // Trigger when memory retrieval surfaces humor, jokes, or fun moments
      // Enables avatar to show "insider" micro-expression (knowing smile)
      // ================================================================
      const hasSharedHumor = memoryRetrievalResult.injections.some(
        (inj) =>
          /joke|laugh|funny|hilarious|humor|lol|haha|inside joke|remember when.*laugh/i.test(
            inj.content
          )
      );
      if (hasSharedHumor) {
        const humorContent = memoryRetrievalResult.injections.find((inj) =>
          /joke|laugh|funny|hilarious|humor/i.test(inj.content)
        )?.content || '';
        fireAndForget(async () => {
          await dispatchInsideJokeCallback(sendDataMessage, {
            memoryReference: humorContent.slice(0, 100),
            intensity: 0.8,
          });
          await dispatchMicroExpression('insider', sendDataMessage, 0.75);
          diag.state('😄 BTH: Inside joke callback triggered', {
            memoryHint: humorContent.slice(0, 40),
          });
        }, 'bth-inside-joke');
      }
    }

    // ================================================================
    // PERFORMANCE: Mark analysis complete, trigger speculative TTS
    // ================================================================
    markTurnCheckpoint(services.sessionId, turnNumber, 'analysisComplete');

    // Fire-and-forget: Speculative TTS pre-generation based on emotion/intent
    // This pre-warms the TTS cache with likely response starters
    if (result.emotional || result.analysis?.analysis?.intent) {
      void speculateTTS(services.sessionId, persona.id, {
        emotion: result.emotional?.primary,
        intent: result.analysis?.analysis?.intent?.primary,
        topic: result.analysis?.currentTopic,
        distressLevel: result.emotional?.distressLevel,
      }).catch((e) => {
        diag.debug('Speculative TTS failed (non-critical)', { error: String(e) });
      });
    }

    // ================================================================
    // 🎭 "BETTER THAN HUMAN": Emotion Signal Dispatch
    // Sends emotional state to frontend for anticipation UI, concern detection,
    // micro-expressions, and Avatar Soul effects (pupil dilation, shimmer, etc.)
    // This is the CRITICAL bridge that enables the EQ system to work.
    // ================================================================
    if (result.emotional) {
      void dispatchEmotionEvents(
        {
          emotionalState: result.emotional,
          userId: services.userId || 'anonymous',
          personaId: persona.id,
          sessionId: services.sessionId,
        },
        sendDataMessage
      ).catch((e) => {
        diag.debug('Emotion dispatch failed (non-critical)', { error: String(e) });
      });

      // ================================================================
      // 🎭 LUXO EXPRESSIONS: Send specific expression update to frontend
      // Maps detected emotion to one of 100 Luxo-style avatar expressions.
      // This enables richer, more nuanced avatar reactions than basic moods.
      // ================================================================
      void dispatchExpressionUpdate(
        {
          emotion: result.emotional.primary || 'neutral',
          intensity: result.emotional.intensity ?? 0.5,
        },
        sendDataMessage
      ).catch((e) => {
        diag.debug('Expression dispatch failed (non-critical)', { error: String(e) });
      });

      // ================================================================
      // 🎉 BTH: SPONTANEOUS DELIGHT - User shares joy/achievement
      // Detect when user shares good news and trigger delight micro-expression
      // ================================================================
      if (detectUserDelight(userText)) {
        fireAndForget(async () => {
          await dispatchSpontaneousDelight(sendDataMessage, {
            trigger: 'user_achievement',
            intensity: result.emotional.intensity ?? 0.8,
          });
          diag.state('🎉 BTH: Spontaneous delight triggered', {
            userText: userText.slice(0, 50),
            emotionIntensity: result.emotional.intensity,
          });
        }, 'bth-spontaneous-delight');
      }

      // ================================================================
      // 💞 BTH: EMOTIONAL BOND DEEPEN - Gratitude or vulnerability shared
      // Detect when relationship is deepening through vulnerability/gratitude
      // ================================================================
      const isGratitude = /thank(s| you)|grateful|appreciate/i.test(userText);
      const isVulnerable =
        result.emotional.distressLevel > 0.4 ||
        /i('m| am) (scared|afraid|worried|nervous|anxious)/i.test(userText);
      if (isGratitude || isVulnerable) {
        fireAndForget(async () => {
          await dispatchEmotionalBondDeepen(sendDataMessage, {
            trigger: isGratitude ? 'gratitude_expressed' : 'vulnerability_shared',
            intensity: isVulnerable ? 0.85 : 0.7,
            relationshipContext: isGratitude ? 'gratitude' : 'vulnerability',
          });
          // Also trigger warmth micro-expression
          await dispatchMicroExpression('warmth_pulse', sendDataMessage, 0.75);
        }, 'bth-emotional-bond');
      }

      // ================================================================
      // 🤝 BTH: META-RELATIONSHIP MOMENT - User reflects on our relationship
      // Detect when user comments on their relationship with Ferni
      // e.g., "I appreciate how you listen", "Our conversations really help"
      // ================================================================
      if (detectMetaRelationship(userText)) {
        fireAndForget(async () => {
          await dispatchMetaRelationshipMoment(sendDataMessage, {
            relationshipContext: 'user_reflection',
            intensity: 0.85,
          });
          await dispatchMicroExpression('warmth_pulse', sendDataMessage, 0.8);
          diag.state('🤝 BTH: Meta-relationship moment triggered', {
            userText: userText.slice(0, 50),
          });
        }, 'bth-meta-relationship');
      }

      // ================================================================
      // 🤔 BTH: VISIBLE VULNERABILITY - Ferni shows appropriate uncertainty
      // Triggered when user asks philosophical/existential questions or
      // complex life decisions where showing uncertainty is authentic.
      // This humanizes Ferni by not being artificially confident.
      // ================================================================
      const isPhilosophical =
        /meaning of life|purpose|why (do we|are we)|what (is|does) it mean|should i|how do i decide|hard choice|difficult decision/i.test(
          userText
        );
      const askingAdvice =
        /what (should|would) (i|you)|advice|recommend|suggest|think i should/i.test(userText);
      if (isPhilosophical || (askingAdvice && result.emotional?.distressLevel > 0.3)) {
        fireAndForget(async () => {
          await dispatchVisibleVulnerability(sendDataMessage, {
            vulnerabilityType: isPhilosophical ? 'uncertainty' : 'admission',
            intensity: isPhilosophical ? 0.75 : 0.6,
          });
          diag.state('🤔 BTH: Visible vulnerability triggered', {
            type: isPhilosophical ? 'philosophical_question' : 'advice_seeking',
            userText: userText.slice(0, 50),
          });
        }, 'bth-visible-vulnerability');
      }
    }

    // ================================================================
    // 🧠 "BETTER THAN HUMAN": Holistic NLU Signal Dispatch
    // Sends holistic context (relationship, emotion, crisis) to frontend
    // for anticipatory avatar expressions BEFORE the LLM responds.
    // This enables the avatar to show warmth when family is mentioned,
    // concern when stress is detected, and crisis mode instantly.
    // ================================================================
    if (result.semanticRouting?.holisticContext) {
      void dispatchHolisticEvents(
        {
          holisticContext: result.semanticRouting.holisticContext,
          userId: services.userId || 'anonymous',
          personaId: persona.id,
          sessionId: services.sessionId,
        },
        sendDataMessage
      ).catch((e) => {
        diag.debug('Holistic dispatch failed (non-critical)', { error: String(e) });
      });
    }

    // ================================================================
    // 🎭 "BETTER THAN HUMAN": Voice Prosody → Concern Detection
    // This bridges voice prosody analysis with the concern detection engine,
    // enabling detection of distress signals that text alone would miss:
    // - Voice strain, tremor, pitch instability
    // - Speech rate changes, pause irregularity
    // - Energy level drops
    // ================================================================
    const { voiceEmotion } = userData as UserData;
    // ================================================================
    // "BETTER THAN HUMAN" - Anticipatory Distress Detection
    // This flag is set by audio-processor.ts when real-time prosody
    // analysis detects falling pitch + high energy variance DURING speech.
    // This enables us to respond with care BEFORE the user even finishes.
    // ================================================================
    const { anticipatedDistress } = userData as UserData & { anticipatedDistress?: boolean };

    if (voiceEmotion?.prosody || anticipatedDistress) {
      fireAndForget(async () => {
        const concernEngine = getConcernDetectionEngine(services.sessionId);
        const prosodySignals = voiceEmotion?.prosody
          ? mapProsodyToConcernSignals(voiceEmotion.prosody)
          : undefined;

        // Boost concern analysis if anticipatedDistress was triggered
        // This is the "reading the future" capability - we detected distress
        // from prosody BEFORE the full utterance completed
        const anticipatoryBoost = anticipatedDistress ? 0.2 : 0;

        // Analyze with prosody data (if available)
        const concernState = concernEngine.analyze(userText, {
          turnCount: turnNumber,
          userEmotion: result.emotional?.primary,
          prosody: prosodySignals,
          currentTopic: result.analysis?.currentTopic,
          // Add anticipatory boost as context (prosody signals will be weighted higher)
        });

        // Apply anticipatory boost to concern score
        const boostedScore = Math.min(1, concernState.score + anticipatoryBoost);
        // Elevate from 'none' or 'mild' to 'moderate' if anticipation detected distress
        const effectiveLevel =
          anticipatedDistress &&
          (concernState.level === 'none' || concernState.level === 'mild') &&
          boostedScore > 0.3
            ? 'moderate'
            : concernState.level;

        // If elevated concern detected (using effectiveLevel which factors in anticipation)
        if (effectiveLevel === 'elevated' || effectiveLevel === 'moderate') {
          // Build voice signals description
          const prosodySignalsList = concernState.activeSignals
            .filter((s) => s.source === 'prosody')
            .map((s) => s.indicator);
          const anticipatorySignal = anticipatedDistress ? 'anticipatory voice distress' : null;
          const allSignals = anticipatorySignal
            ? [anticipatorySignal, ...prosodySignalsList]
            : prosodySignalsList;

          result.context.injections.push({
            category: 'concern_detected',
            content: `[VOICE CONCERN SIGNALS DETECTED]
Concern level: ${effectiveLevel} (${(boostedScore * 100).toFixed(0)}%)${anticipatedDistress ? ' [ANTICIPATED DURING SPEECH]' : ''}
Primary concern type: ${concernState.primaryConcern || 'general distress'}
Recommended approach: ${concernState.recommendedApproach}

${concernState.responseGuidance}

Voice signals detected: ${allSignals.join(', ') || 'subtle vocal cues'}`,
            priority: anticipatedDistress ? 90 : 88, // Higher priority if anticipated
          });

          diag.state('🔊 Voice concern signals detected', {
            level: effectiveLevel,
            score: boostedScore.toFixed(2),
            primaryConcern: concernState.primaryConcern,
            approach: concernState.recommendedApproach,
            voiceSignals: prosodySignalsList.length,
            anticipatedDistress,
          });

          // ================================================================
          // 🛡️ BTH: PROTECTIVE INSTINCT - Voice-text mismatch detected
          // Trigger avatar micro-expression when sensing hidden distress
          // ================================================================
          void dispatchProtectiveInstinct(sendDataMessage, {
            mismatchType: concernState.primaryConcern || 'voice_distress',
            voiceEmotion: prosodySignalsList[0],
            intensity: boostedScore,
          });
          void dispatchMicroExpression('protective', sendDataMessage, 0.8);

          // ================================================================
          // 🧘 BTH: SOMATIC PRESENCE - Physical grounding when needed
          // Combine late night time context with detected distress to
          // offer embodied presence ("let's take a breath together")
          // ================================================================
          const somaticTimeContext = getTimeContext();
          if (somaticTimeContext === 'late_night' || boostedScore > 0.6) {
            void dispatchSomaticPresence(sendDataMessage, {
              somaticType: somaticTimeContext === 'late_night' ? 'breathing' : 'grounding',
              intensity: boostedScore,
            });
            void dispatchMicroExpression('steady_presence', sendDataMessage, 0.85);
            diag.state('🧘 BTH: Somatic presence triggered', {
              timeContext: somaticTimeContext,
              distressScore: boostedScore.toFixed(2),
            });
          }
        }
      }, 'concern-detection-with-prosody');

      // Reset anticipatedDistress after use (it's per-turn)
      if (anticipatedDistress) {
        (userData as UserData & { anticipatedDistress?: boolean }).anticipatedDistress = false;
      }
    }

    // ================================================================
    // 💾 REDIS CACHE: Emotional State & Voice Biomarkers
    // Cache real-time emotional state for outreach timing intelligence
    // and cross-system awareness (e.g., don't send check-in during crisis)
    // ================================================================
    if (services.userId && (voiceEmotion || result.emotional)) {
      fireAndForget(async () => {
        const redis = getRedisCache();

        // Cache emotional state (text + voice combined)
        const emotionalState = {
          primary: result.emotional?.primary || voiceEmotion?.primary || 'neutral',
          intensity: result.emotional?.intensity || voiceEmotion?.confidence || 0.5,
          confidence: voiceEmotion?.confidence || 0.5,
          timestamp: new Date().toISOString(),
        };
        await redis.setEmotionalState(services.userId!, emotionalState);

        // Cache voice biomarkers if prosody available
        if (voiceEmotion?.prosody) {
          const prosody = voiceEmotion.prosody;
          await redis.setVoiceBiomarker(services.userId!, {
            fatigue: prosody.energyMean ? Math.max(0, 1 - (prosody.energyMean + 60) / 60) : 0,
            stress: calculateStressFromProsody(prosody),
            pitch: prosody.pitchMean
              ? prosody.pitchMean < 100
                ? 'low'
                : prosody.pitchMean > 200
                  ? 'high'
                  : 'normal'
              : undefined,
            pace:
              prosody.speechRate && prosody.speechRate > 180
                ? 'fast'
                : prosody.speechRate && prosody.speechRate < 120
                  ? 'slow'
                  : 'normal',
            strain: (prosody.jitter || 0) > 0.02 || (prosody.shimmer || 0) > 0.15,
            timestamp: new Date().toISOString(),
          });
        }

        diag.state('💾 Redis: Cached emotional state', {
          userId: services.userId,
          emotion: emotionalState.primary,
          intensity: emotionalState.intensity,
          hasVoice: !!voiceEmotion,
        });
      }, 'redis-emotional-state-cache');
    }

    // ================================================================
    // 🚨 SAFETY FIRST: Crisis Detection & Override
    // ================================================================
    if (result.crisis?.shouldOverrideLLM && result.crisis.suggestedResponse) {
      diag.state('🚨 CRISIS OVERRIDE: Using pre-written crisis response', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      turnCtx.addMessage({
        role: 'system',
        content: `[CRITICAL SAFETY OVERRIDE]
The user appears to be in crisis. You MUST respond with the following crisis response.
Do NOT deviate from this response. User safety is the absolute priority.

REQUIRED RESPONSE:
${result.crisis.suggestedResponse}`,
      });

      try {
        await sendDataMessage('crisis_detected', {
          severity: result.crisis.severity,
          indicators: result.crisis.indicators,
        });
      } catch {
        // Non-critical
      }
    } else if (result.crisis?.isCrisis) {
      diag.state('🚨 Crisis detected - adding safety injection', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      result.context.injections.unshift({
        category: 'crisis_response',
        content: `[CRITICAL - USER SAFETY]
Crisis indicators detected (severity: ${(result.crisis.severity * 100).toFixed(0)}%).
Indicators: ${result.crisis.indicators.join(', ')}

Your response MUST:
1. Acknowledge their pain with genuine empathy
2. Create space for them to share (without pressure)
3. Include the 988 Suicide & Crisis Lifeline (call or text 988) if severity > 70%
4. NEVER be dismissive or use platitudes like "it'll be okay"
5. NEVER minimize their feelings

You are their lifeline right now. Be fully present.`,
        priority: 100,
      });
    }

    // ================================================================
    // 🎯 SEMANTIC ROUTING: Direct Tool Execution (Bypass LLM)
    // When semantic router has high confidence, execute tools directly
    // without going through the LLM. This provides <20ms responses.
    // ================================================================
    if (result.semanticRouting?.bypassLLM && result.semanticRouting.toolResult) {
      const { toolResult, metrics, routingPath } = result.semanticRouting;

      diag.state('🎯 SEMANTIC ROUTING: Bypassing LLM for direct tool response', {
        toolId: toolResult.toolId,
        confidence: metrics.confidence,
        matchPath: metrics.matchPath,
        latencyMs: metrics.latencyMs,
        cacheHit: metrics.cacheHit,
        routingPath,
      });

      // Record for observability (fire-and-forget)
      fireAndForget(async () => {
        const { recordRoutingPathEvent } =
          await import('../../tools/semantic-router/integration/routing-observability.js');
        recordRoutingPathEvent(
          services.sessionId,
          services.userId || 'anonymous',
          routingPath || 'semantic_auto_execute',
          toolResult.toolId,
          metrics.latencyMs
        );
      }, 'semantic-routing-observability');

      // Send data message about semantic routing (for frontend/analytics)
      try {
        await sendDataMessage('semantic_routing', {
          toolId: toolResult.toolId,
          confidence: metrics.confidence,
          bypassed_llm: true,
          routingPath,
        });
      } catch {
        // Non-critical
      }

      // Speak the tool result through the coordinator to prevent overlap
      if (currentSession && toolResult.speakableResponse) {
        const { coordinatedSay } = await import('../../speech/coordination/index.js');
        coordinatedSay(services.sessionId, toolResult.speakableResponse, {
          allowInterruptions: true,
        });
      }

      // Track tool usage (fire-and-forget)
      fireAndForget(async () => {
        const { recordToolUsage } = await import('../../tools/semantic-router/learning/index.js');
        recordToolUsage(services.userId || 'anonymous', toolResult.toolId);
      }, 'semantic-routing-tool-usage');

      // Early return - don't proceed to LLM
      return;
    }

    // ================================================================
    // 🌊 NATURALNESS ENGINE: Unified Voice Adaptation
    // Combines stress adaptation, voice patterns, ambient reactivity, and rapport
    // to make Ferni's voice feel naturally responsive to the user's state.
    // ================================================================
    let naturalnessResult: NaturalnessResult | null = null;
    try {
      // Ensure engine exists for this session
      getNaturalnessEngine(services.sessionId, services.userId || 'anonymous');

      // Build naturalness input from turn data
      const naturalnessInput = buildNaturalnessInput({
        sessionId: services.sessionId,
        userId: services.userId || 'anonymous',
        turnNumber,
        userText,
        voiceEmotion: voiceEmotion as {
          primary?: string;
          confidence?: number;
          prosody?: ProsodyFeatures;
        },
        emotionalResult: result.emotional,
        userData: {
          speechRateWPM: userData.speechRateWPM,
          pauseBeforeMs: userData.pauseBeforeMs,
        },
        userAskedQuestion:
          result.analysis?.analysis?.intent?.primary === 'asking_question' ||
          result.analysis?.analysis?.intent?.primary === 'seeking_clarification',
      });

      // Process through unified naturalness engine
      naturalnessResult = processNaturalnessTurn(services.sessionId, naturalnessInput);

      // Add context injections from naturalness systems
      if (naturalnessResult.contextInjections.length > 0) {
        for (const injection of naturalnessResult.contextInjections) {
          if (injection.shouldInject) {
            result.context.injections.push({
              category: 'naturalness',
              content: `[VOICE NATURALNESS - ${injection.source.toUpperCase()}]\n${injection.context}`,
              priority: 70 + injection.priority, // Base priority 70, boosted by injection priority
            });
          }
        }
      }

      // Send TTS adjustments to frontend for avatar/voice sync
      if (naturalnessResult.activeSystems.length > 0) {
        void sendDataMessage('naturalness_adjustments', {
          speedMultiplier: naturalnessResult.ttsAdjustments.speedMultiplier,
          volumeBoost: naturalnessResult.ttsAdjustments.volumeBoost,
          warmthLevel: naturalnessResult.ttsAdjustments.warmthLevel,
          clarityMode: naturalnessResult.ttsAdjustments.clarityMode,
          rapportLevel: naturalnessResult.rapportLevel,
          rapportScore: naturalnessResult.rapportScore,
          isNoisy: naturalnessResult.isNoisy,
          activeSystems: naturalnessResult.activeSystems,
          reasons: naturalnessResult.ttsAdjustments.reasons,
        }).catch((e) => {
          diag.debug('Naturalness adjustments send failed (non-critical)', { error: String(e) });
        });

        diag.state('🌊 Naturalness adjustments applied', {
          activeSystems: naturalnessResult.activeSystems,
          speedMultiplier: naturalnessResult.ttsAdjustments.speedMultiplier.toFixed(2),
          rapportLevel: naturalnessResult.rapportLevel,
          reasons: naturalnessResult.ttsAdjustments.reasons,
        });
      }

      // Handle verbal acknowledgment (e.g., "I notice it's a bit noisy there...")
      if (naturalnessResult.acknowledgment && currentSession) {
        // Speak acknowledgment before main response
        const { coordinatedSay } = await import('../../speech/coordination/index.js');
        coordinatedSay(services.sessionId, naturalnessResult.acknowledgment.phrase, {
          allowInterruptions: true,
        });

        diag.info('🌊 Naturalness acknowledgment spoken', {
          phrase: naturalnessResult.acknowledgment.phrase,
          source: naturalnessResult.acknowledgment.source,
        });
      }
    } catch (naturalnessError) {
      // Non-critical - continue without naturalness adjustments
      diag.debug('Naturalness engine error (non-critical)', { error: String(naturalnessError) });
    }

    // ================================================================
    // PERFORMANCE: Mark context building start
    // Context building includes: feedback, trust, personality, extensibility
    // ================================================================
    markTurnCheckpoint(services.sessionId, turnNumber, 'contextBuildStart');

    // ================================================================
    // 📊 CONTEXTUAL FEEDBACK INJECTION
    // Inject recent feedback context so agent can naturally adjust its style
    // ================================================================
    try {
      const { buildFeedbackContext } = await import(
        '../../intelligence/context-builders/feedback-context.js'
      );

      const feedbackContext = await buildFeedbackContext(
        services.userId || '',
        services.sessionId
      );

      if (feedbackContext.context && feedbackContext.summary.needsAdjustment) {
        result.context.injections.push({
          category: 'feedback',
          content: feedbackContext.context,
          priority: 55, // After core context (40-50), before personality (60+)
        });

        diag.state('📊 Feedback context injected', {
          lastReaction: feedbackContext.summary.lastReaction,
          adjustmentType: feedbackContext.summary.adjustmentType,
          recentCount: feedbackContext.summary.recentCount,
        });
      }
    } catch (feedbackError) {
      // Non-critical - continue without feedback context
      diag.debug('Feedback context error (non-critical)', { error: String(feedbackError) });
    }

    // ================================================================
    // 🤝 TRUST CONTEXT MONITORING
    // Track trust signals for monitoring, learning, and frontend events
    // NOTE: Post-response validation is architecturally difficult with streaming.
    // Instead, we emit events and log for monitoring/improvement.
    // ================================================================
    if (result.trustContext) {
      const { hasEmotionalMismatch, topicsToAvoid, hasGrowthReflection, hasCelebration } =
        result.trustContext;

      // Log for monitoring and ML training data
      if (hasEmotionalMismatch || hasGrowthReflection || hasCelebration) {
        diag.info('🤝 Trust signals detected', {
          hasEmotionalMismatch,
          hasGrowthReflection,
          hasCelebration,
          topicsToAvoidCount: topicsToAvoid.length,
        });
      }

      // Emit trust signals to frontend for avatar/UI adaptation
      // Frontend can use these to adjust avatar expressions, show subtle cues, etc.
      if (hasEmotionalMismatch) {
        void sendDataMessage('trust_signal', {
          type: 'emotional_mismatch_detected',
          // Frontend should show extra attentive/concerned expression
          avatarHint: 'attentive',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'emotional_mismatch',
          });
        });
      }

      if (hasGrowthReflection) {
        void sendDataMessage('trust_signal', {
          type: 'growth_reflection_available',
          // Frontend might show a subtle "remembering" indicator
          avatarHint: 'thoughtful',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'growth_reflection',
          });
        });
      }

      if (hasCelebration) {
        void sendDataMessage('trust_signal', {
          type: 'celebration_opportunity',
          // Frontend can prepare celebration animation
          avatarHint: 'joyful',
        }).catch((e) => {
          diag.debug('Trust signal send failed (non-critical)', {
            error: String(e),
            type: 'celebration',
          });
        });
      }

      // 💭 PROACTIVE OUTREACH - "Thinking of You" notifications
      // Send to frontend to show proactive outreach UI notification
      const { hasProactiveOutreach, proactiveOutreach } = result.trustContext;
      if (hasProactiveOutreach && proactiveOutreach) {
        void sendDataMessage('proactive_outreach', {
          id: `outreach-${Date.now()}`,
          type: proactiveOutreach.type,
          message: proactiveOutreach.message,
          personaId: persona.id,
          personaName: persona.name,
          context: proactiveOutreach.context,
          priority: 'medium',
        }).catch((e) => {
          diag.debug('Proactive outreach send failed (non-critical)', {
            error: String(e),
          });
        });

        diag.info('💭 Proactive outreach sent to frontend', {
          type: proactiveOutreach.type,
          personaId: persona.id,
        });
      }

      // Store in userData for potential use in response quality tracking
      (userData as Record<string, unknown>).lastTrustContext = result.trustContext;
    }

    // ================================================================
    // 🎭 PERSONALITY SYSTEM INTEGRATION (START EARLY - NON-BLOCKING)
    // Start personality processing immediately, await later before inject.
    // This saves ~20-50ms by running in parallel with session state updates.
    // ================================================================
    const personalityCtx: PersonalityContext = {
      sessionId: services.sessionId,
      userId: services.userId ?? null,
      personaId: persona.id,
      turnCount: userData.turnCount || 1,
      userText,
      userData,
      voiceEmotion: ctx.voiceEmotion,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as PersonalityContext['humanizingResult'],
      analysisResult: result.analysis?.analysis,
      injections: result.context.injections,
      sessionStateManager,
    };

    // START personality processing (don't await yet)
    const personalityPromise = processPersonality(personalityCtx);

    // ================================================================
    // UPDATE SESSION STATE MANAGER (runs in parallel with personality)
    // These are fast sync operations that don't depend on personality result
    // ================================================================
    if (sessionStateManager) {
      sessionStateManager.incrementTurn();
      sessionStateManager.setLastUserMessage(userText);

      if (result.emotional) {
        sessionStateManager.setEmotionAnalysis({
          primary: result.emotional.primary,
          intensity: result.emotional.intensity,
          distressLevel: result.emotional.distressLevel,
        });

        // Propagate emotion to userData for cache-aware TTS lookup
        // This enables emotion-keyed TTS caching in tts-wrapper.ts
        (userData as Record<string, unknown>).currentEmotion = result.emotional.primary;
      }

      if (result.analysis?.currentTopic) {
        sessionStateManager.setTopic(result.analysis.currentTopic);
      }

      const hrRelationship = result.context.humanizingResult?.relationship as
        | { stage?: string }
        | undefined;
      if (hrRelationship?.stage) {
        sessionStateManager.setRelationshipStage(
          hrRelationship.stage as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
        );
      }

      const hrMood = result.context.humanizingResult?.mood as { state?: string } | undefined;
      if (hrMood?.state) {
        type MoodState =
          | 'energized'
          | 'reflective'
          | 'playful'
          | 'grounded'
          | 'tired_but_present'
          | 'philosophical'
          | 'nostalgic';
        sessionStateManager.setMood(hrMood.state as MoodState);
      }

      const themeMentions = result.context.injections
        ?.filter((i) => i.category === 'memory' || i.category === 'continuity')
        .map((i) => i.content)
        .join(' ');
      if (themeMentions) {
        sessionStateManager.recordThemesMentioned(themeMentions);
      }
    }

    // ================================================================
    // AWAIT PERSONALITY RESULT (needed before context injection)
    // ================================================================
    const personalityResult = await personalityPromise;

    if (personalityResult.shouldInject && personalityResult.injectionContent) {
      result.context.injections.push({
        category: 'personality',
        content: personalityResult.injectionContent,
        priority: 75,
      });
    }

    // Handle behavior event from personality system
    if (personalityResult.behaviorEvent) {
      const behaviorEventContent = JSON.stringify({
        event: personalityResult.behaviorEvent.event,
        data: personalityResult.behaviorEvent.data,
        suggestedResponse: personalityResult.behaviorEvent.suggestedResponse,
        source: 'personality_noticing',
      });

      turnCtx.addMessage({
        role: 'system',
        content:
          `[INTERNAL GUIDANCE - DO NOT SPEAK THIS]\nBehavior event detected:\n${behaviorEventContent}\n\n` +
          `You may call behavior functions in response to this event.`,
      });
    }

    // ================================================================
    // PERFORMANCE: Mark context building complete
    // ================================================================
    // Note: Live superhuman injections are handled by the turn-processor pipeline
    // via src/agents/processors/live-superhuman-injections.ts which runs in Tier 2
    markTurnCheckpoint(services.sessionId, turnNumber, 'contextBuildComplete');

    // ================================================================
    // 🧠 UNIFIED INTELLIGENCE: Inject proactive insight if ready
    // Supports session_start (turn 1), natural_pause, and topic_relevant moments
    // ================================================================
    if (intelligence?.insightToSurface && services.userId) {
      // Determine if this is an appropriate moment to surface
      const isSessionStart = turnNumber === 1;
      const isNaturalPause = turnNumber > 1 && turnNumber % 3 === 0; // Every 3rd turn as natural pause
      const shouldSurface =
        isSessionStart ||
        (isNaturalPause && intelligence.insightToSurface.category !== 'late_night_support');

      if (shouldSurface) {
        turnCtx.addMessage({
          role: 'system',
          content: `[PROACTIVE INSIGHT - Consider sharing naturally]\n${intelligence.insightToSurface.message}${intelligence.insightToSurface.followUp ? `\nFollow-up: ${intelligence.insightToSurface.followUp}` : ''}`,
        });
        markProactiveInsightSurfaced(services.userId, intelligence.insightToSurface.id);
        diag.session('💡 Proactive insight injected', {
          category: intelligence.insightToSurface.category,
          moment: isSessionStart ? 'session_start' : 'natural_pause',
          turnNumber,
          userId: services.userId,
        });
      }
    }

    // ================================================================
    // 🧠 UNIFIED INTELLIGENCE: Inject cross-domain correlations
    // Surfaces patterns that humans wouldn't notice (e.g., sleep → mood)
    // ================================================================
    if (intelligence?.correlations?.length && services.userId) {
      const highConfidenceCorrelations = intelligence.correlations.filter(
        (c) => c.confidence === 'confirmed' || c.confidence === 'likely'
      );
      if (highConfidenceCorrelations.length > 0) {
        const correlationContext = highConfidenceCorrelations
          .slice(0, 2)
          .map((c) => `• ${c.insight}${c.suggestion ? ` (Consider: ${c.suggestion})` : ''}`)
          .join('\n');
        turnCtx.addMessage({
          role: 'system',
          content: `[CROSS-DOMAIN PATTERNS - Better Than Human insights]\nYou notice patterns they can't see. Surface these gently with "I've noticed...":\n${correlationContext}`,
        });
        diag.session('🔗 Cross-domain correlations injected', {
          count: highConfidenceCorrelations.length,
          userId: services.userId,
        });

        // ================================================================
        // 🔮 BTH: SUPERHUMAN OBSERVATION - Pattern surfacing
        // Trigger avatar micro-expression when surfacing cross-session patterns
        // ================================================================
        const topCorrelation = highConfidenceCorrelations[0];
        fireAndForget(async () => {
          await dispatchSuperhumanObservation(sendDataMessage, {
            observationType: 'correlation',
            observationContent: topCorrelation.insight,
            intensity: topCorrelation.confidence === 'confirmed' ? 0.9 : 0.75,
          });
        }, 'bth-superhuman-observation');
      }
    }

    // Inject context into LLM
    injectTurnContext(turnCtx, result);

    // Mark LLM start (LLM inference happens after this point)
    markTurnCheckpoint(services.sessionId, turnNumber, 'llmStart');

    // ================================================================
    // EXTENSIBILITY HOOKS
    // ================================================================
    try {
      const { onBeforeResponse } =
        await import('../../personas/bundles/extensibility-integration.js');
      const beforeResponsePrompt = await onBeforeResponse({
        personaId: persona.id,
        userId: services.userId,
        sessionId: services.sessionId,
      });

      if (beforeResponsePrompt) {
        turnCtx.addMessage({
          role: 'system',
          content: `[INTERNAL GUIDANCE - DO NOT SPEAK THIS]\n${beforeResponsePrompt}`,
        });
      }

      if (userData.extensibilitySessionPrompt && (userData.turnCount ?? 0) <= 1) {
        turnCtx.addMessage({
          role: 'system',
          content: `[INTERNAL CONTEXT - DO NOT SPEAK THIS]\n${userData.extensibilitySessionPrompt}`,
        });
      }

      // ================================================================
      // PRE-SESSION BRIEFING (Turn 0 only)
      // Contains temporal awareness, cultural context, returning user context
      // ================================================================
      if (userData.preSessionBriefing && (userData.turnCount ?? 0) === 0) {
        logger.info(
          { briefingLength: userData.preSessionBriefing.length },
          '📋 Pre-session briefing injected into turn 0 context'
        );
        turnCtx.addMessage({
          role: 'system',
          content: `[INTERNAL BRIEFING - DO NOT SPEAK THIS]\n${userData.preSessionBriefing}`,
        });
      }

      // ================================================================
      // GREETING AWARENESS (Turn 0 only)
      // CRITICAL: The LLM needs to know what greeting was already spoken
      // Without this, Ferni will re-introduce herself or repeat the greeting
      // ================================================================
      if (userData.greetingText && !userData.greetingInjected && (userData.turnCount ?? 0) === 0) {
        // Strip SSML tags for cleaner context (LLM doesn't need to see <break> tags)
        const cleanGreeting = userData.greetingText
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        logger.info(
          { greetingPreview: cleanGreeting.slice(0, 50) },
          '🎤 Greeting context injected - LLM now knows what it said'
        );

        // FIX: Add greeting as actual assistant message in chat history
        // This ensures the LLM sees it as its own prior turn, not just a hint
        // The message is prefixed with [ALREADY_SPOKEN] which the TTS sanitizer will filter
        turnCtx.addMessage({
          role: 'assistant',
          content: `[ALREADY_SPOKEN] ${cleanGreeting}`,
        });

        // Also add explicit guidance to NOT repeat the greeting
        turnCtx.addMessage({
          role: 'system',
          content: `[CRITICAL] You already spoke the greeting above. Do NOT:
- Say hello again
- Re-introduce yourself
- Repeat any part of your opening
Just respond naturally to what the user said.`,
        });

        // Mark as injected so we don't repeat on subsequent turns
        userData.greetingInjected = true;
      }

      // ================================================================
      // BETTER THAN HUMAN: Calendar Awareness (injected if available)
      // This is fetched async at session start - may arrive after first turn
      // ================================================================
      if (userData.calendarAwareness && (userData.turnCount ?? 0) <= 1) {
        logger.info(
          { turnCount: userData.turnCount ?? 0, calendarAwareness: userData.calendarAwareness },
          '📅 BETTER THAN HUMAN - Calendar awareness injected into turn context'
        );
        turnCtx.addMessage({
          role: 'system',
          content: `[CALENDAR AWARENESS - DO NOT ANNOUNCE THIS]\n${userData.calendarAwareness}\n\nUse this naturally - mention upcoming meetings or just-ended meetings if relevant to the conversation.`,
        });
      } else if ((userData.turnCount ?? 0) === 0) {
        logger.debug(
          '📅 No calendar awareness available for turn 0 (calendar not connected or still loading)'
        );
      }

      // ================================================================
      // BETTER THAN HUMAN: Real-time Ambient Calendar Check
      // On every turn, check if there's an urgent calendar event
      // (meeting in next 10 minutes, just ended, etc.)
      // ================================================================
      try {
        if (services.userId) {
          const { getAmbientCalendarContext, shouldInterruptForCalendar, generateAmbientContextInjection } = 
            await import('../../services/calendar/ambient-calendar-awareness.js');
          
          const ambientContext = await getAmbientCalendarContext(services.userId);
          
          if (shouldInterruptForCalendar(ambientContext)) {
            const urgentContextText = generateAmbientContextInjection(ambientContext);
            if (urgentContextText) {
              logger.info(
                { userId: services.userId, turnCount: userData.turnCount ?? 0 },
                '📅 URGENT: Calendar interrupt injected (meeting very soon)'
              );
              turnCtx.addMessage({
                role: 'system',
                content: `[URGENT CALENDAR CONTEXT - MENTION THIS NATURALLY]\n${urgentContextText}\n\nNaturally acknowledge this in your response. For example: "By the way, looks like you have [meeting] coming up in a few minutes - should we wrap up?"`,
              });
            }
          }
        }
      } catch (calendarErr) {
        logger.debug({ error: String(calendarErr) }, '📅 Calendar ambient check failed (non-fatal)');
      }
    } catch (extHookErr) {
      logger.warn({ error: String(extHookErr) }, 'Extensibility hook failed (non-fatal)');
    }

    // ================================================================
    // PHONE COLLECTION (Human-First 2FA)
    // ================================================================
    try {
      const { getResponseModification } =
        await import('../../services/trust-and-identity/voice-agent-integration.js');
      const phoneAskMod = getResponseModification(services.sessionId);

      if (phoneAskMod.injectPhoneAsk && phoneAskMod.script) {
        turnCtx.addMessage({
          role: 'system',
          content: `[INTERNAL GUIDANCE - DO NOT SPEAK THIS]
This is a perfect emotional moment to naturally ask for their phone number.
Moment type: ${phoneAskMod.momentType}
Emotional tone: ${phoneAskMod.tone}

SUGGESTED ASK (incorporate naturally): "${phoneAskMod.script}"

IMPORTANT:
- Frame this as wanting to follow up/check in, NOT data collection
- Make it feel like YOU want to stay connected, not that you NEED their info
- If they decline, accept gracefully and move on
- Don't repeat if already asked this session`,
        });
      }
    } catch {
      // Non-critical
    }

    // ================================================================
    // EVENT DISPATCH (Celebration, Mood, Emotion, Behavior)
    // ================================================================
    const celebrations = getCelebrationEvents(result);
    if (celebrations.length > 0) {
      await sendCelebrationEvents({ injections: celebrations, room });
    }

    const eventCtx: EventDispatchContext = {
      userId: services.userId ?? null,
      personaId: persona.id,
      sessionId: services.sessionId,
      turnCount: userData.turnCount ?? 0,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as EventDispatchContext['humanizingResult'],
      injections: result.context.injections,
      sessionStateManager,
      sendDataMessage,
      turnCtx,
    };

    await dispatchAllTurnEvents(eventCtx);

    // ================================================================
    // LEARNING & TRUST RECORDING
    // ================================================================
    const learningCtx: LearningContext = {
      userId: services.userId ?? null,
      sessionId: services.sessionId,
      personaId: persona.id,
      turnCount: userData.turnCount ?? 0,
      userText,
      emotionalResult: result.emotional,
      humanizingResult: result.context.humanizingResult as LearningContext['humanizingResult'],
      injections: result.context.injections,
      turnResult: {
        emotional: result.emotional,
        context: {
          humanizingResult: result.context.humanizingResult,
        },
      },
    };

    await recordAllLearningData(learningCtx);

    // ================================================================
    // "BETTER THAN HUMAN V3" - SEMANTIC INTELLIGENCE
    // Feed all 6 semantic intelligence systems with turn data
    // ================================================================
    if (services.userId) {
      // voiceEmotion is at the TurnHandlerContext level, not in userData
      const voiceEmotionResult = ctx.voiceEmotion;
      // V3.1: Use enhanced person extraction for better NER-like detection
      const mentionedPerson = getPrimaryPersonName(userText);

      const semanticData: TurnSemanticData = {
        userId: services.userId,
        sessionId: services.sessionId,
        personaId: persona.id,
        turnNumber,
        userText,
        topic: result.analysis.currentTopic,
        topics: result.analysis.analysis.topics?.detected,
        textEmotion: result.emotional.primary,
        textEmotionIntensity: result.emotional.intensity,
        voiceEmotion: voiceEmotionResult?.primary,
        voiceEmotionConfidence: voiceEmotionResult?.confidence,
        voiceEmotionIntensity: voiceEmotionResult?.confidence,
        speechRate: userData.speechRateWPM,
        timestamp: new Date(),
        dayOfWeek: new Date().getDay(),
        hourOfDay: new Date().getHours(),
        turnsSinceStart: turnNumber,
        sessionCount: services.userProfile?.totalConversations,
        relationshipStage: services.userProfile?.relationshipStage,
        mentionedPerson, // V3.1: Enhanced person extraction
      };

      // Fire-and-forget to not block turn completion
      fireAndForget(async () => processSemanticIntelligence(semanticData), 'semantic-intelligence');

      // NEW: Unified intelligence turn learning (cross-domain correlation & pattern detection)
      if (services.userId) {
        processTurnLearning({
          userId: services.userId,
          sessionId: services.sessionId,
          turnNumber,
          transcript: userText,
          emotion: result.emotional.primary,
          topics: result.analysis.analysis.topics?.detected || [],
          reactionToInsight: intelligence?.insightToSurface ? 'acknowledged' : undefined,
        });
      }

      // ================================================================
      // DYNAMIC MEMORY CAPTURE: LLM-powered extraction with temporal decoupling
      // Fast capture (< 50ms) runs inline, deep extraction runs async in background
      // Fire-and-forget to not block turn completion
      // ================================================================
      if (services.userId) {
        const captureUserId = services.userId; // Capture for closure
        // 🧠 MEMORY AUDIT: Log that we're starting memory capture
        diag.info('🧠 [MEMORY-AUDIT] turn-handler triggering memory capture', {
          userId: captureUserId,
          sessionId: services.sessionId,
          turnNumber,
          transcriptLen: userText.length,
        });
        
        fireAndForget(
          async () => {
            const captureResult = await fastCapture({
              userId: captureUserId,
              sessionId: services.sessionId,
              turnNumber,
              transcript: userText,
              voiceEmotion: result.analysis.analysis.emotion?.primary,
              personaId: persona.id, // For multi-persona data attribution
            });

            // 🧠 CRITICAL: Record to STM buffer for session context
            // This enables wasEntityMentioned(), buildSTMContext(), and session-end promotion
            const { recordTurn } = await import('../../memory/dynamic/index.js');
            recordTurn(services.sessionId, captureUserId, captureResult, userText, turnNumber);

            // 🧠 MEMORY AUDIT: Log capture results (upgraded to info level)
            diag.info('🧠 [MEMORY-AUDIT] turn-handler memory capture DONE', {
              userId: captureUserId,
              sessionId: services.sessionId,
              turnNumber,
              entityCount: captureResult.mentionedEntities.length,
              topicCount: captureResult.topicHints.length,
              emotionCount: captureResult.emotionSignals.length,
              asyncJobId: captureResult.asyncJobId,
              captureTimeMs: captureResult.captureTimeMs,
            });
          },
          'dynamic-memory-capture'
        );
      } else {
        diag.warn('🧠 [MEMORY-AUDIT] turn-handler SKIPPING memory capture - no userId');
      }
    }

    // ================================================================
    // PERFORMANCE: Complete turn profiling
    // ================================================================
    const turnMetrics = completeTurnProfiling(services.sessionId, turnNumber);
    if (turnMetrics && (turnMetrics.tier === 'slow' || turnMetrics.tier === 'critical')) {
      diag.warn('Turn latency above threshold', {
        totalMs: turnMetrics.latencies.totalTurnMs,
        bottleneck: turnMetrics.bottleneck.component,
        tier: turnMetrics.tier,
      });
    }

    logger.info(
      {
        elapsedMs: result.context.elapsedMs,
        contextCount: result.context.injections.length,
        emotion: result.emotional.primary,
        turnMetrics: turnMetrics
          ? {
              totalMs: turnMetrics.latencies.totalTurnMs,
              ttfa: turnMetrics.latencies.timeToFirstAudioMs,
              tier: turnMetrics.tier,
            }
          : undefined,
      },
      'Turn processed successfully'
    );
  } catch (error) {
    logger.error({ error: String(error) }, 'Turn processing failed');

    // ================================================================
    // DEAD AIR FIX: Graceful error recovery
    // ================================================================
    const isTimeout = String(error).includes('timeout');
    const errorType = isTimeout ? 'api_timeout' : 'general';
    const gracefulError = getGracefulErrorResponse(errorType, String(error));

    if (currentSession) {
      try {
        currentSession.say(gracefulError.userMessage, { allowInterruptions: true });
        diag.state('Spoke graceful error recovery', {
          errorType,
          recoverable: gracefulError.recoverable,
        });
      } catch (sayError) {
        logger.error({ error: String(sayError) }, 'Failed to speak error recovery');
      }
    }
  }
}

export default handleUserTurn;
