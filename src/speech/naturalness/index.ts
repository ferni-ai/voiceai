/**
 * Unified Naturalness Engine
 *
 * Orchestrates all voice naturalness systems into a single coherent interface:
 * - Stress Auto-Adaptation: Detect user stress, modulate TTS calmingly
 * - Voice Pattern Learning: Remember preferences across sessions
 * - Ambient Sound Reactivity: Adapt to noisy environments
 * - Rapport Scoring: Track conversational health, trigger repairs
 *
 * Key principle: Multiple systems contribute adjustments, but the user
 * experiences ONE coherent, natural voice adaptation - not four.
 *
 * @module naturalness
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getStressAdaptationEngine,
  resetStressAdaptationEngine,
  recordStressReading,
  calculateStressAdaptation,
  type StressReading,
} from '../adaptive-ssml/stress-adaptation.js';
import {
  getVoicePatternEngine,
  resetVoicePatternEngine,
  recordVoiceObservation,
  getRecommendedAgentWpm,
  getRecommendedTurnGap,
  initializeVoicePatterns,
  persistVoicePatterns,
  type VoiceObservation,
} from '../../conversation/humanization/voice-pattern-learning.js';
import {
  getAmbientAwarenessService,
  resetAmbientAwareness,
  type AmbientAnalysisResult,
} from '../ambient-awareness.js';
import {
  getRapportScorer,
  resetRapportScorer,
} from '../../conversation/rapport/rapport-scorer.js';
import type { TurnObservation } from '../../conversation/rapport/types.js';
import {
  combineAdjustments,
  mergeContextInjections,
  type SourceAdjustments,
} from './combine-adjustments.js';
import type {
  AudioSignalInput,
  TurnContextInput,
  AmbientAudioInput,
  NaturalnessResult,
  NaturalnessEngineState,
  ContextInjection,
  VerbalAcknowledgment,
} from './types.js';

const log = createLogger({ module: 'NaturalnessEngine' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Full input for a turn observation
 */
export interface TurnInput {
  /** Audio signals (stress, breath, tremor) */
  audio?: AudioSignalInput;

  /** Turn context (word counts, emotions, interruptions) */
  context: TurnContextInput;

  /** Ambient audio analysis (if available) */
  ambient?: AmbientAudioInput;
}

// ============================================================================
// SESSION-SCOPED ENGINES
// ============================================================================

interface NaturalnessEngineInstance {
  sessionId: string;
  userId: string;
  turnsProcessed: number;
  sessionStartedAt: number;
  lastResult: NaturalnessResult | null;
  initialized: boolean;
}

const engines = new Map<string, NaturalnessEngineInstance>();

/**
 * Get or create naturalness engine for a session
 */
export function getNaturalnessEngine(
  sessionId: string,
  userId: string
): NaturalnessEngineInstance {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, {
      sessionId,
      userId,
      turnsProcessed: 0,
      sessionStartedAt: Date.now(),
      lastResult: null,
      initialized: false,
    });
    log.debug({ sessionId, userId }, '🌊 NaturalnessEngine created');
  }
  return engines.get(sessionId)!;
}

/**
 * Reset naturalness engine and all subsystems
 */
export function resetNaturalnessEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    log.debug(
      { sessionId, turnsProcessed: engine.turnsProcessed },
      '🌊 Resetting NaturalnessEngine'
    );
  }

  // Reset all subsystems
  resetStressAdaptationEngine(sessionId);
  resetVoicePatternEngine(sessionId);
  resetAmbientAwareness(sessionId);
  resetRapportScorer(sessionId);

  engines.delete(sessionId);
}

/**
 * Get count of active engines
 */
export function getActiveNaturalnessEngineCount(): number {
  return engines.size;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize naturalness engine at session start
 * Loads persisted voice patterns from Firestore
 */
export async function initializeNaturalnessEngine(
  sessionId: string,
  userId: string
): Promise<NaturalnessEngineInstance> {
  const engine = getNaturalnessEngine(sessionId, userId);

  if (engine.initialized) {
    return engine;
  }

  try {
    // Load voice patterns from persistence
    await initializeVoicePatterns(sessionId, userId);

    // Initialize other subsystems (they self-initialize on first access)
    getStressAdaptationEngine(sessionId);
    getAmbientAwarenessService(sessionId);
    getRapportScorer(sessionId);

    engine.initialized = true;
    log.info({ sessionId, userId }, '🌊 NaturalnessEngine initialized');
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'NaturalnessEngine init warning');
    engine.initialized = true; // Continue anyway
  }

  return engine;
}

/**
 * Persist session data at session end
 */
