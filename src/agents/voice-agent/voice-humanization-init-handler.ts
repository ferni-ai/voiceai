/**
 * Voice Agent Voice Humanization Init Handler
 *
 * Initializes voice humanization feature flags and services:
 * - FFT spectral analysis
 * - Enhanced turn prediction
 * - Multi-signal laughter detection
 * - Word-timing rhythm service
 * - Response anticipation
 * - Speech pipeline metrics
 * - User analytics session tracking
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/voice-humanization-init-handler
 */

import { log } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import { getSessionFlags, initializeFlags } from '../../config/voice-humanization-flags.js';
import {
  recordFeatureUsage,
  recordSessionStart,
} from '../../services/voice-humanization-metrics.js';
import { recordSessionStart as recordUserSessionStart } from '../../services/user-analytics.js';
import { initializeSpeechMetrics } from '../integrations/speech-metrics-integration.js';
import { getEnhancedTurnPredictor } from '../../speech/enhanced-turn-prediction.js';
import { getMultiSignalLaughterDetector } from '../../speech/multi-signal-laughter.js';
import { getWordTimingRhythmService } from '../../speech/word-timing-rhythm.js';
import { getResponseAnticipationService } from '../../speech/response-anticipation.js';
import { getFFTAnalyzer } from '../../speech/fft-analyzer.js';
import {
  getBreathPauseDetector,
  getLiveBackchannelingService,
} from '../../speech/live-backchanneling/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceHumanizationInitContext {
  /** Session ID */
  sessionId: string;
  /** Persona configuration */
  sessionPersona: PersonaConfig;
  /** User ID (optional) */
  userId?: string;
  /** User profile with subscription info */
  userProfile?: {
    subscription?: {
      tier?: string;
    };
  } | null;
}

export interface VoiceHumanizationInitResult {
  /** Voice humanization flags for this session */
  flags: {
    enableFftAnalysis: boolean;
    enableEnhancedTurnPrediction: boolean;
    enableMultiSignalLaughter: boolean;
    enableWordTimingRhythm: boolean;
    enableResponseAnticipation: boolean;
    useCachedResponses: boolean;
    enableMetrics: boolean;
    enableLiveBackchanneling: boolean;
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Initialize voice humanization features based on feature flags.
 * Sets up various speech analysis and humanization services.
 */
export function setupVoiceHumanizationInit(
  ctx: VoiceHumanizationInitContext
): VoiceHumanizationInitResult {
  const { sessionId, sessionPersona, userId, userProfile } = ctx;
  const logger = log();

  // Initialize feature flags
  initializeFlags();
  const voiceFlags = getSessionFlags(sessionId);

  // Initialize metrics if enabled
  if (voiceFlags.enableMetrics) {
    recordSessionStart(sessionId);
    diag.session('📊 Voice humanization metrics enabled');
  }

  // Initialize unified speech pipeline metrics
  initializeSpeechMetrics(sessionId, sessionPersona.id);
  diag.session('📊 Speech pipeline metrics initialized');

  // User Analytics: Track session for DAU/WAU/MAU metrics
  const visitorId = userId || 'anonymous';
  const isSubscriber = (userProfile?.subscription?.tier ?? 'free') !== 'free';
  void recordUserSessionStart(sessionId, visitorId, sessionPersona.id, isSubscriber).catch(
    (err) => diag.warn('📊 User analytics session start failed', { error: String(err) })
  );

  // Initialize response anticipation for monitoring
  if (voiceFlags.enableResponseAnticipation) {
    const anticipator = getResponseAnticipationService(sessionId);
    anticipator.setPersona(sessionPersona.id);
    recordFeatureUsage(sessionId, 'responseAnticipation', true);
    diag.session('⚡ Response anticipation initialized (monitoring mode)', {
      useCachedResponses: voiceFlags.useCachedResponses,
    });
  }

  // Initialize enhanced turn prediction
  if (voiceFlags.enableEnhancedTurnPrediction) {
    getEnhancedTurnPredictor(sessionId); // Pre-initialize
    recordFeatureUsage(sessionId, 'enhancedTurnPrediction', true);
    diag.session('🎯 Enhanced turn prediction initialized');
  }

  // Initialize multi-signal laughter detection
  if (voiceFlags.enableMultiSignalLaughter) {
    const laughterDetector = getMultiSignalLaughterDetector(sessionId);
    laughterDetector.updateContext({ conversationPhase: 'greeting' });
    recordFeatureUsage(sessionId, 'multiSignalLaughter', true);
    diag.session('😂 Multi-signal laughter detection initialized');
  }

  // Initialize word-timing rhythm service
  if (voiceFlags.enableWordTimingRhythm) {
    getWordTimingRhythmService(sessionId); // Pre-initialize
    recordFeatureUsage(sessionId, 'wordTimingRhythm', true);
    diag.session('🎵 Word-timing rhythm service initialized');
  }

  // Initialize FFT analyzer
  if (voiceFlags.enableFftAnalysis) {
    getFFTAnalyzer(sessionId); // Pre-initialize
    recordFeatureUsage(sessionId, 'fftAnalysis', true);
    diag.session('📊 FFT spectral analyzer initialized');
  }

  // Initialize live backchanneling (breath-pause-aware "mm-hmm" during user speech)
  if (voiceFlags.enableLiveBackchanneling) {
    getBreathPauseDetector(sessionId); // Pre-initialize breath detector
    getLiveBackchannelingService(sessionId); // Pre-initialize service
    recordFeatureUsage(sessionId, 'liveBackchanneling', true);
    diag.session('🎤 Live backchanneling initialized (breath-pause aware)');
  }

  diag.session('🎤 Advanced voice humanization ready', {
    flags: {
      fft: voiceFlags.enableFftAnalysis,
      turnPrediction: voiceFlags.enableEnhancedTurnPrediction,
      laughter: voiceFlags.enableMultiSignalLaughter,
      rhythm: voiceFlags.enableWordTimingRhythm,
      anticipation: voiceFlags.enableResponseAnticipation,
      liveBackchanneling: voiceFlags.enableLiveBackchanneling,
    },
  });

  logger.info(
    { sessionId, personaId: sessionPersona.id },
    'Voice humanization features initialized'
  );

  return {
    flags: {
      enableFftAnalysis: voiceFlags.enableFftAnalysis,
      enableEnhancedTurnPrediction: voiceFlags.enableEnhancedTurnPrediction,
      enableMultiSignalLaughter: voiceFlags.enableMultiSignalLaughter,
      enableWordTimingRhythm: voiceFlags.enableWordTimingRhythm,
      enableResponseAnticipation: voiceFlags.enableResponseAnticipation,
      useCachedResponses: voiceFlags.useCachedResponses,
      enableMetrics: voiceFlags.enableMetrics,
      enableLiveBackchanneling: voiceFlags.enableLiveBackchanneling,
    },
  };
}

export default setupVoiceHumanizationInit;
