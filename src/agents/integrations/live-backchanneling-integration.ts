/**
 * Live Backchanneling Integration for Voice Agent
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates breath-pause-aware backchanneling into the voice agent's audio pipeline.
 * This enables Ferni to give soft verbal feedback ("mm-hmm", "yeah") DURING user
 * speech at natural breath pauses, making conversations feel more human.
 *
 * Key insight from Sesame's research:
 * "When a friend listens to you, they don't sit in silence until you're done.
 * They nod, they react, they show they're with you."
 *
 * @module live-backchanneling-integration
 *
 * @note STATUS: INTEGRATED ✅
 * This integration is exported from index.ts. Use initializeLiveBackchanneling()
 * in the voice agent's audio pipeline setup to enable live backchanneling.
 */

import type { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import {
  getBreathPauseDetector,
  getLiveBackchannelingService,
  type LiveBackchannelContext,
} from '../../speech/live-backchanneling/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { trackBackchannelEvent } from './speech-metrics-integration.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';

const log = getLogger().child({ module: 'LiveBackchannelingIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface LiveBackchannelConfig {
  /** Enable live backchanneling during user speech */
  enabled: boolean;
  /** Minimum turns before starting live backchannels (build rapport first) */
  minTurns: number;
  /** Minimum interval between live backchannels (ms) */
  minIntervalMs: number;
}

export interface LiveBackchannelState {
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Current turn count */
  turnCount: number;
  /** Last backchannel time */
  lastBackchannelAt: number;
  /** Is agent currently speaking? */
  isAgentSpeaking: boolean;
  /** Current user emotion */
  currentEmotion?: { primary: string; intensity: number; distressLevel?: number };
  /** User speech start time for this utterance */
  userSpeechStartTime: number | null;
}

export interface LiveBackchannelIntegration {
  /** Process an audio frame for breath pause detection */
  processAudioFrame: (frame: AudioFrame) => void;
  /** Update state from voice agent */
  updateState: (update: Partial<LiveBackchannelState>) => void;
  /** Record that a new turn started */
  onNewTurn: () => void;
  /** Get current breath pause stats (for debugging) */
  getStats: () => { totalPauses: number; breathPauseCount: number; averagePauseMs?: number };
  /** Cleanup */
  cleanup: () => void;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: LiveBackchannelConfig = {
  enabled: true,
  minTurns: 2, // Build some rapport before live backchanneling
  minIntervalMs: 4000, // At least 4s between live backchannels
};

// ============================================================================
// INTEGRATION FACTORY
// ============================================================================

/**
 * Initialize live backchanneling integration for a voice agent session
 *
 * @param sessionId - Session ID
 * @param personaId - Current persona ID
 * @param session - Voice agent session (for saying backchannels)
 * @param isAgentSpeakingFn - Function to check if agent is currently speaking
 * @param config - Configuration overrides
 */
export function initializeLiveBackchanneling<T>(
  sessionId: string,
  personaId: string,
  session: voice.AgentSession<T>,
  isAgentSpeakingFn: () => boolean,
  config: Partial<LiveBackchannelConfig> = {}
): LiveBackchannelIntegration {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get session-scoped services
  const breathDetector = getBreathPauseDetector(sessionId);
  const backchannelService = getLiveBackchannelingService(sessionId);

  // State
  const state: LiveBackchannelState = {
    sessionId,
    personaId,
    turnCount: 0,
    lastBackchannelAt: 0,
    isAgentSpeaking: false,
    userSpeechStartTime: null,
  };

  log.info({ sessionId, personaId, enabled: cfg.enabled }, '🎤 Live backchanneling initialized');

  // =========================================================================
  // AUDIO FRAME PROCESSOR
  // =========================================================================

  const processAudioFrame = (frame: AudioFrame): void => {
    if (!cfg.enabled) return;
    if (!frame.data || frame.data.length === 0) return;

    // Update breath detector with audio
    breathDetector.processAudioFrame({
      data: frame.data,
      sampleRate: frame.sampleRate,
      channels: frame.channels,
    });

    // Track user speech duration
    if (breathDetector.isUserSpeaking() && !state.userSpeechStartTime) {
      state.userSpeechStartTime = Date.now();
    }

    // Check for breath pause and potentially emit backchannel
    if (breathDetector.isBreathPause()) {
      void tryEmitLiveBackchannel();
    }
  };

  // =========================================================================
  // BACKCHANNEL EMISSION
  // =========================================================================

  const tryEmitLiveBackchannel = async (): Promise<void> => {
    // Don't backchannel if agent is speaking
    if (isAgentSpeakingFn()) return;

    // Build context for decision
    const context: LiveBackchannelContext = {
      personaId: state.personaId,
      userSpeakingDurationMs: state.userSpeechStartTime
        ? Date.now() - state.userSpeechStartTime
        : 0,
      isBreathPause: true,
      emotion: state.currentEmotion,
      turnCount: state.turnCount,
      timeSinceLastBackchannel: Date.now() - state.lastBackchannelAt,
      isEmotionalMoment:
        (state.currentEmotion?.distressLevel ?? 0) > 0.4 ||
        (state.currentEmotion?.intensity ?? 0) > 0.7,
    };

    // Check if we should emit
    const result = backchannelService.shouldEmitLiveBackchannel(context);

    if (result.shouldBackchannel && result.phrase) {
      try {
        // Say the backchannel with interruptions allowed (so it can overlap)
        // The phrase already has SSML for soft volume
        // Use coordinated speech for proper queue management
        coordinatedSay(sessionId, result.phrase, { allowInterruptions: true });

        state.lastBackchannelAt = Date.now();

        // Track metrics
        trackBackchannelEvent(sessionId, {
          pauseDurationMs: breathDetector.getCurrentPauseDuration(),
          wasTimely: true,
          category: context.isEmotionalMoment ? 'empathy' : 'acknowledgment',
          userEmotion: state.currentEmotion?.primary,
          mode: 'live',
        });

        log.debug(
          {
            phrase: result.phrase.slice(0, 30),
            speechDurationMs: context.userSpeakingDurationMs,
            pauseDurationMs: breathDetector.getCurrentPauseDuration(),
          },
          '🎤 Live backchannel emitted during breath pause'
        );
      } catch (err) {
        log.warn({ error: String(err) }, 'Live backchannel emission failed (non-critical)');
      }
    }
  };

  // =========================================================================
  // STATE UPDATES
  // =========================================================================

  const updateState = (update: Partial<LiveBackchannelState>): void => {
    Object.assign(state, update);
  };

  const onNewTurn = (): void => {
    state.turnCount++;
    state.userSpeechStartTime = null;
    // Don't reset lastBackchannelAt - maintain cooldown across turns
  };

  // =========================================================================
  // STATS & CLEANUP
  // =========================================================================

  const getStats = () => {
    const stats = breathDetector.getBreathPauseStats();
    return {
      totalPauses: stats.totalPauses,
      breathPauseCount: stats.breathPauseCount,
      averagePauseMs: stats.averagePauseMs,
    };
  };

  const cleanup = (): void => {
    // Cleanup is handled by session-cleanup.ts via resetLiveBackchanneling
    log.debug({ sessionId }, '🧹 Live backchanneling integration cleaned up');
  };

  return {
    processAudioFrame,
    updateState,
    onNewTurn,
    getStats,
    cleanup,
  };
}