export async function persistNaturalnessData(sessionId: string): Promise<void> {
  try {
    await persistVoicePatterns(sessionId);
    log.debug({ sessionId }, '💾 Voice patterns persisted');
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'Failed to persist voice patterns');
  }
}

// ============================================================================
// TURN PROCESSING
// ============================================================================

/**
 * Process a complete turn and get naturalness adjustments
 *
 * Call this after each user turn to:
 * 1. Record observations to all subsystems
 * 2. Get combined TTS adjustments
 * 3. Get context injections for LLM
 * 4. Get verbal acknowledgments if needed
 */
export function processTurn(
  sessionId: string,
  input: TurnInput
): NaturalnessResult {
  const engine = engines.get(sessionId);
  if (!engine) {
    log.warn({ sessionId }, 'NaturalnessEngine not found, returning defaults');
    return createDefaultResult();
  }

  engine.turnsProcessed++;
  const sources: SourceAdjustments[] = [];
  const contextInjections: ContextInjection[] = [];
  let acknowledgment: VerbalAcknowledgment | null = null;
  const activeSystems: ('stress' | 'patterns' | 'ambient' | 'rapport')[] = [];

  // -------------------------------------------------------------------------
  // 1. STRESS ADAPTATION
  // -------------------------------------------------------------------------
  if (input.audio) {
    const stressReading = buildStressReading(input.audio);
    recordStressReading(sessionId, stressReading);
    const stressAdaptation = calculateStressAdaptation(sessionId);

    if (stressAdaptation.adaptationLevel > 0.1) {
      activeSystems.push('stress');
      sources.push({
        source: 'stress',
        speedMultiplier: stressAdaptation.speedMultiplier,
        warmthLevel: stressAdaptation.warmthLevel === 'high' ? 'very_warm' :
          stressAdaptation.warmthLevel === 'medium' ? 'warm' : 'neutral',
        extraPauseMs: Math.round((stressAdaptation.pauseMultiplier - 1) * 300),
        reason: stressAdaptation.reason,
        priority: 3, // High priority - stress is important
      });

      if (stressAdaptation.shouldAcknowledge) {
        contextInjections.push({
          shouldInject: true,
          context: 'User seems stressed. Respond with extra warmth and gentle pacing.',
          priority: 4,
          source: 'stress',
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. VOICE PATTERN LEARNING
  // -------------------------------------------------------------------------
  const voiceObs = buildVoiceObservation(input.context);
  recordVoiceObservation(sessionId, voiceObs);

  const recommendedWpm = getRecommendedAgentWpm(sessionId);
  const recommendedGap = getRecommendedTurnGap(sessionId);

  // Only add adjustment if significantly different from default
  if (Math.abs(recommendedWpm - 150) > 10) {
    activeSystems.push('patterns');
    const speedMultiplier = recommendedWpm / 150;
    sources.push({
      source: 'patterns',
      speedMultiplier: Math.max(0.85, Math.min(1.15, speedMultiplier)),
      reason: `user prefers ${recommendedWpm} WPM`,
      priority: 2, // Medium priority
    });
  }

  // -------------------------------------------------------------------------
  // 3. AMBIENT AWARENESS
  // -------------------------------------------------------------------------
  const ambientService = getAmbientAwarenessService(sessionId);
  const ambientAnalysis = ambientService.getAnalysis();

  if (ambientAnalysis.recommendations.speakClearer) {
    activeSystems.push('ambient');
    sources.push({
      source: 'ambient',
      speedMultiplier: 0.92, // Slightly slower for clarity
      volumeBoost: ambientAnalysis.recommendations.increaseVolume ? 0.15 : 0,
      clarityMode: true,
      extraPauseMs: ambientAnalysis.recommendations.addPauses ? 150 : 0,
      reason: `noisy environment (SNR: ${ambientAnalysis.snrEstimate.toFixed(0)}dB)`,
      priority: 2,
    });
  }

  if (ambientAnalysis.recommendations.acknowledgment && engine.turnsProcessed === 1) {
    // Only acknowledge environment on first turn
    acknowledgment = {
      phrase: ambientAnalysis.recommendations.acknowledgment,
      source: 'ambient',
      shouldPause: true,
      pauseDurationMs: 500,
    };
  }

  // -------------------------------------------------------------------------
  // 4. RAPPORT SCORING
  // -------------------------------------------------------------------------
  const rapportObs = buildRapportObservation(input.context);
  const rapportScorer = getRapportScorer(sessionId);
  const rapportScore = rapportScorer.recordObservation(rapportObs);

  if (rapportScore.level === 'needs_attention' || rapportScore.level === 'repair_needed' || rapportScore.level === 'critical') {
    activeSystems.push('rapport');
    const repairStrategy = rapportScorer.getRepairStrategy();

    if (repairStrategy.type !== 'none') {
      rapportScorer.activateRepairStrategy(repairStrategy);

      // Add warmth for repair
      sources.push({
        source: 'rapport',
        warmthLevel: 'warm',
        speedMultiplier: 0.95, // Slightly slower to show care
        reason: repairStrategy.reason,
        priority: 3,
      });

      // Context injection for LLM
      if (repairStrategy.contextInjection) {
        contextInjections.push({
          shouldInject: true,
          context: repairStrategy.contextInjection,
          priority: 3,
          source: 'rapport',
        });
      }

      // Verbal acknowledgment for severe cases
      if (rapportScore.level === 'critical') {
        // Generate verbal cue based on repair strategy type
        const verbalCues: Record<string, string> = {
          validate_feeling: "I hear you, and I want you to know I'm fully here with you.",
          slow_down: "Let me take a moment to really understand what you're sharing.",
          check_in: "Before we continue, I just want to check in - how are you feeling right now?",
          give_space: "Take all the time you need. I'm here whenever you're ready.",
          show_interest: "I really want to understand this better. Tell me more.",
        };
        const cue = verbalCues[repairStrategy.type];
        if (cue) {
          acknowledgment = {
            phrase: cue,
            source: 'rapport',
            shouldPause: true,
            pauseDurationMs: 800,
          };
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // COMBINE ADJUSTMENTS
  // -------------------------------------------------------------------------
  const ttsAdjustments = combineAdjustments(sources);
  const mergedInjections = mergeContextInjections(contextInjections);

  const result: NaturalnessResult = {
    ttsAdjustments,
    contextInjections: mergedInjections,
    acknowledgment,
    rapportLevel: rapportScore.level,
    rapportScore: rapportScore.score,
    recommendedWpm,
    recommendedTurnGapMs: recommendedGap,
    isNoisy: ambientAnalysis.noiseLevel > 0.5,
    activeSystems,
  };

  engine.lastResult = result;

  // Log if multiple systems active
  if (activeSystems.length > 1) {
    log.debug(
      {
        sessionId,
        activeSystems,
        speed: ttsAdjustments.speedMultiplier.toFixed(2),
        rapportLevel: rapportScore.level,
      },
      '🌊 Multiple naturalness systems active'
    );
  }

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build StressReading from AudioSignalInput
 */
function buildStressReading(audio: AudioSignalInput): StressReading {
  return {
    timestamp: Date.now(),
    stressLevel: audio.stressLevel ?? 0,
    anxietyMarkers: audio.anxietyMarkers ?? false,
    breathPattern: mapBreathPattern(audio.breathPattern),
    voiceTremor: (audio.voiceTremor ?? 0) > 0.3,
    concernLevel: mapConcernLevel(audio.concernLevel),
  };
}

/**
 * Map breath pattern string to BreathType
 */
function mapBreathPattern(
  pattern?: 'normal' | 'shallow' | 'deep' | 'held' | 'irregular' | 'relaxing'
): 'normal' | 'sigh' | 'deep' | 'held' | 'gasp' | 'shaky' | 'release' {
  switch (pattern) {
    case 'shallow':
      return 'gasp';
    case 'deep':
      return 'deep';
    case 'held':
      return 'held';
    case 'irregular':
      return 'shaky';
    case 'relaxing':
      return 'release';
    default:
      return 'normal';
  }
}

/**
 * Map concern level number to string
 */
function mapConcernLevel(level?: number): 'none' | 'mild' | 'moderate' | 'high' | 'crisis' {
  if (level === undefined || level < 0.2) return 'none';
  if (level < 0.4) return 'mild';
  if (level < 0.6) return 'moderate';
  if (level < 0.8) return 'high';
  return 'crisis';
}

/**
 * Build VoiceObservation from TurnContextInput
 */
function buildVoiceObservation(context: TurnContextInput): VoiceObservation {
  return {
    userWpm: context.userWordCount > 0 ? context.userWordCount * 15 : undefined, // Estimate ~4s turn
    agentWpm: context.agentWordCount > 0 ? context.agentWordCount * 15 : undefined,
    turnGapMs: context.silenceDurationMs,
    userInterrupted: context.userInterrupted,
    wantedMoreGap: context.silenceDurationMs !== undefined && context.silenceDurationMs > 2000,
    userEnergy: undefined, // Would need audio analysis
    timestamp: Date.now(),
  };
}

/**
 * Build TurnObservation from TurnContextInput
 */
function buildRapportObservation(context: TurnContextInput): TurnObservation {
  // Estimate talk time from word count (~150 wpm = 400ms per word)
  const msPerWord = 400;
  return {
    turnNumber: context.turnNumber,
    timestamp: Date.now(),
    turnBalance: {
      agentWordCount: context.agentWordCount,
      userWordCount: context.userWordCount,
      agentTalkTimeMs: context.agentWordCount * msPerWord,
      userTalkTimeMs: context.userWordCount * msPerWord,
    },
    interruption: context.agentInterrupted || context.userInterrupted
      ? {
          agentInterrupted: context.agentInterrupted ?? false,
          userInterrupted: context.userInterrupted ?? false,
          overlapMs: 0, // Would need audio timing
          wasCollaborative: false,
        }
      : undefined,
    engagement: {
      responseLength: context.responseLength ?? 'medium',
      userAskedQuestion: context.userAskedQuestion ?? false,
      userElaborated: (context.userWordCount ?? 0) > 30,
      userIntroducedTopic: false,
      userShowedEmotion: !!context.userEmotion,
    },
    emotionalAlignment: context.userEmotion && context.agentEmotion
      ? {
          userEmotion: context.userEmotion,
          agentEmotion: context.agentEmotion,
          isAligned: context.emotionsAligned ?? false,
          userEnergy: 0.5,
          agentEnergy: 0.5,
        }
      : undefined,
    flowContinuity: {
      silenceDurationMs: context.silenceDurationMs ?? 500,
      topicShift: false,
      smoothTransition: context.smoothTransition ?? true,
      naturalPacing: true,
    },
    trustSignals: {
      userDisclosed: context.userDisclosed ?? false,
      userShowedVulnerability: false,
      userAskedForHelp: context.userAskedQuestion ?? false,
      userExpressedSkepticism: false,
      comfortLevel: context.comfortLevel ?? 0.6,
    },
  };
}

/**
 * Create default result for missing engine
 */
function createDefaultResult(): NaturalnessResult {
  return {
    ttsAdjustments: {
      speedMultiplier: 1.0,
      volumeBoost: 0,
      clarityMode: false,
      extraPauseMs: 0,
      warmthLevel: 'neutral',
      reasons: [],
    },
    contextInjections: [],
    acknowledgment: null,
    rapportLevel: 'good',
    rapportScore: 70,
    recommendedWpm: 150,
    recommendedTurnGapMs: 800,
    isNoisy: false,
    activeSystems: [],
  };
}

// ============================================================================
// STATE ACCESS
// ============================================================================

/**
 * Get current naturalness engine state
 */
export function getNaturalnessEngineState(sessionId: string): NaturalnessEngineState | null {
  const engine = engines.get(sessionId);
  if (!engine) return null;

  // Check health of subsystems
  const stressEngine = getStressAdaptationEngine(sessionId);
  const voiceEngine = getVoicePatternEngine(sessionId, engine.userId);
  const ambientService = getAmbientAwarenessService(sessionId);
  const rapportScorer = getRapportScorer(sessionId);

  return {
    sessionId: engine.sessionId,
    userId: engine.userId,
    turnsProcessed: engine.turnsProcessed,
    lastResult: engine.lastResult,
    systemHealth: {
      stress: !!stressEngine,
      patterns: !!voiceEngine,
      ambient: !!ambientService,
      rapport: !!rapportScorer,
    },
    sessionStartedAt: engine.sessionStartedAt,
  };
}

/**
 * Get last naturalness result
 */
export function getLastNaturalnessResult(sessionId: string): NaturalnessResult | null {
  return engines.get(sessionId)?.lastResult ?? null;
}

// ============================================================================
// AUDIO FRAME PROCESSING
// ============================================================================

/**
 * Process an audio frame for ambient analysis
 * Call this with each audio frame during the conversation
 */
export function processAudioFrame(
  sessionId: string,
  data: Int16Array | Float32Array,
  sampleRate: number,
  isSpeech: boolean
): void {
  const ambientService = getAmbientAwarenessService(sessionId);
  ambientService.processFrame(data, sampleRate, isSpeech);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const naturalnessEngine = {
  // Engine management
  get: getNaturalnessEngine,
  reset: resetNaturalnessEngine,
  initialize: initializeNaturalnessEngine,
  persist: persistNaturalnessData,
  getActiveCount: getActiveNaturalnessEngineCount,

  // Turn processing
  processTurn,
  processAudioFrame,

  // State access
  getState: getNaturalnessEngineState,
  getLastResult: getLastNaturalnessResult,
};

// Re-export types
export * from './types.js';
export * from './combine-adjustments.js';
